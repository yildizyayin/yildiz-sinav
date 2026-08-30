import app from './product-completion-entry';
import type { AuthUser, CapacityJobMessage, Env } from './types';
import { getAuthUser } from './lib/auth';
import { all, audit, badRequest, forbidden, json, methodNotAllowed, notFound, one, uuid } from './lib/db';
import {
  canManagePrivacyGovernance,
  canRequestForLinkedChild,
  isPrivacyRequestType,
  noticeAudienceForRole,
} from './lib/privacy-policy';

type PrivacyNoticeAckBody = { noticeVersionId?: string; channel?: string };
type PrivacyRequestBody = { requestType?: string; studentId?: string; scopeNote?: string };

function unauthenticated(): Response {
  return json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Oturum açmanız gerekiyor.' } }, 401);
}

function isPrivacyPath(path: string): boolean {
  return path.startsWith('/api/privacy/') || path.startsWith('/api/admin/privacy/');
}

async function requirePrivacyAdmin(env: Env, request: Request): Promise<AuthUser | Response> {
  const user = await getAuthUser(env, request);
  if (!user) return unauthenticated();
  if (!canManagePrivacyGovernance(user.role)) return forbidden('KVKK yönetişim kayıtlarını yalnız Süper Admin yönetebilir.');
  return user;
}

async function currentPrivacyNotice(env: Env, user: AuthUser): Promise<Response> {
  const audience = noticeAudienceForRole(user.role);
  const notice = await one<any>(env.DB.prepare(`
    SELECT id,audience,version,title,content_hash,content_url,effective_at,retired_at,status
    FROM privacy_notice_versions
    WHERE audience=? AND status='ACTIVE' AND effective_at<=CURRENT_TIMESTAMP
      AND (retired_at IS NULL OR retired_at>CURRENT_TIMESTAMP)
    ORDER BY effective_at DESC,created_at DESC
    LIMIT 1
  `).bind(audience));
  return json({ ok: true, audience, notice });
}

async function acknowledgePrivacyNotice(request: Request, env: Env, user: AuthUser): Promise<Response> {
  const body = await request.json<PrivacyNoticeAckBody>().catch(() => ({} as PrivacyNoticeAckBody));
  const audience = noticeAudienceForRole(user.role);
  const notice = body.noticeVersionId
    ? await one<any>(env.DB.prepare(`
        SELECT id,audience,version,title,status,effective_at,retired_at
        FROM privacy_notice_versions
        WHERE id=? AND audience=? AND status='ACTIVE' AND effective_at<=CURRENT_TIMESTAMP
          AND (retired_at IS NULL OR retired_at>CURRENT_TIMESTAMP)
        LIMIT 1
      `).bind(body.noticeVersionId, audience))
    : await one<any>(env.DB.prepare(`
        SELECT id,audience,version,title,status,effective_at,retired_at
        FROM privacy_notice_versions
        WHERE audience=? AND status='ACTIVE' AND effective_at<=CURRENT_TIMESTAMP
          AND (retired_at IS NULL OR retired_at>CURRENT_TIMESTAMP)
        ORDER BY effective_at DESC,created_at DESC
        LIMIT 1
      `).bind(audience));
  if (!notice) return notFound('Bu kullanıcı rolü için etkin aydınlatma metni bulunamadı.');

  const existing = await one<{ id: string; acknowledged_at: string | null }>(env.DB.prepare(`
    SELECT id,acknowledged_at FROM privacy_notice_receipts
    WHERE notice_version_id=? AND user_id=?
    ORDER BY created_at DESC LIMIT 1
  `).bind(notice.id, user.id));
  if (existing) return json({ ok: true, receiptId: existing.id, acknowledgedAt: existing.acknowledged_at, alreadyRecorded: true });

  const channel = String(body.channel || 'WEB').toUpperCase();
  if (!['WEB', 'MOBILE', 'EMAIL', 'PAPER', 'OTHER'].includes(channel)) return badRequest('Geçersiz bildirim kanalı.');
  const receiptId = uuid('pnotice');
  await env.DB.prepare(`
    INSERT INTO privacy_notice_receipts
      (id,notice_version_id,user_id,student_id,institution_id,acknowledged_at,channel)
    VALUES (?,?,?,?,?,CURRENT_TIMESTAMP,?)
  `).bind(receiptId, notice.id, user.id, user.role === 'STUDENT' ? user.student_id : null, user.institution_id, channel).run();
  await audit(env.DB, user.id, user.institution_id, 'PRIVACY_NOTICE_ACKNOWLEDGED', 'privacy_notice_receipt', receiptId, {
    noticeVersionId: notice.id,
    audience,
    channel,
  });
  return json({ ok: true, receiptId, noticeVersionId: notice.id, acknowledged: true }, 201);
}

