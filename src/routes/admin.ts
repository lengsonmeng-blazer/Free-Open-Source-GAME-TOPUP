import { Hono } from 'hono';
import type { AppEnv, Env } from '../env';
import {
  attachSessionCookie,
  clearAttempts,
  destroySession,
  clientIp,
  createSession,
  recordAttempt,
  requireAdmin,
  resolveAdmin,
  tooManyAttempts,
} from '../lib/auth';
import { hashPassword, verifyPassword } from '../lib/crypto';
import { logEvent, publicOrder, type OrderRow } from '../lib/orders';
import { getSettings, redactSettings, saveSettings } from '../lib/settings';
import {
  parseDenom,
  parseGame,
  parseGift,
  repriceCatalog,
  syncCatalog,
  syncGameDenoms,
  type DenomRow,
  type GameRow,
  type GiftRow,
} from '../services/catalog';
import { createG2Client } from '../services/g2bulk';
import { dispatchOrder, refreshOrder, sweepOrders } from '../services/fulfillment';
import { markPaid } from '../services/payments';

export const adminRoutes = new Hono<AppEnv>();

async function readJson<T extends object>(c: { req: { json: () => Promise<unknown> } }): Promise<Partial<T>> {
  try {
    return ((await c.req.json()) as Partial<T>) || {};
  } catch {
    return {};
  }
}

/* ------------------------------------------------------------------ auth */

adminRoutes.post('/login', async (c) => {
  const env = c.env as Env;
  const ip = clientIp(c);
  if (await tooManyAttempts(env, `admin-login:${ip}`, 8, 15)) {
    return c.json({ success: false, message: 'Too many attempts. Try again in 15 minutes.' }, 429);
  }

  const body = await readJson<{ username?: string; password?: string }>(c);
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (!username || !password) return c.json({ success: false, message: 'Username and password required.' }, 400);

  const admin = await env.DB.prepare('SELECT id, username, password_hash FROM admins WHERE username = ?')
    .bind(username)
    .first<{ id: string; username: string; password_hash: string }>();

  const ok = admin ? await verifyPassword(password, admin.password_hash) : false;
  if (!admin || !ok) {
    await recordAttempt(env, `admin-login:${ip}`);
    return c.json({ success: false, message: 'Invalid username or password.' }, 401);
  }

  await clearAttempts(env, `admin-login:${ip}`);
  const sessionId = await createSession(env, admin.id);
  await attachSessionCookie(c, env, sessionId);
  return c.json({ success: true, admin: { username: admin.username } });
});

adminRoutes.post('/logout', async (c) => {
  await destroySession(c);
  return c.json({ success: true });
});

adminRoutes.get('/me', async (c) => {
  const admin = await resolveAdmin(c);
  if (!admin) return c.json({ success: false, authenticated: false }, 200);
  return c.json({ success: true, authenticated: true, admin });
});

/* --------------------------------------------------------------- guarded */

adminRoutes.use('/*', requireAdmin);

/* --------------------------------------------------------------- stats */

