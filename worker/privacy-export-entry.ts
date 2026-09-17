import app from './privacy-minimization-entry';
import type { CapacityJobMessage, Env } from './types';
import { getAuthUser } from './lib/auth';
import { all, audit, forbidden, json, methodNotAllowed, one } from './lib/db';
import { handleResultNetworkRequest,purgeExpiredResultNetwork } from './result-network-entry';

const DSR_EXPORT_PATH = '/api/admin/privacy/exports/requests.csv';
const HEALTH_TABLES = ['institutions', 'users', 'sessions', 'exams', 'student_entities', 'audit_logs'] as const;

export function healthSchemaReady(found: number): boolean {
  return found === HEALTH_TABLES.length;
}

export function safeObservabilityRoute(pathname: string): string {
  return pathname.split('/').map((part) => part.length >= 12 ? ':id' : part).join('/') || '/';
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function unauthenticated(): Response {
  return json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Oturum açmanız gerekiyor.' } }, 401);
}

async function exportPrivacyRequests(env: Env, request: Request): Promise<Response> {
  const user = await getAuthUser(env, request);
  if (!user) return unauthenticated();
  if (user.role !== 'SUPER_ADMIN') return forbidden('Hassas KVKK dışa aktarımlarını yalnız Süper Admin oluşturabilir.');

  const rows = await all<{
    id: string;
    institution_id: string | null;
    request_type: string;
    identity_verification_status: string;
    status: string;
    received_at: string;
    target_deadline_at: string | null;
    completed_at: string | null;
  }>(env.DB.prepare(`
    SELECT id,institution_id,request_type,identity_verification_status,status,received_at,target_deadline_at,completed_at
    FROM data_subject_requests
    ORDER BY received_at DESC
    LIMIT 5000
  `));

  await audit(env.DB, user.id, user.institution_id, 'PRIVACY_SENSITIVE_EXPORT', 'data_subject_request', undefined, {
    exportType: 'DSR_REGISTER_CSV',
    rowCount: rows.length,
  });

  const header = [
    'request_id',
    'institution_id',
    'request_type',
    'identity_verification_status',
    'status',
    'received_at',
    'target_deadline_at',
    'completed_at',
  ];
  const body = [
    header.map(csvCell).join(','),
    ...rows.map((row) => [
      row.id,
      row.institution_id,
      row.request_type,
      row.identity_verification_status,
      row.status,
      row.received_at,
      row.target_deadline_at,
      row.completed_at,
    ].map(csvCell).join(',')),
  ].join('\n');

  return new Response(`\uFEFF${body}`, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="anunex-kvkk-requests.csv"',
      'Cache-Control': 'private, no-store',
      'Pragma': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'X-Anunex-Sensitive-Export': 'audited',
    },
  });
}

async function productionHealth(env: Env): Promise<Response> {
  try {
    const placeholders = HEALTH_TABLES.map(() => '?').join(',');
    const row = await one<{ count: number }>(env.DB.prepare(`SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name IN (${placeholders})`).bind(...HEALTH_TABLES));
    const schemaReady = healthSchemaReady(Number(row?.count || 0));
    return json({ ok: schemaReady, status: schemaReady ? 'ready' : 'schema_pending', environment: env.ENVIRONMENT || 'unknown' }, schemaReady ? 200 : 503);
  } catch {
    return json({ ok: false, status: 'database_unavailable', environment: env.ENVIRONMENT || 'unknown' }, 503);
  }
}

async function handleFetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const resultNetwork = await handleResultNetworkRequest(request,env);
  if (resultNetwork) return resultNetwork;
  if (url.pathname === '/api/health' && request.method === 'GET') return productionHealth(env);
  if (url.pathname !== DSR_EXPORT_PATH) return app.fetch(request, env, ctx);
  if (request.method !== 'GET') return methodNotAllowed();
  return exportPrivacyRequests(env, request);
}

async function observedFetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const started = Date.now();
  const url = new URL(request.url);
  const requestId = request.headers.get('cf-ray') || crypto.randomUUID();
  try {
    const response = await handleFetch(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set('X-Request-Id', requestId);
    console.log(JSON.stringify({ event: 'http_request', requestId, method: request.method, route: safeObservabilityRoute(url.pathname), status: response.status, durationMs: Date.now() - started, environment: env.ENVIRONMENT || 'unknown' }));
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch (error) {
    console.error(JSON.stringify({ event: 'unhandled_request_error', requestId, method: request.method, route: safeObservabilityRoute(url.pathname), durationMs: Date.now() - started, environment: env.ENVIRONMENT || 'unknown', error: error instanceof Error ? error.message : 'UNKNOWN_ERROR' }));
    return json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Sunucu hatası oluştu.', requestId } }, 500, { 'X-Request-Id': requestId });
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return observedFetch(request, env, ctx);
  },
  async queue(batch: MessageBatch<CapacityJobMessage>, env: Env, ctx: ExecutionContext) {
    return app.queue(batch, env, ctx);
  },
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(purgeExpiredResultNetwork(env));
    return app.scheduled(event, env, ctx);
  },
} satisfies ExportedHandler<Env, CapacityJobMessage>;
