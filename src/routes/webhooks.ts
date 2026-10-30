import { Hono } from 'hono';
import type { AppEnv, Env } from '../env';
import { sha256Hex, safeEqual } from '../lib/crypto';
import { logEvent } from '../lib/orders';
import { getSettings } from '../lib/settings';
import { markPaid } from '../services/payments';
import { verifyWebhook } from '../services/ahnajakpay';
import { refreshOrder } from '../services/fulfillment';

export const webhookRoutes = new Hono<AppEnv>();

/**
 * Ahnajak Pay -> us.
 * Body: { transaction_id, amount, status, hash }
 * Header: X-Ahnajak-Signature = HMAC-SHA256(secret_key, raw body)
 */
webhookRoutes.post('/ahnajakpay', async (c) => {
  const env = c.env as Env;
  const raw = await c.req.text();
  const signature = c.req.header('x-ahnajak-signature') || null;

  let payload: { transaction_id?: string; amount?: string; status?: string; hash?: string } = {};
  try {
    payload = JSON.parse(raw || '{}');
  } catch {
    return c.json({ success: false, message: 'Invalid JSON body.' }, 400);
  }

  const settings = await getSettings(env);
  const secret = settings.aba_secret_key;
  if (!secret) return c.json({ success: false, message: 'Gateway not configured.' }, 503);

  const signatureOk = await verifyWebhook(secret, raw, signature);
  if (!signatureOk) {
    // Reject unsigned or tampered callbacks: only the gateway holds the secret.
    return c.json({ success: false, message: 'Invalid signature.' }, 401);
  }

  // The gateway also embeds sha256(transaction_id + amount + secret_key) in the body.
  const bodyHashOk = payload.hash
    ? safeEqual(payload.hash, await sha256Hex(`${payload.transaction_id}${payload.amount}${secret}`))
    : true;

  const paymentRef = String(payload.transaction_id || '');
  const order = await env.DB.prepare('SELECT id, payment_status FROM orders WHERE payment_ref = ?')
    .bind(paymentRef)
    .first<{ id: string; payment_status: string }>();

  if (!order) {
    return c.json({ success: true, ignored: true, message: 'No matching order.' });
  }

  const status = String(payload.status || '').toUpperCase();
  const origin = new URL(c.req.url).origin;

  await logEvent(env, order.id, 'webhook', `gateway status ${status} (signature ${signatureOk ? 'ok' : 'bad'})`);

  if ((status === 'SUCCESS' || status === 'PAID' || status === 'COMPLETED') && bodyHashOk) {
    const changed = await markPaid(env, origin, order.id, 'webhook');
    return c.json({ success: true, changed });
  }

  return c.json({ success: true, ignored: true, status });
});

/**
 * G2Bulk -> us. The supplier lets you subscribe a URL per order; we merely
 * use it as a nudge to re-read the authoritative order state.
 */
webhookRoutes.post('/g2bulk', async (c) => {
  const env = c.env as Env;
  const raw = await c.req.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(raw || '{}');
  } catch {
    payload = {};
  }

  const orderRef =
    (payload.remark as string) ||
    (payload.reference as string) ||
    (payload.client_reference as string) ||
    '';
  const match = String(orderRef).match(/GT-[A-Z0-9]{4,12}/);
  if (!match) return c.json({ success: true, ignored: true });

  const order = await env.DB.prepare('SELECT id FROM orders WHERE id = ?').bind(match[0]).first<{ id: string }>();
  if (!order) return c.json({ success: true, ignored: true });

  const origin = new URL(c.req.url).origin;
  await logEvent(env, order.id, 'supplier_webhook', raw.slice(0, 300));
  await refreshOrder(env, origin, order.id);
  return c.json({ success: true });
});

/** Ahnajak Pay also supports GET-style health probes on its webhook path. */
webhookRoutes.get('/ahnajakpay', (c) => c.json({ success: true, service: 'ahnajakpay-webhook' }));