adminRoutes.get('/stats', async (c) => {
  const env = c.env as Env;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const totals = await env.DB.prepare(
    `SELECT
       COUNT(*) AS orders,
       COALESCE(SUM(CASE WHEN payment_status = 'PAID' THEN total_cents ELSE 0 END), 0) AS revenue_cents,
       COALESCE(SUM(CASE WHEN payment_status = 'PAID' THEN total_cents - (unit_price_cents * quantity) + (unit_price_cents * quantity) ELSE 0 END), 0) AS gross_cents,
       SUM(CASE WHEN payment_status = 'PAID' THEN 1 ELSE 0 END) AS paid,
       SUM(CASE WHEN payment_status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN fulfill_status = 'SUCCESS' THEN 1 ELSE 0 END) AS delivered,
       SUM(CASE WHEN fulfill_status = 'FAILED' THEN 1 ELSE 0 END) AS failed,
       SUM(CASE WHEN fulfill_status = 'MANUAL' THEN 1 ELSE 0 END) AS manual
     FROM orders WHERE created_at > ?`,
  )
    .bind(since)
    .first<Record<string, number>>();

  const daily = await env.DB.prepare(
    `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS orders,
            COALESCE(SUM(CASE WHEN payment_status = 'PAID' THEN total_cents ELSE 0 END), 0) AS revenue_cents
     FROM orders WHERE created_at > ?
     GROUP BY day ORDER BY day ASC`,
  )
    .bind(since)
    .all<{ day: string; orders: number; revenue_cents: number }>();

  const recent = await env.DB.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 8').all<OrderRow>();
  const newContacts = await env.DB.prepare("SELECT COUNT(*) AS n FROM contacts WHERE status = 'NEW'").first<{ n: number }>();

  const catalogCounts = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM games WHERE visible = 1) AS games,
            (SELECT COUNT(*) FROM game_denoms WHERE visible = 1) AS denoms,
            (SELECT COUNT(*) FROM gift_products WHERE visible = 1) AS gifts`,
  ).first<{ games: number; denoms: number; gifts: number }>();

  return c.json({
    success: true,
    totals: totals ?? {},
    daily: daily.results ?? [],
    recent: (recent.results ?? []).map(publicOrder),
    newContacts: newContacts?.n ?? 0,
    catalog: catalogCounts ?? { games: 0, denoms: 0, gifts: 0 },
  });
});

/* --------------------------------------------------------------- orders */

adminRoutes.get('/orders', async (c) => {
  const env = c.env as Env;
  const status = c.req.query('status') || '';
  const q = (c.req.query('q') || '').trim();
  const page = Math.max(1, Number(c.req.query('page') || 1));
  const limit = Math.min(Math.max(1, Number(c.req.query('limit') || 25)), 100);

  const where: string[] = ['1 = 1'];
  const binds: unknown[] = [];
  if (status && status !== 'ALL') {
    if (status === 'PAID') where.push("payment_status = 'PAID'");
    else if (status === 'PENDING') where.push("payment_status = 'PENDING'");
    else if (status === 'EXPIRED') where.push("payment_status IN ('EXPIRED','FAILED')");
    else {
      where.push('fulfill_status = ?');
      binds.push(status);
    }
  }
  if (q) {
    where.push('(id LIKE ? OR item_name LIKE ? OR customer_contact LIKE ? OR COALESCE(player_name, \'\') LIKE ?)');
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  const clause = where.join(' AND ');

  const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM orders WHERE ${clause}`)
    .bind(...binds)
    .first<{ n: number }>();
  const { results } = await env.DB.prepare(
    `SELECT * FROM orders WHERE ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(...binds, limit, (page - 1) * limit)
    .all<OrderRow>();

  return c.json({
    success: true,
    page,
    total: total?.n ?? 0,
    totalPages: Math.max(1, Math.ceil((total?.n ?? 0) / limit)),
    orders: (results ?? []).map((row) => ({
      ...publicOrder(row),
      paymentRef: row.payment_ref,
      supplierOrderId: row.supplier_order_id,
      attempts: row.attempts,
    })),
  });
});

adminRoutes.get('/orders/:id', async (c) => {
  const env = c.env as Env;
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(c.req.param('id')).first<OrderRow>();
  if (!order) return c.json({ success: false, message: 'Order not found.' }, 404);
  const { results: events } = await env.DB.prepare(
    'SELECT kind, message, created_at FROM order_events WHERE order_id = ? ORDER BY id ASC',
  )
    .bind(order.id)
    .all();
  return c.json({
    success: true,
    order: {
      ...publicOrder(order),
      paymentRef: order.payment_ref,
      supplierOrderId: order.supplier_order_id,
      attempts: order.attempts,
      accountJson: order.account_json,
      deliveryJson: order.delivery_json,
    },
    events: events ?? [],
  });
});

adminRoutes.post('/orders/:id/retry', async (c) => {
  const env = c.env as Env;
  const origin = new URL(c.req.url).origin;
  const id = c.req.param('id');
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
  if (!order) return c.json({ success: false, message: 'Order not found.' }, 404);
  if (order.payment_status !== 'PAID') {
    return c.json({ success: false, message: 'Order is not paid — nothing to deliver.' }, 409);
  }

  await env.DB.prepare("UPDATE orders SET fulfill_status = 'MANUAL', updated_at = ? WHERE id = ? AND fulfill_status = 'FAILED'")
    .bind(new Date().toISOString(), id)
    .run();

  const result = order.supplier_order_id
    ? await refreshOrder(env, origin, id)
    : await dispatchOrder(env, origin, id);
  const fresh = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
  return c.json({ success: true, message: result.message, order: fresh ? publicOrder(fresh) : null });
});

adminRoutes.post('/orders/:id/mark-paid', async (c) => {
  const env = c.env as Env;
  const origin = new URL(c.req.url).origin;
  const id = c.req.param('id');
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
  if (!order) return c.json({ success: false, message: 'Order not found.' }, 404);
  if (order.payment_status === 'PAID') return c.json({ success: true, message: 'Already paid.' });

  const changed = await markPaid(env, origin, id, `manual (${c.get('adminName')})`);
  const fresh = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
  return c.json({
    success: true,
    changed,
    message: changed ? 'Marked paid and queued for delivery.' : 'No change.',
    order: fresh ? publicOrder(fresh) : null,
  });
});

adminRoutes.post('/orders/sweep', async (c) => {
  const env = c.env as Env;
  const origin = new URL(c.req.url).origin;
  const result = await sweepOrders(env, origin);
  return c.json({ success: true, ...result });
});

/* -------------------------------------------------------------- catalog */

adminRoutes.post('/catalog/sync', async (c) => {
  const env = c.env as Env;
  try {
    const result = await syncCatalog(env);
    return c.json({ success: true, result });
  } catch (err) {
    return c.json({ success: false, message: (err as Error).message }, 502);
  }
});

/** Syncs denominations for up to 8 games per call so the batch stays inside Worker limits. */
adminRoutes.post('/catalog/sync-denoms', async (c) => {
  const env = c.env as Env;
  const body = await readJson<{ codes?: string[]; force?: boolean }>(c);
  const codes = (body.codes ?? []).slice(0, 8);
  const force = !!body.force;

  if (codes.length) {
    const done: string[] = [];
    for (const code of codes) {
      try {
        await syncGameDenoms(env, code, force);
        done.push(code);
      } catch {
        // keep going; a single bad game must not abort the batch
      }
    }
    return c.json({ success: true, synced: done, remaining: 0 });
  }

  const { results } = await env.DB.prepare(
    'SELECT code FROM games WHERE visible = 1 ORDER BY (SELECT MAX(synced_at) FROM game_denoms WHERE game_code = games.code) IS NOT NULL, code ASC LIMIT 8',
  ).all<{ code: string }>();
  const batch = (results ?? []).map((r) => r.code);
  const done: string[] = [];
  for (const code of batch) {
    try {
      await syncGameDenoms(env, code, true);
      done.push(code);
    } catch {
      /* ignore */
    }
  }
  const remainingRow = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM games WHERE visible = 1 AND code NOT IN (SELECT DISTINCT game_code FROM game_denoms)",
  ).first<{ n: number }>();

  return c.json({ success: true, synced: done, remaining: remainingRow?.n ?? 0 });
});

adminRoutes.post('/catalog/reprice', async (c) => {
  const env = c.env as Env;
  const result = await repriceCatalog(env);
  return c.json({ success: true, ...result });
});

adminRoutes.get('/catalog/games', async (c) => {
  const env = c.env as Env;
  const q = (c.req.query('q') || '').trim();
  const limit = Math.min(Number(c.req.query('limit') || 100), 300);
  const { results } = await env.DB.prepare(
    `SELECT g.*, (SELECT COUNT(*) FROM game_denoms d WHERE d.game_code = g.code) AS denom_count
     FROM games g ${q ? 'WHERE g.name LIKE ? OR g.code LIKE ?' : ''}
     ORDER BY g.featured DESC, g.name ASC LIMIT ?`,
  )
    .bind(...(q ? [`%${q}%`, `%${q}%`] : []), limit)
    .all<GameRow & { denom_count: number }>();

  return c.json({
    success: true,
    games: (results ?? []).map((row) => ({ ...parseGame(row), denomCount: row.denom_count })),
  });
});

adminRoutes.patch('/catalog/games/:code', async (c) => {
  const env = c.env as Env;
  const body = await readJson<{ visible?: boolean; featured?: boolean; sortOrder?: number; name?: string }>(c);
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (typeof body.visible === 'boolean') {
    sets.push('visible = ?');
    binds.push(body.visible ? 1 : 0);
  }
  if (typeof body.featured === 'boolean') {
    sets.push('featured = ?');
    binds.push(body.featured ? 1 : 0);
  }
  if (typeof body.sortOrder === 'number') {
    sets.push('sort_order = ?');
    binds.push(Math.trunc(body.sortOrder));
  }
  if (typeof body.name === 'string' && body.name.trim()) {
    sets.push('name = ?');
    binds.push(body.name.trim().slice(0, 120));
  }
  if (!sets.length) return c.json({ success: false, message: 'Nothing to update.' }, 400);
  await env.DB.prepare(`UPDATE games SET ${sets.join(', ')} WHERE code = ?`)
    .bind(...binds, c.req.param('code'))
    .run();
  return c.json({ success: true });
});

adminRoutes.get('/catalog/games/:code/denoms', async (c) => {
  const env = c.env as Env;
  const { results } = await env.DB.prepare(
    'SELECT * FROM game_denoms WHERE game_code = ? ORDER BY sort_order ASC, cost_cents ASC',
  )
    .bind(c.req.param('code'))
    .all<DenomRow>();
  return c.json({ success: true, denominations: (results ?? []).map(parseDenom) });
});

adminRoutes.patch('/catalog/denoms/:id', async (c) => {
  const env = c.env as Env;
  const id = Number(c.req.param('id'));
  const body = await readJson<{ priceCents?: number | null; visible?: boolean }>(c);
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (body.priceCents === null) {
    sets.push('price_override = 0');
  } else if (typeof body.priceCents === 'number' && Number.isFinite(body.priceCents) && body.priceCents > 0) {
    sets.push('price_cents = ?', 'price_override = 1');
    binds.push(Math.round(body.priceCents));
  }
  if (typeof body.visible === 'boolean') {
    sets.push('visible = ?');
    binds.push(body.visible ? 1 : 0);
  }
  if (!sets.length) return c.json({ success: false, message: 'Nothing to update.' }, 400);
  await env.DB.prepare(`UPDATE game_denoms SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, id).run();
  return c.json({ success: true });
});

