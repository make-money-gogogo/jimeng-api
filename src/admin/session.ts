import crypto from 'crypto';

import { adminConfig } from '@/admin/config.ts';

export const ADMIN_SESSION_COOKIE = 'admin_session';

type SessionPayload = {
  u: string;
  exp: number;
};

function toBase64Url(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

function sign(payloadB64: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  const chunks = cookieHeader.split(';');
  for (const chunk of chunks) {
    const idx = chunk.indexOf('=');
    if (idx <= 0) continue;
    const key = chunk.slice(0, idx).trim();
    const value = chunk.slice(idx + 1).trim();
    if (!key) continue;
    result[key] = decodeURIComponent(value);
  }
  return result;
}

function createSessionToken(username: string, ttlHours: number, secret: string): string {
  const now = Date.now();
  const payload: SessionPayload = {
    u: username,
    exp: now + ttlHours * 60 * 60 * 1000,
  };
  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const sig = sign(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

function verifySessionToken(token: string, secret: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;
  const expected = sign(payloadB64, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(fromBase64Url(payloadB64).toString('utf8')) as SessionPayload;
    if (!payload?.u || !payload?.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createAdminSessionCookie(username: string): string {
  const secret = adminConfig.sessionSecret || adminConfig.password || 'admin-session-secret';
  const token = createSessionToken(username, adminConfig.sessionTtlHours, secret);
  const maxAge = adminConfig.sessionTtlHours * 60 * 60;
  const secure = adminConfig.cookieSecure ? '; Secure' : '';
  return `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearAdminSessionCookie(): string {
  const secure = adminConfig.cookieSecure ? '; Secure' : '';
  return `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function verifyAdminSessionFromCookieHeader(cookieHeader: string | undefined): { username: string } | null {
  const cookies = parseCookies(cookieHeader);
  const token = cookies[ADMIN_SESSION_COOKIE];
  if (!token) return null;
  const secret = adminConfig.sessionSecret || adminConfig.password || 'admin-session-secret';
  const payload = verifySessionToken(token, secret);
  if (!payload) return null;
  return { username: payload.u };
}

