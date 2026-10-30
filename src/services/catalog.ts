import type { Env } from '../env';
import { applyMarkup, centsFromUsd } from '../lib/money';
import { getSettings } from '../lib/settings';
import { createG2Client, type G2Category, type G2Product, prettyDenomName } from './g2bulk';

const DENOM_TTL_MS = 30 * 60 * 1000; // re-pull a game catalogue every 30 minutes

export interface GameRow {
  code: string;
  g2_id: number | null;
  name: string;
  image_url: string;
  fields_json: string;
  notes: string;
  servers_json: string;
  visible: number;
  featured: number;
  sort_order: number;
  synced_at: string;
}

export interface DenomRow {
  id: number;
  game_code: string;
  g2_name: string;
  display_name: string;
  cost_cents: number;
  price_cents: number;
  price_override: number;
  visible: number;
  sort_order: number;
  synced_at: string;
}

export interface GiftRow {
  id: number;
  title: string;
  description: string;
  category_id: number | null;
  category_title: string;
  image_url: string;
  cost_cents: number;
  price_cents: number;
  price_override: number;
  face_value: number | null;
  stock: number;
  visible: number;
  sort_order: number;
  synced_at: string;
}

async function client(env: Env) {
  const settings = await getSettings(env);
  return { g2: createG2Client({ baseUrl: settings.g2bulk_base_url, apiKey: settings.g2bulk_api_key }), settings };
}

/* ------------------------------------------------------------------ games */

export interface GameSyncResult {
  games: number;
  products: number;
  categories: number;
  at: string;
}

/** Pulls the game list and gift-card catalogue. Two upstream requests — safe for Workers. */
export async function syncCatalog(env: Env): Promise<GameSyncResult> {
  const { g2, settings } = await client(env);
  const now = new Date().toISOString();

  const [gamesRes, productsRes, categoriesRes] = await Promise.all([
    g2.listGames(),
    g2.listProducts(),
    g2.listCategories(),
  ]);

  const games = gamesRes.games ?? [];
  const products = productsRes.products ?? [];
  const categories = categoriesRes.categories ?? [];
  const categoryImage = new Map<number, string>();
  for (const c of categories) if (c.image_url) categoryImage.set(c.id, c.image_url);

  const gameStatements = games.map((g) =>
    env.DB.prepare(
      `INSERT INTO games (code, g2_id, name, image_url, fields_json, notes, servers_json, visible, featured, sort_order, synced_at)
       VALUES (?, ?, ?, ?, COALESCE((SELECT fields_json FROM games WHERE code = ?), '[]'),
               COALESCE((SELECT notes FROM games WHERE code = ?), ''),
               COALESCE((SELECT servers_json FROM games WHERE code = ?), '{}'),
               COALESCE((SELECT visible FROM games WHERE code = ?), 1),
               COALESCE((SELECT featured FROM games WHERE code = ?), 0),
               COALESCE((SELECT sort_order FROM games WHERE code = ?), 0),
               ?)
       ON CONFLICT(code) DO UPDATE SET
         g2_id = excluded.g2_id,
         name = excluded.name,
         image_url = excluded.image_url,
         synced_at = excluded.synced_at`,
    ).bind(g.code, g.id, g.name, g.image_url || '', g.code, g.code, g.code, g.code, g.code, g.code, now),
  );

  const giftStatements = products.map((p) => {
    const costCents = centsFromUsd(p.unit_price);
    const image = p.image_url || categoryImage.get(p.category_id) || '';
    return env.DB.prepare(
      `INSERT INTO gift_products (id, title, description, category_id, category_title, image_url, cost_cents, price_cents, price_override, face_value, stock, visible, sort_order, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT price_cents FROM gift_products WHERE id = ? AND price_override = 1), ?),
               COALESCE((SELECT price_override FROM gift_products WHERE id = ?), 0),
               ?, ?, COALESCE((SELECT visible FROM gift_products WHERE id = ?), 1),
               COALESCE((SELECT sort_order FROM gift_products WHERE id = ?), 0), ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         description = excluded.description,
         category_id = excluded.category_id,
         category_title = excluded.category_title,
         image_url = excluded.image_url,
         cost_cents = excluded.cost_cents,
         price_cents = CASE WHEN gift_products.price_override = 1 THEN gift_products.price_cents ELSE excluded.price_cents END,
         face_value = excluded.face_value,
         stock = excluded.stock,
         synced_at = excluded.synced_at`,
    ).bind(
      p.id,
      p.title,
      p.description || '',
      p.category_id,
      p.category_title || '',
      image,
      costCents,
      applyMarkup(costCents, settings.markup_percent),
      p.id,
      applyMarkup(costCents, settings.markup_percent),
      p.id,
      p.face_value,
      p.stock,
      p.id,
      p.id,
      now,
    );
  });

  for (let i = 0; i < gameStatements.length; i += 40) {
    await env.DB.batch(gameStatements.slice(i, i + 40));
  }
  for (let i = 0; i < giftStatements.length; i += 40) {
    await env.DB.batch(giftStatements.slice(i, i + 40));
  }

  return { games: games.length, products: products.length, categories: categories.length, at: now };
}

