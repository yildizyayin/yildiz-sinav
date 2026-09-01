import type { AuthUser, CanonicalRecord, Env, MatchCandidate } from './types';
import { audit, badRequest, forbidden, json, methodNotAllowed, normalizeName, notFound, one, all, splitName, uuid } from './lib/db';
import { createSession, getAuthUser, isTemporarilyLocked, recordLoginAttempt, revokeSession, verifyPassword, verifyTurnstile } from './lib/auth';
import { canAccessSubjectForClass, canEvaluateExam, loadPermissionScope, roleCanManageInstitution } from './lib/permissions';
import { matchParticipant } from './lib/matching';
import { parseUploadedText, parseWithTemplate, type ParserTemplate } from './lib/parse';
import { assertScoringRuleVerified, calculateOverall, calculateSubjectScore } from './lib/scoring';
import { masteryStatus } from './lib/outcome';
import { calibrationWithinTolerance, nextCalibrationStatus, type CalibrationMetrics } from './lib/calibration';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (!url.pathname.startsWith('/api/')) return new Response(null, { status: 404 });
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { Allow: 'GET,POST,PATCH,DELETE,OPTIONS' } });

      if (url.pathname === '/api/config' && request.method === 'GET') {
        return json({
          ok: true,
          productName: env.PRODUCT_NAME || 'Anunex',
          turnstileSiteKey: env.TURNSTILE_SITE_KEY || '',
          environment: env.ENVIRONMENT || 'development',
          superAdminMfaEnabled: Boolean(String(env.SUPER_ADMIN_MFA_TOTP_SECRET || '').trim()),
        });
      }
      if (url.pathname === '/api/auth/login') return request.method === 'POST' ? login(request, env) : methodNotAllowed();
      if (url.pathname === '/api/auth/logout') return request.method === 'POST' ? revokeSession(env, request) : methodNotAllowed();

      const user = await getAuthUser(env, request);
      if (!user) return json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Oturum açmanız gerekiyor.' } }, 401);

      if (url.pathname === '/api/auth/me' && request.method === 'GET') {
        const institution = user.institution_id ? await one<{ status: string; name: string }>(env.DB.prepare('SELECT status, name FROM institutions WHERE id = ?').bind(user.institution_id)) : null;
        return json({ ok: true, user, institution });
      }

      const passive = await rejectIfPassiveInstitution(env, user);
      if (passive) return passive;

      if (url.pathname === '/api/dashboard' && request.method === 'GET') return dashboard(env, user);
      if (url.pathname === '/api/institutions') return request.method === 'GET' ? listInstitutions(env, user) : methodNotAllowed();
      const institutionStatusMatch = url.pathname.match(/^\/api\/institutions\/([^/]+)\/status$/);
      if (institutionStatusMatch) return request.method === 'POST' ? setInstitutionStatus(request, env, user, institutionStatusMatch[1]) : methodNotAllowed();

      if (url.pathname === '/api/exams') return request.method === 'GET' ? listExams(env, user, url) : methodNotAllowed();
      const examPreviewMatch = url.pathname.match(/^\/api\/exams\/([^/]+)\/preview-file$/);
      if (examPreviewMatch) return request.method === 'POST' ? previewExamFile(request, env, user, examPreviewMatch[1]) : methodNotAllowed();

      const scanResolveMatch = url.pathname.match(/^\/api\/scan-batches\/([^/]+)\/records\/([^/]+)\/resolve$/);
      if (scanResolveMatch) return request.method === 'POST' ? resolveScanRecord(request, env, user, scanResolveMatch[1], scanResolveMatch[2]) : methodNotAllowed();
      const scanEvaluateMatch = url.pathname.match(/^\/api\/scan-batches\/([^/]+)\/evaluate$/);
      if (scanEvaluateMatch) return request.method === 'POST' ? evaluateBatch(env, user, scanEvaluateMatch[1]) : methodNotAllowed();
      const scanBatchMatch = url.pathname.match(/^\/api\/scan-batches\/([^/]+)$/);
      if (scanBatchMatch) return request.method === 'GET' ? getScanBatch(env, user, scanBatchMatch[1]) : methodNotAllowed();

      if (url.pathname === '/api/students') return request.method === 'GET' ? listStudents(env, user, url) : methodNotAllowed();
      const activateGuestMatch = url.pathname.match(/^\/api\/students\/([^/]+)\/activate$/);
      if (activateGuestMatch) return request.method === 'POST' ? activateGuest(request, env, user, activateGuestMatch[1]) : methodNotAllowed();
      const studentResultsMatch = url.pathname.match(/^\/api\/students\/([^/]+)\/results$/);
      if (studentResultsMatch) return request.method === 'GET' ? studentResults(env, user, studentResultsMatch[1]) : methodNotAllowed();
      const studentOutcomesMatch = url.pathname.match(/^\/api\/students\/([^/]+)\/outcomes$/);
      if (studentOutcomesMatch) return request.method === 'GET' ? studentOutcomes(env, user, studentOutcomesMatch[1], url) : methodNotAllowed();

      if (url.pathname === '/api/my-results' && request.method === 'GET') return myResults(env, user, url);
      if (url.pathname === '/api/my-outcomes' && request.method === 'GET') return myOutcomes(env, user, url);
      if (url.pathname === '/api/classes' && request.method === 'GET') return listClasses(env, user, url);
      if (url.pathname === '/api/teacher/insights' && request.method === 'GET') return teacherInsights(env, user, url);

      if (url.pathname === '/api/optical-templates' && request.method === 'GET') return listOpticalTemplates(env, user);
      if (url.pathname === '/api/printer-profiles') {
        if (request.method === 'GET') return listPrinterProfiles(env, user, url);
        if (request.method === 'POST') return createPrinterProfile(request, env, user);
        return methodNotAllowed();
      }
      if (url.pathname === '/api/calibrations' && request.method === 'GET') return listCalibrations(env, user, url);
      if (url.pathname === '/api/calibrations/start' && request.method === 'POST') return startCalibration(request, env, user);
      const calibrationAttemptMatch = url.pathname.match(/^\/api\/calibrations\/([^/]+)\/attempt$/);
      if (calibrationAttemptMatch) return request.method === 'POST' ? saveCalibrationAttempt(request, env, user, calibrationAttemptMatch[1]) : methodNotAllowed();
      if (url.pathname === '/api/optical-prepare' && request.method === 'GET') return opticalPrepare(env, user, url);

      if (url.pathname === '/api/seasons/rollover-preview' && request.method === 'POST') return rolloverPreview(request, env, user);
      if (url.pathname === '/api/seasons/rollover-commit' && request.method === 'POST') return rolloverCommit(request, env, user);

      if (url.pathname === '/api/imports/preview' && request.method === 'POST') return importPreview(request, env, user);
      const importGetMatch = url.pathname.match(/^\/api\/imports\/([^/]+)$/);
      if (importGetMatch) return request.method === 'GET' ? getImport(env, user, importGetMatch[1]) : methodNotAllowed();
      const importCommitMatch = url.pathname.match(/^\/api\/imports\/([^/]+)\/commit$/);
      if (importCommitMatch) return request.method === 'POST' ? importCommit(env, user, importCommitMatch[1]) : methodNotAllowed();

      if (url.pathname === '/api/worksheets' && request.method === 'GET') return listWorksheets(env, user, url);
      const worksheetAssetMatch = url.pathname.match(/^\/api\/worksheets\/([^/]+)\/assets$/);
      if (worksheetAssetMatch) return request.method === 'POST' ? uploadWorksheetAsset(request, env, user, worksheetAssetMatch[1]) : methodNotAllowed();

      return notFound('API yolu bulunamadı.');
    } catch (error) {
      console.error('Worker error', error);
      const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
      if (message === 'OFFICIAL_SCORING_RULE_REQUIRED') return badRequest('Bu sınav için doğrulanmış resmî puanlama kuralı tanımlanmalıdır.', message);
      return json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Sunucu hatası oluştu.' } }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

async function login(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ identifier?: string; password?: string; remember?: boolean; turnstileToken?: string }>();
  const identifier = body.identifier?.trim() || '';
  if (!identifier || !body.password) return badRequest('Kullanıcı bilgileri eksik.');
  if (await isTemporarilyLocked(env, identifier)) return json({ ok: false, error: { code: 'TEMP_LOCKED', message: 'Çok fazla hatalı giriş yapıldı. 15 dakika sonra tekrar deneyin.' } }, 429);
  const turnstile = await verifyTurnstile(env, body.turnstileToken, request.headers.get('CF-Connecting-IP'));
  if (!turnstile.ok) return badRequest('Robot doğrulaması başarısız.', turnstile.error || 'TURNSTILE_FAILED');

  const row = await one<any>(env.DB.prepare(`SELECT u.*, i.status AS institution_status FROM users u LEFT JOIN institutions i ON i.id=u.institution_id
    WHERE lower(coalesce(u.email,''))=lower(?) OR lower(coalesce(u.username,''))=lower(?) OR coalesce(u.phone,'')=? LIMIT 1`).bind(identifier, identifier, identifier));
  if (!row || !row.active || !(await verifyPassword(body.password, row.password_salt, row.password_hash, row.password_iterations))) {
    await recordLoginAttempt(env, identifier, false, request);
    return json({ ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'Kullanıcı adı veya şifre hatalı.' } }, 401);
  }
  if (row.role !== 'SUPER_ADMIN' && row.institution_id && row.institution_status === 'PASSIVE') {
    await recordLoginAttempt(env, identifier, true, request);
    return json({ ok: false, error: { code: 'INSTITUTION_PASSIVE', message: 'Kurum hesabınız şu anda aktif değildir. Lütfen kurum yöneticinizle iletişime geçin.' } }, 403);
  }
  if (row.student_id) {
    const student = await one<{ status: string }>(env.DB.prepare('SELECT status FROM student_entities WHERE id=?').bind(row.student_id));
    if (student?.status === 'GUEST') return json({ ok: false, error: { code: 'GUEST_NO_LOGIN', message: 'Misafir öğrencilerin sistem girişi bulunmaz.' } }, 403);
  }
  await recordLoginAttempt(env, identifier, true, request);
  return createSession(env, row.id, request, Boolean(body.remember));
}

