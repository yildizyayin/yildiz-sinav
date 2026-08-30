import app from './privacy-export-entry';
import type { AuthUser, CapacityJobMessage, Env } from './types';
import { getAuthUser } from './lib/auth';
import { forbidden, json, one, uuid } from './lib/db';
import {
  containsRawCameraMedia,
  minimizeNibiruAiMessages,
  minimizeWhatsAppOutboundText,
  privacyMinimizationPolicy,
} from './lib/privacy-minimization';

type SmokeRunBody = {
  status?: string;
  suiteVersion?: string;
  commitSha?: string;
  checksTotal?: number;
  checksPassed?: number;
  failureCodes?: string[];
};

const SMOKE_PREFIX = '/api/admin/privacy/smoke/';

function unauthenticated(): Response {
  return json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Oturum açmanız gerekiyor.' } }, 401);
}

function unavailable(): Response {
  return json({ ok: false, error: { code: 'NOT_FOUND', message: 'API yolu bulunamadı.' } }, 404);
}

async function requireStagingSuperAdmin(env: Env, request: Request): Promise<AuthUser | Response> {
  if (env.ENVIRONMENT !== 'staging') return unavailable();
  const user = await getAuthUser(env, request);
  if (!user) return unauthenticated();
  if (user.role !== 'SUPER_ADMIN') return forbidden('KVKK sentetik smoke kanıtlarını yalnız Süper Admin çalıştırabilir.');
  return user;
}

function syntheticMinimizationDiagnostics(): Response {
  const syntheticName = 'Synthetic Privacy Student';
  const syntheticEmail = 'privacy-smoke@example.test';
  const syntheticNationalId = '11111111111';
  const messages = [
    { role: 'system' as const, content: "Sen Nibiru'sun. Yalnız eğitimsel bağlamı işle." },
    {
      role: 'user' as const,
      content: JSON.stringify({
        first_name: syntheticName,
        email: syntheticEmail,
        tckn: syntheticNationalId,
        grade_level: 7,
        outcome_code: 'SMOKE.OUTCOME.1',
      }),
    },
  ];
  const minimized = minimizeNibiruAiMessages(messages);
  const joined = minimized.messages.map(message => message.content).join('\n');
  const aiPassed = minimized.redactions >= 3
    && !joined.includes(syntheticName)
    && !joined.includes(syntheticEmail)
    && !joined.includes(syntheticNationalId);

  const whatsapp = minimizeWhatsAppOutboundText('Sentetik öğrenci için net 17, yanlış 3; privacy-smoke@example.test');
  const whatsappPassed = whatsapp.minimized
    && !whatsapp.text.includes('17')
    && !whatsapp.text.includes('privacy-smoke@example.test');

  const cameraDetected = containsRawCameraMedia({ marks: ['A', 'B'], frame: 'synthetic-only' });

  return json({
    ok: true,
    syntheticOnly: true,
    ai: { passed: aiPassed, redactions: minimized.redactions },
    whatsapp: { passed: whatsappPassed, minimized: whatsapp.minimized },
    camera: { rawMediaDetected: cameraDetected },
    policy: privacyMinimizationPolicy,
  });
}

async function auditEvidence(env: Env, admin: AuthUser): Promise<Response> {
  const row = await one<{ c: number; last_at: string | null }>(env.DB.prepare(`
    SELECT count(*) c,max(created_at) last_at
    FROM audit_logs
    WHERE action='PRIVACY_SENSITIVE_EXPORT' AND actor_user_id=? AND created_at>=datetime('now','-15 minutes')
  `).bind(admin.id));
  return json({
    ok: true,
    syntheticOnly: true,
    sensitiveExportAudit: {
      found: Number(row?.c || 0) > 0,
      count: Number(row?.c || 0),
      lastAt: row?.last_at || null,
    },
  });
}

async function recordSmokeRun(request: Request, env: Env, admin: AuthUser): Promise<Response> {
  const body = await request.json<SmokeRunBody>().catch(() => ({} as SmokeRunBody));
  const status = String(body.status || '').trim().toUpperCase();
  const suiteVersion = String(body.suiteVersion || '').trim();
  const commitSha = String(body.commitSha || '').trim();
  const checksTotal = Number(body.checksTotal);
  const checksPassed = Number(body.checksPassed);
  const failureCodes = Array.isArray(body.failureCodes)
    ? [...new Set(body.failureCodes.map(value => String(value || '').trim().toUpperCase()).filter(value => /^[A-Z0-9_.:-]{2,80}$/.test(value)))].slice(0, 50)
    : [];

  if (!['PASSED', 'FAILED'].includes(status)) return json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Geçersiz smoke durumu.' } }, 400);
  if (!/^[A-Za-z0-9_.:-]{3,80}$/.test(suiteVersion)) return json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Geçersiz smoke sürümü.' } }, 400);
  if (commitSha && !/^[a-f0-9]{7,64}$/i.test(commitSha)) return json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Geçersiz commit özeti.' } }, 400);
  if (!Number.isInteger(checksTotal) || checksTotal < 1 || checksTotal > 500) return json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Geçersiz kontrol sayısı.' } }, 400);
  if (!Number.isInteger(checksPassed) || checksPassed < 0 || checksPassed > checksTotal) return json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Geçersiz başarılı kontrol sayısı.' } }, 400);
  if (status === 'PASSED' && (checksPassed !== checksTotal || failureCodes.length)) return json({ ok: false, error: { code: 'BAD_REQUEST', message: 'PASSED smoke kaydı tüm kontroller geçmeden oluşturulamaz.' } }, 400);

  const id = uuid('psmoke');
  await env.DB.prepare(`
    INSERT INTO privacy_smoke_runs
      (id,environment,commit_sha,suite_version,status,synthetic_only,checks_total,checks_passed,failure_codes_json,started_at,completed_at,created_by)
    VALUES (?,?,?,?,?,1,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?)
  `).bind(
    id,
    env.ENVIRONMENT || 'unknown',
    commitSha || null,
    suiteVersion,
    status,
    checksTotal,
    checksPassed,
    failureCodes.length ? JSON.stringify(failureCodes) : null,
    admin.id,
  ).run();

  return json({ ok: true, id, status, syntheticOnly: true, checksTotal, checksPassed }, 201);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(SMOKE_PREFIX)) return app.fetch(request, env, ctx);

    const admin = await requireStagingSuperAdmin(env, request);
    if (admin instanceof Response) return admin;

    if (url.pathname === '/api/admin/privacy/smoke/minimization') {
      return request.method === 'POST' ? syntheticMinimizationDiagnostics() : json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Bu yöntem desteklenmiyor.' } }, 405);
    }
    if (url.pathname === '/api/admin/privacy/smoke/audit-evidence') {
      return request.method === 'GET' ? auditEvidence(env, admin) : json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Bu yöntem desteklenmiyor.' } }, 405);
    }
    if (url.pathname === '/api/admin/privacy/smoke/record') {
      return request.method === 'POST' ? recordSmokeRun(request, env, admin) : json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Bu yöntem desteklenmiyor.' } }, 405);
    }
    return unavailable();
  },
  async queue(batch: MessageBatch<CapacityJobMessage>, env: Env, ctx: ExecutionContext) {
    return app.queue(batch, env, ctx);
  },
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    return app.scheduled(event, env, ctx);
  },
} satisfies ExportedHandler<Env, CapacityJobMessage>;
