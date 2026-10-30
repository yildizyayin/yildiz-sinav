import type { Env } from '../types';
import { all, json, one, uuid } from './db';
import { normalizeTrMobile, phoneHash, phoneVariants, sendOtpSms, sha256, smsOtpEnabled } from './sms';

/**
 * S046: login and password reset with a one-time SMS code (bank style).
 * - The code is 6 digits, valid 3 minutes, 5 tries; only its salted hash is stored.
 * - Turnstile before every send; at most 3 codes per number per 15 minutes, 10 per day, 15 per IP per hour.
 * - The answer never tells whether a number is registered.
 * - The Super Admin, service accounts, guest students and passive institutions never log in by SMS.
 */
const TTL_SECONDS = 180;
const MAX_TRIES = 5;
const ROLE_LABEL: Record<string, string> = { STUDENT: 'Öğrenci', PARENT: 'Veli', TEACHER: 'Öğretmen', GUIDANCE_TEACHER: 'Rehber öğretmen', INSTITUTION_MANAGER: 'Kurum yöneticisi', DEALER: 'Bayi' };

const fail = (status: number, code: string, message: string) => json({ ok: false, error: { code, message } }, status, { 'Cache-Control': 'no-store' });

async function ipHash(request: Request) {
  const ip = request.headers.get('CF-Connecting-IP') || '';
  return ip ? sha256(`ip:${ip}`) : null;
}

function purposeOf(value: unknown): 'LOGIN' | 'RESET' | null {
  return value === 'LOGIN' || value === 'RESET' ? value : null;
}

async function eligibleAccounts(env: Env, mobile: string) {
  const { isServiceAccountId } = await import('./auth');
  const v = phoneVariants(mobile);
  const rows = await all<any>(env.DB.prepare(`SELECT u.id,u.role,u.display_name,u.must_change_password,u.student_id,i.status institution_status,se.status student_status
    FROM users u LEFT JOIN institutions i ON i.id=u.institution_id LEFT JOIN student_entities se ON se.id=u.student_id
    WHERE u.active=1 AND u.phone IN (${v.map(() => '?').join(',')}) LIMIT 10`).bind(...v));
  return rows.filter((r) => r.role !== 'SUPER_ADMIN' && !isServiceAccountId(r.id) && r.institution_status !== 'PASSIVE' && r.student_status !== 'GUEST');
}

async function requestCode(request: Request, env: Env) {
  if (!smsOtpEnabled(env)) return fail(503, 'SMS_NOT_CONFIGURED', 'SMS ile giriş şu anda kullanılamıyor.');
  const body = await request.json<any>().catch(() => ({}));
  const purpose = purposeOf(body?.purpose);
  const mobile = normalizeTrMobile(body?.phone);
  if (!purpose) return fail(400, 'BAD_REQUEST', 'Geçersiz istek.');
  if (!mobile) return fail(400, 'PHONE_INVALID', 'Geçerli bir cep telefonu numarası girin (5XX XXX XX XX).');
  const { verifyTurnstile } = await import('./auth');
  const turnstile = await verifyTurnstile(env, body?.turnstileToken, request.headers.get('CF-Connecting-IP'));
  if (!turnstile.ok) return fail(400, turnstile.error || 'TURNSTILE_FAILED', 'Robot doğrulaması başarısız.');
  const ph = await phoneHash(mobile), ih = await ipHash(request);
  const limits = await one<{ q: number; d: number; ip: number }>(env.DB.prepare(`SELECT
      (SELECT count(*) FROM sms_otp_challenges WHERE phone_hash=?1 AND created_at>=datetime('now','-15 minutes')) q,
      (SELECT count(*) FROM sms_otp_challenges WHERE phone_hash=?1 AND created_at>=datetime('now','-1 day')) d,
      (SELECT count(*) FROM sms_otp_challenges WHERE ?2 IS NOT NULL AND ip_hash=?2 AND created_at>=datetime('now','-1 hour')) ip`).bind(ph, ih));
  if (Number(limits?.q) >= 3 || Number(limits?.d) >= 10 || Number(limits?.ip) >= 15) return fail(429, 'SMS_RATE_LIMITED', 'Çok fazla kod istendi. Bir süre sonra tekrar deneyin.');
  const accounts = await eligibleAccounts(env, mobile);
  const id = uuid('otp');
  const expires = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();
  if (!accounts.length) {
    await env.DB.prepare(`INSERT INTO sms_otp_challenges(id,purpose,phone_hash,code_hash,expires_at,sent,ip_hash) VALUES(?,?,?,NULL,?,0,?)`).bind(id, purpose, ph, expires, ih).run();
  } else {
    const digits = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
    const code = String(digits).padStart(6, '0');
    await env.DB.prepare(`INSERT INTO sms_otp_challenges(id,purpose,phone_hash,code_hash,expires_at,sent,ip_hash) VALUES(?,?,?,?,?,0,?)`).bind(id, purpose, ph, await sha256(`${id}:${code}`), expires, ih).run();
    // Plain ASCII: Netgsm's OTP route sends one 160-character segment without Turkish characters.
    const what = purpose === 'LOGIN' ? 'giris' : 'sifre yenileme';
    const r = await sendOtpSms(env, mobile, `ANUNEX ${what} kodunuz: ${code}. Kod 3 dakika gecerlidir. Kodu kimseyle paylasmayin; ANUNEX kodu asla sizden istemez.`, `OTP_${purpose}`, accounts.length === 1 ? accounts[0].id : null);
    if (r.ok) await env.DB.prepare(`UPDATE sms_otp_challenges SET sent=1 WHERE id=?`).bind(id).run();
  }
  return json({ ok: true, message: 'Numara kayıtlıysa doğrulama kodu SMS ile gönderildi.', expiresInSeconds: TTL_SECONDS }, 200, { 'Cache-Control': 'no-store' });
}

