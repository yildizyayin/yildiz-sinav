import app from './privacy-entry';
import type { AuthUser, CapacityJobMessage, Env } from './types';
import { getAuthUser } from './lib/auth';
import { all, audit, badRequest, forbidden, json, notFound, one, uuid } from './lib/db';
import { deletionJobCanExecute } from './lib/privacy-operations';

const REQUIRED_RETENTION_POLICY_CODES = [
  'AUTH_SESSION_EXPIRED',
  'LOGIN_ATTEMPT_SECURITY',
  'NIBIRU_PAIRING_CODE',
  'WHATSAPP_RECEIPT',
  'SCAN_RAW_PAYLOAD',
] as const;

const LIFECYCLE_SCOPE = 'IDENTITY_ERASURE_V1';
const SYNTHETIC_POLICY_CODE = 'SMOKE_SYNTHETIC_STUDENT_ERASURE';

type DeletionDecisionBody = { decision?: string; retentionPolicyCode?: string; evidenceHash?: string; note?: string };
type LegalHoldBody = { action?: string; reasonCode?: string; evidenceHash?: string; note?: string };
type RetentionDecisionBody = { status?: string; evidenceHash?: string; note?: string };

type DeletionJobRow = {
  id: string;
  institution_id: string | null;
  institution_code: string | null;
  subject_user_id: string | null;
  subject_student_id: string | null;
  request_id: string | null;
  mode: 'DELETE' | 'ANONYMIZE';
  reason_code: string;
  legal_hold: number;
  status: string;
  retention_policy_id: string | null;
  retention_policy_code: string | null;
  retention_policy_status: string | null;
  disposal_action: string | null;
};

type RetentionPolicyRow = {
  id: string;
  code: string;
  entity_type: string;
  retention_days: number | null;
  disposal_action: 'DELETE' | 'ANONYMIZE' | 'LEGAL_REVIEW';
  legal_hold_supported: number;
  status: string;
};

function unauthenticated(): Response {
  return json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Oturum açmanız gerekiyor.' } }, 401);
}

function conflict(message: string, code = 'CONFLICT'): Response {
  return json({ ok: false, error: { code, message } }, 409);
}

function methodNotAllowed(): Response {
  return json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Bu yöntem desteklenmiyor.' } }, 405);
}

function validEvidenceHash(value: string): boolean {
  return /^[A-Fa-f0-9]{32,128}$/.test(value);
}