adminRoutes.get('/catalog/products', async (c) => {
  const env = c.env as Env;
  const q = (c.req.query('q') || '').trim();
  const page = Math.max(1, Number(c.req.query('page') || 1));
  const limit = Math.min(Math.max(1, Number(c.req.query('limit') || 30)), 100);
  const where = q ? 'WHERE title LIKE ? OR category_title LIKE ?' : '';
  const binds = q ? [`%${q}%`, `%${q}%`] : [];

  const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM gift_products ${where}`)
    .bind(...binds)
    .first<{ n: number }>();
  const { results } = await env.DB.prepare(
    `SELECT * FROM gift_products ${where} ORDER BY category_title ASC, title ASC LIMIT ? OFFSET ?`,
  )
    .bind(...binds, limit, (page - 1) * limit)
    .all<GiftRow>();

  return c.json({
    success: true,
    page,
    total: total?.n ?? 0,
    totalPages: Math.max(1, Math.ceil((total?.n ?? 0) / limit)),
    products: (results ?? []).map(parseGift),
  });
});

adminRoutes.patch('/catalog/products/:id', async (c) => {
  const env = c.env as Env;
  const id = Number(c.req.param('id'));
  const body = await readJson<{ priceCents?: number | null; visible?: boolean }>(c);
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (body.priceCents === null) {
    sets.push('price_override = 0');
  } else if (typeof body.priceCents === 'number' && Number.isFinite(body.priceCents) && body.priceCents > 0) {
    sets.push('price_cents = ?', 'price_override = 1');
    binds.push(Math.round(body.priceCents));
  }
  if (typeof body.visible === 'boolean') {
    sets.push('visible = ?');
    binds.push(body.visible ? 1 : 0);
  }
  if (!sets.length) return c.json({ success: false, message: 'Nothing to update.' }, 400);
  await env.DB.prepare(`UPDATE gift_products SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, id).run();
  return c.json({ success: true });
});

