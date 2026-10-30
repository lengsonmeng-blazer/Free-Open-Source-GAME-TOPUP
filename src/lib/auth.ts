import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { AppEnv, Env } from '../env';
import { hmacSha256Hex, randomId, safeEqual } from './crypto';

const COOKIE = 'gt_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

function sessionSecret(env: Env): string {
  // Falls back to the gateway secret so a fork without extra config still boots.
  return env.SESSION_SECRET || env.ABA_SECRET_KEY || 'g2topup-dev-secret-change-me';
}

export async function createSession(env: Env, adminId: string): Promise<string> {
  const id = randomId('sess_', 20);
  const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await env.DB.prepare('INSERT INTO admin_sessions (id, admin_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, adminId, expires, new Date().toISOString())
    .run();
  return id;
}

export async function attachSessionCookie(c: Context<AppEnv>, env: Env, sessionId: string): Promise<void> {
  const sig = await hmacSha256Hex(sessionSecret(env), sessionId);
  const isHttps = new URL(c.req.url).protocol === 'https:';
  setCookie(c, COOKIE, `${sessionId}.${sig}`, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isHttps,
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(c: Context<AppEnv>): void {
  deleteCookie(c, COOKIE, { path: '/' });
}

export async function destroySession(c: Context<AppEnv>): Promise<void> {
  const raw = getCookie(c, COOKIE);
  if (raw && raw.includes('.')) {
    const [sessionId] = raw.split('.');
    if (sessionId) {
      await (c.env as Env).DB.prepare('DELETE FROM admin_sessions WHERE id = ?').bind(sessionId).run();
    }
  }
  clearSessionCookie(c);
}

export interface AdminIdentity {
  id: string;
  username: string;
}

export async function resolveAdmin(c: Context<AppEnv>): Promise<AdminIdentity | null> {
  const raw = getCookie(c, COOKIE);
  if (!raw || !raw.includes('.')) return null;
  const [sessionId, sig] = raw.split('.');
  if (!sessionId || !sig) return null;

  const expected = await hmacSha256Hex(sessionSecret(c.env as Env), sessionId);
  if (!safeEqual(expected, sig)) return null;

  const row = await (c.env as Env).DB.prepare(
    `SELECT s.admin_id AS id, s.expires_at AS expires, a.username AS username
     FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
     WHERE s.id = ?`,
  )
    .bind(sessionId)
    .first<{ id: string; expires: string; username: string }>();

  if (!row) return null;
  if (new Date(row.expires).getTime() < Date.now()) {
    await (c.env as Env).DB.prepare('DELETE FROM admin_sessions WHERE id = ?').bind(sessionId).run();
    return null;
  }
  return { id: row.id, username: row.username };
}

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const admin = await resolveAdmin(c);
  if (!admin) return c.json({ success: false, message: 'Admin authentication required.' }, 401);
  c.set('adminId', admin.id);
  c.set('adminName', admin.username);
  await next();
};

/* ----------------------------------------------------- customer auth */

export interface UserIdentity {
  id: string;
  email: string;
  username: string;
  balanceCents: number;
}

const USER_COOKIE = 'gt_user_session';
const USER_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export async function createCustomerSession(env: Env, userId: string): Promise<string> {
  const id = randomId('usess_', 24);
  const expires = new Date(Date.now() + USER_SESSION_TTL_MS).toISOString();
  await env.DB.prepare('INSERT INTO user_sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, userId, expires, new Date().toISOString())
    .run();
  return id;
}

export async function attachCustomerSessionCookie(c: Context<AppEnv>, env: Env, sessionId: string): Promise<void> {
  const sig = await hmacSha256Hex(sessionSecret(env), sessionId);
  const isHttps = new URL(c.req.url).protocol === 'https:';
  setCookie(c, USER_COOKIE, `${sessionId}.${sig}`, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isHttps,
    path: '/',
    maxAge: USER_SESSION_TTL_MS / 1000,
  });
}

export function clearCustomerSessionCookie(c: Context<AppEnv>): void {
  deleteCookie(c, USER_COOKIE, { path: '/' });
}

export async function destroyCustomerSession(c: Context<AppEnv>): Promise<void> {
  const raw = getCookie(c, USER_COOKIE);
  if (raw && raw.includes('.')) {
    const [sessionId] = raw.split('.');
    if (sessionId) {
      await (c.env as Env).DB.prepare('DELETE FROM user_sessions WHERE id = ?').bind(sessionId).run();
    }
  }
  clearCustomerSessionCookie(c);
}

export async function resolveCustomer(c: Context<AppEnv>): Promise<UserIdentity | null> {
  const env = c.env as Env;
  const raw = getCookie(c, USER_COOKIE);
  if (!raw) return null;

  const parts = raw.split('.');
  if (parts.length !== 2) return null;
  const [sessionId, clientSig] = parts;

  const expectedSig = await hmacSha256Hex(sessionSecret(env), sessionId);
  if (!safeEqual(clientSig, expectedSig)) return null;

  const now = new Date().toISOString();
  const session = await env.DB.prepare(
    `SELECT s.id, s.user_id, s.expires_at, u.id AS uid, u.email, u.username, u.balance_cents
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > ?`,
  )
    .bind(sessionId, now)
    .first<{
      id: string;
      user_id: string;
      expires_at: string;
      uid: string;
      email: string;
      username: string;
      balance_cents: number;
    }>();

  if (!session) return null;

  return {
    id: session.uid,
    email: session.email,
    username: session.username,
    balanceCents: Number(session.balance_cents || 0),
  };
}

/* ------------------------------------------------------- rate limiting */

export async function tooManyAttempts(env: Env, key: string, limit: number, windowMinutes: number): Promise<boolean> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE key = ? AND created_at > ?')
    .bind(key, since)
    .first<{ n: number }>();
  return (row?.n ?? 0) >= limit;
}

export async function recordAttempt(env: Env, key: string): Promise<void> {
  await env.DB.prepare('INSERT INTO login_attempts (key, created_at) VALUES (?, ?)')
    .bind(key, new Date().toISOString())
    .run();
  await env.DB.prepare('DELETE FROM login_attempts WHERE created_at < ?')
    .bind(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .run();
}

export async function clearAttempts(env: Env, key: string): Promise<void> {
  await env.DB.prepare('DELETE FROM login_attempts WHERE key = ?').bind(key).run();
}

export function clientIp(c: Context<AppEnv>): string {
  return c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
}
