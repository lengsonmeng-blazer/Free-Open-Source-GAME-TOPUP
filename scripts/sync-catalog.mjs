// Standalone Node script to sync G2Bulk games and gift cards into local or remote D1
// Run with: node scripts/sync-catalog.mjs [--local|--remote]

import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';

const target = process.argv.includes('--remote') ? '--remote' : '--local';
const G2_BASE = 'https://api.g2bulk.com';

console.log(`[sync-catalog] Fetching catalogue from ${G2_BASE}...`);

const [gamesRes, productsRes, categoriesRes] = await Promise.all([
  fetch(`${G2_BASE}/v1/games`).then((r) => r.json()),
  fetch(`${G2_BASE}/v1/products`).then((r) => r.json()),
  fetch(`${G2_BASE}/v1/category`).then((r) => r.json()),
]);

const games = gamesRes.games || [];
const products = productsRes.products || [];
const categories = categoriesRes.categories || [];

console.log(`[sync-catalog] Fetched ${games.length} games, ${products.length} vouchers, ${categories.length} categories.`);
console.log(`[sync-catalog] Fetching fields & servers for ${games.length} games...`);

const gameMeta = new Map();
const CHUNK_SIZE = 12;
for (let i = 0; i < games.length; i += CHUNK_SIZE) {
  const chunk = games.slice(i, i + CHUNK_SIZE);
  await Promise.all(
    chunk.map(async (g) => {
      try {
        const [fRes, sRes] = await Promise.all([
          fetch(`${G2_BASE}/v1/games/fields`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ game: g.code }),
          }),
          fetch(`${G2_BASE}/v1/games/servers`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ game: g.code }),
          }),
        ]);

        const f = await fRes.json().catch(() => null);
        const s = sRes.ok ? await sRes.json().catch(() => null) : null;

        const fields = f?.info?.fields && f.info.fields.length > 0 ? f.info.fields : ['userid'];
        const notes = f?.info?.notes || '';
        const servers =
          s?.servers && typeof s.servers === 'object' && JSON.stringify(s.servers).length < 50000
            ? s.servers
            : {};

        gameMeta.set(g.code, { fields, notes, servers });
      } catch {
        gameMeta.set(g.code, { fields: ['userid'], notes: '', servers: {} });
      }
    }),
  );
}
console.log(`[sync-catalog] Successfully retrieved metadata for ${gameMeta.size} games.`);

const categoryImage = new Map();
for (const c of categories) {
  if (c.image_url) categoryImage.set(c.id, c.image_url);
}

const now = new Date().toISOString();
const sql = [];

function esc(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  return `'${String(val).replace(/'/g, "''")}'`;
}

for (const g of games) {
  const meta = gameMeta.get(g.code) || { fields: ['userid'], notes: '', servers: {} };
  sql.push(
    `INSERT INTO games (code, g2_id, name, image_url, fields_json, notes, servers_json, visible, featured, sort_order, synced_at)
     VALUES (${esc(g.code)}, ${esc(g.id)}, ${esc(g.name)}, ${esc(g.image_url || '')}, ${esc(JSON.stringify(meta.fields))}, ${esc(meta.notes)}, ${esc(JSON.stringify(meta.servers))}, 1, 0, 0, ${esc(now)})
     ON CONFLICT(code) DO UPDATE SET
       g2_id = excluded.g2_id,
       name = excluded.name,
       image_url = excluded.image_url,
       fields_json = excluded.fields_json,
       notes = excluded.notes,
       servers_json = excluded.servers_json,
       synced_at = excluded.synced_at;`
  );
}

for (const p of products) {
  const costCents = Math.round(Number(p.unit_price || 0) * 100);
  const markup = Math.ceil(costCents * 1.06); // default 6% markup
  const priceCents = Math.max(markup, costCents);
  const image = p.image_url || categoryImage.get(p.category_id) || '';

  sql.push(
    `INSERT INTO gift_products (id, title, description, category_id, category_title, image_url, cost_cents, price_cents, price_override, face_value, stock, visible, sort_order, synced_at)
     VALUES (${esc(p.id)}, ${esc(p.title)}, ${esc(p.description || '')}, ${esc(p.category_id)}, ${esc(p.category_title || '')}, ${esc(image)}, ${costCents}, ${priceCents}, 0, ${esc(p.face_value)}, ${esc(p.stock)}, 1, 0, ${esc(now)})
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
       synced_at = excluded.synced_at;`
  );
}

const tmpFile = `D:/temp/catalog_seed_${Date.now()}.sql`;
writeFileSync(tmpFile, sql.join('\n'), 'utf8');

console.log(`[sync-catalog] Executing ${sql.length} SQL statements on D1 (${target})...`);
try {
  execSync(`npx wrangler d1 execute g2topup-db ${target} --file "${tmpFile}"`, {
    stdio: 'inherit',
    timeout: 180000,
  });
  console.log('[sync-catalog] Catalogue successfully populated.');
} catch (err) {
  console.error('[sync-catalog] Failed to execute SQL on D1:', err.message);
  process.exit(1);
} finally {
  try {
    unlinkSync(tmpFile);
  } catch {}
}
