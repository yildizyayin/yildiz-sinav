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

async function revokeAllSessionsForUser(env: Env, userId: string): Promise<void> {
  await env.DB.prepare(`UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND revoked_at IS NULL`).bind(userId).run();
}

async function enforceSuperAdminMfa(request: Request, env: Env): Promise<Response | null> {
  const body = await request.clone().json<{ identifier?: string; password?: string; mfaCode?: string }>().catch(() => ({}));
  const identifier = String(body.identifier || '').trim();
  if (!identifier) return null;
  const user = await one<{ id: string; role: string; mfa_enabled: number; mfa_secret_base32: string | null; mfa_failure_count: number; mfa_locked_at: string | null }>(env.DB.prepare(`
    SELECT id,role,mfa_enabled,mfa_secret_base32,mfa_failure_count,mfa_locked_at FROM users
    WHERE active=1 AND (lower(username)=lower(?) OR lower(email)=lower(?)) LIMIT 1
  `).bind(identifier, identifier));
  if (!user || user.role !== 'SUPER_ADMIN') return null;

  if (!user.mfa_enabled || !user.mfa_secret_base32) {
    return json({ ok: false, error: { code: 'SUPER_ADMIN_MFA_REQUIRED', message: 'Süper Admin hesabı için MFA etkinleştirilmeden giriş yapılamaz.' } }, 403);
  }
  if (user.mfa_locked_at) {
    return json({ ok: false, error: { code: 'SUPER_ADMIN_MFA_LOCKED', message: 'MFA doğrulaması güvenlik nedeniyle kilitlendi. Yönetici müdahalesi gerekiyor.' } }, 423);
  }
  const mfaCode = String(body.mfaCode || '').trim();
  if (!/^\d{6}$/.test(mfaCode)) {
    return json({ ok: false, error: { code: 'MFA_CODE_REQUIRED', message: '6 haneli doğrulama kodu gerekiyor.' } }, 401);
  }
  const valid = await verifyTotpCode(user.mfa_secret_base32, mfaCode);
  if (!valid) {
    const failures = Number(user.mfa_failure_count || 0) + 1;
    await env.DB.prepare(`
      UPDATE users SET mfa_failure_count=?,mfa_locked_at=CASE WHEN ?>=? THEN CURRENT_TIMESTAMP ELSE mfa_locked_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).bind(failures, failures, MFA_FAILURE_LIMIT, user.id).run();
    return json({ ok: false, error: { code: failures >= MFA_FAILURE_LIMIT ? 'SUPER_ADMIN_MFA_LOCKED' : 'MFA_CODE_INVALID', message: failures >= MFA_FAILURE_LIMIT ? 'MFA doğrulaması güvenlik nedeniyle kilitlendi.' : 'Doğrulama kodu geçersiz.' } }, failures >= MFA_FAILURE_LIMIT ? 423 : 401);
  }
  await env.DB.prepare(`UPDATE users SET mfa_failure_count=0,mfa_locked_at=NULL,mfa_last_verified_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(user.id).run();
  return null;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (isCameraPreview(path, request.method)) {
      const body = await request.clone().json<unknown>().catch(() => null);
      if (containsRawCameraMedia(body)) return rawCameraRejected();
    }

    if (isLogin(path, request.method)) {
      const mfaBlock = await enforceSuperAdminMfa(request, env);
      if (mfaBlock) return mfaBlock;
    }

    const response = await app.fetch(request, env, ctx);

    if (path === '/api/auth/logout' && request.method === 'POST') {
      const cookie = request.headers.get('Cookie') || '';
      const token = cookie.match(/(?:^|;\s*)yildiz_session=([^;]+)/)?.[1];
      if (token) {
        const tokenHash = await sha256Hex(decodeURIComponent(token));
        const session = await one<{ user_id: string }>(env.DB.prepare(`SELECT user_id FROM sessions WHERE token_hash=? LIMIT 1`).bind(tokenHash));
        if (session?.user_id) await revokeAllSessionsForUser(env, session.user_id);
      }
    }

    return withEphemeralVoiceHeaders(response, path);
  },
  async queue(batch: MessageBatch<CapacityJobMessage>, env: Env, ctx: ExecutionContext) {
    return app.queue(batch, env, ctx);
  },
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    return app.scheduled(event, env, ctx);
  },
} satisfies ExportedHandler<Env, CapacityJobMessage>;