type RequestTarget = { subjectUserId: string | null; subjectStudentId: string | null; institutionId: string | null };

async function resolvePrivacyRequestTarget(env: Env, user: AuthUser, requestedStudentId?: string | null): Promise<RequestTarget | Response> {
  const studentId = requestedStudentId?.trim() || null;

  if (user.role === 'STUDENT') {
    if (!user.student_id) return badRequest('Öğrenci hesabı bir öğrenci kaydına bağlı değil.');
    if (studentId && studentId !== user.student_id) return forbidden('Başka bir öğrenci adına başvuru oluşturamazsınız.');
    return { subjectUserId: user.id, subjectStudentId: user.student_id, institutionId: user.institution_id };
  }

  if (studentId) {
    if (!canRequestForLinkedChild(user.role)) return forbidden('Öğrenci adına başvuru yalnız bağlı veli hesabından oluşturulabilir.');
    if (!user.institution_id) return forbidden('Veli hesabı bir kuruma bağlı değil.');
    const linked = await one<{ ok: number }>(env.DB.prepare(`
      SELECT 1 ok
      FROM parent_student_links p
      JOIN student_enrollments e ON e.student_id=p.student_id AND e.status='ACTIVE'
      WHERE p.parent_user_id=? AND p.student_id=? AND p.active=1 AND e.institution_id=?
      LIMIT 1
    `).bind(user.id, studentId, user.institution_id));
    if (!linked) return forbidden('Yalnız aktif olarak bağlı çocuğunuz adına başvuru oluşturabilirsiniz.');
    return { subjectUserId: null, subjectStudentId: studentId, institutionId: user.institution_id };
  }

  return { subjectUserId: user.id, subjectStudentId: null, institutionId: user.institution_id };
}

async function createPrivacyRequest(request: Request, env: Env, user: AuthUser): Promise<Response> {
  const body = await request.json<PrivacyRequestBody>().catch(() => ({} as PrivacyRequestBody));
  const requestType = String(body.requestType || '').toUpperCase();
  if (!isPrivacyRequestType(requestType)) return badRequest('Geçersiz KVKK başvuru türü.');
  const target = await resolvePrivacyRequestTarget(env, user, body.studentId || null);
  if (target instanceof Response) return target;
  const scopeNote = String(body.scopeNote || '').trim();
  if (scopeNote.length > 2000) return badRequest('Başvuru açıklaması en fazla 2000 karakter olabilir.');

  const id = uuid('dsr');
  await env.DB.prepare(`
    INSERT INTO data_subject_requests
      (id,institution_id,requester_user_id,subject_user_id,subject_student_id,request_type,identity_verification_status,scope_note,status)
    VALUES (?,?,?,?,?,?,'PENDING',?,'RECEIVED')
  `).bind(id, target.institutionId, user.id, target.subjectUserId, target.subjectStudentId, requestType, scopeNote || null).run();
  await audit(env.DB, user.id, target.institutionId, 'DATA_SUBJECT_REQUEST_RECEIVED', 'data_subject_request', id, {
    requestType,
    forLinkedStudent: Boolean(target.subjectStudentId && target.subjectStudentId !== user.student_id),
  });
  return json({ ok: true, id, requestType, status: 'RECEIVED', identityVerificationStatus: 'PENDING' }, 201);
}

async function listMyPrivacyRequests(env: Env, user: AuthUser): Promise<Response> {
  const rows = await all<any>(env.DB.prepare(`
    SELECT id,request_type,identity_verification_status,status,received_at,target_deadline_at,completed_at,resolution_note,
           CASE WHEN subject_student_id IS NULL THEN 0 ELSE 1 END AS child_or_student_request
    FROM data_subject_requests
    WHERE requester_user_id=?
    ORDER BY received_at DESC
    LIMIT 100
  `).bind(user.id));
  return json({ ok: true, requests: rows });
}

