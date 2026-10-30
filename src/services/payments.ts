import type { Env } from '../env';
import { getOrder, logEvent, type OrderRow, touchOrder } from '../lib/orders';
import { getSettings } from '../lib/settings';
import { fetchStatus, isAbaConfigured, type AbaConfig } from './ahnajakpay';
import { dispatchOrder } from './fulfillment';

export async function abaConfigFromSettings(env: Env): Promise<AbaConfig | null> {
  const settings = await getSettings(env);
  const cfg = {
    baseUrl: settings.aba_base_url,
    profileId: settings.aba_profile_id,
    secretKey: settings.aba_secret_key,
  };
  return isAbaConfigured(cfg) ? cfg : null;
}

/**
 * Flips PENDING/EXPIRED -> PAID exactly once and starts fulfillment.
 * Returns true when this call performed the transition.
 */
export async function markPaid(env: Env, origin: string, orderId: string, source: string): Promise<boolean> {
  const now = new Date().toISOString();
  const res = await env.DB.prepare(
    `UPDATE orders SET payment_status = 'PAID', paid_at = COALESCE(paid_at, ?), updated_at = ?
     WHERE id = ? AND payment_status IN ('PENDING', 'EXPIRED')`,
  )
    .bind(now, now, orderId)
    .run();

  if ((res.meta?.changes ?? 0) === 0) return false;

  await logEvent(env, orderId, 'paid', `Payment confirmed via ${source}`);
  await dispatchOrder(env, origin, orderId);
  return true;
}

export async function markExpired(env: Env, orderId: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE orders SET payment_status = 'EXPIRED', updated_at = ? WHERE id = ? AND payment_status = 'PENDING'`,
  )
    .bind(new Date().toISOString(), orderId)
    .run();
  await logEvent(env, orderId, 'expired', 'Payment window closed without a confirmed payment');
}

export interface SyncResult {
  order: OrderRow;
  paid: boolean;
  changed: boolean;
}

/**
 * Reconciles one order against the payment gateway. Safe to call on every poll:
 * a settled order returns immediately without touching the network.
 */
export async function syncOrderPayment(env: Env, origin: string, orderId: string): Promise<SyncResult | null> {
  const order = await getOrder(env, orderId);
  if (!order) return null;

  if (order.payment_status === 'PAID') {
    return { order, paid: true, changed: false };
  }
  if (order.payment_status === 'EXPIRED' || order.payment_status === 'FAILED') {
    return { order, paid: false, changed: false };
  }
  if (!order.aba_tx_id) {
    return { order, paid: false, changed: false };
  }
  if (order.aba_tx_id.startsWith('DEMO-')) {
    // Test mode: nothing to reconcile, a staff member confirms the order.
    return { order, paid: false, changed: false };
  }

  const cfg = await abaConfigFromSettings(env);
  if (!cfg) return { order, paid: false, changed: false };

  try {
    const { status } = await fetchStatus(cfg, order.aba_tx_id);
    if (status === 'SUCCESS') {
      await markPaid(env, origin, orderId, 'gateway poll');
      const fresh = await getOrder(env, orderId);
      return { order: fresh ?? order, paid: true, changed: true };
    }
    if (status === 'EXPIRED') {
      await markExpired(env, orderId);
      const fresh = await getOrder(env, orderId);
      return { order: fresh ?? order, paid: false, changed: true };
    }
  } catch {
    // A flaky gateway must not break the customer's status page.
  }

  return { order, paid: false, changed: false };
}

/** Re-checks the gateway for an order the customer says they already paid. */
export async function refreshPaidOrder(env: Env, origin: string, orderId: string): Promise<OrderRow | null> {
  const fresh = await getOrder(env, orderId);
  if (!fresh) return null;
  if (fresh.payment_status === 'PAID' && fresh.fulfill_status === 'PENDING') {
    await dispatchOrder(env, origin, orderId);
  }
  void touchOrder;
  return getOrder(env, orderId);
}
