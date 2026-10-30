import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv, Env } from './env';
import { ensureSchema } from './lib/schema';
import { hashPassword, randomId } from './lib/crypto';
import { getSettings } from './lib/settings';
import { publicRoutes } from './routes/public';
import { adminRoutes } from './routes/admin';
import { webhookRoutes } from './routes/webhooks';
import { sweepOrders } from './services/fulfillment';
import { syncOrderPayment } from './services/payments';

const app = new Hono<AppEnv>();

/** Schema + first-admin bootstrap runs once per isolate. */
let bootstrapped: Promise<void> | null = null;

async function bootstrap(env: Env): Promise<void> {
  await ensureSchema(env.DB);

  const adminCount = await env.DB.prepare('SELECT COUNT(*) AS n FROM admins').first<{ n: number }>();
  if ((adminCount?.n ?? 0) === 0) {
    const username = 'admin';
    const password = 'admin12345'; // must be changed from the admin panel right after first login
    await env.DB.prepare('INSERT INTO admins (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .bind(randomId('adm_', 10), username, await hashPassword(password), new Date().toISOString())
      .run();
    console.warn('[g2topup] Seeded default admin "admin" / "admin12345" — change it immediately.');
  }

  // Seed default settings rows so the admin panel always has something to edit.
  const settings = await getSettings(env);
  const now = new Date().toISOString();
  const seed: D1PreparedStatement[] = [];
  for (const [key, value] of Object.entries(settings)) {
    seed.push(
      env.DB.prepare('INSERT OR IGNORE INTO settings (key, value, is_secret, updated_at) VALUES (?, ?, 0, ?)').bind(
        key,
        String(value),
        now,
      ),
    );
  }
  await env.DB.batch(seed);
}

app.use('/api/*', async (c, next) => {
  if (!bootstrapped) bootstrapped = bootstrap(c.env as Env);
  try {
    await bootstrapped;
  } catch (err) {
    bootstrapped = null;
    return c.json({ success: false, message: `Database bootstrap failed: ${(err as Error).message}` }, 500);
  }
  await next();
});

app.use('/api/*', cors({ origin: (origin) => origin || '*', credentials: true }));

app.get('/api/health', async (c) => {
  const env = c.env as Env;
  try {
    const row = await env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();
    return c.json({ ok: row?.ok === 1, service: 'g2topup', time: new Date().toISOString() });
  } catch (err) {
    return c.json({ ok: false, message: (err as Error).message }, 503);
  }
});

app.route('/api', publicRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/webhook', webhookRoutes);

app.notFound((c) => {
  const path = new URL(c.req.url).pathname;
  if (path.startsWith('/api/')) return c.json({ success: false, message: 'Not found.' }, 404);
  return c.env.ASSETS.fetch(c.req.raw);
});

app.onError((err, c) => {
  console.error('[g2topup]', err);
  if (new URL(c.req.url).pathname.startsWith('/api/')) {
    return c.json({ success: false, message: err.message || 'Internal error.' }, 500);
  }
  return c.text('Internal error', 500);
});

export default {
  fetch: app.fetch,

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        try {
          const origin = env.PUBLIC_ORIGIN || 'https://g2topup.example.workers.dev';
          // Settle pending payments that the customer closed the tab on.
          const { results } = await env.DB.prepare(
            `SELECT id FROM orders WHERE payment_status = 'PENDING' AND created_at > ? LIMIT 20`,
          )
            .bind(new Date(Date.now() - 60 * 60 * 1000).toISOString())
            .all<{ id: string }>();
          for (const row of results ?? []) {
            await syncOrderPayment(env, origin, row.id);
          }
          await sweepOrders(env, origin);
        } catch (err) {
          console.error('[g2topup] cron failed', err);
        }
      })(),
    );
  },
};
