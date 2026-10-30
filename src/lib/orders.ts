import type { Env } from '../env';
import { randomId } from './crypto';

export async function logEvent(env: Env, orderId: string, kind: string, message = ''): Promise<void> {
  try {
    await env.DB.prepare('INSERT INTO order_events (order_id, kind, message, created_at) VALUES (?, ?, ?, ?)')
      .bind(orderId, kind, message.slice(0, 1000), new Date().toISOString())
      .run();
  } catch {
    // Logging must never break an order.
  }
}

export interface OrderRow {
  id: string;
  kind: 'TOPUP' | 'GIFTCARD';
  item_ref: string;
  item_name: string;
  item_image: string;
  denom_ref: string;
  denom_name: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  currency: string;
  account_json: string;
  player_name: string | null;
  customer_contact: string;
  note: string;
  payment_status: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED';
  payment_ref: string;
  aba_tx_id: string | null;
  aba_checkout_url: string | null;
  paid_at: string | null;
  fulfill_status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'MANUAL';
  supplier_order_id: string | null;
  delivery_json: string | null;
  supplier_error: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
}

export async function getOrder(env: Env, id: string): Promise<OrderRow | null> {
  return env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
}

export async function touchOrder(env: Env, id: string, patch: Partial<OrderRow>): Promise<void> {
  const keys = Object.keys(patch).filter((k) => k !== 'id');
  if (!keys.length) return;
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => (patch as Record<string, unknown>)[k] ?? null);
  await env.DB.prepare(`UPDATE orders SET ${sets}, updated_at = ? WHERE id = ?`)
    .bind(...values, new Date().toISOString(), id)
    .run();
}

/** Public shape returned by the storefront API — never leaks internal references. */
export function publicOrder(order: OrderRow) {
  let account: Record<string, string> = {};
  try {
    account = JSON.parse(order.account_json || '{}');
  } catch {
    account = {};
  }
  let delivery: string[] | null = null;
  try {
    delivery = order.delivery_json ? (JSON.parse(order.delivery_json) as string[]) : null;
  } catch {
    delivery = null;
  }
  return {
    id: order.id,
    kind: order.kind,
    item: {
      ref: order.item_ref,
      name: order.item_name,
      image: order.item_image,
    },
    denomination: order.denom_name,
    quantity: order.quantity,
    unitPriceCents: order.unit_price_cents,
    totalCents: order.total_cents,
    currency: order.currency,
    account,
    playerName: order.player_name,
    contact: order.customer_contact,
    paymentStatus: order.payment_status,
    fulfillStatus: order.fulfill_status,
    delivery: order.payment_status === 'PAID' && order.fulfill_status === 'SUCCESS' ? delivery : null,
    error: order.supplier_error,
    createdAt: order.created_at,
    paidAt: order.paid_at,
    updatedAt: order.updated_at,
  };
}

export function newOrderId(): string {
  return randomId('GT-', 8);
}

export function newPaymentRef(): string {
  return randomId('PAY-', 12);
}

export interface ContactInput {
  name: string;
  email: string;
  orderId: string;
  message: string;
}

export async function saveContact(env: Env, input: ContactInput): Promise<string> {
  const id = randomId('MSG-', 8);
  await env.DB.prepare('INSERT INTO contacts (id, name, email, order_id, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, input.name, input.email, input.orderId, input.message, 'NEW', new Date().toISOString())
    .run();
  return id;
}