/* ------------------------------------------------------------- settings */

adminRoutes.get('/settings', async (c) => {
  const env = c.env as Env;
  const settings = await getSettings(env);
  return c.json({ success: true, settings: redactSettings(settings) });
});

adminRoutes.post('/settings', async (c) => {
  const env = c.env as Env;
  const body = await readJson<Record<string, unknown>>(c);
  await saveSettings(env, body as Record<string, unknown>);
  const settings = await getSettings(env);
  return c.json({ success: true, settings: redactSettings(settings) });
});

adminRoutes.post('/settings/password', async (c) => {
  const env = c.env as Env;
  const body = await readJson<{ current?: string; next?: string }>(c);
  const current = String(body.current || '');
  const next = String(body.next || '');
  if (next.length < 8) return c.json({ success: false, message: 'New password must be at least 8 characters.' }, 400);

  const admin = await env.DB.prepare('SELECT id, password_hash FROM admins WHERE id = ?')
    .bind(c.get('adminId'))
    .first<{ id: string; password_hash: string }>();
  if (!admin) return c.json({ success: false, message: 'Admin not found.' }, 404);
  if (!(await verifyPassword(current, admin.password_hash))) {
    return c.json({ success: false, message: 'Current password is incorrect.' }, 401);
  }
  await env.DB.prepare('UPDATE admins SET password_hash = ? WHERE id = ?')
    .bind(await hashPassword(next), admin.id)
    .run();
  await env.DB.prepare('DELETE FROM admin_sessions WHERE admin_id = ?').bind(admin.id).run();
  return c.json({ success: true, message: 'Password updated. Please sign in again.' });
});

