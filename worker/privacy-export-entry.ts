import app from './privacy-minimization-entry';
import type { CapacityJobMessage, Env } from './types';
import { getAuthUser } from './lib/auth';
import { all, audit, forbidden, json, methodNotAllowed } from './lib/db';

const DSR_EXPORT_PATH = '/api/admin/privacy/exports/requests.csv';

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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== DSR_EXPORT_PATH) return app.fetch(request, env, ctx);
    if (request.method !== 'GET') return methodNotAllowed();
    return exportPrivacyRequests(env, request);
  },
  async queue(batch: MessageBatch<CapacityJobMessage>, env: Env, ctx: ExecutionContext) {
    return app.queue(batch, env, ctx);
  },
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    return app.scheduled(event, env, ctx);
  },
} satisfies ExportedHandler<Env, CapacityJobMessage>;
