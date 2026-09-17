import app from './panel-theme-entry';
import type { AuthUser, CapacityJobMessage, Env } from './types';
import { getAuthUser } from './lib/auth';
import { all, audit, badRequest, forbidden, json, methodNotAllowed, notFound, one, uuid } from './lib/db';
import {
  canManagePrivacyGovernance,
  canRequestForLinkedChild,
  isPrivacyRequestType,
  noticeAudienceForRole,
} from './lib/privacy-policy';
import {
  incidentAuthorityDeadline,
  normalizeConsentPurposeCode,
  normalizePrivacyChannel,
  processorReadyForPersonalData,
  transferReadyForPersonalData,
} from './lib/privacy-operations';

type PrivacyNoticeAckBody = { noticeVersionId?: string; channel?: string };
type PrivacyRequestBody = { requestType?: string; studentId?: string; scopeNote?: string };
type ConsentBody = { purposeCode?: string; studentId?: string; noticeVersionId?: string; channel?: string };
type IncidentBody = {
  title?: string;
  incidentType?: string;
  riskLevel?: string;
  personalDataInvolved?: boolean | number;
  detectedAt?: string;
  affectedDataCategories?: string[];
  affectedSubjectCategories?: string[];
  estimatedSubjectCount?: number;
};
type DeletionJobBody = { requestId?: string; mode?: string; reasonCode?: string };
type ReleaseApprovalBody = { status?: string; evidenceHash?: string; note?: string };

type RequestTarget = { subjectUserId: string | null; subjectStudentId: string | null; institutionId: string | null };

const REQUIRED_NOTICE_AUDIENCES = ['STUDENT', 'PARENT', 'TEACHER', 'GUIDANCE_TEACHER', 'INSTITUTION_MANAGER', 'PLATFORM_STAFF'] as const;
const REQUIRED_RELEASE_APPROVALS = [
  'COUNSEL_CONTROLLER_PROCESSOR',
  'COUNSEL_PRIVACY_NOTICES',
  'COUNSEL_RETENTION_SCHEDULE',
  'COUNSEL_SUBPROCESSOR_TRANSFERS',
  'VERBIS_STATUS_CONFIRMED',
  'PRODUCTION_OWNER_SIGNOFF',
] as const;

function unauthenticated(): Response {
  return json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Oturum açmanız gerekiyor.' } }, 401);
}

function conflict(message: string, code = 'CONFLICT'): Response {
  return json({ ok: false, error: { code, message } }, 409);
}

function isPrivacyPath(path: string): boolean {
  return path.startsWith('/api/privacy/') || path.startsWith('/api/admin/privacy/');
}

function normalizeCategoryList(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50) return null;
  const normalized = value.map(item => String(item || '').trim()).filter(Boolean);
  if (normalized.some(item => item.length > 80)) return null;
  return [...new Set(normalized)];
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

  const channel = normalizePrivacyChannel(body.channel);
  if (!channel) return badRequest('Geçersiz bildirim kanalı.');
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

