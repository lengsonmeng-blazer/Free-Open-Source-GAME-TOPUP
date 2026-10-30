import type { Env } from '../env';

export interface SettingsShape {
  site_name: string;
  site_tagline: string;
  support_telegram: string;
  support_email: string;
  currency: string;
  markup_percent: number;
  g2bulk_base_url: string;
  g2bulk_api_key: string;
  aba_base_url: string;
  aba_profile_id: string;
  aba_secret_key: string;
  demo_fulfillment: number;
  /** Accept orders without a live gateway and show a clearly-labelled test QR (never charges anyone). */
  payment_demo: number;
  maintenance: number;
  min_topup_cents: number;
  announcement: string;
}

export const DEFAULT_SETTINGS: SettingsShape = {
  site_name: 'Ahnajak TopUp',
  site_tagline: 'Instant game top-ups & digital gift cards',
  support_telegram: 'kesorcloud_support',
  support_email: 'support@ahnajak.tech',
  currency: 'USD',
  markup_percent: 6,
  g2bulk_base_url: 'https://api.g2bulk.com',
  g2bulk_api_key: '',
  aba_base_url: 'https://aba.ahnajak.cyou',
  aba_profile_id: '',
  aba_secret_key: '',
  demo_fulfillment: 1,
  payment_demo: 1,
  maintenance: 0,
  min_topup_cents: 50,
  announcement: '',
};

const SECRET_KEYS = new Set<keyof SettingsShape>(['g2bulk_api_key', 'aba_secret_key']);

export function invalidateSettingsCache() {
  // Kept for API symmetry; settings are always read fresh so an admin save is visible
  // immediately on the next request, even from another isolate.
}

export async function getSettings(env: Env): Promise<SettingsShape> {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  const merged: SettingsShape = { ...DEFAULT_SETTINGS };
  for (const row of results ?? []) {
    if (!(row.key in DEFAULT_SETTINGS)) continue;
    const key = row.key as keyof SettingsShape;
    const fallback = DEFAULT_SETTINGS[key];
    if (typeof fallback === 'number') {
      const n = Number(row.value);
      if (Number.isFinite(n)) (merged[key] as number) = n;
    } else {
      (merged[key] as string) = row.value;
    }
  }

  // Environment variables win when present so a deployment can inject secrets without the DB.
  if (env.G2BULK_API_KEY) merged.g2bulk_api_key = env.G2BULK_API_KEY;
  if (env.ABA_BASE_URL) merged.aba_base_url = env.ABA_BASE_URL;
  if (env.ABA_PROFILE_ID) merged.aba_profile_id = env.ABA_PROFILE_ID;
  if (env.ABA_SECRET_KEY) merged.aba_secret_key = env.ABA_SECRET_KEY;

  // Never let the admin read secrets back out.
  return merged;
}

/** Settings object safe to return to the admin UI (secrets replaced with a presence flag). */
export function redactSettings(settings: SettingsShape) {
  const out: Record<string, unknown> = { ...settings };
  for (const key of SECRET_KEYS) {
    const value = String(settings[key] ?? '');
    out[key] = '';
    out[`${key}_set`] = value.length > 0;
  }
  return out;
}

export async function saveSettings(env: Env, patch: Record<string, unknown>): Promise<void> {
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];

  for (const [key, raw] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    const typed = key as keyof SettingsShape;
    const fallback = DEFAULT_SETTINGS[typed];
    let value: string;

    if (typeof fallback === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      value = String(Math.trunc(n));
    } else {
      value = String(raw ?? '').slice(0, 4000);
      // Blank secret means "leave unchanged" so the UI never wipes a stored key by accident.
      if (SECRET_KEYS.has(typed) && value === '') continue;
    }

    statements.push(
      env.DB.prepare(
        `INSERT INTO settings (key, value, is_secret, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).bind(key, value, SECRET_KEYS.has(typed) ? 1 : 0, now),
    );
  }

  if (statements.length) await env.DB.batch(statements);
  invalidateSettingsCache();
}
