/**
 * Ahnajak Pay gateway client — https://aba.ahnajak.cyou
 *
 * Flow
 *  1. GET  /api/payment/requestv2/{profile_id}?transaction_id&amount&hash&success_url&remark
 *         -> 302 to /payment/ahnajakpay/tx_xxxx  (the hosted checkout + QR session)
 *  2. GET  /api/payment/qr/{tx_id}            -> SVG QR image
 *  3. GET  /api/payment/status/{tx_id}        -> { status: PENDING | SUCCESS | EXPIRED, ... }
 *  4. Webhook POST (profile.webhook_url)      -> { transaction_id, amount, status, hash }
 *         signed with X-Ahnajak-Signature = HMAC-SHA256(secret_key, raw_body)
 */
import { hmacSha256Hex, safeEqual, sha256Hex } from '../lib/crypto';

export interface AbaConfig {
  baseUrl: string;
  profileId: string;
  secretKey: string;
}

export interface AbaCheckout {
  /** Gateway transaction id, e.g. tx_ab12cd34ef56 */
  txId: string;
  /** Absolute URL of the hosted checkout page. */
  checkoutUrl: string;
  /** Absolute URL of the QR SVG served by the gateway. */
  qrUrl: string;
}

export type AbaStatus = 'PENDING' | 'SUCCESS' | 'EXPIRED' | 'FAILED';

export class AbaPayError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'AbaPayError';
    this.status = status;
  }
}

/** sha256(profile_id + transaction_id + amount.toFixed(2) + secret_key) */
export async function signPaymentRequest(cfg: AbaConfig, transactionId: string, amount: number): Promise<string> {
  return sha256Hex(`${cfg.profileId}${transactionId}${amount.toFixed(2)}${cfg.secretKey}`);
}

export function isAbaConfigured(cfg: Partial<AbaConfig>): cfg is AbaConfig {
  return !!(cfg.baseUrl && cfg.profileId && cfg.secretKey);
}

export async function createCheckout(
  cfg: AbaConfig,
  input: { transactionId: string; amount: number; successUrl: string; remark: string },
): Promise<AbaCheckout> {
  const base = cfg.baseUrl.replace(/\/+$/, '');
  const hash = await signPaymentRequest(cfg, input.transactionId, input.amount);
  const params = new URLSearchParams({
    transaction_id: input.transactionId,
    amount: input.amount.toFixed(2),
    hash,
    success_url: input.successUrl,
    remark: input.remark.slice(0, 200),
  });
  const requestUrl = `${base}/api/payment/requestv2/${encodeURIComponent(cfg.profileId)}?${params.toString()}`;

  let res: Response;
  try {
    res = await fetch(requestUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'g2topup/1.0',
      },
    });
  } catch (err) {
    throw new AbaPayError(`Cannot reach the payment gateway: ${(err as Error).message}`);
  }

  const location = res.headers.get('location') || res.headers.get('Location') || '';
  const match = location.match(/\/payment\/ahnajakpay\/(tx_[A-Za-z0-9]+)/);
  if (!match) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      /* ignore */
    }
    throw new AbaPayError(
      `Payment gateway did not create a checkout session (HTTP ${res.status}). ${detail}`.trim(),
      502,
    );
  }

  const txId = match[1];
  return {
    txId,
    checkoutUrl: `${base}/payment/ahnajakpay/${txId}`,
    qrUrl: `${base}/api/payment/qr/${txId}`,
  };
}

export interface AbaStatusResult {
  status: AbaStatus;
  raw: Record<string, unknown>;
}

export async function fetchStatus(cfg: AbaConfig, txId: string): Promise<AbaStatusResult> {
  const base = cfg.baseUrl.replace(/\/+$/, '');
  let res: Response;
  try {
    res = await fetch(`${base}/api/payment/status/${txId}`, {
      headers: { accept: 'application/json', 'user-agent': 'g2topup/1.0' },
    });
  } catch (err) {
    throw new AbaPayError(`Payment status check failed: ${(err as Error).message}`);
  }

  if (!res.ok) throw new AbaPayError(`Payment status check returned HTTP ${res.status}`, res.status);

  const raw = (await res.json()) as Record<string, unknown>;
  const rawStatus = String(raw.status || '').toUpperCase();
  let status: AbaStatus = 'PENDING';
  if (rawStatus === 'SUCCESS' || rawStatus === 'PAID' || rawStatus === 'COMPLETED') status = 'SUCCESS';
  else if (rawStatus === 'EXPIRED' || rawStatus === 'CANCELLED' || rawStatus === 'FAILED') status = 'EXPIRED';
  return { status, raw };
}

/**
 * Verifies the webhook signature produced by Ahnajak Pay:
 *   X-Ahnajak-Signature = HMAC-SHA256(secret_key, raw body)
 */
export async function verifyWebhook(secretKey: string, rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const expected = await hmacSha256Hex(secretKey, rawBody);
  return safeEqual(expected, signature.toLowerCase());
}
