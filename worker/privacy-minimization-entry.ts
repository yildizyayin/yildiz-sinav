import app from './privacy-lifecycle-entry';
import type { CapacityJobMessage, Env } from './types';
import { json, one, uuid } from './lib/db';
import { verifyTotpCode } from './lib/mfa';
import { containsRawCameraMedia, privacyMinimizationPolicy } from './lib/privacy-minimization';

const SESSION_COOKIE = 'yildiz_session';
const MFA_FAILURE_LIMIT = 8;

function rawCameraRejected(): Response {
  return json({
    ok: false,
    error: {
      code: 'CAMERA_RAW_MEDIA_NOT_ACCEPTED',
      message: 'Ham fotoğraf/video sunucuya gönderilmez. Optik yalnız cihazda çıkarılan işaretleme kayıtlarıyla işlenmelidir.',
    },
  }, 400);
}

function isCameraPreview(path: string, method: string) {
  return method === 'POST' && /^\/api\/exams\/[^/]+\/camera-preview$/.test(path);
}

function isLogin(path: string, method: string) {
  return method === 'POST' && path === '/api/auth/login';
}

function withEphemeralVoiceHeaders(response: Response, path: string): Response {
  if (path !== '/api/nibiru/voice/transcribe') return response;
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Pragma', 'no-cache');
  headers.set('X-Anunex-Raw-Audio-Retention', 'ephemeral');
  headers.set('X-Anunex-Voiceprint', 'disabled');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function sessionTokenFromResponse(response: Response): string | null {
  const raw = response.headers.get('Set-Cookie') || '';
  const match = raw.match(/(?:^|[;,]\s*)yildiz_session=([^;,]+)/i);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

async function revokeIssuedLoginSession(env: Env, response: Response): Promise<void> {
  const token = sessionTokenFromResponse(response);
  if (!token) return;
  const tokenHash = await sha256Hex(token);
  await env.DB.prepare(`UPDATE sessions SET revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP) WHERE token_hash=?`).bind(tokenHash).run();
}

async function resolveLoginUser(env: Env, identifier: string): Promise<{ id: string; role: string } | null> {
  return one<{ id: string; role: string }>(env.DB.prepare(`
    SELECT id,role FROM users
    WHERE lower(coalesce(email,''))=lower(?) OR lower(coalesce(username,''))=lower(?) OR coalesce(phone,'')=?
    LIMIT 1
  `).bind(identifier, identifier, identifier));
}

async function mfaTemporarilyLocked(env: Env, userId: string): Promise<boolean> {
  const rows = await env.DB.prepare(`
    SELECT success FROM super_admin_mfa_attempts
    WHERE user_id=? AND created_at>=datetime('now','-15 minutes')
    ORDER BY created_at DESC LIMIT ?
  `).bind(userId, MFA_FAILURE_LIMIT).all<{ success: number }>();
  const attempts = rows.results || [];
  return attempts.length >= MFA_FAILURE_LIMIT && attempts.every(row => !row.success);
}

async function recordMfaAttempt(env: Env, userId: string, success: boolean, request: Request): Promise<void> {
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const ipHash = ip ? await sha256Hex(ip) : null;
  await env.DB.prepare(`INSERT INTO super_admin_mfa_attempts(id,user_id,success,ip_hash) VALUES(?,?,?,?)`)
    .bind(uuid('mfa'), userId, success ? 1 : 0, ipHash)
    .run();
}

async function enforceProductionSuperAdminMfa(
  request: Request,
  env: Env,
  loginBody: Record<string, unknown> | null,
  response: Response,
): Promise<Response> {
  if (env.ENVIRONMENT !== 'production' || !response.ok || !loginBody) return response;
  const identifier = String(loginBody.identifier || '').trim();
  if (!identifier) return response;

  const user = await resolveLoginUser(env, identifier);
  if (!user || user.role !== 'SUPER_ADMIN') return response;

  if (await mfaTemporarilyLocked(env, user.id)) {
    await revokeIssuedLoginSession(env, response);
    return json({ ok: false, error: { code: 'MFA_TEMP_LOCKED', message: 'Çok fazla hatalı doğrulama kodu girildi. 15 dakika sonra tekrar deneyin.' } }, 429);
  }

  const secret = String(env.SUPER_ADMIN_MFA_TOTP_SECRET || '').trim();
  if (!secret) {
    return response;
  }

  const code = String(loginBody.mfaCode || '').trim();
  const valid = await verifyTotpCode(secret, code);
  await recordMfaAttempt(env, user.id, valid, request);
  if (!valid) {
    await revokeIssuedLoginSession(env, response);
    const codeName = code ? 'MFA_INVALID' : 'MFA_REQUIRED';
    const message = code ? 'Doğrulama kodu geçersiz.' : 'Süper Admin hesabı için 6 haneli doğrulama kodu gereklidir.';
    return json({ ok: false, error: { code: codeName, message } }, 401);
  }

  return response;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (isCameraPreview(url.pathname, request.method)) {
      const body = await request.clone().json<unknown>().catch(() => null);
      if (containsRawCameraMedia(body)) return rawCameraRejected();
    }

    const loginBody = isLogin(url.pathname, request.method)
      ? await request.clone().json<Record<string, unknown>>().catch(() => null)
      : null;
    const response = await app.fetch(request, env, ctx);
    const mfaResponse = isLogin(url.pathname, request.method)
      ? await enforceProductionSuperAdminMfa(request, env, loginBody, response)
      : response;
    return withEphemeralVoiceHeaders(mfaResponse, url.pathname);
  },
  async queue(batch: MessageBatch<CapacityJobMessage>, env: Env, ctx: ExecutionContext) {
    return app.queue(batch, env, ctx);
  },
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    return app.scheduled(event, env, ctx);
  },
} satisfies ExportedHandler<Env, CapacityJobMessage>;

export { privacyMinimizationPolicy };