function validReasonCode(value: string): boolean {
  return /^[A-Z0-9_.:-]{2,80}$/.test(value);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function requireAdmin(env: Env, request: Request): Promise<AuthUser | Response> {
  const user = await getAuthUser(env, request);
  if (!user) return unauthenticated();
  if (user.role !== 'SUPER_ADMIN') return forbidden('KVKK yaşam döngüsü işlemlerini yalnız Süper Admin yönetebilir.');
  return user;
}

async function loadDeletionJob(env: Env, jobId: string): Promise<DeletionJobRow | null> {
  return one<DeletionJobRow>(env.DB.prepare(`
    SELECT j.id,j.institution_id,i.code institution_code,j.subject_user_id,j.subject_student_id,j.request_id,
           j.mode,j.reason_code,j.legal_hold,j.status,j.retention_policy_id,
           r.code retention_policy_code,r.status retention_policy_status,r.disposal_action
    FROM privacy_deletion_jobs j
    LEFT JOIN institutions i ON i.id=j.institution_id
    LEFT JOIN retention_policies r ON r.id=j.retention_policy_id
    WHERE j.id=? LIMIT 1
  `).bind(jobId));
}

async function retentionCounselApproved(env: Env): Promise<boolean> {
  const row = await one<{ status: string }>(env.DB.prepare(`
    SELECT status FROM privacy_release_approvals
    WHERE approval_code='COUNSEL_RETENTION_SCHEDULE' LIMIT 1
  `));
  return ['APPROVED', 'WAIVED'].includes(row?.status || 'PENDING');
}

function isSyntheticStagingJob(env: Env, job: DeletionJobRow): boolean {
  return env.ENVIRONMENT === 'staging'
    && job.institution_code === 'PRIVB'
    && job.reason_code === 'SMOKE_SYNTHETIC'
    && job.retention_policy_code === SYNTHETIC_POLICY_CODE;
}

async function activeLegalHoldExists(env: Env, job: DeletionJobRow): Promise<boolean> {
  const row = await one<{ c: number }>(env.DB.prepare(`
    SELECT count(*) c FROM privacy_legal_holds
    WHERE status='ACTIVE'
      AND ((? IS NOT NULL AND subject_user_id=?) OR (? IS NOT NULL AND subject_student_id=?))
  `).bind(job.subject_user_id, job.subject_user_id, job.subject_student_id, job.subject_student_id));
  return Number(row?.c || 0) > 0;
}

async function decideDeletionJob(request: Request, env: Env, admin: AuthUser, jobId: string): Promise<Response> {
  const body = await request.json<DeletionDecisionBody>().catch(() => ({} as DeletionDecisionBody));
  const decision = String(body.decision || '').trim().toUpperCase();
  const retentionPolicyCode = String(body.retentionPolicyCode || '').trim().toUpperCase();
  const evidenceHash = String(body.evidenceHash || '').trim();
  const note = String(body.note || '').trim();
  if (!['APPROVE', 'REJECT'].includes(decision)) return badRequest('Geçersiz silme işi kararı.');
  if (note.length > 1000) return badRequest('Karar notu en fazla 1000 karakter olabilir.');

  const job = await loadDeletionJob(env, jobId);
  if (!job) return notFound('Silme/anonimleştirme işi bulunamadı.');
  if (job.status === 'COMPLETED') return conflict('Tamamlanmış iş yeniden karara bağlanamaz.', 'DELETION_JOB_COMPLETED');
  if (!['LEGAL_REVIEW', 'FAILED'].includes(job.status)) return conflict('İş yalnız hukuk incelemesi veya kontrollü yeniden deneme durumunda karara bağlanabilir.', 'DELETION_JOB_DECISION_STATE');

  if (decision === 'REJECT') {
    await env.DB.prepare(`UPDATE privacy_deletion_jobs SET status='CANCELLED',failure_summary='LEGAL_REVIEW_REJECTED',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(jobId).run();
    if (job.request_id) await env.DB.prepare(`UPDATE data_subject_requests SET status='IN_REVIEW',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(job.request_id).run();
    await audit(env.DB, admin.id, job.institution_id, 'PRIVACY_DELETION_JOB_REJECTED', 'privacy_deletion_job', jobId, { requestId: job.request_id });
    return json({ ok: true, id: jobId, status: 'CANCELLED' });
  }

  if (!retentionPolicyCode || !validEvidenceHash(evidenceHash)) return badRequest('Onay için onaylı saklama politikası ve belge kanıt özeti zorunludur.');
  const policy = await one<RetentionPolicyRow>(env.DB.prepare(`
    SELECT id,code,entity_type,retention_days,disposal_action,legal_hold_supported,status
    FROM retention_policies WHERE upper(code)=? LIMIT 1
  `).bind(retentionPolicyCode));
  if (!policy || policy.status !== 'APPROVED') return conflict('Silme işi yalnız onaylı bir saklama/imha politikasına bağlanabilir.', 'RETENTION_POLICY_NOT_APPROVED');
  if (policy.disposal_action !== job.mode && policy.disposal_action !== 'LEGAL_REVIEW') return conflict('Saklama politikası imha eylemi iş moduyla uyuşmuyor.', 'RETENTION_POLICY_MODE_MISMATCH');

  const syntheticStaging = env.ENVIRONMENT === 'staging'
    && job.institution_code === 'PRIVB'
    && job.reason_code === 'SMOKE_SYNTHETIC'
    && policy.code === SYNTHETIC_POLICY_CODE;
  if (!syntheticStaging && !await retentionCounselApproved(env)) {
    return conflict('Hukukçu saklama/imha planı onayı tamamlanmadan gerçek kişi verisi için yürütme onayı verilemez.', 'RETENTION_COUNSEL_APPROVAL_PENDING');
  }

  await env.DB.prepare(`
    UPDATE privacy_deletion_jobs
    SET status='APPROVED',retention_policy_id=?,approved_by=?,approved_at=CURRENT_TIMESTAMP,
        approval_evidence_hash=?,failure_summary=NULL,updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(policy.id, admin.id, evidenceHash, jobId).run();
  await audit(env.DB, admin.id, job.institution_id, 'PRIVACY_DELETION_JOB_APPROVED', 'privacy_deletion_job', jobId, {
    requestId: job.request_id,
    mode: job.mode,
    retentionPolicyCode: policy.code,
    syntheticStaging,
  });
  return json({ ok: true, id: jobId, status: 'APPROVED', retentionPolicyCode: policy.code, syntheticStaging });
}

async function changeLegalHold(request: Request, env: Env, admin: AuthUser, jobId: string): Promise<Response> {
  const body = await request.json<LegalHoldBody>().catch(() => ({} as LegalHoldBody));
  const action = String(body.action || '').trim().toUpperCase();
  const reasonCode = String(body.reasonCode || '').trim().toUpperCase();
  const note = String(body.note || '').trim();
  const evidenceHash = String(body.evidenceHash || '').trim();
  if (!['APPLY', 'RELEASE'].includes(action)) return badRequest('Geçersiz legal hold işlemi.');
  if (!validReasonCode(reasonCode)) return badRequest('Legal hold neden kodu geçersiz.');
  if (note.length > 1000) return badRequest('Legal hold notu en fazla 1000 karakter olabilir.');
  if (evidenceHash && !validEvidenceHash(evidenceHash)) return badRequest('Legal hold kanıt özeti geçersiz.');

  const job = await loadDeletionJob(env, jobId);
  if (!job) return notFound('Silme/anonimleştirme işi bulunamadı.');
  if (job.status === 'COMPLETED') return conflict('Tamamlanmış iş için legal hold değiştirilemez.', 'DELETION_JOB_COMPLETED');

  if (action === 'APPLY') {
    const existing = await one<{ id: string }>(env.DB.prepare(`
      SELECT id FROM privacy_legal_holds
      WHERE status='ACTIVE' AND ((? IS NOT NULL AND subject_user_id=?) OR (? IS NOT NULL AND subject_student_id=?))
      ORDER BY applied_at DESC LIMIT 1
    `).bind(job.subject_user_id, job.subject_user_id, job.subject_student_id, job.subject_student_id));
    const holdId = existing?.id || uuid('phold');
    if (!existing) {
      await env.DB.prepare(`
        INSERT INTO privacy_legal_holds
          (id,institution_id,subject_user_id,subject_student_id,reason_code,note,evidence_hash,status,applied_by)
        VALUES (?,?,?,?,?,?,?,'ACTIVE',?)
      `).bind(holdId, job.institution_id, job.subject_user_id, job.subject_student_id, reasonCode, note || null, evidenceHash || null, admin.id).run();
    }
    await env.DB.prepare(`UPDATE privacy_deletion_jobs SET legal_hold=1,legal_hold_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(note || reasonCode, jobId).run();
    await audit(env.DB, admin.id, job.institution_id, 'PRIVACY_LEGAL_HOLD_APPLIED', 'privacy_legal_hold', holdId, { jobId, reasonCode });
    return json({ ok: true, id: jobId, legalHold: true, holdId, alreadyActive: Boolean(existing) });
  }

  const active = await all<{ id: string }>(env.DB.prepare(`
    SELECT id FROM privacy_legal_holds
    WHERE status='ACTIVE' AND ((? IS NOT NULL AND subject_user_id=?) OR (? IS NOT NULL AND subject_student_id=?))
  `).bind(job.subject_user_id, job.subject_user_id, job.subject_student_id, job.subject_student_id));
  if (!active.length) return json({ ok: true, id: jobId, legalHold: false, alreadyReleased: true });
  await env.DB.prepare(`
    UPDATE privacy_legal_holds
    SET status='RELEASED',released_by=?,released_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
    WHERE status='ACTIVE' AND ((? IS NOT NULL AND subject_user_id=?) OR (? IS NOT NULL AND subject_student_id=?))
  `).bind(admin.id, job.subject_user_id, job.subject_user_id, job.subject_student_id, job.subject_student_id).run();
  await env.DB.prepare(`UPDATE privacy_deletion_jobs SET legal_hold=0,legal_hold_note=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(jobId).run();
  await audit(env.DB, admin.id, job.institution_id, 'PRIVACY_LEGAL_HOLD_RELEASED', 'privacy_deletion_job', jobId, { reasonCode, releasedHoldCount: active.length });
  return json({ ok: true, id: jobId, legalHold: false, releasedHoldCount: active.length });
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(',');
}

function changesOf(result: unknown): number {
  return Number((result as { meta?: { changes?: number } } | null)?.meta?.changes || 0);
}

async function executeDeletionJob(env: Env, admin: AuthUser, jobId: string): Promise<Response> {
  const job = await loadDeletionJob(env, jobId);
  if (!job) return notFound('Silme/anonimleştirme işi bulunamadı.');
  if (job.status === 'COMPLETED') {
    const evidence = await one<any>(env.DB.prepare(`SELECT id,affected_records,result_hash,completed_at FROM privacy_disposal_evidence WHERE deletion_job_id=? LIMIT 1`).bind(jobId));
    return json({ ok: true, id: jobId, status: 'COMPLETED', alreadyCompleted: true, evidence });
  }
  const activeHold = await activeLegalHoldExists(env, job);
  if (activeHold || !deletionJobCanExecute(job.status, job.legal_hold)) {
    return conflict('İş onaylı değil veya aktif legal hold nedeniyle çalıştırılamaz.', activeHold ? 'LEGAL_HOLD_ACTIVE' : 'DELETION_JOB_NOT_EXECUTABLE');
  }
  if (!job.retention_policy_id || job.retention_policy_status !== 'APPROVED') return conflict('Onaylı saklama/imha politikası olmadan iş çalıştırılamaz.', 'RETENTION_POLICY_NOT_APPROVED');
  const syntheticStaging = isSyntheticStagingJob(env, job);
  if (!syntheticStaging && !await retentionCounselApproved(env)) return conflict('Hukukçu saklama/imha planı onayı tamamlanmadı.', 'RETENTION_COUNSEL_APPROVAL_PENDING');

  const userIds = new Set<string>();
  if (job.subject_user_id) userIds.add(job.subject_user_id);
  if (job.subject_student_id) {
    const linkedUsers = await all<{ id: string }>(env.DB.prepare(`SELECT id FROM users WHERE student_id=?`).bind(job.subject_student_id));
    for (const row of linkedUsers) userIds.add(row.id);
  }
  const ids = [...userIds];
  const erasedSecret = await sha256Hex(`${job.id}:${crypto.randomUUID()}:erased`);
  const statements: D1PreparedStatement[] = [];

  if (ids.length) {
    const marks = placeholders(ids.length);
    statements.push(env.DB.prepare(`DELETE FROM nibiru_whatsapp_receipts WHERE phone_e164 IN (SELECT phone_e164 FROM nibiru_whatsapp_identities WHERE user_id IN (${marks}))`).bind(...ids));
    statements.push(env.DB.prepare(`DELETE FROM nibiru_pairing_codes WHERE user_id IN (${marks})`).bind(...ids));
    statements.push(env.DB.prepare(`DELETE FROM nibiru_sessions WHERE user_id IN (${marks})`).bind(...ids));
    statements.push(env.DB.prepare(`DELETE FROM nibiru_whatsapp_identities WHERE user_id IN (${marks})`).bind(...ids));
    statements.push(env.DB.prepare(`DELETE FROM announcement_deliveries WHERE recipient_user_id IN (${marks})`).bind(...ids));
    statements.push(env.DB.prepare(`DELETE FROM sessions WHERE user_id IN (${marks})`).bind(...ids));
  }

  if (job.subject_student_id) {
    const studentId = job.subject_student_id;
    statements.push(env.DB.prepare(`DELETE FROM external_identities WHERE entity_type='STUDENT' AND internal_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`UPDATE nibiru_sessions SET last_student_id=NULL WHERE last_student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`DELETE FROM parent_student_links WHERE student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`DELETE FROM guest_profiles WHERE student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`DELETE FROM student_experience_preferences WHERE student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`DELETE FROM student_academic_targets WHERE student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`DELETE FROM guidance_assessment_sessions WHERE student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`DELETE FROM guidance_responses WHERE student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`DELETE FROM rba_assessments WHERE student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`DELETE FROM rba_profiles WHERE student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`DELETE FROM live_sessions WHERE student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`DELETE FROM student_personal_books WHERE student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`DELETE FROM zero_error_attempts WHERE student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`DELETE FROM zero_error_booklets WHERE student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`DELETE FROM assignment_attempts WHERE student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`DELETE FROM assignment_recipients WHERE student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`DELETE FROM recovery_plans WHERE student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`DELETE FROM student_learning_state WHERE student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`DELETE FROM learning_evidence WHERE student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`DELETE FROM student_memberships WHERE student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`DELETE FROM gamification_profiles WHERE student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`DELETE FROM student_achievements WHERE student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`DELETE FROM game_sessions WHERE student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`DELETE FROM coach_followup_actions WHERE student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`DELETE FROM student_outcome_mastery WHERE student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`DELETE FROM coach_mini_tests WHERE student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`DELETE FROM student_intelligence_profile_history WHERE student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`DELETE FROM student_intelligence_profiles WHERE student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`DELETE FROM outcome_results WHERE student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`UPDATE admissions_candidates SET participant_id=NULL WHERE participant_id IN (SELECT id FROM exam_participants WHERE student_id=?)`).bind(studentId));
    statements.push(env.DB.prepare(`UPDATE scan_records SET canonical_json='{}',matched_student_id=NULL,match_status='INVALID',match_confidence=0,issues_json=NULL WHERE matched_student_id=?`).bind(studentId));

    if (job.mode === 'DELETE') {
      statements.push(env.DB.prepare(`DELETE FROM exam_participants WHERE student_id=?`).bind(studentId));
    } else {
      statements.push(env.DB.prepare(`UPDATE exam_result_snapshots SET student_id=NULL,payload_json=NULL,class_snapshot=NULL WHERE student_id=?`).bind(studentId));
      statements.push(env.DB.prepare(`UPDATE exam_participants SET student_id=NULL,student_number_snapshot=NULL,name_snapshot='Anonim Öğrenci',class_snapshot=NULL WHERE student_id=?`).bind(studentId));
    }

    statements.push(env.DB.prepare(`DELETE FROM student_enrollments WHERE student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`UPDATE nibiru_audit_events SET subject_student_id=NULL WHERE subject_student_id=?`).bind(studentId));
    statements.push(env.DB.prepare(`UPDATE student_entities SET first_name='Anonim',last_name='Öğrenci',normalized_name='anonim ogrenci',status='ARCHIVED',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(studentId));
  }

  if (ids.length) {
    const marks = placeholders(ids.length);
    statements.push(env.DB.prepare(`UPDATE users SET institution_id=NULL,student_id=NULL,display_name='Silinmiş Hesap',email=NULL,phone=NULL,username=NULL,password_hash=?,password_salt=?,active=0,updated_at=CURRENT_TIMESTAMP WHERE id IN (${marks})`).bind(erasedSecret, erasedSecret, ...ids));
  }

  if (!statements.length) return conflict('İş için yürütülebilir veri kapsamı bulunamadı.', 'DELETION_JOB_EMPTY_SCOPE');
  await env.DB.prepare(`UPDATE privacy_deletion_jobs SET status='RUNNING',started_at=CURRENT_TIMESTAMP,execution_scope_code=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(LIFECYCLE_SCOPE, jobId).run();

  try {
    const results = await env.DB.batch(statements);
    const affectedRecords = results.reduce((sum, result) => sum + changesOf(result), 0);
    const completedAt = new Date().toISOString();
    const resultHash = await sha256Hex(`${job.id}|${job.mode}|${LIFECYCLE_SCOPE}|${affectedRecords}|${completedAt}`);
    const evidenceId = uuid('pdispose');
    await env.DB.batch([
      env.DB.prepare(`
        INSERT OR IGNORE INTO privacy_disposal_evidence
          (id,deletion_job_id,request_id,institution_id,mode,execution_scope_code,affected_records,result_hash,completed_at,created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `).bind(evidenceId, job.id, job.request_id, job.institution_id, job.mode, LIFECYCLE_SCOPE, affectedRecords, resultHash, completedAt, admin.id),
      env.DB.prepare(`UPDATE privacy_deletion_jobs SET status='COMPLETED',completed_at=?,affected_records=?,result_hash=?,failure_summary=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(completedAt, affectedRecords, resultHash, job.id),
      ...(job.request_id ? [env.DB.prepare(`UPDATE data_subject_requests SET status='COMPLETED',completed_at=?,response_evidence_hash=?,resolution_note='Controlled privacy lifecycle job completed.',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(completedAt, resultHash, job.request_id)] : []),
    ]);
    await audit(env.DB, admin.id, job.institution_id, 'PRIVACY_DELETION_JOB_COMPLETED', 'privacy_deletion_job', job.id, {
      requestId: job.request_id,
      mode: job.mode,
      executionScopeCode: LIFECYCLE_SCOPE,
      affectedRecords,
      resultHash,
      syntheticStaging,
    });
    return json({ ok: true, id: job.id, status: 'COMPLETED', mode: job.mode, affectedRecords, resultHash, syntheticStaging });
  } catch {
    await env.DB.prepare(`UPDATE privacy_deletion_jobs SET status='FAILED',failure_summary='CONTROLLED_EXECUTION_FAILED',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(job.id).run();
    await audit(env.DB, admin.id, job.institution_id, 'PRIVACY_DELETION_JOB_FAILED', 'privacy_deletion_job', job.id, { requestId: job.request_id, mode: job.mode, failureCode: 'CONTROLLED_EXECUTION_FAILED' });
    return json({ ok: false, error: { code: 'CONTROLLED_EXECUTION_FAILED', message: 'Kontrollü silme/anonimleştirme yürütmesi tamamlanamadı.' } }, 500);
  }
}

async function decideRetentionPolicy(request: Request, env: Env, admin: AuthUser, code: string): Promise<Response> {
  const body = await request.json<RetentionDecisionBody>().catch(() => ({} as RetentionDecisionBody));
  const status = String(body.status || '').trim().toUpperCase();
  const evidenceHash = String(body.evidenceHash || '').trim();
  const note = String(body.note || '').trim();
  if (!['DRAFT', 'LEGAL_REVIEW', 'APPROVED', 'RETIRED'].includes(status)) return badRequest('Geçersiz saklama politikası durumu.');
  if (note.length > 1000) return badRequest('Saklama politikası notu en fazla 1000 karakter olabilir.');
  if (status === 'APPROVED') {
    if (!validEvidenceHash(evidenceHash)) return badRequest('Onay için belge kanıt özeti zorunludur.');
    if (!await retentionCounselApproved(env)) return conflict('Hukukçu saklama/imha planı onayı tamamlanmadan teknik politika APPROVED yapılamaz.', 'RETENTION_COUNSEL_APPROVAL_PENDING');
  }
  const row = await one<{ id: string }>(env.DB.prepare(`SELECT id FROM retention_policies WHERE upper(code)=? LIMIT 1`).bind(code));
  if (!row) return notFound('Saklama politikası bulunamadı.');
  await env.DB.prepare(`
    UPDATE retention_policies
    SET status=?,legal_review_note=?,approved_by=CASE WHEN ?='APPROVED' THEN ? ELSE NULL END,
        approved_at=CASE WHEN ?='APPROVED' THEN CURRENT_TIMESTAMP ELSE NULL END,updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(status, note || null, status, admin.id, status, row.id).run();
  await audit(env.DB, admin.id, null, 'PRIVACY_RETENTION_POLICY_UPDATED', 'retention_policy', row.id, { code, status, evidenceHash: evidenceHash || null });
  return json({ ok: true, code, status });
}

async function listLifecycleCollection(env: Env, collection: string): Promise<Response> {
  if (collection === 'legal-holds') {
    const items = await all<any>(env.DB.prepare(`SELECT id,institution_id,subject_user_id,subject_student_id,reason_code,status,applied_at,released_at,created_at FROM privacy_legal_holds ORDER BY applied_at DESC LIMIT 500`));
    return json({ ok: true, collection, items });
  }
  if (collection === 'disposal-evidence') {
    const items = await all<any>(env.DB.prepare(`SELECT id,deletion_job_id,request_id,institution_id,mode,execution_scope_code,affected_records,result_hash,completed_at,created_at FROM privacy_disposal_evidence ORDER BY completed_at DESC LIMIT 500`));
    return json({ ok: true, collection, items });
  }
  if (collection === 'retention-runs') {
    const items = await all<any>(env.DB.prepare(`SELECT id,environment,status,policies_considered,policies_executed,affected_records,failure_codes_json,started_at,completed_at FROM privacy_retention_runs ORDER BY started_at DESC LIMIT 100`));
    return json({ ok: true, collection, items });
  }
  return notFound('KVKK yaşam döngüsü koleksiyonu bulunamadı.');
}

async function augmentReleaseGate(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const response = await app.fetch(request, env, ctx);
  if (response.status !== 200) return response;
  const payload = await response.clone().json().catch(() => null) as any;
  if (!payload?.ok || !Array.isArray(payload.blockers)) return response;
  const policies = await all<{ code: string; status: string }>(env.DB.prepare(`SELECT code,status FROM retention_policies WHERE code IN (${REQUIRED_RETENTION_POLICY_CODES.map(() => '?').join(',')})`).bind(...REQUIRED_RETENTION_POLICY_CODES));
  const statusByCode = new Map(policies.map(row => [row.code, row.status]));
  const blockers = [...payload.blockers];
  for (const code of REQUIRED_RETENTION_POLICY_CODES) {
    if (statusByCode.get(code) !== 'APPROVED') blockers.push({ code: 'RETENTION_POLICY_NOT_APPROVED', detail: code });
  }
  return json({ ...payload, productionReleaseAllowed: payload.productionReleaseAllowed === true && blockers.length === 0, blockers, requiredRetentionPolicies: REQUIRED_RETENTION_POLICY_CODES });
}

async function runApprovedRetentionSweep(env: Env): Promise<void> {
  if (!await retentionCounselApproved(env)) return;
  const runId = uuid('pret');
  await env.DB.prepare(`INSERT INTO privacy_retention_runs(id,environment,status) VALUES (?,?,'RUNNING')`).bind(runId, env.ENVIRONMENT || 'unknown').run();
  let considered = 0;
  let executed = 0;
  let affected = 0;
  const failures: string[] = [];
  try {
    const policies = await all<RetentionPolicyRow>(env.DB.prepare(`
      SELECT id,code,entity_type,retention_days,disposal_action,legal_hold_supported,status
      FROM retention_policies WHERE status='APPROVED' AND code IN (${REQUIRED_RETENTION_POLICY_CODES.map(() => '?').join(',')})
    `).bind(...REQUIRED_RETENTION_POLICY_CODES));
    considered = policies.length;
    for (const policy of policies) {
      if (policy.retention_days === null || policy.retention_days < 0) continue;
      const cutoff = new Date(Date.now() - policy.retention_days * 86400000).toISOString();
      let statement: D1PreparedStatement | null = null;
      if (policy.code === 'AUTH_SESSION_EXPIRED') {
        statement = env.DB.prepare(`DELETE FROM sessions WHERE expires_at<? AND user_id NOT IN (SELECT subject_user_id FROM privacy_legal_holds WHERE status='ACTIVE' AND subject_user_id IS NOT NULL)`).bind(cutoff);
      } else if (policy.code === 'LOGIN_ATTEMPT_SECURITY') {
        statement = env.DB.prepare(`DELETE FROM login_attempts WHERE created_at<?`).bind(cutoff);
      } else if (policy.code === 'NIBIRU_PAIRING_CODE') {
        statement = env.DB.prepare(`DELETE FROM nibiru_pairing_codes WHERE expires_at<? AND user_id NOT IN (SELECT subject_user_id FROM privacy_legal_holds WHERE status='ACTIVE' AND subject_user_id IS NOT NULL)`).bind(cutoff);
      } else if (policy.code === 'WHATSAPP_RECEIPT') {
        statement = env.DB.prepare(`DELETE FROM nibiru_whatsapp_receipts WHERE received_at<? AND phone_e164 NOT IN (SELECT n.phone_e164 FROM nibiru_whatsapp_identities n JOIN privacy_legal_holds h ON h.subject_user_id=n.user_id WHERE h.status='ACTIVE')`).bind(cutoff);
      } else if (policy.code === 'SCAN_RAW_PAYLOAD') {
        statement = env.DB.prepare(`UPDATE scan_records SET canonical_json='{}',issues_json=NULL WHERE batch_id IN (SELECT id FROM scan_batches WHERE status='COMMITTED' AND created_at<?) AND (matched_student_id IS NULL OR matched_student_id NOT IN (SELECT subject_student_id FROM privacy_legal_holds WHERE status='ACTIVE' AND subject_student_id IS NOT NULL))`).bind(cutoff);
      }
      if (!statement) continue;
      try {
        const result = await statement.run();
        affected += changesOf(result);
        executed += 1;
      } catch {
        failures.push(`RETENTION_${policy.code}_FAILED`);
      }
    }
    await env.DB.prepare(`
      UPDATE privacy_retention_runs SET status=?,policies_considered=?,policies_executed=?,affected_records=?,failure_codes_json=?,completed_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(failures.length ? 'FAILED' : 'COMPLETED', considered, executed, affected, failures.length ? JSON.stringify(failures) : null, runId).run();
    await audit(env.DB, null, null, 'PRIVACY_RETENTION_SWEEP_COMPLETED', 'privacy_retention_run', runId, { considered, executed, affected, failureCodes: failures });
  } catch {
    await env.DB.prepare(`UPDATE privacy_retention_runs SET status='FAILED',failure_codes_json='["RETENTION_SWEEP_FAILED"]',completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(runId).run();
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/admin/privacy/release-gate' && request.method === 'GET') return augmentReleaseGate(request, env, ctx);

    const collectionMatch = path.match(/^\/api\/admin\/privacy\/(legal-holds|disposal-evidence|retention-runs)$/);
    if (collectionMatch) {
      if (request.method !== 'GET') return methodNotAllowed();
      const admin = await requireAdmin(env, request);
      if (admin instanceof Response) return admin;
      return listLifecycleCollection(env, collectionMatch[1]);
    }

    const decisionMatch = path.match(/^\/api\/admin\/privacy\/deletion-jobs\/([^/]+)\/decision$/);
    const holdMatch = path.match(/^\/api\/admin\/privacy\/deletion-jobs\/([^/]+)\/legal-hold$/);
    const executeMatch = path.match(/^\/api\/admin\/privacy\/deletion-jobs\/([^/]+)\/execute$/);
    const retentionMatch = path.match(/^\/api\/admin\/privacy\/retention\/([^/]+)\/decision$/);
    if (!decisionMatch && !holdMatch && !executeMatch && !retentionMatch) return app.fetch(request, env, ctx);

    if (request.method !== 'POST') return methodNotAllowed();
    const admin = await requireAdmin(env, request);
    if (admin instanceof Response) return admin;
    if (decisionMatch) return decideDeletionJob(request, env, admin, decisionMatch[1]);
    if (holdMatch) return changeLegalHold(request, env, admin, holdMatch[1]);
    if (executeMatch) return executeDeletionJob(env, admin, executeMatch[1]);
    if (retentionMatch) return decideRetentionPolicy(request, env, admin, retentionMatch[1].toUpperCase());
    return notFound('KVKK yaşam döngüsü API yolu bulunamadı.');
  },
  async queue(batch: MessageBatch<CapacityJobMessage>, env: Env, ctx: ExecutionContext) {
    return app.queue(batch, env, ctx);
  },
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runApprovedRetentionSweep(env));
    return app.scheduled(event, env, ctx);
  },
} satisfies ExportedHandler<Env, CapacityJobMessage>;
