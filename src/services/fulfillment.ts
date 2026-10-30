import type { Env } from '../env';
import { randomId, uuid } from '../lib/crypto';
import { getOrder, logEvent, type OrderRow, touchOrder } from '../lib/orders';
import { getSettings } from '../lib/settings';
import { createG2Client, G2BulkError } from './g2bulk';

const MAX_ATTEMPTS = 3;

function supplierClient(baseUrl: string, apiKey: string) {
  return createG2Client({ baseUrl, apiKey });
}

function callbackUrl(origin: string): string {
  return `${origin}/api/webhook/g2bulk`;
}

/**
 * Claims the right to dispatch an order exactly once. The conditional UPDATE is the lock:
 * only the request that actually changes PENDING -> PROCESSING proceeds to call the supplier.
 */
async function claimFulfillment(env: Env, order: OrderRow): Promise<boolean> {
  const res = await env.DB.prepare(
    `UPDATE orders SET fulfill_status = 'PROCESSING', attempts = attempts + 1, updated_at = ?
     WHERE id = ? AND payment_status = 'PAID' AND fulfill_status IN ('PENDING', 'MANUAL')`,
  )
    .bind(new Date().toISOString(), order.id)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

function demoDelivery(order: OrderRow): string[] {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  if (order.kind === 'GIFTCARD') {
    return [`DEMO-${randomId('', 4)}-${randomId('', 4)}-${randomId('', 4)}-${stamp}`];
  }
  return [`DEMO top-up of ${order.denom_name} to ${order.account_json} (${order.id})`];
}

export interface DispatchResult {
  ok: boolean;
  status: OrderRow['fulfill_status'];
  message: string;
}

/** Sends a paid order to the supplier. Safe to call repeatedly — only one dispatch wins. */
export async function dispatchOrder(env: Env, origin: string, orderId: string): Promise<DispatchResult> {
  const order = await getOrder(env, orderId);
  if (!order) return { ok: false, status: 'FAILED', message: 'Order not found' };

  if (order.payment_status !== 'PAID') {
    return { ok: false, status: order.fulfill_status, message: 'Order is not paid yet' };
  }
  if (order.fulfill_status === 'SUCCESS') {
    return { ok: true, status: 'SUCCESS', message: 'Already delivered' };
  }

  const settings = await getSettings(env);
  const client = supplierClient(settings.g2bulk_base_url, settings.g2bulk_api_key);

  // Demo mode: no supplier key configured, or the admin explicitly enabled it.
  if (settings.demo_fulfillment === 1 || !settings.g2bulk_api_key) {
    const claimed = await env.DB.prepare(
      `UPDATE orders SET fulfill_status = 'PROCESSING', attempts = attempts + 1, updated_at = ?
       WHERE id = ? AND payment_status = 'PAID' AND fulfill_status IN ('PENDING', 'MANUAL')`,
    )
      .bind(new Date().toISOString(), orderId)
      .run();
    if ((claimed.meta?.changes ?? 0) === 0) {
      const fresh = await getOrder(env, orderId);
      return {
        ok: fresh?.fulfill_status === 'SUCCESS',
        status: fresh?.fulfill_status ?? 'PROCESSING',
        message: 'Fulfillment already in progress',
      };
    }
    const codes = demoDelivery(order);
    await touchOrder(env, orderId, {
      fulfill_status: 'SUCCESS',
      delivery_json: JSON.stringify(codes),
      supplier_order_id: `DEMO-${randomId('', 8)}`,
      supplier_error: null,
    } as Partial<OrderRow>);
    await logEvent(
      env,
      orderId,
      'fulfilled_demo',
      settings.demo_fulfillment === 1
        ? 'Delivered in demo mode (admin enabled demo fulfillment).'
        : 'Delivered in demo mode (no G2Bulk API key configured).',
    );
    return { ok: true, status: 'SUCCESS', message: 'Delivered (demo mode)' };
  }

  if (order.fulfill_status === 'PROCESSING' && order.supplier_order_id) {
    // Already handed to the supplier — refresh it instead of double-charging.
    const result = await refreshOrder(env, origin, orderId);
    return { ok: result.status === 'SUCCESS', status: result.status, message: result.message };
  }

  if ((order.attempts ?? 0) >= MAX_ATTEMPTS && order.fulfill_status === 'FAILED') {
    return { ok: false, status: 'FAILED', message: 'Maximum retry attempts reached' };
  }

  const claimed = await claimFulfillment(env, order);
  if (!claimed) {
    const fresh = await getOrder(env, orderId);
    return {
      ok: fresh?.fulfill_status === 'SUCCESS',
      status: fresh?.fulfill_status ?? 'PROCESSING',
      message: 'Fulfillment already in progress',
    };
  }

  const account = (() => {
    try {
      return JSON.parse(order.account_json || '{}') as Record<string, string>;
    } catch {
      return {} as Record<string, string>;
    }
  })();

  try {
    if (order.kind === 'TOPUP') {
      const res = await client.createTopupOrder(
        order.item_ref,
        {
          catalogue_name: order.denom_ref,
          player_id: account.user_id || account.player_id || '',
          server_id: account.server_id || undefined,
          charname: account.charname || undefined,
          remark: order.id,
          callback_url: callbackUrl(origin),
        },
        uuid(),
      );
      const supplierId = String(res.order.order_id);
      const supplierStatus = res.order.status;
      if (supplierStatus === 'COMPLETED') {
        await touchOrder(env, orderId, {
          fulfill_status: 'SUCCESS',
          supplier_order_id: supplierId,
          delivery_json: JSON.stringify([
            `${order.denom_name} delivered to ${res.order.player_name || account.user_id || ''}`.trim(),
          ]),
          supplier_error: null,
        } as Partial<OrderRow>);
        await logEvent(env, orderId, 'fulfilled', `Supplier order ${supplierId} completed`);
        return { ok: true, status: 'SUCCESS', message: 'Delivered' };
      }
      if (supplierStatus === 'FAILED') {
        await touchOrder(env, orderId, {
          fulfill_status: 'FAILED',
          supplier_order_id: supplierId,
          supplier_error: 'Supplier reported the top-up as failed (wallet refunded).',
        } as Partial<OrderRow>);
        await logEvent(env, orderId, 'failed', `Supplier order ${supplierId} failed`);
        return { ok: false, status: 'FAILED', message: 'Supplier reported a failure' };
      }
      await touchOrder(env, orderId, {
        fulfill_status: 'PROCESSING',
        supplier_order_id: supplierId,
        supplier_error: null,
      } as Partial<OrderRow>);
      await logEvent(env, orderId, 'dispatched', `Supplier top-up order ${supplierId} accepted (${supplierStatus})`);
      return { ok: true, status: 'PROCESSING', message: 'Top-up accepted by supplier' };
    }

    // Gift card / voucher
    const res = await client.purchaseProduct(
      Number(order.item_ref),
      order.quantity,
      { description: order.id, callback_url: callbackUrl(origin) },
      uuid(),
    );

    if (res.status === 'COMPLETED' && Array.isArray(res.delivery_items) && res.delivery_items.length) {
      await touchOrder(env, orderId, {
        fulfill_status: 'SUCCESS',
        supplier_order_id: String(res.order_id),
        delivery_json: JSON.stringify(res.delivery_items),
        supplier_error: null,
      } as Partial<OrderRow>);
      await logEvent(env, orderId, 'fulfilled', `Voucher order ${res.order_id} delivered`);
      return { ok: true, status: 'SUCCESS', message: 'Voucher delivered' };
    }

    await touchOrder(env, orderId, {
      fulfill_status: 'PROCESSING',
      supplier_order_id: String(res.order_id),
      supplier_error: null,
    } as Partial<OrderRow>);
    await logEvent(env, orderId, 'dispatched', `Voucher order ${res.order_id} is pending at the supplier`);
    return { ok: true, status: 'PROCESSING', message: 'Voucher order pending at supplier' };
  } catch (err) {
    const message = err instanceof G2BulkError ? err.message : (err as Error).message;
    const refunded = /enough balance/i.test(message);
    await touchOrder(env, orderId, {
      fulfill_status: refunded ? 'FAILED' : 'MANUAL',
      supplier_error: message.slice(0, 900),
    } as Partial<OrderRow>);
    await logEvent(env, orderId, 'dispatch_failed', message.slice(0, 900));
    return { ok: false, status: refunded ? 'FAILED' : 'MANUAL', message };
  }
}

export interface RefreshResult {
  status: OrderRow['fulfill_status'];
  message: string;
}

/** Polls the supplier for orders that are still PROCESSING and finalises them. */
export async function refreshOrder(env: Env, origin: string, orderId: string): Promise<RefreshResult> {
  void origin;
  const order = await getOrder(env, orderId);
  if (!order) return { status: 'FAILED', message: 'Order not found' };
  if (order.fulfill_status !== 'PROCESSING') {
    return { status: order.fulfill_status, message: 'Nothing to refresh' };
  }
  if (!order.supplier_order_id) return { status: 'PROCESSING', message: 'Waiting for dispatch' };

  const settings = await getSettings(env);
  if (settings.demo_fulfillment === 1 || !settings.g2bulk_api_key) {
    return { status: 'PROCESSING', message: 'Demo mode' };
  }
  const client = supplierClient(settings.g2bulk_base_url, settings.g2bulk_api_key);

  try {
    if (order.kind === 'TOPUP') {
      const res = await client.topupStatus(order.item_ref, Number(order.supplier_order_id));
      const status = res.order.status;
      if (status === 'COMPLETED') {
        await touchOrder(env, orderId, {
          fulfill_status: 'SUCCESS',
          delivery_json: JSON.stringify([
            `${order.denom_name} delivered to ${res.order.player_name || order.player_name || ''}`.trim(),
          ]),
          supplier_error: null,
        } as Partial<OrderRow>);
        await logEvent(env, orderId, 'fulfilled', 'Supplier confirmed completion');
        return { status: 'SUCCESS', message: 'Delivered' };
      }
      if (status === 'FAILED') {
        await touchOrder(env, orderId, {
          fulfill_status: 'FAILED',
          supplier_error: res.order.message || 'Supplier reported the top-up as failed.',
        } as Partial<OrderRow>);
        await logEvent(env, orderId, 'failed', 'Supplier reported failure');
        return { status: 'FAILED', message: 'Supplier failure' };
      }
      return { status: 'PROCESSING', message: status };
    }

    const delivery = await client.delivery(Number(order.supplier_order_id));
    if (delivery.status === 'COMPLETED' && delivery.delivery_items?.length) {
      await touchOrder(env, orderId, {
        fulfill_status: 'SUCCESS',
        delivery_json: JSON.stringify(delivery.delivery_items),
        supplier_error: null,
      } as Partial<OrderRow>);
      await logEvent(env, orderId, 'fulfilled', 'Voucher codes received');
      return { status: 'SUCCESS', message: 'Voucher delivered' };
    }
    if (delivery.status === 'FAILED' || delivery.status === 'CANCELLED' || delivery.refunded) {
      await touchOrder(env, orderId, {
        fulfill_status: 'FAILED',
        supplier_error: delivery.message || 'Supplier cancelled and refunded the order.',
      } as Partial<OrderRow>);
      await logEvent(env, orderId, 'failed', 'Supplier cancelled the voucher order');
      return { status: 'FAILED', message: 'Supplier cancellation' };
    }
    return { status: 'PROCESSING', message: delivery.status };
  } catch (err) {
    const message = err instanceof G2BulkError ? err.message : (err as Error).message;
    await logEvent(env, orderId, 'refresh_failed', message.slice(0, 900));
    return { status: 'PROCESSING', message };
  }
}

/** Sweeps every paid-but-undelivered order. Used by the cron trigger and the admin dashboard. */
export async function sweepOrders(env: Env, origin: string): Promise<{ dispatched: number; refreshed: number }> {
  const { results } = await env.DB.prepare(
    `SELECT id, fulfill_status, supplier_order_id FROM orders
     WHERE payment_status = 'PAID'
       AND fulfill_status IN ('PENDING', 'MANUAL', 'PROCESSING')
       AND created_at > ?
     ORDER BY created_at ASC
     LIMIT 25`,
  )
    .bind(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .all<{ id: string; fulfill_status: string; supplier_order_id: string | null }>();

  let dispatched = 0;
  let refreshed = 0;
  for (const row of results ?? []) {
    if (row.fulfill_status === 'PROCESSING' && row.supplier_order_id) {
      await refreshOrder(env, origin, row.id);
      refreshed++;
    } else {
      await dispatchOrder(env, origin, row.id);
      dispatched++;
    }
  }
  return { dispatched, refreshed };
}
