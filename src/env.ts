export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Optional overrides — normally configured in the admin panel (stored in D1). */
  G2BULK_API_KEY?: string;
  ABA_BASE_URL?: string;
  ABA_PROFILE_ID?: string;
  ABA_SECRET_KEY?: string;
  SESSION_SECRET?: string;
  /** Public origin used for webhooks and return URLs, e.g. https://topup.ahnajak.tech */
  PUBLIC_ORIGIN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

export type Variables = {
  adminId?: string;
  adminName?: string;
};

export type AppEnv = { Bindings: Env; Variables: Variables };