/** Pulls one game's denominations. Cheap enough to run on page view. */
export async function syncGameDenoms(env: Env, code: string, force = false): Promise<number> {
  const { g2, settings } = await client(env);
  const existing = await env.DB.prepare('SELECT MAX(synced_at) AS at FROM game_denoms WHERE game_code = ?')
    .bind(code)
    .first<{ at: string | null }>();

  if (!force && existing?.at && Date.now() - new Date(existing.at).getTime() < DENOM_TTL_MS) {
    return 0;
  }

  const [catalogue, fields, servers] = await Promise.all([
    g2.gameCatalogue(code),
    g2.gameFields(code).catch(() => null),
    g2.gameServers(code).catch(() => ({})),
  ]);

  const gameName = catalogue.game?.name || code;
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];

  const fieldList = fields?.info?.fields && fields.info.fields.length > 0 ? fields.info.fields : ['userid'];
  const notesText = fields?.info?.notes ? String(fields.info.notes).slice(0, 800) : '';
  const serversObj = servers && typeof servers === 'object' ? servers : {};

  statements.push(
    env.DB.prepare('UPDATE games SET fields_json = ?, notes = ?, servers_json = ?, synced_at = ? WHERE code = ?').bind(
      JSON.stringify(fieldList),
      notesText,
      JSON.stringify(serversObj),
      now,
      code,
    ),
  );

  catalogue.catalogues.forEach((d, index) => {
    const costCents = centsFromUsd(d.amount);
    statements.push(
      env.DB.prepare(
        `INSERT INTO game_denoms (game_code, g2_name, display_name, cost_cents, price_cents, price_override, visible, sort_order, synced_at)
         VALUES (?, ?, ?, ?, COALESCE((SELECT price_cents FROM game_denoms WHERE game_code = ? AND g2_name = ? AND price_override = 1), ?),
                 COALESCE((SELECT price_override FROM game_denoms WHERE game_code = ? AND g2_name = ?), 0),
                 COALESCE((SELECT visible FROM game_denoms WHERE game_code = ? AND g2_name = ?), 1),
                 COALESCE((SELECT sort_order FROM game_denoms WHERE game_code = ? AND g2_name = ?), ?),
                 ?)
         ON CONFLICT(game_code, g2_name) DO UPDATE SET
           display_name = excluded.display_name,
           cost_cents = excluded.cost_cents,
           price_cents = CASE WHEN game_denoms.price_override = 1 THEN game_denoms.price_cents ELSE excluded.price_cents END,
           synced_at = excluded.synced_at`,
      ).bind(
        code,
        d.name,
        prettyDenomName(d.name, gameName),
        costCents,
        code,
        d.name,
        applyMarkup(costCents, settings.markup_percent),
        code,
        d.name,
        code,
        d.name,
        code,
        d.name,
        index,
        now,
      ),
    );
  });

  for (let i = 0; i < statements.length; i += 40) {
    await env.DB.batch(statements.slice(i, i + 40));
  }

  return catalogue.catalogues.length;
}

/** Re-prices everything from the stored supplier cost using the current markup. */
export async function repriceCatalog(env: Env): Promise<{ denoms: number; products: number }> {
  const settings = await getSettings(env);
  const pct = settings.markup_percent;

  const denoms = await env.DB.prepare(
    'SELECT id, cost_cents FROM game_denoms WHERE price_override = 0',
  ).all<{ id: number; cost_cents: number }>();
  const products = await env.DB.prepare(
    'SELECT id, cost_cents FROM gift_products WHERE price_override = 0',
  ).all<{ id: number; cost_cents: number }>();

  const statements: D1PreparedStatement[] = [];
  for (const row of denoms.results ?? []) {
    statements.push(
      env.DB.prepare('UPDATE game_denoms SET price_cents = ? WHERE id = ?').bind(applyMarkup(row.cost_cents, pct), row.id),
    );
  }
  for (const row of products.results ?? []) {
    statements.push(
      env.DB.prepare('UPDATE gift_products SET price_cents = ? WHERE id = ?').bind(applyMarkup(row.cost_cents, pct), row.id),
    );
  }
  for (let i = 0; i < statements.length; i += 60) {
    await env.DB.batch(statements.slice(i, i + 60));
  }

  return { denoms: denoms.results?.length ?? 0, products: products.results?.length ?? 0 };
}

/* ------------------------------------------------------------------ reads */

export function parseGame(row: GameRow) {
  return {
    code: row.code,
    name: row.name,
    imageUrl: row.image_url,
    fields: safeJson<string[]>(row.fields_json, []),
    notes: row.notes,
    servers: safeJson<Record<string, string>>(row.servers_json, {}),
    visible: !!row.visible,
    featured: !!row.featured,
    sortOrder: row.sort_order,
  };
}

export function parseDenom(row: DenomRow) {
  return {
    id: row.id,
    key: `${row.game_code}:${row.g2_name}`,
    name: row.g2_name,
    displayName: row.display_name,
    priceCents: row.price_cents,
    costCents: row.cost_cents,
    visible: !!row.visible,
    sortOrder: row.sort_order,
  };
}

export function parseGift(row: GiftRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    categoryId: row.category_id,
    categoryTitle: row.category_title,
    imageUrl: row.image_url,
    priceCents: row.price_cents,
    costCents: row.cost_cents,
    faceValue: row.face_value,
    stock: row.stock,
    visible: !!row.visible,
    sortOrder: row.sort_order,
  };
}

function safeJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function visibleCategories(rows: GiftRow[]): G2Category[] {
  const seen = new Map<number, G2Category>();
  for (const row of rows) {
    if (!row.category_id || seen.has(row.category_id)) continue;
    seen.set(row.category_id, {
      id: row.category_id,
      title: row.category_title,
      description: '',
      image_url: row.image_url,
      product_count: 0,
    });
  }
  return [...seen.values()];
}

export type { G2Product };