/* ------------------------------------------------------------- supplier */

adminRoutes.get('/supplier/balance', async (c) => {
  const env = c.env as Env;
  const settings = await getSettings(env);
  if (!settings.g2bulk_api_key) {
    return c.json({ success: false, message: 'No G2Bulk API key configured.', balance: null }, 200);
  }
  try {
    const g2 = createG2Client({ baseUrl: settings.g2bulk_base_url, apiKey: settings.g2bulk_api_key });
    const me = await g2.me();
    return c.json({ success: true, balance: me.balance, username: me.username });
  } catch (err) {
    return c.json({ success: false, message: (err as Error).message, balance: null }, 200);
  }
});

/* -------------------------------------------------------------- contacts */

adminRoutes.get('/contacts', async (c) => {
  const env = c.env as Env;
  const { results } = await env.DB.prepare('SELECT * FROM contacts ORDER BY created_at DESC LIMIT 200').all();
  return c.json({ success: true, contacts: results ?? [] });
});

adminRoutes.patch('/contacts/:id', async (c) => {
  const env = c.env as Env;
  const body = await readJson<{ status?: string }>(c);
  const status = String(body.status || 'DONE').toUpperCase();
  await env.DB.prepare('UPDATE contacts SET status = ? WHERE id = ?').bind(status, c.req.param('id')).run();
  return c.json({ success: true });
});

/* ---------------------------------------------------------------- events */

adminRoutes.get('/orders/:id/events', async (c) => {
  const env = c.env as Env;
  const { results } = await env.DB.prepare(
    'SELECT kind, message, created_at FROM order_events WHERE order_id = ? ORDER BY id ASC',
  )
    .bind(c.req.param('id'))
    .all();
  return c.json({ success: true, events: results ?? [] });
});

adminRoutes.post('/reconcile', async (c) => {
  const env = c.env as Env;
  const origin = new URL(c.req.url).origin;
  await logEvent(env, '-', 'manual_reconcile', `triggered by ${c.get('adminName')}`);
  const result = await sweepOrders(env, origin);
  return c.json({ success: true, ...result });
});