async function resolvePrivacyRequestTarget(env: Env, user: AuthUser, requestedStudentId?: string | null): Promise<RequestTarget | Response> {
  const studentId = requestedStudentId?.trim() || null;

  if (user.role === 'STUDENT') {
    if (!user.student_id) return badRequest('Öğrenci hesabı bir öğrenci kaydına bağlı değil.');
    if (studentId && studentId !== user.student_id) return forbidden('Başka bir öğrenci adına başvuru oluşturamazsınız.');
    return { subjectUserId: user.id, subjectStudentId: user.student_id, institutionId: user.institution_id };
  }

  if (studentId) {
    if (!canRequestForLinkedChild(user.role)) return forbidden('Öğrenci adına işlem yalnız bağlı veli hesabından yapılabilir.');
    if (!user.institution_id) return forbidden('Veli hesabı bir kuruma bağlı değil.');
    const linked = await one<{ ok: number }>(env.DB.prepare(`
      SELECT 1 ok
      FROM parent_student_links p
      JOIN student_enrollments e ON e.student_id=p.student_id AND e.status='ACTIVE'
      WHERE p.parent_user_id=? AND p.student_id=? AND p.active=1 AND e.institution_id=?
      LIMIT 1
    `).bind(user.id, studentId, user.institution_id));
    if (!linked) return forbidden('Yalnız aktif olarak bağlı çocuğunuz adına işlem yapabilirsiniz.');
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

async function listMyConsents(env: Env, user: AuthUser): Promise<Response> {
  const rows = await all<any>(env.DB.prepare(`
    SELECT id,purpose_code,subject_user_id,subject_student_id,state,channel,granted_at,withdrawn_at,notice_version_id,created_at,updated_at
    FROM consent_records
    WHERE granted_by_user_id=? OR subject_user_id=? OR (? IS NOT NULL AND subject_student_id=?)
    ORDER BY created_at DESC
    LIMIT 100
  `).bind(user.id, user.id, user.student_id, user.student_id));
  return json({ ok: true, consents: rows });
}

async function grantConsent(request: Request, env: Env, user: AuthUser): Promise<Response> {
  const body = await request.json<ConsentBody>().catch(() => ({} as ConsentBody));
  const purposeCode = normalizeConsentPurposeCode(body.purposeCode);
  if (!purposeCode) return badRequest('Geçersiz açık rıza amaç kodu.');
  const purpose = await one<{ code: string }>(env.DB.prepare(`
    SELECT code FROM processing_activity_registry
    WHERE upper(code)=? AND status='APPROVED' AND upper(coalesce(lawful_basis_code,'')) IN ('CONSENT','EXPLICIT_CONSENT','ACIK_RIZA')
    LIMIT 1
  `).bind(purposeCode));
  if (!purpose) return conflict('Bu amaç için hukukça onaylanmış açık rıza işleme faaliyeti bulunmuyor.', 'CONSENT_PURPOSE_NOT_APPROVED');

  const target = await resolvePrivacyRequestTarget(env, user, body.studentId || null);
  if (target instanceof Response) return target;
  const channel = normalizePrivacyChannel(body.channel);
  if (!channel || channel === 'EMAIL') return badRequest('Açık rıza için geçersiz kayıt kanalı.');

  let noticeVersionId: string | null = null;
  if (body.noticeVersionId) {
    const notice = await one<{ id: string }>(env.DB.prepare(`SELECT id FROM privacy_notice_versions WHERE id=? AND status='ACTIVE' LIMIT 1`).bind(body.noticeVersionId));
    if (!notice) return badRequest('Açık rıza kaydı için geçerli bir aydınlatma sürümü bulunamadı.');
    noticeVersionId = notice.id;
  }

  const existing = await one<{ id: string }>(env.DB.prepare(`
    SELECT id FROM consent_records
    WHERE purpose_code=? AND coalesce(subject_user_id,'')=coalesce(?,'') AND coalesce(subject_student_id,'')=coalesce(?,'') AND state='GRANTED'
    ORDER BY created_at DESC LIMIT 1
  `).bind(purposeCode, target.subjectUserId, target.subjectStudentId));
  if (existing) return json({ ok: true, id: existing.id, purposeCode, state: 'GRANTED', alreadyGranted: true });

  const id = uuid('consent');
  await env.DB.prepare(`
    INSERT INTO consent_records
      (id,purpose_code,subject_user_id,subject_student_id,institution_id,granted_by_user_id,notice_version_id,state,channel,granted_at)
    VALUES (?,?,?,?,?,?,?,'GRANTED',?,CURRENT_TIMESTAMP)
  `).bind(id, purposeCode, target.subjectUserId, target.subjectStudentId, target.institutionId, user.id, noticeVersionId, channel).run();
  await audit(env.DB, user.id, target.institutionId, 'CONSENT_GRANTED', 'consent_record', id, {
    purposeCode,
    subjectStudentId: target.subjectStudentId,
    channel,
  });
  return json({ ok: true, id, purposeCode, state: 'GRANTED' }, 201);
}

async function withdrawConsent(env: Env, user: AuthUser, consentId: string): Promise<Response> {
  const record = await one<any>(env.DB.prepare(`
    SELECT id,purpose_code,subject_user_id,subject_student_id,institution_id,granted_by_user_id,state
    FROM consent_records WHERE id=? LIMIT 1
  `).bind(consentId));
  if (!record) return notFound('Açık rıza kaydı bulunamadı.');

  let allowed = record.granted_by_user_id === user.id || record.subject_user_id === user.id || (user.student_id && record.subject_student_id === user.student_id);
  if (!allowed && user.role === 'PARENT' && user.institution_id && record.subject_student_id) {
    const linked = await one<{ ok: number }>(env.DB.prepare(`
      SELECT 1 ok FROM parent_student_links p
      JOIN student_enrollments e ON e.student_id=p.student_id AND e.status='ACTIVE'
      WHERE p.parent_user_id=? AND p.student_id=? AND p.active=1 AND e.institution_id=? LIMIT 1
    `).bind(user.id, record.subject_student_id, user.institution_id));
    allowed = Boolean(linked);
  }
  if (!allowed) return forbidden('Bu açık rıza kaydını geri çekme yetkiniz yok.');
  if (record.state === 'WITHDRAWN') return json({ ok: true, id: consentId, state: 'WITHDRAWN', alreadyWithdrawn: true });
  if (record.state !== 'GRANTED') return conflict('Yalnız aktif açık rıza kaydı geri çekilebilir.', 'CONSENT_NOT_ACTIVE');

  await env.DB.prepare(`UPDATE consent_records SET state='WITHDRAWN',withdrawn_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(consentId).run();
  await audit(env.DB, user.id, record.institution_id, 'CONSENT_WITHDRAWN', 'consent_record', consentId, { purposeCode: record.purpose_code });
  return json({ ok: true, id: consentId, state: 'WITHDRAWN' });
}

async function verifyDataSubjectRequest(env: Env, admin: AuthUser, requestId: string): Promise<Response> {
  const row = await one<any>(env.DB.prepare(`SELECT id,status,identity_verification_status,institution_id FROM data_subject_requests WHERE id=? LIMIT 1`).bind(requestId));
  if (!row) return notFound('KVKK başvurusu bulunamadı.');
  if (['COMPLETED', 'REJECTED', 'CANCELLED'].includes(row.status)) return conflict('Kapanmış başvuru doğrulanamaz.', 'DSR_ALREADY_CLOSED');
  await env.DB.prepare(`
    UPDATE data_subject_requests
    SET identity_verification_status='VERIFIED',status='IN_REVIEW',updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(requestId).run();
  await audit(env.DB, admin.id, row.institution_id, 'DATA_SUBJECT_REQUEST_IDENTITY_VERIFIED', 'data_subject_request', requestId, { verification: 'VERIFIED' });
  return json({ ok: true, id: requestId, identityVerificationStatus: 'VERIFIED', status: 'IN_REVIEW' });
}

async function createDeletionJob(request: Request, env: Env, admin: AuthUser): Promise<Response> {
  const body = await request.json<DeletionJobBody>().catch(() => ({} as DeletionJobBody));
  const requestId = String(body.requestId || '').trim();
  const mode = String(body.mode || '').trim().toUpperCase();
  const reasonCode = String(body.reasonCode || '').trim().toUpperCase();
  if (!requestId || !['DELETE', 'ANONYMIZE'].includes(mode) || !/^[A-Z0-9_.:-]{2,80}$/.test(reasonCode)) return badRequest('Silme/anonimleştirme işi alanları geçersiz.');

  const dsr = await one<any>(env.DB.prepare(`
    SELECT id,institution_id,subject_user_id,subject_student_id,request_type,identity_verification_status,status
    FROM data_subject_requests WHERE id=? LIMIT 1
  `).bind(requestId));
  if (!dsr) return notFound('Bağlı KVKK başvurusu bulunamadı.');
  if (dsr.identity_verification_status !== 'VERIFIED') return conflict('Kimlik doğrulaması tamamlanmadan silme işi oluşturulamaz.', 'DSR_IDENTITY_NOT_VERIFIED');
  if (!['DELETE', 'ANONYMIZE'].includes(dsr.request_type)) return conflict('Bu KVKK başvuru türü silme/anonimleştirme işi oluşturamaz.', 'DSR_MODE_NOT_ALLOWED');
  if (dsr.request_type !== mode) return conflict('İş modu doğrulanmış başvuru türüyle aynı olmalıdır.', 'DSR_MODE_MISMATCH');

  const existing = await one<{ id: string; status: string }>(env.DB.prepare(`
    SELECT id,status FROM privacy_deletion_jobs WHERE request_id=? AND status NOT IN ('FAILED','CANCELLED') ORDER BY created_at DESC LIMIT 1
  `).bind(requestId));
  if (existing) return json({ ok: true, id: existing.id, status: existing.status, alreadyQueued: true });

  const id = uuid('pdel');
  await env.DB.prepare(`
    INSERT INTO privacy_deletion_jobs
      (id,institution_id,subject_user_id,subject_student_id,requested_by_user_id,request_id,mode,reason_code,status)
    VALUES (?,?,?,?,?,?,?,?,'LEGAL_REVIEW')
  `).bind(id, dsr.institution_id, dsr.subject_user_id, dsr.subject_student_id, admin.id, requestId, mode, reasonCode).run();
  await env.DB.prepare(`UPDATE data_subject_requests SET status='ACTION_REQUIRED',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(requestId).run();
  await audit(env.DB, admin.id, dsr.institution_id, 'PRIVACY_DELETION_JOB_CREATED', 'privacy_deletion_job', id, { requestId, mode, reasonCode });
  return json({ ok: true, id, requestId, mode, status: 'LEGAL_REVIEW' }, 201);
}

async function createSecurityIncident(request: Request, env: Env, admin: AuthUser): Promise<Response> {
  const body = await request.json<IncidentBody>().catch(() => ({} as IncidentBody));
  const title = String(body.title || '').trim();
  const incidentType = String(body.incidentType || '').trim().toUpperCase();
  const riskLevel = String(body.riskLevel || 'UNDER_REVIEW').trim().toUpperCase();
  const personalDataInvolved = Boolean(body.personalDataInvolved);
  const detectedAt = body.detectedAt ? new Date(body.detectedAt) : new Date();
  const dataCategories = normalizeCategoryList(body.affectedDataCategories);
  const subjectCategories = normalizeCategoryList(body.affectedSubjectCategories);
  const estimatedSubjectCount = body.estimatedSubjectCount;

  if (title.length < 3 || title.length > 200) return badRequest('Olay başlığı 3-200 karakter olmalıdır.');
  if (!/^[A-Z0-9_.:-]{2,80}$/.test(incidentType)) return badRequest('Geçersiz olay türü.');
  if (!['UNDER_REVIEW', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(riskLevel)) return badRequest('Geçersiz risk seviyesi.');
  if (!Number.isFinite(detectedAt.getTime())) return badRequest('Geçersiz tespit zamanı.');
  if (!dataCategories || !subjectCategories) return badRequest('Etkilenen kategori listesi geçersiz.');
  if (estimatedSubjectCount !== undefined && (!Number.isInteger(estimatedSubjectCount) || estimatedSubjectCount < 0)) return badRequest('Tahmini ilgili kişi sayısı geçersiz.');

  const id = uuid('inc');
  const incidentCode = `INC-${detectedAt.toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const dueAt = incidentAuthorityDeadline(detectedAt, personalDataInvolved);
  await env.DB.prepare(`
    INSERT INTO security_incidents
      (id,incident_code,title,incident_type,risk_level,personal_data_involved,affected_data_categories_json,affected_subject_categories_json,estimated_subject_count,detected_at,authority_notification_due_at,status,owner_user_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'OPEN',?)
  `).bind(
    id,
    incidentCode,
    title,
    incidentType,
    riskLevel,
    personalDataInvolved ? 1 : 0,
    dataCategories.length ? JSON.stringify(dataCategories) : null,
    subjectCategories.length ? JSON.stringify(subjectCategories) : null,
    estimatedSubjectCount ?? null,
    detectedAt.toISOString(),
    dueAt,
    admin.id,
  ).run();
  await audit(env.DB, admin.id, null, 'SECURITY_INCIDENT_OPENED', 'security_incident', id, {
    incidentCode,
    incidentType,
    riskLevel,
    personalDataInvolved,
    authorityNotificationDueAt: dueAt,
  });
  return json({ ok: true, id, incidentCode, status: 'OPEN', authorityNotificationDueAt: dueAt }, 201);
}

async function updateReleaseApproval(request: Request, env: Env, admin: AuthUser, approvalCode: string): Promise<Response> {
  if (!(REQUIRED_RELEASE_APPROVALS as readonly string[]).includes(approvalCode)) return notFound('Üretim onay kalemi bulunamadı.');
  const body = await request.json<ReleaseApprovalBody>().catch(() => ({} as ReleaseApprovalBody));
  const status = String(body.status || '').toUpperCase();
  const evidenceHash = String(body.evidenceHash || '').trim();
  const note = String(body.note || '').trim();
  if (!['APPROVED', 'WAIVED', 'REJECTED', 'PENDING'].includes(status)) return badRequest('Geçersiz onay durumu.');
  if (['APPROVED', 'WAIVED'].includes(status) && !/^[A-Fa-f0-9]{32,128}$/.test(evidenceHash)) return badRequest('Onay/feragat için belge kanıt özeti (hash) zorunludur.');
  if (note.length > 1000) return badRequest('Onay notu en fazla 1000 karakter olabilir.');

  const existing = await one<{ id: string }>(env.DB.prepare(`SELECT id FROM privacy_release_approvals WHERE approval_code=? LIMIT 1`).bind(approvalCode));
  if (!existing) return notFound('Üretim onay kalemi bulunamadı.');
  await env.DB.prepare(`
    UPDATE privacy_release_approvals
    SET status=?,approved_by=?,approved_at=CASE WHEN ? IN ('APPROVED','WAIVED') THEN CURRENT_TIMESTAMP ELSE NULL END,
        evidence_hash=?,note=?,updated_at=CURRENT_TIMESTAMP
    WHERE approval_code=?
  `).bind(status, admin.id, status, evidenceHash || null, note || null, approvalCode).run();
  await audit(env.DB, admin.id, null, 'PRIVACY_RELEASE_APPROVAL_UPDATED', 'privacy_release_approval', existing.id, { approvalCode, status, evidenceHash: evidenceHash || null });
  return json({ ok: true, approvalCode, status });
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
      (SELECT count(*) FROM security_incidents WHERE status NOT IN ('CLOSED','FALSE_POSITIVE')) open_incidents,
      (SELECT count(*) FROM privacy_release_approvals WHERE status NOT IN ('APPROVED','WAIVED')) release_approvals_pending
  `));
  return json({ ok: true, counts });
}

async function privacyReleaseGate(env: Env, user: AuthUser): Promise<Response> {
  if (!canManagePrivacyGovernance(user.role)) return forbidden();
  const processors = await all<any>(env.DB.prepare(`SELECT service_code,active,legal_review_status,dpa_status,training_on_customer_data FROM processor_registry ORDER BY service_code`));
  const transfers = await all<any>(env.DB.prepare(`SELECT id,processor_id,status,transfer_mechanism FROM international_transfer_registry ORDER BY processor_id,id`));
  const notices = await all<{ audience: string }>(env.DB.prepare(`
    SELECT DISTINCT audience FROM privacy_notice_versions
    WHERE status='ACTIVE' AND effective_at<=CURRENT_TIMESTAMP AND (retired_at IS NULL OR retired_at>CURRENT_TIMESTAMP)
  `));
  const retention = await one<{ c: number }>(env.DB.prepare(`SELECT count(*) c FROM retention_policies WHERE status='APPROVED'`));
  const approvals = await all<{ approval_code: string; status: string }>(env.DB.prepare(`SELECT approval_code,status FROM privacy_release_approvals ORDER BY approval_code`));

  const activeAudiences = new Set(notices.map(item => item.audience));
  const approvalMap = new Map(approvals.map(item => [item.approval_code, item.status]));
  const blockers: Array<{ code: string; detail?: string }> = [];

  for (const processor of processors) {
    if (!processorReadyForPersonalData(processor)) blockers.push({ code: 'PROCESSOR_NOT_APPROVED', detail: processor.service_code });
  }
  for (const transfer of transfers) {
    if (!transferReadyForPersonalData(transfer)) blockers.push({ code: 'TRANSFER_NOT_APPROVED', detail: String(transfer.processor_id) });
  }
  for (const audience of REQUIRED_NOTICE_AUDIENCES) {
    if (!activeAudiences.has(audience)) blockers.push({ code: 'NOTICE_MISSING', detail: audience });
  }
  if ((retention?.c ?? 0) < 1) blockers.push({ code: 'RETENTION_POLICY_MISSING' });
  for (const approvalCode of REQUIRED_RELEASE_APPROVALS) {
    if (!['APPROVED', 'WAIVED'].includes(approvalMap.get(approvalCode) || 'PENDING')) blockers.push({ code: 'EXTERNAL_APPROVAL_PENDING', detail: approvalCode });
  }

  return json({
    ok: true,
    productionReleaseAllowed: blockers.length === 0,
    blockers,
    requiredNoticeAudiences: REQUIRED_NOTICE_AUDIENCES,
    requiredReleaseApprovals: REQUIRED_RELEASE_APPROVALS,
  });
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
    case 'consents':
      rows = await all<any>(env.DB.prepare(`SELECT id,purpose_code,subject_user_id,subject_student_id,institution_id,state,channel,granted_at,withdrawn_at,notice_version_id,created_at,updated_at FROM consent_records ORDER BY created_at DESC LIMIT 500`));
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
    case 'release-approvals':
      rows = await all<any>(env.DB.prepare(`SELECT * FROM privacy_release_approvals ORDER BY approval_code LIMIT 100`));
      break;
    case 'smoke-runs':
      rows = await all<any>(env.DB.prepare(`SELECT * FROM privacy_smoke_runs ORDER BY started_at DESC LIMIT 100`));
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
      if (path === '/api/admin/privacy/release-gate') return request.method === 'GET' ? privacyReleaseGate(env, admin) : methodNotAllowed();
      if (path === '/api/admin/privacy/incidents') {
        if (request.method === 'GET') return listPrivacyAdminCollection(env, admin, 'incidents');
        if (request.method === 'POST') return createSecurityIncident(request, env, admin);
        return methodNotAllowed();
      }
      if (path === '/api/admin/privacy/deletion-jobs') {
        if (request.method === 'GET') return listPrivacyAdminCollection(env, admin, 'deletion-jobs');
        if (request.method === 'POST') return createDeletionJob(request, env, admin);
        return methodNotAllowed();
      }
      const verifyRequestMatch = path.match(/^\/api\/admin\/privacy\/requests\/([^/]+)\/verify$/);
      if (verifyRequestMatch) return request.method === 'POST' ? verifyDataSubjectRequest(env, admin, verifyRequestMatch[1]) : methodNotAllowed();
      const approvalMatch = path.match(/^\/api\/admin\/privacy\/release-approvals\/([^/]+)$/);
      if (approvalMatch) return request.method === 'POST' ? updateReleaseApproval(request, env, admin, approvalMatch[1]) : methodNotAllowed();
      const match = path.match(/^\/api\/admin\/privacy\/(processing-activities|notices|consents|processors|transfers|retention|requests|release-approvals|smoke-runs)$/);
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
    if (path === '/api/privacy/consents') {
      if (request.method === 'GET') return listMyConsents(env, user);
      if (request.method === 'POST') return grantConsent(request, env, user);
      return methodNotAllowed();
    }
    const consentWithdrawMatch = path.match(/^\/api\/privacy\/consents\/([^/]+)\/withdraw$/);
    if (consentWithdrawMatch) return request.method === 'POST' ? withdrawConsent(env, user, consentWithdrawMatch[1]) : methodNotAllowed();
    return notFound('KVKK self-servis API yolu bulunamadı.');
  },
  async queue(batch: MessageBatch<CapacityJobMessage>, env: Env, ctx: ExecutionContext) {
    return app.queue(batch, env, ctx);
  },
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    return app.scheduled(event, env, ctx);
  },
} satisfies ExportedHandler<Env, CapacityJobMessage>;
