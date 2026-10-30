import type { AuthUser, Env } from '../types';
import { json, one, uuid } from './db';
import { verifyTotpCode } from './mfa';
import { openSecret, sealSecret, secretBoxAvailable } from './secret-box';

/**
 * S045: Super Admin two-step login, enrolled from the panel.
 * - enroll: a new seed is sealed as PENDING and shown once (QR + text).
 * - confirm: a code from the app turns it ACTIVE; only then does login start asking for codes.
 * - disable: needs a valid current code.
 * The Cloudflare secret SUPER_ADMIN_MFA_TOTP_SECRET, when present, stays the platform-wide override.
 */
const PURPOSE = 'super-admin-totp';
const FAILURE_LIMIT = 8;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const fail = (status: number, code: string, message: string) => json({ ok: false, error: { code, message } }, status);

export function generateTotpSecret(bytes = 20): string {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  let bits = 0, value = 0, out = '';
  for (const byte of raw) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += BASE32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function otpauthUri(secret: string, account: string): string {
  const label = encodeURIComponent(`ANUNEX:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=ANUNEX&algorithm=SHA1&digits=6&period=30`;
}

/** Returned when an ACTIVE seed exists but cannot be opened (SESSION_SECRET missing or rotated): login must fail closed. */
export const MFA_SECRET_UNREADABLE = 'MFA_SECRET_UNREADABLE';

/** The seed that guards this Super Admin's login, or null when two-step login is not active for them. */
export async function superAdminMfaSecret(env: Env, userId: string): Promise<string | null> {
  const platform = String(env.SUPER_ADMIN_MFA_TOTP_SECRET || '').trim();
  if (platform) return platform;
  const row = await one<{ secret_sealed: string }>(env.DB.prepare(`SELECT secret_sealed FROM super_admin_mfa_secrets WHERE user_id=? AND status='ACTIVE'`).bind(userId));
  if (!row) return null;
  return (await openSecret(env, PURPOSE, row.secret_sealed)) || MFA_SECRET_UNREADABLE;
}

/** True when any Super Admin has an active second factor (drives the code field on the login page). */
export async function anySuperAdminMfaActive(env: Env): Promise<boolean> {
  if (String(env.SUPER_ADMIN_MFA_TOTP_SECRET || '').trim()) return true;
  const row = await one<{ n: number }>(env.DB.prepare(`SELECT count(*) n FROM super_admin_mfa_secrets WHERE status='ACTIVE'`)).catch(() => null);
  return Number(row?.n || 0) > 0;
}

async function ipHash(request: Request): Promise<string | null> {
  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (!ip) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function locked(env: Env, userId: string): Promise<boolean> {
  const rows = await env.DB.prepare(`SELECT success FROM super_admin_mfa_attempts WHERE user_id=? AND created_at>=datetime('now','-15 minutes') ORDER BY created_at DESC LIMIT ?`).bind(userId, FAILURE_LIMIT).all<{ success: number }>();
  const list = rows.results || [];
  return list.length >= FAILURE_LIMIT && list.every((r) => !r.success);
}

async function record(env: Env, userId: string, success: boolean, request: Request) {
  await env.DB.prepare(`INSERT INTO super_admin_mfa_attempts(id,user_id,success,ip_hash) VALUES(?,?,?,?)`).bind(uuid('mfa'), userId, success ? 1 : 0, await ipHash(request)).run();
}

async function status(env: Env, user: AuthUser) {
  const row = await one<{ status: string; activated_at: string | null }>(env.DB.prepare(`SELECT status,activated_at FROM super_admin_mfa_secrets WHERE user_id=?`).bind(user.id));
  const platform = Boolean(String(env.SUPER_ADMIN_MFA_TOTP_SECRET || '').trim());
  return json({
    ok: true,
    data: {
      active: platform || row?.status === 'ACTIVE',
      source: platform ? 'PLATFORM_SECRET' : row?.status === 'ACTIVE' ? 'ACCOUNT' : null,
      pending: row?.status === 'PENDING',
      activatedAt: row?.activated_at || null,
      enforcedOnLogin: env.ENVIRONMENT === 'production',
      canEnroll: secretBoxAvailable(env),
    },
  });
}

async function enroll(env: Env, user: AuthUser) {
  if (!secretBoxAvailable(env)) return fail(503, 'MFA_STORAGE_UNAVAILABLE', 'Sunucu anahtarı tanımlı olmadığı için kurulum yapılamıyor.');
  const existing = await one<{ status: string }>(env.DB.prepare(`SELECT status FROM super_admin_mfa_secrets WHERE user_id=?`).bind(user.id));
  if (existing?.status === 'ACTIVE') return fail(409, 'MFA_ALREADY_ACTIVE', 'İki adımlı doğrulama zaten açık. Yeniden kurmak için önce kapatın.');
  const secret = generateTotpSecret();
  const sealed = await sealSecret(env, PURPOSE, secret);
  if (!sealed) return fail(503, 'MFA_STORAGE_UNAVAILABLE', 'Sunucu anahtarı tanımlı olmadığı için kurulum yapılamıyor.');
  await env.DB.prepare(`INSERT INTO super_admin_mfa_secrets(user_id,secret_sealed,status) VALUES(?,?,'PENDING') ON CONFLICT(user_id) DO UPDATE SET secret_sealed=excluded.secret_sealed,status='PENDING',created_at=CURRENT_TIMESTAMP,activated_at=NULL`).bind(user.id, sealed).run();
  const account = user.email || user.username || user.display_name || 'super-admin';
  return json({ ok: true, data: { secret, otpauthUri: otpauthUri(secret, account) } });
}

async function confirm(request: Request, env: Env, user: AuthUser) {
  if (await locked(env, user.id)) return fail(429, 'MFA_TEMP_LOCKED', 'Çok fazla hatalı kod girildi. 15 dakika sonra tekrar deneyin.');
  const body = await request.json<any>().catch(() => ({}));
  const row = await one<{ secret_sealed: string }>(env.DB.prepare(`SELECT secret_sealed FROM super_admin_mfa_secrets WHERE user_id=? AND status='PENDING'`).bind(user.id));
  if (!row) return fail(409, 'MFA_NOT_PENDING', 'Önce kurulumu başlatın.');
  const secret = await openSecret(env, PURPOSE, row.secret_sealed);
  if (!secret) return fail(503, 'MFA_STORAGE_UNAVAILABLE', 'Kurulum bilgisi okunamadı; kurulumu yeniden başlatın.');
  const valid = await verifyTotpCode(secret, body?.code);
  await record(env, user.id, valid, request);
  if (!valid) return fail(400, 'MFA_INVALID', 'Kod doğrulanamadı. Uygulamadaki güncel 6 haneli kodu girin.');
  await env.DB.prepare(`UPDATE super_admin_mfa_secrets SET status='ACTIVE',activated_at=CURRENT_TIMESTAMP WHERE user_id=?`).bind(user.id).run();
  return json({ ok: true, data: { active: true } });
}

async function disable(request: Request, env: Env, user: AuthUser) {
  if (await locked(env, user.id)) return fail(429, 'MFA_TEMP_LOCKED', 'Çok fazla hatalı kod girildi. 15 dakika sonra tekrar deneyin.');
  const body = await request.json<any>().catch(() => ({}));
  const row = await one<{ secret_sealed: string; status: string }>(env.DB.prepare(`SELECT secret_sealed,status FROM super_admin_mfa_secrets WHERE user_id=?`).bind(user.id));
  if (!row) return fail(404, 'MFA_NOT_ENROLLED', 'Hesabınızda kurulu iki adımlı doğrulama yok.');
  if (row.status === 'ACTIVE') {
    const secret = await openSecret(env, PURPOSE, row.secret_sealed);
    const valid = Boolean(secret) && await verifyTotpCode(secret as string, body?.code);
    await record(env, user.id, valid, request);
    if (!valid) return fail(400, 'MFA_INVALID', 'Kapatmak için uygulamadaki güncel kodu girin.');
  }
  await env.DB.prepare(`DELETE FROM super_admin_mfa_secrets WHERE user_id=?`).bind(user.id).run();
  return json({ ok: true, data: { active: false } });
}

export async function handleSuperAdminMfa(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/security/mfa')) return null;
  const { getAuthUser } = await import('./auth');
  const user = await getAuthUser(env, request);
  if (!user) return fail(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  if (user.role !== 'SUPER_ADMIN') return fail(403, 'FORBIDDEN', 'Bu ayar yalnız Süper Admin içindir.');
  if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) return fail(403, 'FORBIDDEN', 'İsteği ANUNEX üzerinden başlatın.');
  const p = url.pathname, m = request.method;
  if (p === '/api/security/mfa' && m === 'GET') return status(env, user);
  if (p === '/api/security/mfa/enroll' && m === 'POST') return enroll(env, user);
  if (p === '/api/security/mfa/confirm' && m === 'POST') return confirm(request, env, user);
  if (p === '/api/security/mfa/disable' && m === 'POST') return disable(request, env, user);
  return fail(404, 'NOT_FOUND', 'Yol bulunamadı.');
}