async function rejectIfPassiveInstitution(env: Env, user: AuthUser): Promise<Response | null> {
  if (user.role === 'SUPER_ADMIN' || !user.institution_id) return null;
  const inst = await one<{ status: string }>(env.DB.prepare('SELECT status FROM institutions WHERE id=?').bind(user.institution_id));
  if (inst?.status === 'PASSIVE') return json({ ok: false, error: { code: 'INSTITUTION_PASSIVE', message: 'Kurum hesabınız şu anda aktif değildir. Lütfen kurum yöneticinizle iletişime geçin.' } }, 403);
  return null;
}

async function dashboard(env: Env, user: AuthUser): Promise<Response> {
  if (user.role === 'SUPER_ADMIN') {
    const [institutions, activeStudents, guests, todayResults, passive] = await Promise.all([
      one<{ c: number }>(env.DB.prepare('SELECT count(*) c FROM institutions')),
      one<{ c: number }>(env.DB.prepare(`SELECT count(*) c FROM student_entities WHERE status='ACTIVE'`)),
      one<{ c: number }>(env.DB.prepare(`SELECT count(*) c FROM student_entities WHERE status='GUEST'`)),
      one<{ c: number }>(env.DB.prepare(`SELECT count(*) c FROM exam_results WHERE date(created_at)=date('now')`)),
      one<{ c: number }>(env.DB.prepare(`SELECT count(*) c FROM institutions WHERE status='PASSIVE'`)),
    ]);
    return json({ ok: true, cards: [
      { label: 'Kurum', value: institutions?.c ?? 0 }, { label: 'Aktif Öğrenci', value: activeStudents?.c ?? 0 },
      { label: 'Misafir Öğrenci', value: guests?.c ?? 0 }, { label: 'Bugün Değerlendirilen', value: todayResults?.c ?? 0 },
      { label: 'Pasif Kurum', value: passive?.c ?? 0 },
    ] });
  }
  if (user.role === 'STUDENT') {
    if (!user.student_id) return badRequest('Öğrenci hesabı bağlı değil.');
    const latest = await one<any>(env.DB.prepare(`SELECT e.title, e.exam_date, er.net, er.score, er.success_percent
      FROM exam_results er JOIN exam_participants ep ON ep.id=er.participant_id JOIN exams e ON e.id=ep.exam_id
      WHERE ep.student_id=? ORDER BY coalesce(e.exam_date, er.created_at) DESC LIMIT 1`).bind(user.student_id));
    const [developing,strong] = await Promise.all([
      aggregateStudentOutcomes(env.DB, user.student_id, 0.6, 3, 'DEVELOPING', 5),
      aggregateStudentOutcomes(env.DB, user.student_id, 0.6, 3, 'STRONG', 5),
    ]);
    return json({ ok: true, latest, developing, strong });
  }
  if (user.role === 'PARENT') {
    const children = await all<any>(env.DB.prepare(`SELECT s.id, s.first_name || ' ' || s.last_name name FROM parent_student_links p JOIN student_entities s ON s.id=p.student_id WHERE p.parent_user_id=? AND p.active=1`).bind(user.id));
    return json({ ok: true, children });
  }
  const institutionId = user.institution_id!;
  const [active, guest, exams] = await Promise.all([
    one<{ c: number }>(env.DB.prepare(`SELECT count(DISTINCT se.student_id) c FROM student_enrollments se JOIN student_entities s ON s.id=se.student_id WHERE se.institution_id=? AND s.status='ACTIVE'`).bind(institutionId)),
    one<{ c: number }>(env.DB.prepare(`SELECT count(DISTINCT se.student_id) c FROM student_enrollments se JOIN student_entities s ON s.id=se.student_id WHERE se.institution_id=? AND s.status='GUEST'`).bind(institutionId)),
    one<{ c: number }>(env.DB.prepare(`SELECT count(DISTINCT ep.exam_id) c FROM exam_participants ep WHERE ep.institution_id=?`).bind(institutionId)),
  ]);
  return json({ ok: true, cards: [
    { label: 'Aktif Öğrenci', value: active?.c ?? 0 },
    ...(user.role === 'INSTITUTION_MANAGER' ? [{ label: 'Misafir Öğrenci', value: guest?.c ?? 0 }] : []),
    { label: 'Uygulanan Sınav', value: exams?.c ?? 0 },
  ] });
}

async function listInstitutions(env: Env, user: AuthUser): Promise<Response> {
  if (user.role !== 'SUPER_ADMIN') return forbidden();
  const rows = await all<any>(env.DB.prepare(`SELECT i.*,
    (SELECT count(DISTINCT e.student_id) FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id WHERE e.institution_id=i.id AND s.status='ACTIVE') active_students,
    (SELECT count(DISTINCT e.student_id) FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id WHERE e.institution_id=i.id AND s.status='GUEST') guest_students
    FROM institutions i ORDER BY i.name`));
  return json({ ok: true, institutions: rows });
}