async function verifyCode(request: Request, env: Env) {
  if (!smsOtpEnabled(env)) return fail(503, 'SMS_NOT_CONFIGURED', 'SMS ile giriş şu anda kullanılamıyor.');
  const body = await request.json<any>().catch(() => ({}));
  const purpose = purposeOf(body?.purpose);
  const mobile = normalizeTrMobile(body?.phone);
  const code = String(body?.code || '').trim();
  if (!purpose || !mobile || !/^\d{6}$/.test(code)) return fail(400, 'OTP_INVALID', 'Kod geçersiz veya süresi dolmuş.');
  const ph = await phoneHash(mobile);
  const ch = await one<any>(env.DB.prepare(`SELECT * FROM sms_otp_challenges WHERE phone_hash=? AND purpose=? AND consumed_at IS NULL AND sent=1 AND expires_at>? ORDER BY created_at DESC LIMIT 1`).bind(ph, purpose, new Date().toISOString()));
  if (!ch) return fail(400, 'OTP_INVALID', 'Kod geçersiz veya süresi dolmuş.');
  if (Number(ch.attempts) >= MAX_TRIES) {
    await env.DB.prepare(`UPDATE sms_otp_challenges SET consumed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(ch.id).run();
    return fail(429, 'OTP_LOCKED', 'Çok fazla hatalı deneme. Yeni kod isteyin.');
  }
  if (await sha256(`${ch.id}:${code}`) !== ch.code_hash) {
    await env.DB.prepare(`UPDATE sms_otp_challenges SET attempts=attempts+1 WHERE id=?`).bind(ch.id).run();
    return fail(400, 'OTP_INVALID', 'Kod geçersiz veya süresi dolmuş.');
  }
  const accounts = await eligibleAccounts(env, mobile);
  if (!accounts.length) return fail(400, 'OTP_INVALID', 'Kod geçersiz veya süresi dolmuş.');
  let account = accounts[0];
  if (accounts.length > 1) {
    const chosen = accounts.find((a) => a.id === body?.accountId);
    if (!chosen) return json({ ok: true, chooseAccount: accounts.map((a) => ({ id: a.id, label: `${a.display_name} · ${ROLE_LABEL[a.role] || a.role}` })) }, 200, { 'Cache-Control': 'no-store' });
    account = chosen;
  }
  const auth = await import('./auth');
  let newPassword = '';
  if (purpose === 'RESET') {
    newPassword = String(body?.newPassword || '');
    if (newPassword.length < 8) return fail(400, 'PASSWORD_TOO_SHORT', 'Yeni şifre en az 8 karakter olmalıdır.');
  }
  const consumed = await env.DB.prepare(`UPDATE sms_otp_challenges SET consumed_at=CURRENT_TIMESTAMP WHERE id=? AND consumed_at IS NULL`).bind(ch.id).run();
  if (!consumed.meta?.changes) return fail(400, 'OTP_INVALID', 'Kod geçersiz veya süresi dolmuş.');
  if (purpose === 'RESET') {
    const p = await auth.hashPassword(newPassword);
    await env.DB.batch([
      env.DB.prepare(`UPDATE users SET password_hash=?,password_salt=?,password_iterations=?,password_algo='PBKDF2-SHA256-v1',must_change_password=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(p.hash, p.salt, p.iterations, account.id),
      env.DB.prepare(`UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND revoked_at IS NULL`).bind(account.id),
      env.DB.prepare(`INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,NULL,'PASSWORD_RESET_BY_SMS','user',?,'{}')`).bind(uuid('aud'), account.id, account.id),
    ]);
  }
  await auth.recordLoginAttempt(env, `sms:${mobile}`, true, request);
  return auth.createSession(env, account.id, request, Boolean(body?.remember), purpose === 'LOGIN' && Boolean(account.must_change_password));
}

export async function handleSmsAuth(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/auth/sms/')) return null;
  if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Yöntem desteklenmiyor.');
  if (url.pathname === '/api/auth/sms/request') return requestCode(request, env);
  if (url.pathname === '/api/auth/sms/verify') return verifyCode(request, env);
  return fail(404, 'NOT_FOUND', 'Yol bulunamadı.');
}