async function privacyOverview(env: Env, user: AuthUser): Promise<Response> {
  if (!canManagePrivacyGovernance(user.role)) return forbidden();
  const counts = await one<any>(env.DB.prepare(`
    SELECT
      (SELECT count(*) FROM processing_activity_registry WHERE status<>'RETIRED') processing_activities,
      (SELECT count(*) FROM processing_activity_registry WHERE status IN ('DRAFT','LEGAL_REVIEW')) processing_activities_pending,
      (SELECT count(*) FROM privacy_notice_versions WHERE status='ACTIVE') active_notices,
      (SELECT count(*) FROM processor_registry WHERE active=1) active_processors,
      (SELECT count(*) FROM processor_registry WHERE active=1 AND legal_review_status='PENDING') processors_pending_legal_review,
      (SELECT count(*) FROM international_transfer_registry WHERE status IN ('DRAFT','LEGAL_REVIEW')) transfers_pending,
      (SELECT count(*) FROM retention_policies WHERE status IN ('DRAFT','LEGAL_REVIEW')) retention_pending,
      (SELECT count(*) FROM data_subject_requests WHERE status NOT IN ('COMPLETED','REJECTED','CANCELLED')) open_requests,
      (SELECT count(*) FROM privacy_deletion_jobs WHERE status IN ('PENDING','LEGAL_REVIEW','APPROVED','RUNNING')) open_deletion_jobs,
      (SELECT count(*) FROM security_incidents WHERE status NOT IN ('CLOSED','FALSE_POSITIVE')) open_incidents
  `));
  return json({ ok: true, counts });
}

async function listPrivacyAdminCollection(env: Env, user: AuthUser, collection: string): Promise<Response> {
  if (!canManagePrivacyGovernance(user.role)) return forbidden();
  let rows: any[];
  switch (collection) {
    case 'processing-activities':
      rows = await all<any>(env.DB.prepare(`SELECT * FROM processing_activity_registry ORDER BY status,code LIMIT 500`));
      break;
    case 'notices':
      rows = await all<any>(env.DB.prepare(`SELECT * FROM privacy_notice_versions ORDER BY audience,effective_at DESC LIMIT 500`));
      break;
    case 'processors':
      rows = await all<any>(env.DB.prepare(`SELECT * FROM processor_registry ORDER BY active DESC,provider_name,service_name LIMIT 500`));
      break;
    case 'transfers':
      rows = await all<any>(env.DB.prepare(`SELECT t.*,p.provider_name,p.service_name,p.service_code FROM international_transfer_registry t JOIN processor_registry p ON p.id=t.processor_id ORDER BY t.status,p.provider_name LIMIT 500`));
      break;
    case 'retention':
      rows = await all<any>(env.DB.prepare(`SELECT * FROM retention_policies ORDER BY status,entity_type,code LIMIT 500`));
      break;
    case 'requests':
      rows = await all<any>(env.DB.prepare(`SELECT * FROM data_subject_requests ORDER BY received_at DESC LIMIT 500`));
      break;
    case 'deletion-jobs':
      rows = await all<any>(env.DB.prepare(`SELECT * FROM privacy_deletion_jobs ORDER BY created_at DESC LIMIT 500`));
      break;
    case 'incidents':
      rows = await all<any>(env.DB.prepare(`SELECT * FROM security_incidents ORDER BY detected_at DESC LIMIT 500`));
      break;
    default:
      return notFound('KVKK yönetim koleksiyonu bulunamadı.');
  }
  return json({ ok: true, collection, items: rows });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    if (!isPrivacyPath(path)) return app.fetch(request, env, ctx);

    if (path.startsWith('/api/admin/privacy/')) {
      const admin = await requirePrivacyAdmin(env, request);
      if (admin instanceof Response) return admin;
      if (path === '/api/admin/privacy/overview') return request.method === 'GET' ? privacyOverview(env, admin) : methodNotAllowed();
      const match = path.match(/^\/api\/admin\/privacy\/(processing-activities|notices|processors|transfers|retention|requests|deletion-jobs|incidents)$/);
      if (match) return request.method === 'GET' ? listPrivacyAdminCollection(env, admin, match[1]) : methodNotAllowed();
      return notFound('KVKK yönetim API yolu bulunamadı.');
    }

    const user = await getAuthUser(env, request);
    if (!user) return unauthenticated();
    if (path === '/api/privacy/notices/current') return request.method === 'GET' ? currentPrivacyNotice(env, user) : methodNotAllowed();
    if (path === '/api/privacy/notices/acknowledge') return request.method === 'POST' ? acknowledgePrivacyNotice(request, env, user) : methodNotAllowed();
    if (path === '/api/privacy/requests') {
      if (request.method === 'GET') return listMyPrivacyRequests(env, user);
      if (request.method === 'POST') return createPrivacyRequest(request, env, user);
      return methodNotAllowed();
    }
    return notFound('KVKK self-servis API yolu bulunamadı.');
  },
  async queue(batch: MessageBatch<CapacityJobMessage>, env: Env, ctx: ExecutionContext) {
    return app.queue(batch, env, ctx);
  },
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    return app.scheduled(event, env, ctx);
  },
} satisfies ExportedHandler<Env, CapacityJobMessage>;