async function setInstitutionStatus(request: Request, env: Env, user: AuthUser, institutionId: string): Promise<Response> {
  if (user.role !== 'SUPER_ADMIN') return forbidden();
  const body = await request.json<{ status?: 'ACTIVE' | 'PASSIVE'; reason?: string }>();
  if (!body.status || !['ACTIVE', 'PASSIVE'].includes(body.status)) return badRequest('Geçersiz kurum durumu.');
  const inst = await one<any>(env.DB.prepare('SELECT id,status FROM institutions WHERE id=?').bind(institutionId));
  if (!inst) return notFound('Kurum bulunamadı.');
  await env.DB.prepare('UPDATE institutions SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(body.status, institutionId).run();
  if (body.status === 'PASSIVE') await env.DB.prepare(`UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id IN (SELECT id FROM users WHERE institution_id=?) AND revoked_at IS NULL`).bind(institutionId).run();
  await audit(env.DB, user.id, institutionId, body.status === 'PASSIVE' ? 'INSTITUTION_PAUSED' : 'INSTITUTION_REACTIVATED', 'institution', institutionId, { reason: body.reason || null });
  return json({ ok: true, status: body.status });
}

async function listExams(env: Env, user: AuthUser, url: URL): Promise<Response> {
  const institutionId = user.role === 'SUPER_ADMIN' ? url.searchParams.get('institutionId') : user.institution_id;
  const params: unknown[] = [];
  let where = `e.status IN ('ACTIVE','CLOSED')`;
  if (institutionId) {
    where += ` AND (e.owner_type='CENTRAL' OR e.institution_id=? OR EXISTS(SELECT 1 FROM exam_institutions ei WHERE ei.exam_id=e.id AND ei.institution_id=? AND ei.enabled=1))`;
    params.push(institutionId, institutionId);
  }
  const rows = await all<any>(env.DB.prepare(`SELECT e.*, srv.verified scoring_verified, sr.authority,
    (SELECT group_concat(code, '/') FROM exam_booklets b WHERE b.exam_id=e.id AND b.active=1) booklet_codes,
    (SELECT count(*) FROM exam_participants ep WHERE ep.exam_id=e.id ${institutionId ? 'AND ep.institution_id=?' : ''}) participant_count
    FROM exams e LEFT JOIN scoring_rule_versions srv ON srv.id=e.scoring_rule_version_id LEFT JOIN scoring_rules sr ON sr.id=srv.rule_id
    WHERE ${where} ORDER BY coalesce(e.exam_date,'9999-12-31') DESC, e.title`).bind(...params, ...(institutionId ? [institutionId] : [])));
  return json({ ok: true, exams: rows });
}

async function previewExamFile(request: Request, env: Env, user: AuthUser, examId: string): Promise<Response> {
  if (!canEvaluateExam(user.role)) return forbidden();
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return badRequest('TXT/DAT/CSV dosyası seçin.');
  if (file.size > 12 * 1024 * 1024) return badRequest('Dosya 12 MB sınırını aşıyor.');
  const exam = await one<any>(env.DB.prepare('SELECT * FROM exams WHERE id=?').bind(examId));
  if (!exam) return notFound('Sınav bulunamadı.');
  const institutionId = resolveInstitutionId(user, form.get('institutionId')?.toString() || null);
  if (!institutionId) return badRequest('Kurum seçilmelidir.');
  if (!(await userCanAccessInstitution(env.DB, user, institutionId))) return forbidden();
  const inst = await one<{ status: string }>(env.DB.prepare('SELECT status FROM institutions WHERE id=?').bind(institutionId));
  if (!inst) return notFound('Kurum bulunamadı.');
  if (inst.status === 'PASSIVE') return badRequest('Pasif kurumda sınav değerlendirilemez.', 'INSTITUTION_PASSIVE');
  const season = await ensureSeason(env.DB, institutionId, exam.academic_year);
  const text = await file.text();
  const templates = await all<ParserTemplate>(env.DB.prepare(`SELECT v.id, t.name, v.parser_definition FROM optical_template_versions v JOIN optical_templates t ON t.id=v.template_id WHERE v.active=1 AND t.active=1`));
  const manualTemplateId = form.get('templateVersionId')?.toString();
  let parsed;
  if (manualTemplateId) {
    const template = templates.find((x) => x.id === manualTemplateId);
    if (!template) return badRequest('Seçilen optik şablon bulunamadı.');
    parsed = parseWithTemplate(text, file.name, template);
  } else parsed = parseUploadedText(text, file.name, templates);
  if (parsed.records.length === 0) return badRequest(parsed.issues[0] || 'Dosya okunamadı.', parsed.ambiguous ? 'OPTICAL_TEMPLATE_AMBIGUOUS' : 'OPTICAL_TEMPLATE_REQUIRED', { templates: parsed.ambiguous ? templates.map((t) => ({ id: t.id, name: t.name })) : undefined, issues: parsed.issues });

  const candidates = await loadStudentCandidates(env.DB, institutionId, season.id);
  const batchId = uuid('batch');
  const batchStatus = parsed.records.some((r) => r.issues.length) ? 'NEEDS_REVIEW' : 'PREVIEW';
  await env.DB.prepare(`INSERT INTO scan_batches (id,exam_id,institution_id,season_id,source_type,optical_template_version_id,detection_confidence,status,created_by) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(batchId, examId, institutionId, season.id, parsed.records[0]?.source_type || 'TXT', parsed.templateId || null, parsed.confidence, batchStatus, user.id).run();

  const counts = { active: 0, guest: 0, newGuest: 0, ambiguous: 0, invalid: 0 };
  for (const record of parsed.records) {
    const match = matchParticipant(record, candidates);
    if (match.status === 'ACTIVE_MATCH') counts.active++;
    if (match.status === 'GUEST_MATCH') counts.guest++;
    if (match.status === 'NEW_GUEST') counts.newGuest++;
    if (match.status === 'AMBIGUOUS') counts.ambiguous++;
    if (match.status === 'INVALID') counts.invalid++;
    await env.DB.prepare(`INSERT INTO scan_records (id,batch_id,row_no,canonical_json,matched_student_id,match_status,match_confidence,issues_json) VALUES(?,?,?,?,?,?,?,?)`)
      .bind(uuid('scan'), batchId, record.row_no, JSON.stringify(record), match.student_id || null, match.status, match.confidence, JSON.stringify([...record.issues, ...match.issues])).run();
  }
  const finalStatus = counts.ambiguous || counts.invalid ? 'NEEDS_REVIEW' : 'READY';
  await env.DB.prepare('UPDATE scan_batches SET status=? WHERE id=?').bind(finalStatus, batchId).run();
  await audit(env.DB, user.id, institutionId, 'EXAM_FILE_PREVIEWED', 'scan_batch', batchId, { examId, rows: parsed.records.length, counts, template: parsed.templateName });
  return json({ ok: true, batchId, detection: { templateId: parsed.templateId, templateName: parsed.templateName, confidence: parsed.confidence }, counts, total: parsed.records.length, status: finalStatus });
}

async function getScanBatch(env: Env, user: AuthUser, batchId: string): Promise<Response> {
  if (!canEvaluateExam(user.role)) return forbidden();
  const batch = await one<any>(env.DB.prepare('SELECT * FROM scan_batches WHERE id=?').bind(batchId));
  if (!batch) return notFound();
  if (!(await userCanAccessInstitution(env.DB, user, batch.institution_id))) return forbidden();
  const records = await all<any>(env.DB.prepare(`SELECT r.*, s.first_name || ' ' || s.last_name matched_name FROM scan_records r LEFT JOIN student_entities s ON s.id=r.matched_student_id WHERE batch_id=? ORDER BY row_no`).bind(batchId));
  return json({ ok: true, batch, records: records.map((r) => ({ ...r, canonical: JSON.parse(r.canonical_json), issues: r.issues_json ? JSON.parse(r.issues_json) : [] })) });
}

async function resolveScanRecord(request: Request, env: Env, user: AuthUser, batchId: string, recordId: string): Promise<Response> {
  if (!canEvaluateExam(user.role)) return forbidden();
  const batch = await one<any>(env.DB.prepare('SELECT * FROM scan_batches WHERE id=?').bind(batchId));
  if (!batch) return notFound();
  if (!(await userCanAccessInstitution(env.DB, user, batch.institution_id))) return forbidden();
  const body = await request.json<{ studentId?: string; asNewGuest?: boolean }>();
  if (body.studentId) {
    const candidate = await one<any>(env.DB.prepare(`SELECT s.id,s.status FROM student_entities s JOIN student_enrollments e ON e.student_id=s.id WHERE s.id=? AND e.institution_id=? AND e.season_id=?`).bind(body.studentId, batch.institution_id, batch.season_id));
    if (!candidate) return badRequest('Seçilen öğrenci bu kurum/sezonda bulunamadı.');
    await env.DB.prepare(`UPDATE scan_records SET matched_student_id=?, match_status=?, match_confidence=1, issues_json='[]' WHERE id=? AND batch_id=?`)
      .bind(candidate.id, candidate.status === 'ACTIVE' ? 'ACTIVE_MATCH' : 'GUEST_MATCH', recordId, batchId).run();
  } else if (body.asNewGuest) {
    await env.DB.prepare(`UPDATE scan_records SET matched_student_id=NULL, match_status='NEW_GUEST', match_confidence=1, issues_json='[]' WHERE id=? AND batch_id=?`).bind(recordId, batchId).run();
  } else return badRequest('Eşleştirme seçimi eksik.');
  const problem = await one<{ c: number }>(env.DB.prepare(`SELECT count(*) c FROM scan_records WHERE batch_id=? AND match_status IN ('AMBIGUOUS','INVALID')`).bind(batchId));
  await env.DB.prepare('UPDATE scan_batches SET status=? WHERE id=?').bind((problem?.c ?? 0) ? 'NEEDS_REVIEW' : 'READY', batchId).run();
  return json({ ok: true });
}

async function evaluateBatch(env: Env, user: AuthUser, batchId: string): Promise<Response> {
  if (!canEvaluateExam(user.role)) return forbidden();
  const batch = await one<any>(env.DB.prepare('SELECT * FROM scan_batches WHERE id=?').bind(batchId));
  if (!batch) return notFound();
  if (!(await userCanAccessInstitution(env.DB, user, batch.institution_id))) return forbidden();
  if (!['READY','COMMITTED'].includes(batch.status)) return badRequest('Önce sorunlu kayıtları düzeltin.', 'BATCH_NEEDS_REVIEW');
  const exam = await one<any>(env.DB.prepare(`SELECT e.*, srv.verified, srv.id scoring_version_id, srv.config_json, sr.authority FROM exams e LEFT JOIN scoring_rule_versions srv ON srv.id=e.scoring_rule_version_id LEFT JOIN scoring_rules sr ON sr.id=srv.rule_id WHERE e.id=?`).bind(batch.exam_id));
  if (!exam) return notFound('Sınav bulunamadı.');
  if (!exam.scoring_version_id) return badRequest('Sınavın puanlama kuralı tanımlı değil.', 'SCORING_RULE_REQUIRED');
  assertScoringRuleVerified({ verified: exam.verified, authority: exam.authority });
  const subjects = await all<any>(env.DB.prepare(`SELECT es.subject_id, s.code, s.name, es.question_count, es.wrong_divisor FROM exam_subjects es JOIN subjects s ON s.id=es.subject_id WHERE es.exam_id=? ORDER BY es.sort_order`).bind(exam.id));
  const booklets = await all<{ code: string }>(env.DB.prepare('SELECT code FROM exam_booklets WHERE exam_id=? AND active=1').bind(exam.id));
  const keyRows = await all<any>(env.DB.prepare(`SELECT q.id question_id,q.subject_id,q.question_no,s.code subject_code,ak.booklet_code,ak.correct_answer,
    group_concat(qo.outcome_id) outcome_ids
    FROM exam_questions q JOIN subjects s ON s.id=q.subject_id JOIN answer_keys ak ON ak.exam_question_id=q.id
    LEFT JOIN question_outcomes qo ON qo.exam_question_id=q.id WHERE q.exam_id=?
    GROUP BY q.id,ak.booklet_code ORDER BY q.subject_id,q.question_no`).bind(exam.id));
  const records = await all<any>(env.DB.prepare(`SELECT * FROM scan_records WHERE batch_id=? ORDER BY row_no`).bind(batchId));
  let processed = 0;
  for (const row of records) {
    const record = JSON.parse(row.canonical_json) as CanonicalRecord;
    let studentId = row.matched_student_id as string | null;
    let studentStatus = row.match_status === 'ACTIVE_MATCH' ? 'ACTIVE' : 'GUEST';
    if (row.match_status === 'NEW_GUEST') {
      const names = splitName(record.name);
      studentId = uuid('stu');
      await env.DB.prepare(`INSERT INTO student_entities (id,first_name,last_name,normalized_name,status) VALUES(?,?,?,?, 'GUEST')`).bind(studentId, names.firstName, names.lastName, normalizeName(record.name)).run();
      const classRow = record.grade_level ? await one<any>(env.DB.prepare(`SELECT id FROM classes WHERE season_id=? AND grade_level=? AND (? IS NULL OR upper(section)=upper(?)) LIMIT 1`).bind(batch.season_id, record.grade_level, record.section || null, record.section || null)) : null;
      await env.DB.prepare(`INSERT INTO student_enrollments (id,student_id,institution_id,season_id,class_id,student_number,grade_level,section) VALUES(?,?,?,?,?,?,?,?)`)
        .bind(uuid('enr'), studentId, batch.institution_id, batch.season_id, classRow?.id || null, record.student_number || null, record.grade_level || null, record.section || null).run();
      await env.DB.prepare(`INSERT INTO guest_profiles (student_id,first_seen_exam_id,last_seen_at) VALUES(?,?,CURRENT_TIMESTAMP)`).bind(studentId, exam.id).run();
      await env.DB.prepare(`UPDATE scan_records SET matched_student_id=?, match_status='GUEST_MATCH' WHERE id=?`).bind(studentId, row.id).run();
    } else if (studentId && studentStatus === 'GUEST') {
      await env.DB.prepare('UPDATE guest_profiles SET last_seen_at=CURRENT_TIMESTAMP WHERE student_id=?').bind(studentId).run();
    }
    if (!studentId) throw new Error('UNRESOLVED_PARTICIPANT');
    const booklet = (record.booklet || '').toUpperCase() || (booklets.length === 1 ? booklets[0].code : '');
    if (!booklet || !booklets.some((b) => b.code === booklet)) throw new Error(`BOOKLET_REQUIRED_ROW_${row.row_no}`);
    const existing = await one<{ id: string }>(env.DB.prepare('SELECT id FROM exam_participants WHERE exam_id=? AND institution_id=? AND student_id=?').bind(exam.id, batch.institution_id, studentId));
    let participantId = existing?.id || uuid('part');
    if (existing) {
      await env.DB.prepare('DELETE FROM student_answers WHERE participant_id=?').bind(participantId).run();
      await env.DB.prepare('DELETE FROM subject_results WHERE participant_id=?').bind(participantId).run();
      await env.DB.prepare('DELETE FROM exam_results WHERE participant_id=?').bind(participantId).run();
      await env.DB.prepare(`UPDATE exam_participants SET scan_record_id=?,student_number_snapshot=?,name_snapshot=?,class_snapshot=?,booklet_code=?,participant_status=? WHERE id=?`)
        .bind(row.id, record.student_number || null, record.name, record.class_name || null, booklet, studentStatus, participantId).run();
    } else {
      await env.DB.prepare(`INSERT INTO exam_participants (id,exam_id,institution_id,season_id,student_id,scan_record_id,student_number_snapshot,name_snapshot,class_snapshot,booklet_code,participant_status)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(participantId, exam.id, batch.institution_id, batch.season_id, studentId, row.id, record.student_number || null, record.name, record.class_name || null, booklet, studentStatus).run();
    }
    await env.DB.prepare('DELETE FROM outcome_results WHERE student_id=? AND exam_id=?').bind(studentId, exam.id).run();
    const subjectScores = [];
    const outcomeAccumulator = new Map<string, { evidence: number; correct: number }>();
    for (const subject of subjects) {
      const answerString = record.answers_by_subject[subject.code] || '';
      const subjectKeys = keyRows.filter((k) => k.subject_id === subject.subject_id && k.booklet_code === booklet).sort((a,b)=>a.question_no-b.question_no);
      let correct = 0, wrong = 0, blank = 0;
      for (let i = 0; i < subject.question_count; i++) {
        const key = subjectKeys[i];
        const answer = (answerString[i] || '').toUpperCase();
        const status = !answer ? 'BLANK' : key && answer === key.correct_answer ? 'CORRECT' : 'WRONG';
        if (status === 'CORRECT') correct++; else if (status === 'WRONG') wrong++; else blank++;
        if (key) {
          await env.DB.prepare(`INSERT INTO student_answers (id,participant_id,exam_question_id,answer,status,confidence) VALUES(?,?,?,?,?,?)`)
            .bind(uuid('ans'), participantId, key.question_id, answer || null, status, record.confidence).run();
          const outcomeIds = key.outcome_ids ? String(key.outcome_ids).split(',').filter(Boolean) : [];
          for (const outcomeId of outcomeIds) {
            const acc = outcomeAccumulator.get(outcomeId) || { evidence: 0, correct: 0 };
            acc.evidence += 1;
            if (status === 'CORRECT') acc.correct += 1;
            outcomeAccumulator.set(outcomeId, acc);
          }
        }
      }
      const score = calculateSubjectScore({ correct, wrong, blank, wrongDivisor: subject.wrong_divisor, questionCount: subject.question_count });
      subjectScores.push(score);
      await env.DB.prepare(`INSERT INTO subject_results (id,participant_id,subject_id,correct_count,wrong_count,blank_count,net,success_percent) VALUES(?,?,?,?,?,?,?,?)`)
        .bind(uuid('sr'), participantId, subject.subject_id, correct, wrong, blank, score.net, score.successPercent).run();
    }
    const overall = calculateOverall(subjectScores);
    await env.DB.prepare(`INSERT INTO exam_results (id,participant_id,scoring_rule_version_id,correct_count,wrong_count,blank_count,net,score,success_percent) VALUES(?,?,?,?,?,?,?,?,?)`)
      .bind(uuid('er'), participantId, exam.scoring_version_id, overall.correct, overall.wrong, overall.blank, overall.net, null, overall.successPercent).run();
    for (const [outcomeId, acc] of outcomeAccumulator) {
      const rate = acc.evidence ? acc.correct / acc.evidence : 0;
      await env.DB.prepare(`INSERT INTO outcome_results (id,student_id,exam_id,outcome_id,evidence_count,correct_count,success_rate,mastery_status) VALUES(?,?,?,?,?,?,?,?)`)
        .bind(uuid('or'), studentId, exam.id, outcomeId, acc.evidence, acc.correct, rate, masteryStatus(acc.correct, acc.evidence)).run();
    }
    processed++;
  }
  await env.DB.prepare(`UPDATE exam_results SET institution_rank=(SELECT rn FROM (
    SELECT er2.id, row_number() OVER (ORDER BY er2.net DESC, er2.correct_count DESC) rn FROM exam_results er2
    JOIN exam_participants ep2 ON ep2.id=er2.participant_id WHERE ep2.exam_id=? AND ep2.institution_id=?
    ) ranked WHERE ranked.id=exam_results.id)
    WHERE participant_id IN (SELECT id FROM exam_participants WHERE exam_id=? AND institution_id=?)`).bind(exam.id, batch.institution_id, exam.id, batch.institution_id).run();
  await env.DB.prepare(`UPDATE scan_batches SET status='COMMITTED' WHERE id=?`).bind(batchId).run();
  await audit(env.DB, user.id, batch.institution_id, 'EXAM_EVALUATED', 'scan_batch', batchId, { examId: exam.id, processed });
  return json({ ok: true, processed, batchId, examId: exam.id });
}

async function listStudents(env: Env, user: AuthUser, url: URL): Promise<Response> {
  if (!['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role)) return forbidden();
  const institutionId = user.role === 'SUPER_ADMIN' ? url.searchParams.get('institutionId') : user.institution_id;
  if (!institutionId) return badRequest('Kurum seçilmelidir.');
  if (!(await userCanAccessInstitution(env.DB, user, institutionId))) return forbidden();
  const requestedStatus = url.searchParams.get('status');
  const status = (user.role === 'TEACHER' || user.role === 'GUIDANCE_TEACHER') ? 'ACTIVE' : requestedStatus;
  const seasonId = url.searchParams.get('seasonId') || (await currentSeason(env.DB, institutionId))?.id;
  const params: unknown[] = [institutionId];
  let filter = '';
  if (seasonId) { filter += ' AND e.season_id=?'; params.push(seasonId); }
  if (status && ['ACTIVE','GUEST'].includes(status)) { filter += ' AND s.status=?'; params.push(status); }
  let classRestriction = '';
  if (user.role === 'TEACHER' || user.role === 'GUIDANCE_TEACHER') {
    const scope = await loadPermissionScope(env.DB, user, seasonId);
    const allowedClasses = [...new Set([...scope.classIds, ...scope.guidanceClassIds])];
    if (!allowedClasses.length) return json({ ok: true, students: [] });
    classRestriction = ` AND e.class_id IN (${allowedClasses.map(()=>'?').join(',')})`;
    params.push(...allowedClasses);
  }
  const rows = await all<any>(env.DB.prepare(`SELECT s.id,s.first_name,s.last_name,s.status,e.student_number,e.grade_level,e.section,e.class_id,
    (SELECT count(*) FROM exam_participants ep WHERE ep.student_id=s.id) exam_count,
    (SELECT max(ex.created_at) FROM exam_participants ex WHERE ex.student_id=s.id) last_exam_at
    FROM student_entities s JOIN student_enrollments e ON e.student_id=s.id WHERE e.institution_id=? ${filter} ${classRestriction}
    ORDER BY e.grade_level,e.section,cast(e.student_number as integer),s.normalized_name`).bind(...params));
  return json({ ok: true, students: rows });
}

async function activateGuest(request: Request, env: Env, user: AuthUser, studentId: string): Promise<Response> {
  if (user.role !== 'SUPER_ADMIN') return forbidden('Misafir öğrenci aktivasyonu Super Admin onayı gerektirir.');
  const body = await request.json<{ paymentConfirmed?: boolean; note?: string }>();
  if (!body.paymentConfirmed) return badRequest('Ödeme/onay tamamlanmadan öğrenci aktifleştirilemez.', 'PAYMENT_CONFIRMATION_REQUIRED');
  const row = await one<any>(env.DB.prepare(`SELECT s.status,e.institution_id,e.season_id FROM student_entities s JOIN student_enrollments e ON e.student_id=s.id WHERE s.id=? ORDER BY e.created_at DESC LIMIT 1`).bind(studentId));
  if (!row) return notFound('Öğrenci bulunamadı.');
  if (row.status !== 'GUEST') return badRequest('Öğrenci zaten aktif veya arşivlenmiş.');
  const license = await one<any>(env.DB.prepare(`SELECT * FROM institution_license_state WHERE institution_id=? AND season_id=?`).bind(row.institution_id, row.season_id));
  if (license && license.licensed_student_limit > 0 && license.licensed_student_count >= license.licensed_student_limit) return badRequest('Kurumun lisanslı öğrenci limiti dolu.', 'LICENSE_LIMIT_REACHED');
  await env.DB.prepare(`UPDATE student_entities SET status='ACTIVE', activated_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(studentId).run();
  await env.DB.prepare(`UPDATE guest_profiles SET converted_by=?, converted_at=CURRENT_TIMESTAMP WHERE student_id=?`).bind(user.id, studentId).run();
  if (license) await env.DB.prepare(`UPDATE institution_license_state SET licensed_student_count=licensed_student_count+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(license.id).run();
  const history = await one<{ c: number }>(env.DB.prepare('SELECT count(*) c FROM exam_participants WHERE student_id=?').bind(studentId));
  await audit(env.DB, user.id, row.institution_id, 'GUEST_ACTIVATED', 'student', studentId, { priorExamCount: history?.c ?? 0, note: body.note || null });
  return json({ ok: true, studentId, priorExamCount: history?.c ?? 0 });
}

async function studentResults(env: Env, user: AuthUser, studentId: string): Promise<Response> {
  const access = await canAccessStudent(env.DB, user, studentId);
  if (!access.allowed) return forbidden();
  const rows = await all<any>(env.DB.prepare(`SELECT e.id exam_id,e.title,e.exam_date,er.correct_count,er.wrong_count,er.blank_count,er.net,er.score,er.success_percent,er.institution_rank,
    ep.booklet_code FROM exam_participants ep JOIN exams e ON e.id=ep.exam_id JOIN exam_results er ON er.participant_id=ep.id
    WHERE ep.student_id=? ORDER BY coalesce(e.exam_date,er.created_at) DESC`).bind(studentId));
  if (user.role === 'TEACHER' && access.classId) {
    const scope = await loadPermissionScope(env.DB, user, access.seasonId);
    if (scope.guidanceClassIds.includes(access.classId)) return json({ ok: true, exams: rows });
    const subjectRows = await all<any>(env.DB.prepare(`SELECT ep.exam_id,sr.*,s.name subject_name,s.code subject_code FROM exam_participants ep JOIN subject_results sr ON sr.participant_id=ep.id JOIN subjects s ON s.id=sr.subject_id WHERE ep.student_id=?`).bind(studentId));
    const filtered = subjectRows.filter((r) => canAccessSubjectForClass(scope, access.classId!, r.subject_id));
    return json({ ok: true, exams: rows.map(({ net, score, correct_count, wrong_count, blank_count, ...rest }) => rest), subjectResults: filtered, restrictedToSubjects: true });
  }
  return json({ ok: true, exams: rows });
}

async function studentOutcomes(env: Env, user: AuthUser, studentId: string, url: URL): Promise<Response> {
  const access = await canAccessStudent(env.DB, user, studentId);
  if (!access.allowed) return forbidden();
  const threshold = Number(url.searchParams.get('threshold') || 0.6);
  const minEvidence = Number(url.searchParams.get('minEvidence') || 3);
  let subjectFilter: string[] | null = null;
  if (user.role === 'TEACHER' && access.classId) {
    const scope = await loadPermissionScope(env.DB, user, access.seasonId);
    subjectFilter = scope.guidanceClassIds.includes(access.classId)
      ? null
      : scope.subjectClassAssignments.filter((assignment) => assignment.classId === access.classId).map((assignment) => assignment.subjectId);
  }
  const rows = await aggregateStudentOutcomes(env.DB, studentId, threshold, minEvidence, undefined, 200, subjectFilter);
  return json({ ok: true, outcomes: rows, threshold, minEvidence });
}

async function myResults(env: Env, user: AuthUser, url: URL): Promise<Response> {
  let studentId = user.student_id;
  if (user.role === 'PARENT') studentId = url.searchParams.get('studentId');
  if (!studentId) return badRequest('Öğrenci seçilmelidir.');
  return studentResults(env, user, studentId);
}

async function myOutcomes(env: Env, user: AuthUser, url: URL): Promise<Response> {
  let studentId = user.student_id;
  if (user.role === 'PARENT') studentId = url.searchParams.get('studentId');
  if (!studentId) return badRequest('Öğrenci seçilmelidir.');
  return studentOutcomes(env, user, studentId, url);
}

async function listClasses(env: Env, user: AuthUser, url: URL): Promise<Response> {
  const institutionId = user.role === 'SUPER_ADMIN' ? url.searchParams.get('institutionId') : user.institution_id;
  if (!institutionId) return badRequest('Kurum seçilmelidir.');
  if (!(await userCanAccessInstitution(env.DB, user, institutionId))) return forbidden();
  const seasonId = url.searchParams.get('seasonId') || (await currentSeason(env.DB, institutionId))?.id;
  if (!seasonId) return json({ ok: true, classes: [] });
  let rows = await all<any>(env.DB.prepare(`SELECT c.*,(SELECT count(*) FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id WHERE e.class_id=c.id AND s.status='ACTIVE') student_count FROM classes c WHERE c.season_id=? AND c.active=1 ORDER BY c.grade_level,c.section`).bind(seasonId));
  if (user.role === 'TEACHER' || user.role === 'GUIDANCE_TEACHER') {
    const scope = await loadPermissionScope(env.DB, user, seasonId);
    const allowed = new Set([...scope.classIds, ...scope.guidanceClassIds]);
    rows = rows.filter((r) => allowed.has(r.id));
  }
  return json({ ok: true, classes: rows });
}

async function teacherInsights(env: Env, user: AuthUser, url: URL): Promise<Response> {
  if (!['TEACHER','GUIDANCE_TEACHER','INSTITUTION_MANAGER','SUPER_ADMIN'].includes(user.role)) return forbidden();
  const institutionId = user.role === 'SUPER_ADMIN' ? url.searchParams.get('institutionId') : user.institution_id;
  if (!institutionId) return badRequest('Kurum seçilmelidir.');
  const seasonId = url.searchParams.get('seasonId') || (await currentSeason(env.DB, institutionId))?.id;
  if (!seasonId) return json({ ok: true, outcomes: [] });
  const scope = await loadPermissionScope(env.DB, user, seasonId);
  const base = await all<any>(env.DB.prepare(`SELECT o.id,o.title,o.topic,o.subject_id,s.name subject_name,
    sum(orx.evidence_count) evidence,sum(orx.correct_count) correct,
    case when sum(orx.evidence_count)>0 then 1.0*sum(orx.correct_count)/sum(orx.evidence_count) else 0 end success_rate,
    e.class_id
    FROM outcome_results orx JOIN outcomes o ON o.id=orx.outcome_id JOIN subjects s ON s.id=o.subject_id
    JOIN student_enrollments e ON e.student_id=orx.student_id AND e.season_id=?
    WHERE e.institution_id=? GROUP BY o.id,e.class_id ORDER BY success_rate ASC`).bind(seasonId, institutionId));
  const filtered = base.filter((r) => {
    if (user.role === 'SUPER_ADMIN' || user.role === 'INSTITUTION_MANAGER') return true;
    return canAccessSubjectForClass(scope, r.class_id, r.subject_id);
  });
  return json({ ok: true, outcomes: filtered.slice(0, 50) });
}

async function listOpticalTemplates(env: Env, user: AuthUser): Promise<Response> {
  if (!['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role)) return forbidden();
  const rows = await all<any>(env.DB.prepare(`SELECT t.id template_id,t.name,t.vendor,t.status,v.id version_id,v.version,v.page_width_mm,v.page_height_mm,
    v.parser_definition IS NOT NULL has_parser,v.camera_geometry IS NOT NULL has_camera,v.print_fields IS NOT NULL has_print
    FROM optical_templates t LEFT JOIN optical_template_versions v ON v.template_id=t.id AND v.active=1 WHERE t.active=1 ORDER BY t.name`));
  return json({ ok: true, templates: rows });
}

async function listPrinterProfiles(env: Env, user: AuthUser, url: URL): Promise<Response> {
  if (!roleCanManageInstitution(user.role)) return forbidden();
  const institutionId = user.role === 'SUPER_ADMIN' ? url.searchParams.get('institutionId') : user.institution_id;
  if (!institutionId) return badRequest('Kurum seçilmelidir.');
  if (!(await userCanAccessInstitution(env.DB, user, institutionId))) return forbidden();
  const rows = await all<any>(env.DB.prepare(`SELECT p.*,(SELECT count(*) FROM printer_optical_calibrations c WHERE c.printer_profile_id=p.id AND c.status='READY') ready_count FROM printer_profiles p WHERE p.institution_id=? AND p.active=1 ORDER BY p.name`).bind(institutionId));
  return json({ ok: true, profiles: rows });
}

async function createPrinterProfile(request: Request, env: Env, user: AuthUser): Promise<Response> {
  if (!roleCanManageInstitution(user.role)) return forbidden();
  const body = await request.json<{ institutionId?: string; name?: string; physicalPrinterHint?: string }>();
  const institutionId = resolveInstitutionId(user, body.institutionId || null);
  if (!institutionId || !body.name?.trim()) return badRequest('Yazıcı profil adı ve kurum gerekli.');
  if (!(await userCanAccessInstitution(env.DB, user, institutionId))) return forbidden();
  const id = uuid('printer');
  await env.DB.prepare(`INSERT INTO printer_profiles (id,institution_id,name,physical_printer_hint) VALUES(?,?,?,?)`).bind(id, institutionId, body.name.trim(), body.physicalPrinterHint || null).run();
  await audit(env.DB, user.id, institutionId, 'PRINTER_PROFILE_CREATED', 'printer_profile', id, { name: body.name });
  return json({ ok: true, id });
}

async function listCalibrations(env: Env, user: AuthUser, url: URL): Promise<Response> {
  if (!roleCanManageInstitution(user.role)) return forbidden();
  const institutionId = user.role === 'SUPER_ADMIN' ? url.searchParams.get('institutionId') : user.institution_id;
  if (!institutionId || !(await userCanAccessInstitution(env.DB, user, institutionId))) return forbidden();
  const rows = await all<any>(env.DB.prepare(`SELECT c.*,p.name printer_name,t.name template_name,v.version template_version
    FROM printer_optical_calibrations c JOIN printer_profiles p ON p.id=c.printer_profile_id
    JOIN optical_template_versions v ON v.id=c.optical_template_version_id JOIN optical_templates t ON t.id=v.template_id
    WHERE p.institution_id=? ORDER BY p.name,t.name`).bind(institutionId));
  return json({ ok: true, calibrations: rows });
}

async function startCalibration(request: Request, env: Env, user: AuthUser): Promise<Response> {
  if (!roleCanManageInstitution(user.role)) return forbidden();
  const body = await request.json<{ printerProfileId?: string; templateVersionId?: string }>();
  if (!body.printerProfileId || !body.templateVersionId) return badRequest('Yazıcı ve optik seçilmelidir.');
  const printer = await one<any>(env.DB.prepare('SELECT * FROM printer_profiles WHERE id=?').bind(body.printerProfileId));
  if (!printer || !(await userCanAccessInstitution(env.DB, user, printer.institution_id))) return forbidden();
  const template = await one<any>(env.DB.prepare(`SELECT v.*,t.name template_name FROM optical_template_versions v JOIN optical_templates t ON t.id=v.template_id WHERE v.id=?`).bind(body.templateVersionId));
  if (!template) return notFound('Optik şablon bulunamadı.');
  let calibration = await one<any>(env.DB.prepare('SELECT * FROM printer_optical_calibrations WHERE printer_profile_id=? AND optical_template_version_id=?').bind(printer.id, template.id));
  if (!calibration) {
    const id = uuid('cal');
    await env.DB.prepare(`INSERT INTO printer_optical_calibrations (id,printer_profile_id,optical_template_version_id,status) VALUES(?,?,?,'AUTO_CALIBRATING')`).bind(id, printer.id, template.id).run();
    calibration = await one<any>(env.DB.prepare('SELECT * FROM printer_optical_calibrations WHERE id=?').bind(id));
  } else {
    await env.DB.prepare(`UPDATE printer_optical_calibrations SET status='AUTO_CALIBRATING',attempt_count=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(calibration.id).run();
    calibration.status = 'AUTO_CALIBRATING'; calibration.attempt_count = 0;
  }
  return json({ ok: true, calibration, template: { name: template.template_name, pageWidthMm: template.page_width_mm, pageHeightMm: template.page_height_mm } });
}

async function saveCalibrationAttempt(request: Request, env: Env, user: AuthUser, calibrationId: string): Promise<Response> {
  if (!roleCanManageInstitution(user.role)) return forbidden();
  const cal = await one<any>(env.DB.prepare(`SELECT c.*,p.institution_id FROM printer_optical_calibrations c JOIN printer_profiles p ON p.id=c.printer_profile_id WHERE c.id=?`).bind(calibrationId));
  if (!cal || !(await userCanAccessInstitution(env.DB, user, cal.institution_id))) return forbidden();
  const form = await request.formData();
  const image = form.get('image');
  const metricsRaw = form.get('metrics')?.toString();
  const mode = form.get('mode')?.toString() === 'MANUAL_VERIFY' ? 'MANUAL_VERIFY' : 'AUTO';
  if (!(image instanceof File) || !metricsRaw) return badRequest('Kalibrasyon görseli ve analiz ölçümleri gerekli.');
  let metrics: CalibrationMetrics;
  try { metrics = JSON.parse(metricsRaw); } catch { return badRequest('Kalibrasyon ölçümleri okunamadı.'); }
  if (![metrics.offset_x_mm,metrics.offset_y_mm,metrics.scale_x,metrics.scale_y,metrics.rotation_deg,metrics.confidence].every(Number.isFinite)) return badRequest('Geçersiz kalibrasyon ölçümleri.');
  const attemptNo = Number(cal.attempt_count || 0) + 1;
  const imageKey = `calibration/${cal.institution_id}/${calibrationId}/${Date.now()}-${safeFileName(image.name || 'scan.jpg')}`;
  await env.FILES.put(imageKey, image.stream(), { httpMetadata: { contentType: image.type || 'image/jpeg' } });
  const within = calibrationWithinTolerance(metrics);
  let status = nextCalibrationStatus(attemptNo, within);
  if (mode === 'MANUAL_VERIFY' && !within) status = 'MANUAL_REQUIRED';
  await env.DB.prepare(`INSERT INTO calibration_attempts (id,calibration_id,attempt_no,mode,image_key,offset_x_mm,offset_y_mm,scale_x,scale_y,rotation_deg,confidence,within_tolerance)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(uuid('catt'), calibrationId, attemptNo, mode, imageKey, metrics.offset_x_mm, metrics.offset_y_mm, metrics.scale_x, metrics.scale_y, metrics.rotation_deg, metrics.confidence, within ? 1 : 0).run();
  await env.DB.prepare(`UPDATE printer_optical_calibrations SET status=?,offset_x_mm=?,offset_y_mm=?,scale_x=?,scale_y=?,rotation_deg=?,attempt_count=?,verified_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(status, metrics.offset_x_mm, metrics.offset_y_mm, metrics.scale_x, metrics.scale_y, metrics.rotation_deg, attemptNo, within ? new Date().toISOString() : null, calibrationId).run();
  await audit(env.DB, user.id, cal.institution_id, within ? 'CALIBRATION_VERIFIED' : 'CALIBRATION_ATTEMPT', 'calibration', calibrationId, { attemptNo, mode, metrics, status });
  return json({ ok: true, attemptNo, status, withinTolerance: within, metrics });
}

async function opticalPrepare(env: Env, user: AuthUser, url: URL): Promise<Response> {
  if (!roleCanManageInstitution(user.role)) return forbidden();
  const classId = url.searchParams.get('classId');
  const templateVersionId = url.searchParams.get('templateVersionId');
  const sort = url.searchParams.get('sort') === 'name' ? 'name' : 'number';
  if (!classId || !templateVersionId) return badRequest('Sınıf ve optik şablon seçilmelidir.');
  const c = await one<any>(env.DB.prepare('SELECT * FROM classes WHERE id=?').bind(classId));
  if (!c || !(await userCanAccessInstitution(env.DB, user, c.institution_id))) return forbidden();
  const template = await one<any>(env.DB.prepare(`SELECT v.*,t.name FROM optical_template_versions v JOIN optical_templates t ON t.id=v.template_id WHERE v.id=?`).bind(templateVersionId));
  if (!template) return notFound('Optik şablon bulunamadı.');
  if (!template.print_fields) return badRequest('Bu optik için baskı koordinatları henüz tanımlanmamış.', 'TEMPLATE_DEFINITION_REQUIRED');
  const rows = await all<any>(env.DB.prepare(`SELECT s.id,s.first_name,s.last_name,e.student_number,e.grade_level,e.section FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id WHERE e.class_id=? AND s.status='ACTIVE' ORDER BY ${sort === 'name' ? 's.normalized_name' : `cast(e.student_number as integer),e.student_number`}`).bind(classId));
  return json({ ok: true, template: { id: template.id, name: template.name, pageWidthMm: template.page_width_mm, pageHeightMm: template.page_height_mm, printFields: JSON.parse(template.print_fields) }, class: c, students: rows });
}

async function rolloverPreview(request: Request, env: Env, user: AuthUser): Promise<Response> {
  if (!roleCanManageInstitution(user.role)) return forbidden();
  const body = await request.json<{ institutionId?: string; fromSeasonId?: string; nextAcademicYear?: string }>();
  const institutionId = resolveInstitutionId(user, body.institutionId || null);
  if (!institutionId || !body.fromSeasonId || !body.nextAcademicYear) return badRequest('Kurum, mevcut sezon ve yeni akademik yıl gerekli.');
  if (!(await userCanAccessInstitution(env.DB, user, institutionId))) return forbidden();
  const rows = await all<any>(env.DB.prepare(`SELECT e.grade_level,count(*) count FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id WHERE e.institution_id=? AND e.season_id=? AND s.status='ACTIVE' AND e.status='ACTIVE' GROUP BY e.grade_level ORDER BY e.grade_level`).bind(institutionId, body.fromSeasonId));
  return json({ ok: true, nextAcademicYear: body.nextAcademicYear, groups: rows.map((r) => ({ from: r.grade_level, to: nextGrade(r.grade_level), count: r.count })) });
}

async function rolloverCommit(request: Request, env: Env, user: AuthUser): Promise<Response> {
  if (!roleCanManageInstitution(user.role)) return forbidden();
  const body = await request.json<{ institutionId?: string; fromSeasonId?: string; nextAcademicYear?: string; keepSections?: boolean }>();
  const institutionId = resolveInstitutionId(user, body.institutionId || null);
  if (!institutionId || !body.fromSeasonId || !body.nextAcademicYear) return badRequest('Eksik sezon bilgisi.');
  if (!(await userCanAccessInstitution(env.DB, user, institutionId))) return forbidden();
  let season = await one<any>(env.DB.prepare('SELECT * FROM institution_seasons WHERE institution_id=? AND academic_year=?').bind(institutionId, body.nextAcademicYear));
  if (!season) {
    const id = uuid('season');
    await env.DB.prepare(`INSERT INTO institution_seasons (id,institution_id,academic_year,status,started_at) VALUES(?,?,?,'ACTIVE',date('now'))`).bind(id, institutionId, body.nextAcademicYear).run();
    season = await one<any>(env.DB.prepare('SELECT * FROM institution_seasons WHERE id=?').bind(id));
  }
  const old = await all<any>(env.DB.prepare(`SELECT e.*,s.status student_status FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id WHERE e.institution_id=? AND e.season_id=? AND s.status='ACTIVE' AND e.status='ACTIVE'`).bind(institutionId, body.fromSeasonId));
  let created = 0;
  for (const e of old) {
    const grade = nextGrade(e.grade_level);
    if (!grade) continue;
    const section = body.keepSections === false ? null : e.section;
    let classId: string | null = null;
    if (section) {
      let cls = await one<any>(env.DB.prepare('SELECT id FROM classes WHERE season_id=? AND grade_level=? AND upper(section)=upper(?)').bind(season.id, grade, section));
      if (!cls) {
        classId = uuid('class');
        await env.DB.prepare('INSERT INTO classes (id,institution_id,season_id,grade_level,section,name) VALUES(?,?,?,?,?,?)').bind(classId, institutionId, season.id, grade, section, `${grade}/${section}`).run();
      } else classId = cls.id;
    }
    const exists = await one<any>(env.DB.prepare('SELECT id FROM student_enrollments WHERE student_id=? AND season_id=?').bind(e.student_id, season.id));
    if (!exists) {
      await env.DB.prepare(`INSERT INTO student_enrollments (id,student_id,institution_id,season_id,class_id,student_number,grade_level,section,status) VALUES(?,?,?,?,?,?,?,?, 'ACTIVE')`)
        .bind(uuid('enr'), e.student_id, institutionId, season.id, classId, e.student_number, grade, section).run();
      created++;
    }
  }
  await audit(env.DB, user.id, institutionId, 'SEASON_ROLLOVER', 'season', season.id, { fromSeasonId: body.fromSeasonId, nextAcademicYear: body.nextAcademicYear, created });
  return json({ ok: true, seasonId: season.id, created });
}

async function importPreview(request: Request, env: Env, user: AuthUser): Promise<Response> {
  if (!roleCanManageInstitution(user.role)) return forbidden();
  const form = await request.formData();
  const file = form.get('file');
  const sourceSystem = (form.get('sourceSystem')?.toString() || 'GENERIC').toUpperCase();
  const institutionId = resolveInstitutionId(user, form.get('institutionId')?.toString() || null);
  if (!(file instanceof File) || !institutionId) return badRequest('Dosya ve kurum gerekli.');
  if (!(await userCanAccessInstitution(env.DB, user, institutionId))) return forbidden();
  const seasonId = form.get('seasonId')?.toString() || (await currentSeason(env.DB, institutionId))?.id;
  if (!seasonId) return badRequest('Aktif eğitim yılı bulunamadı.');
  const key = `imports/${institutionId}/${Date.now()}-${safeFileName(file.name)}`;
  const bytes=await file.arrayBuffer();
  await env.FILES.put(key, bytes, { httpMetadata: { contentType: file.type || 'text/plain' } });
  const text = new TextDecoder().decode(bytes);
  if(sourceSystem==='EDESIS'||sourceSystem==='OKULIZYON'){
    const adapter=await one<any>(env.DB.prepare(`SELECT * FROM transfer_adapter_profiles WHERE source_system=?`).bind(sourceSystem));
    if(!adapter||adapter.status!=='VERIFIED'){
      const digest=await crypto.subtle.digest('SHA-256',bytes),sampleHash=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
      const firstLine=(text.split(/\r?\n/).find(x=>x.trim())||'').replace(/^\uFEFF/,'').trim();
      const headerDigest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(firstLine)),headerFingerprint=[...new Uint8Array(headerDigest)].map(x=>x.toString(16).padStart(2,'0')).join('');
      await env.DB.prepare(`UPDATE transfer_adapter_profiles SET status='UNDER_REVIEW',sample_sha256=?,sample_file_name=?,header_fingerprint=?,updated_at=CURRENT_TIMESTAMP WHERE source_system=?`).bind(sampleHash,safeFileName(file.name),headerFingerprint,sourceSystem).run();
      await audit(env.DB,user.id,institutionId,'TRANSFER_ADAPTER_SAMPLE_RECEIVED','transfer_adapter',sourceSystem,{fileName:safeFileName(file.name),sampleHash,headerFingerprint,objectKey:key});
      return json({ok:false,error:{code:'REAL_EXPORT_MAPPING_REVIEW_REQUIRED',message:`${sourceSystem} gerçek export örneği güvenli alana kaydedildi. Özel alan eşlemesi doğrulanıp adapter VERIFIED yapılmadan öğrenci tablolarına aktarım yapılmaz.`,details:{sourceSystem,status:'UNDER_REVIEW',sampleHash,headerFingerprint}}},409);
    }
  }
  const rows = parseGenericStudentImport(text);
  if (!rows.length) return badRequest('Aktarılabilir öğrenci satırı bulunamadı. Excel dosyalarını önce CSV olarak dışa aktarın.', 'IMPORT_FORMAT_REQUIRED');
  const candidates = await loadStudentCandidates(env.DB, institutionId, seasonId);
  const id = uuid('imp');
  let matched = 0, newCount = 0, review = 0;
  await env.DB.prepare(`INSERT INTO import_jobs (id,institution_id,season_id,source_system,source_file_key,status,created_by) VALUES(?,?,?,?,?,'PREVIEW',?)`).bind(id, institutionId, seasonId, sourceSystem, key, user.id).run();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const canonical: CanonicalRecord = { row_no: i + 2, student_number: r.student_number, name: r.name, class_name: r.class_name, grade_level: r.grade_level, section: r.section, answers_by_subject: {}, source_type: 'TRANSFER', confidence: 1, issues: [] };
    const m = matchParticipant(canonical, candidates);
    if (m.status === 'ACTIVE_MATCH' || m.status === 'GUEST_MATCH') matched++; else if (m.status === 'NEW_GUEST') newCount++; else review++;
    await env.DB.prepare(`INSERT INTO import_staging_rows (id,import_job_id,row_no,entity_type,source_json,mapped_json,match_status,issues_json) VALUES(?,?,?,?,?,?,?,?)`)
      .bind(uuid('isr'), id, i + 2, 'STUDENT', JSON.stringify(r), JSON.stringify({ matchedStudentId: m.student_id || null }), m.status, JSON.stringify(m.issues)).run();
  }
  const summary = { total: rows.length, matched, new: newCount, review };
  await env.DB.prepare('UPDATE import_jobs SET summary_json=?,status=? WHERE id=?').bind(JSON.stringify(summary), review ? 'NEEDS_REVIEW' : 'READY', id).run();
  return json({ ok: true, importJobId: id, summary, sourceSystem });
}

async function getImport(env: Env, user: AuthUser, id: string): Promise<Response> {
  const job = await one<any>(env.DB.prepare('SELECT * FROM import_jobs WHERE id=?').bind(id));
  if (!job || !(await userCanAccessInstitution(env.DB, user, job.institution_id))) return notFound();
  const rows = await all<any>(env.DB.prepare('SELECT * FROM import_staging_rows WHERE import_job_id=? ORDER BY row_no LIMIT 500').bind(id));
  return json({ ok: true, job: { ...job, summary: job.summary_json ? JSON.parse(job.summary_json) : null }, rows: rows.map((r) => ({ ...r, source: JSON.parse(r.source_json), mapped: r.mapped_json ? JSON.parse(r.mapped_json) : null, issues: r.issues_json ? JSON.parse(r.issues_json) : [] })) });
}

async function importCommit(env: Env, user: AuthUser, id: string): Promise<Response> {
  if (!roleCanManageInstitution(user.role)) return forbidden();
  const job = await one<any>(env.DB.prepare('SELECT * FROM import_jobs WHERE id=?').bind(id));
  if (!job || !(await userCanAccessInstitution(env.DB, user, job.institution_id))) return notFound();
  if (job.status === 'NEEDS_REVIEW') return badRequest('Kontrol gereken satırlar çözülmeden aktarım yapılamaz.');
  if (job.status === 'COMMITTED') return json({ ok: true, alreadyCommitted: true });
  const rows = await all<any>(env.DB.prepare('SELECT * FROM import_staging_rows WHERE import_job_id=? ORDER BY row_no').bind(id));
  let created = 0, reused = 0;
  for (const row of rows) {
    const source = JSON.parse(row.source_json);
    const mapped = row.mapped_json ? JSON.parse(row.mapped_json) : {};
    if (mapped.matchedStudentId) { reused++; continue; }
    const names = splitName(source.name);
    const studentId = uuid('stu');
    await env.DB.prepare(`INSERT INTO student_entities (id,first_name,last_name,normalized_name,status,activated_at) VALUES(?,?,?,?, 'ACTIVE',CURRENT_TIMESTAMP)`).bind(studentId, names.firstName, names.lastName, normalizeName(source.name)).run();
    let classId: string | null = null;
    if (source.grade_level && source.section) {
      let cls = await one<any>(env.DB.prepare('SELECT id FROM classes WHERE season_id=? AND grade_level=? AND upper(section)=upper(?)').bind(job.season_id, source.grade_level, source.section));
      if (!cls) {
        classId = uuid('class');
        await env.DB.prepare('INSERT INTO classes (id,institution_id,season_id,grade_level,section,name) VALUES(?,?,?,?,?,?)').bind(classId, job.institution_id, job.season_id, source.grade_level, source.section, `${source.grade_level}/${source.section}`).run();
      } else classId = cls.id;
    }
    await env.DB.prepare(`INSERT INTO student_enrollments (id,student_id,institution_id,season_id,class_id,student_number,grade_level,section) VALUES(?,?,?,?,?,?,?,?)`).bind(uuid('enr'), studentId, job.institution_id, job.season_id, classId, source.student_number || null, source.grade_level || null, source.section || null).run();
    if (source.external_id) await env.DB.prepare(`INSERT OR IGNORE INTO external_identities (id,institution_id,source_system,entity_type,external_id,internal_id) VALUES(?,?,?,?,?,?)`).bind(uuid('ext'), job.institution_id, job.source_system, 'STUDENT', source.external_id, studentId).run();
    created++;
  }
  await env.DB.prepare(`UPDATE import_jobs SET status='COMMITTED',committed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();
  await audit(env.DB, user.id, job.institution_id, 'IMPORT_COMMITTED', 'import_job', id, { created, reused });
  return json({ ok: true, created, reused });
}

async function listWorksheets(env: Env, user: AuthUser, url: URL): Promise<Response> {
  const grade = url.searchParams.get('grade');
  const params: unknown[] = [];
  let where = `w.status='PUBLISHED'`;
  if (grade) { where += ' AND w.grade_level=?'; params.push(Number(grade)); }
  if (user.role === 'TEACHER') {
    const seasonId = user.institution_id ? (await currentSeason(env.DB, user.institution_id))?.id : null;
    const scope = await loadPermissionScope(env.DB, user, seasonId);
    if (scope.subjectIds.length) {
      where += ` AND EXISTS(SELECT 1 FROM worksheet_subjects ws WHERE ws.worksheet_id=w.id AND ws.subject_id IN (${scope.subjectIds.map(()=>'?').join(',')}))`;
      params.push(...scope.subjectIds);
    }
  }
  const rows = await all<any>(env.DB.prepare(`SELECT w.*,(SELECT group_concat(s.name, ', ') FROM worksheet_subjects ws JOIN subjects s ON s.id=ws.subject_id WHERE ws.worksheet_id=w.id) subjects FROM worksheets w WHERE ${where} ORDER BY w.academic_year DESC,w.track,w.sequence_no`).bind(...params));
  return json({ ok: true, worksheets: rows });
}

async function uploadWorksheetAsset(request: Request, env: Env, user: AuthUser, worksheetId: string): Promise<Response> {
  if (user.role !== 'SUPER_ADMIN') return forbidden();
  const worksheet = await one<any>(env.DB.prepare('SELECT id FROM worksheets WHERE id=?').bind(worksheetId));
  if (!worksheet) return notFound('Föy bulunamadı.');
  const form = await request.formData();
  const file = form.get('file');
  const type = form.get('assetType')?.toString() || 'PDF';
  if (!(file instanceof File) || !['PDF','ANSWER_KEY','OTHER'].includes(type)) return badRequest('Dosya veya varlık türü geçersiz.');
  const key = `worksheets/${worksheetId}/${Date.now()}-${safeFileName(file.name)}`;
  await env.FILES.put(key, file.stream(), { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
  const id = uuid('asset');
  await env.DB.prepare('INSERT INTO worksheet_assets (id,worksheet_id,asset_type,r2_key,file_name) VALUES(?,?,?,?,?)').bind(id, worksheetId, type, key, file.name).run();
  return json({ ok: true, id, key });
}

async function ensureSeason(db: D1Database, institutionId: string, academicYear: string): Promise<any> {
  let season = await one<any>(db.prepare('SELECT * FROM institution_seasons WHERE institution_id=? AND academic_year=?').bind(institutionId, academicYear));
  if (!season) {
    const id = uuid('season');
    await db.prepare(`INSERT INTO institution_seasons (id,institution_id,academic_year,status) VALUES(?,?,?,'ACTIVE')`).bind(id, institutionId, academicYear).run();
    season = await one<any>(db.prepare('SELECT * FROM institution_seasons WHERE id=?').bind(id));
  }
  return season;
}

async function currentSeason(db: D1Database, institutionId: string): Promise<any | null> {
  return one<any>(db.prepare(`SELECT * FROM institution_seasons WHERE institution_id=? AND status='ACTIVE' ORDER BY academic_year DESC LIMIT 1`).bind(institutionId));
}

async function loadStudentCandidates(db: D1Database, institutionId: string, seasonId: string): Promise<MatchCandidate[]> {
  return all<MatchCandidate>(db.prepare(`SELECT s.id student_id,s.status,s.normalized_name,e.student_number,e.grade_level,e.section FROM student_entities s JOIN student_enrollments e ON e.student_id=s.id WHERE e.institution_id=? AND e.season_id=? AND s.status IN ('ACTIVE','GUEST')`).bind(institutionId, seasonId));
}

function resolveInstitutionId(user: AuthUser, requested: string | null): string | null {
  return user.role === 'SUPER_ADMIN' ? requested : user.institution_id;
}

async function userCanAccessInstitution(db: D1Database, user: AuthUser, institutionId: string): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true;
  return user.institution_id === institutionId;
}

async function canAccessStudent(db: D1Database, user: AuthUser, studentId: string): Promise<{ allowed: boolean; classId?: string | null; seasonId?: string | null }> {
  if (user.role === 'SUPER_ADMIN') return { allowed: true };
  if (user.role === 'STUDENT') return { allowed: user.student_id === studentId };
  if (user.role === 'PARENT') {
    const link = await one<any>(db.prepare('SELECT 1 ok FROM parent_student_links WHERE parent_user_id=? AND student_id=? AND active=1').bind(user.id, studentId));
    return { allowed: Boolean(link) };
  }
  const enrollment = await one<any>(db.prepare(`SELECT e.class_id,e.season_id,e.institution_id,s.status student_status FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id WHERE e.student_id=? AND e.institution_id=? ORDER BY e.created_at DESC LIMIT 1`).bind(studentId, user.institution_id));
  if (!enrollment) return { allowed: false };
  if (user.role === 'INSTITUTION_MANAGER') return { allowed: true, classId: enrollment.class_id, seasonId: enrollment.season_id };
  if (user.role === 'TEACHER' || user.role === 'GUIDANCE_TEACHER') {
    if (enrollment.student_status !== 'ACTIVE') return { allowed: false };
    const scope = await loadPermissionScope(db, user, enrollment.season_id);
    const allowed = scope.classIds.includes(enrollment.class_id) || scope.guidanceClassIds.includes(enrollment.class_id);
    return { allowed, classId: enrollment.class_id, seasonId: enrollment.season_id };
  }
  return { allowed: false };
}

async function aggregateStudentOutcomes(db: D1Database, studentId: string, threshold: number, minEvidence: number, only?: 'DEVELOPING' | 'STRONG', limit = 200, subjectIds: string[] | null = null): Promise<any[]> {
  const params: unknown[] = [studentId];
  let subjectFilter = '';
  if (subjectIds?.length) { subjectFilter = ` AND o.subject_id IN (${subjectIds.map(()=>'?').join(',')})`; params.push(...subjectIds); }
  const rows = await all<any>(db.prepare(`SELECT o.id,o.title,o.topic,o.subtopic,o.subject_id,s.name subject_name,
    sum(r.evidence_count) evidence_count,sum(r.correct_count) correct_count,
    case when sum(r.evidence_count)>0 then 1.0*sum(r.correct_count)/sum(r.evidence_count) else 0 end success_rate
    FROM outcome_results r JOIN outcomes o ON o.id=r.outcome_id JOIN subjects s ON s.id=o.subject_id
    WHERE r.student_id=? ${subjectFilter} GROUP BY o.id ORDER BY success_rate ASC,evidence_count DESC`).bind(...params));
  const mapped = rows.map((r) => ({ ...r, mastery_status: Number(r.evidence_count) < minEvidence ? 'INSUFFICIENT_EVIDENCE' : Number(r.success_rate) >= threshold ? 'STRONG' : 'DEVELOPING' }));
  return mapped.filter((r) => !only || r.mastery_status === only).slice(0, limit);
}

function nextGrade(grade: number | null): number | null {
  if (!grade) return null;
  if (grade >= 1 && grade < 12) return grade + 1;
  return null;
}

function parseGenericStudentImport(text: string): Array<{ external_id?: string; student_number?: string; name: string; class_name?: string; grade_level?: number; section?: string }> {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim().split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const delimiter = [',',';','\t'].sort((a,b)=>lines[0].split(b).length-lines[0].split(a).length)[0];
  const headers = lines[0].split(delimiter).map((h)=>h.trim().toLocaleLowerCase('tr-TR'));
  const idx = (...names:string[]) => headers.findIndex((h)=>names.includes(h));
  const idIdx = idx('id','external_id','ogrenci_id','öğrenci_id');
  const noIdx = idx('student_number','ogrenci_no','öğrenci_no','numara','no');
  const nameIdx = idx('name','ad_soyad','adsoyad','öğrenci','ogrenci');
  const classIdx = idx('class','sinif','sınıf','class_name');
  if (nameIdx < 0) return [];
  return lines.slice(1).map((line) => {
    const cols = line.split(delimiter).map((x)=>x.trim().replace(/^"|"$/g,''));
    const className = classIdx >= 0 ? cols[classIdx] : '';
    const m = className?.toLocaleUpperCase('tr-TR').match(/(\d{1,2})\s*[\/-]?\s*([A-ZÇĞİÖŞÜ])?/);
    return { external_id: idIdx>=0?cols[idIdx]:undefined, student_number:noIdx>=0?cols[noIdx]:undefined, name:cols[nameIdx], class_name:className||undefined, grade_level:m?Number(m[1]):undefined, section:m?.[2] };
  }).filter((r)=>r.name);
}

function safeFileName(name: string): string {
  return name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').slice(0,120) || 'file';
}
