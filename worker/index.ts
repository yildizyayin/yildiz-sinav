import { serverErrorResponse } from './lib/error-boundary';
import { anySuperAdminMfaActive } from './lib/super-admin-mfa';
import { examOpenToInstitutionSql } from './lib/exam-audience';
import { handleInstitutionCard } from './lib/institution-card';
import { sanitizeAuditDetails } from './lib/db';
import type { AuthUser, CanonicalRecord, Env, MatchCandidate } from './types';
import { audit, badRequest, forbidden, json, methodNotAllowed, normalizeName, notFound, one, all, splitName, uuid } from './lib/db';
import { createSession, getAuthUser, hashPassword, isServiceAccountId, isTemporarilyLocked, recordLoginAttempt, revokeOtherSessions, revokeSession, verifyPassword, verifyTurnstile } from './lib/auth';
import { canAccessSubjectForClass, canEvaluateExam, loadPermissionScope, roleCanManageInstitution } from './lib/permissions';
import { examPublicationGuard } from './lib/exam-publication-guard';
import { examEvaluationAccess } from './lib/exam-evaluation-access';
import { withExamOperationLock } from './lib/exam-operation-lock';
import { matchParticipant } from './lib/matching';
import { bookletIssue, compareBooklets, isBookletIssue } from './lib/booklet-review';
import { decodeUploadedBytes, parseUploadedText, parseWithTemplate, type ParserTemplate } from './lib/parse';
import { isLearnerRole, publishedForLearnersSql } from './lib/exam-schedule';
import { changeInstitutionLifecycle } from './lib/institution-lifecycle';
import { alignRecordsToExam, mergeSessionRecords, primaryBooklet, recordBookletIssue, subjectBooklet } from './lib/two-session';
import { duplicateMessage, duplicateStudentConflicts } from './lib/scan-duplicates';
import { assertScoringRuleVerified, effectiveWrongDivisor, scoreMethodFor } from './lib/scoring';
import { calibrationWithinTolerance, nextCalibrationStatus, type CalibrationMetrics } from './lib/calibration';
import { startTrial } from './lib/license';
import { generatedInstitutionCode, normalizeInstitutionCreateBody, type InstitutionCreateBody } from './lib/institution-onboarding';
import { createAccountNotificationBatch } from './lib/account-notifications';

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
          superAdminMfaEnabled: await anySuperAdminMfaActive(env),
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
      if (url.pathname === '/api/auth/change-password' && request.method === 'POST') return changePassword(request, env, user);

      const passive = await rejectIfPassiveInstitution(env, user);
      if (passive) return passive;

      if (url.pathname === '/api/dashboard' && request.method === 'GET') return dashboard(env, user);
      if (url.pathname === '/api/institutions') {
        if (request.method === 'GET') return listInstitutions(env, user, url);
        if (request.method === 'POST') return createInstitution(request, env, user);
        return methodNotAllowed();
      }
      const institutionCardMatch = url.pathname.match(/^\/api\/institutions\/([^/]+)$/);
      if (institutionCardMatch) return handleInstitutionCard(request, env, user, institutionCardMatch[1]);
      const institutionStatusMatch = url.pathname.match(/^\/api\/institutions\/([^/]+)\/status$/);
      if (institutionStatusMatch) return request.method === 'POST' ? setInstitutionStatus(request, env, user, institutionStatusMatch[1]) : methodNotAllowed();

      if (url.pathname === '/api/exams') return request.method === 'GET' ? listExams(env, user, url) : methodNotAllowed();
      const examPreviewMatch = url.pathname.match(/^\/api\/exams\/([^/]+)\/preview-file$/);
      if (examPreviewMatch) return request.method === 'POST' ? previewExamFile(request, env, user, examPreviewMatch[1]) : methodNotAllowed();

      const scanResolveMatch = url.pathname.match(/^\/api\/scan-batches\/([^/]+)\/records\/([^/]+)\/resolve$/);
      if (scanResolveMatch) return request.method === 'POST' ? resolveScanRecord(request, env, user, scanResolveMatch[1], scanResolveMatch[2]) : methodNotAllowed();
      const scanCandidatesMatch = url.pathname.match(/^\/api\/scan-batches\/([^/]+)\/records\/([^/]+)\/candidates$/);
      if (scanCandidatesMatch) return request.method === 'GET' ? searchScanCandidates(env, user, scanCandidatesMatch[1], scanCandidatesMatch[2], url) : methodNotAllowed();
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

      if (url.pathname === '/api/optical-templates' && request.method === 'GET') return listOpticalTemplates(env, user, url);
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
      const importResolveMatch = url.pathname.match(/^\/api\/imports\/([^/]+)\/rows\/([^/]+)\/resolve$/);
      if (importResolveMatch) return request.method === 'POST' ? importResolve(request, env, user, importResolveMatch[1], importResolveMatch[2]) : methodNotAllowed();
      const importCommitMatch = url.pathname.match(/^\/api\/imports\/([^/]+)\/commit$/);
      if (importCommitMatch) return request.method === 'POST' ? importCommit(env, user, importCommitMatch[1]) : methodNotAllowed();

      if (url.pathname === '/api/worksheets' && request.method === 'GET') return listWorksheets(env, user, url);
      const worksheetAssetMatch = url.pathname.match(/^\/api\/worksheets\/([^/]+)\/assets$/);
      if (worksheetAssetMatch) return request.method === 'POST' ? uploadWorksheetAsset(request, env, user, worksheetAssetMatch[1]) : methodNotAllowed();

      return notFound('API yolu bulunamadı.');
    } catch (error) {
      return serverErrorResponse(error);
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

  // A047: e-mail/username identify one account; a phone number may be on several (a teacher who is also a parent).
  // The phone never grants access by itself: the password must match, and it must match exactly one account.
  const byName = await one<any>(env.DB.prepare(`SELECT u.*, i.status AS institution_status FROM users u LEFT JOIN institutions i ON i.id=u.institution_id
    WHERE lower(coalesce(u.email,''))=lower(?) OR lower(coalesce(u.username,''))=lower(?) LIMIT 1`).bind(identifier, identifier));
  let row: any = null;
  if (byName) row = byName.active && !isServiceAccountId(byName.id) && await verifyPassword(body.password, byName.password_salt, byName.password_hash, byName.password_iterations) ? byName : null;
  else {
    const byPhone = await all<any>(env.DB.prepare(`SELECT u.*, i.status AS institution_status FROM users u LEFT JOIN institutions i ON i.id=u.institution_id WHERE u.phone=? AND u.active=1 LIMIT 5`).bind(identifier));
    const fits: any[] = [];
    for (const c of byPhone) if (!isServiceAccountId(c.id) && await verifyPassword(body.password, c.password_salt, c.password_hash, c.password_iterations)) fits.push(c);
    if (fits.length > 1) { await recordLoginAttempt(env, identifier, false, request); return json({ ok: false, error: { code: 'PHONE_AMBIGUOUS', message: 'Bu telefon numarası birden fazla hesapta kayıtlı. Kullanıcı adınız veya e-postanızla giriş yapın.' } }, 401); }
    row = fits[0] || null;
  }
  if (!row) {
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
  return createSession(env, row.id, request, Boolean(body.remember), Boolean(row.must_change_password));
}

async function changePassword(request: Request, env: Env, user: AuthUser): Promise<Response> {
  const body = await request.json<{ currentPassword?: string; newPassword?: string }>().catch(() => ({} as { currentPassword?: string; newPassword?: string }));
  const currentPassword = body.currentPassword || '';
  const newPassword = body.newPassword || '';
  if (!currentPassword || newPassword.length < 8) return badRequest('Mevcut şifre ve en az 8 karakterli yeni şifre gereklidir.');
  if (currentPassword === newPassword) return badRequest('Yeni şifre mevcut şifreden farklı olmalıdır.');
  const row = await one<any>(env.DB.prepare('SELECT password_hash,password_salt,password_iterations FROM users WHERE id=? AND active=1').bind(user.id));
  if (!row || !(await verifyPassword(currentPassword, row.password_salt, row.password_hash, row.password_iterations))) return json({ ok: false, error: { code: 'CURRENT_PASSWORD_INVALID', message: 'Mevcut şifre hatalı.' } }, 400);
  const passwordData = await hashPassword(newPassword);
  await env.DB.prepare(`UPDATE users SET password_hash=?,password_salt=?,password_iterations=?,password_algo='PBKDF2-SHA256-v1',must_change_password=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(passwordData.hash, passwordData.salt, passwordData.iterations, user.id).run();
  await revokeOtherSessions(env, request, user.id);
  await audit(env.DB, user.id, user.institution_id, 'PASSWORD_CHANGED', 'user', user.id, { forced: Boolean(user.must_change_password) });
  return json({ ok: true, mustChangePassword: false });
}

async function rejectIfPassiveInstitution(env: Env, user: AuthUser): Promise<Response | null> {
  if (user.role === 'SUPER_ADMIN' || !user.institution_id) return null;
  const inst = await one<{ status: string }>(env.DB.prepare('SELECT status FROM institutions WHERE id=?').bind(user.institution_id));
  if (inst?.status === 'PASSIVE') return json({ ok: false, error: { code: 'INSTITUTION_PASSIVE', message: 'Kurum hesabınız şu anda aktif değildir. Lütfen kurum yöneticinizle iletişime geçin.' } }, 403);
  return null;
}

async function dashboard(env: Env, user: AuthUser): Promise<Response> {
  if (user.role === 'SUPER_ADMIN') {
    const [
      institutions,
      activeInstitutions,
      passiveInstitutions,
      activeStudents,
      guests,
      exams,
      activeExams,
      todayResults,
      pendingScans,
      readyOpticals,
      opticalDefinitions,
      pendingActivations,
      licenseWarnings,
      approvedDealers,
      activeUsers,
      recentActivity,
    ] = await Promise.all([
      one<{ c: number }>(env.DB.prepare('SELECT count(*) c FROM institutions')),
      one<{ c: number }>(env.DB.prepare(`SELECT count(*) c FROM institutions WHERE status='ACTIVE'`)),
      one<{ c: number }>(env.DB.prepare(`SELECT count(*) c FROM institutions WHERE status='PASSIVE'`)),
      one<{ c: number }>(env.DB.prepare(`SELECT count(*) c FROM student_entities WHERE status='ACTIVE'`)),
      one<{ c: number }>(env.DB.prepare(`SELECT count(*) c FROM student_entities WHERE status='GUEST'`)),
      one<{ c: number }>(env.DB.prepare(`SELECT count(*) c FROM exams WHERE status<>'ARCHIVED'`)),
      one<{ c: number }>(env.DB.prepare(`SELECT count(*) c FROM exams WHERE status='ACTIVE'`)),
      one<{ c: number }>(env.DB.prepare(`SELECT count(*) c FROM exam_results WHERE date(created_at)=date('now')`)),
      one<{ c: number }>(env.DB.prepare(`SELECT count(*) c FROM scan_batches WHERE status IN ('PREVIEW','NEEDS_REVIEW')`)),
      one<{ c: number }>(env.DB.prepare(`SELECT count(*) c FROM optical_templates WHERE status='READY' AND active=1`)),
      one<{ c: number }>(env.DB.prepare(`SELECT count(*) c FROM optical_templates WHERE status='NEEDS_DEFINITION' AND active=1`)),
      one<{ c: number }>(env.DB.prepare(`SELECT count(*) c FROM activation_requests WHERE status='PENDING'`)),
      one<{ c: number }>(env.DB.prepare(`SELECT count(*) c FROM institution_licenses WHERE status IN ('EXPIRED','SUSPENDED') OR date(coalesce(license_expires_at,trial_expires_at)) <= date('now','+30 day')`)),
      one<{ c: number }>(env.DB.prepare(`SELECT count(*) c FROM result_network_dealers WHERE status='APPROVED'`)),
      one<{ c: number }>(env.DB.prepare(`SELECT count(*) c FROM users WHERE active=1`)),
      all<any>(env.DB.prepare(`
        SELECT a.action,a.entity_type,a.entity_id,a.created_at,coalesce(u.display_name,'Sistem') actor_name
        FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id
        ORDER BY a.created_at DESC LIMIT 8
      `)),
    ]);
    const count = (row: { c: number } | null | undefined) => row?.c ?? 0;
    return json({ ok: true, cards: [
      { label: 'Aktif Kurum', value: count(activeInstitutions) },
      { label: 'Aktif Öğrenci', value: count(activeStudents) },
      { label: 'Tanımlı Sınav', value: count(exams) },
      { label: 'Bugün Değerlendirilen', value: count(todayResults) },
      { label: 'Bekleyen Optik', value: count(pendingScans) },
      { label: 'Yayındaki Sınav', value: count(activeExams) },
      { label: 'Hazır Optik', value: count(readyOpticals) },
      { label: 'Lisans Uyarısı', value: count(licenseWarnings) },
    ],
    pending: {
      scanReview: count(pendingScans),
      opticalDefinitions: count(opticalDefinitions),
      activationRequests: count(pendingActivations),
      licenseWarnings: count(licenseWarnings),
    },
    institutionSummary: {
      total: count(institutions),
      active: count(activeInstitutions),
      passive: count(passiveInstitutions),
      guests: count(guests),
      activeUsers: count(activeUsers),
      approvedDealers: count(approvedDealers),
    },
    recentActivity,
    systemHealth: [
      { key: 'api', label: 'API / Worker', status: 'READY', detail: 'Yanıt veriyor' },
      { key: 'database', label: 'D1 veri tabanı', status: 'READY', detail: 'Sorgular çalışıyor' },
      { key: 'optical', label: 'Optik motoru', status: count(readyOpticals) ? 'READY' : 'ACTION', detail: `${count(readyOpticals)} hazır tanım` },
      { key: 'results', label: 'Sonuç ağı', status: count(activeExams) ? 'READY' : 'EMPTY', detail: `${count(activeExams)} yayınlanabilir sınav` },
    ],
    });
  }
  if (user.role === 'STUDENT') {
    if (!user.student_id) return badRequest('Öğrenci hesabı bağlı değil.');
    const latest = await one<any>(env.DB.prepare(`SELECT e.title, e.exam_date, er.net, er.score, er.success_percent
      FROM exam_results er JOIN exam_participants ep ON ep.id=er.participant_id JOIN exams e ON e.id=ep.exam_id
      WHERE ep.student_id=? AND ${publishedForLearnersSql('e.id')} ORDER BY coalesce(e.exam_date, er.created_at) DESC LIMIT 1`).bind(user.student_id));
    const [developing,strong] = await Promise.all([
      aggregateStudentOutcomes(env.DB, user.student_id, 0.6, 3, 'DEVELOPING', 5, null, true),
      aggregateStudentOutcomes(env.DB, user.student_id, 0.6, 3, 'STRONG', 5, null, true),
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

async function listInstitutions(env: Env, user: AuthUser, url?: URL): Promise<Response> {
  if (user.role !== 'SUPER_ADMIN') return forbidden();
  // A032b: deleted (ARCHIVED) institutions leave the list; ?archived=1 shows them for restoring.
  const archived = url?.searchParams.get('archived') === '1';
  const rows = await all<any>(env.DB.prepare(`SELECT i.*,COALESCE(iac.lifecycle_status,CASE WHEN i.status='ACTIVE' THEN 'ACTIVE' ELSE 'PASSIVE' END) lifecycle_status,iac.reason lifecycle_reason,iac.updated_at lifecycle_updated_at,
    (SELECT count(*) FROM users u WHERE u.institution_id=i.id AND u.role<>'SUPER_ADMIN') account_count,
    l.plan_code license_plan,l.status license_status,l.trial_expires_at,l.license_expires_at,
    (SELECT s.academic_year FROM institution_seasons s WHERE s.institution_id=i.id ORDER BY CASE s.status WHEN 'ACTIVE' THEN 0 ELSE 1 END,s.created_at DESC LIMIT 1) academic_year,
    (SELECT count(*) FROM users u WHERE u.institution_id=i.id AND u.role='INSTITUTION_MANAGER' AND u.active=1) manager_count,
    (SELECT count(DISTINCT e.student_id) FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id WHERE e.institution_id=i.id AND s.status='ACTIVE') active_students,
    (SELECT count(DISTINCT e.student_id) FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id WHERE e.institution_id=i.id AND s.status='GUEST') guest_students
    FROM institutions i LEFT JOIN institution_licenses l ON l.institution_id=i.id LEFT JOIN institution_access_controls iac ON iac.institution_id=i.id
    WHERE (COALESCE(iac.lifecycle_status,'ACTIVE')='ARCHIVED')=? ORDER BY i.name`).bind(archived ? 1 : 0));
  return json({ ok: true, institutions: rows });
}

async function createInstitution(request: Request, env: Env, user: AuthUser): Promise<Response> {
  if (user.role !== 'SUPER_ADMIN') return forbidden('Kurum açma yetkisi yalnızca Süper Admin hesabındadır.');

  const body = await request.json<InstitutionCreateBody>().catch(() => ({} as InstitutionCreateBody));
  let input;
  try {
    input = normalizeInstitutionCreateBody(body);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Kurum bilgileri geçersiz.', 'VALIDATION_ERROR');
  }

  const institutionId = uuid('inst');
  const seasonId = uuid('season');
  const managerId = uuid('usr');
  const institutionCode = input.code || input.mebCode || generatedInstitutionCode(institutionId);
  const existingInstitution = await one<any>(env.DB.prepare(`SELECT id FROM institutions WHERE code=? OR (? IS NOT NULL AND meb_code=?) LIMIT 1`).bind(institutionCode, input.mebCode, input.mebCode));
  if (existingInstitution) return json({ ok: false, error: { code: 'INSTITUTION_EXISTS', message: 'Bu kurum kodu veya MEB kodu zaten kayıtlı.' } }, 409);

  if (input.manager.email) {
    const duplicate = await one<any>(env.DB.prepare('SELECT id FROM users WHERE lower(email)=lower(?) LIMIT 1').bind(input.manager.email));
    if (duplicate) return json({ ok: false, error: { code: 'EMAIL_EXISTS', message: 'Kurum yöneticisinin e-posta adresi zaten kullanılıyor.' } }, 409);
  }
  if (input.manager.username) {
    const duplicate = await one<any>(env.DB.prepare('SELECT id FROM users WHERE lower(username)=lower(?) LIMIT 1').bind(input.manager.username));
    if (duplicate) return json({ ok: false, error: { code: 'USERNAME_EXISTS', message: 'Kurum yöneticisinin kullanıcı adı zaten kullanılıyor.' } }, 409);
  }

  const passwordData = await hashPassword(input.manager.password);
  const featureRows = input.features.length
    ? await all<{ feature_key: string }>(env.DB.prepare(`SELECT feature_key FROM platform_features WHERE feature_key IN (${input.features.map(() => '?').join(',')})`).bind(...input.features))
    : [];
  const featureKeys = new Set(featureRows.map((row) => row.feature_key));
  const now = new Date().toISOString();

  const statements = [
    env.DB.prepare(`INSERT INTO institutions
      (id,name,code,city,district,contact_name,contact_phone,contact_email,status,source_type,meb_code,institution_type,ownership,education_level,official_url,address,package_code,user_limit)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      institutionId, input.name, institutionCode, input.city, input.district, input.contactName, input.contactPhone, input.contactEmail,
      'ACTIVE', input.sourceType, input.mebCode, input.institutionType, input.ownership, input.educationLevel, input.officialUrl, input.address, input.packageCode, input.userLimit,
    ),
    env.DB.prepare(`INSERT INTO institution_seasons (id,institution_id,academic_year,status,started_at) VALUES (?,?,?,'ACTIVE',?)`).bind(seasonId, institutionId, input.academicYear, now),
    env.DB.prepare(`INSERT INTO institution_license_state (id,institution_id,season_id,licensed_student_limit,licensed_student_count,agreement_status,note) VALUES (?,?,?,? ,0,'ACTIVE',?)`).bind(uuid('licstate'), institutionId, seasonId, input.studentLimit, `Kurum açılışı · ${input.packageCode}`),
    env.DB.prepare(`INSERT INTO users (id,institution_id,role,display_name,email,phone,username,password_hash,password_salt,password_iterations,password_algo,must_change_password,active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,1,1)`).bind(
      managerId, institutionId, 'INSTITUTION_MANAGER', input.manager.displayName, input.manager.email, input.manager.phone, input.manager.username,
      passwordData.hash, passwordData.salt, passwordData.iterations, 'PBKDF2-SHA256-v1',
    ),
    env.DB.prepare(`INSERT INTO institution_access_controls (institution_id,lifecycle_status,updated_by) VALUES (?,'ACTIVE',?)`).bind(institutionId, user.id),
    env.DB.prepare(`INSERT INTO institution_governance_events (id,institution_id,actor_user_id,action,next_status,metadata_json) VALUES (?,?,?,'CREATE','ACTIVE',?)`).bind(
      uuid('ige'), institutionId, user.id, JSON.stringify({ sourceType: input.sourceType, packageCode: input.packageCode, academicYear: input.academicYear }),
    ),
    env.DB.prepare(`INSERT INTO audit_logs (id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES (?,?,?,'INSTITUTION_CREATED','institution',?,?)`).bind(
      uuid('aud'), user.id, institutionId, institutionId, JSON.stringify({ sourceType: input.sourceType, packageCode: input.packageCode, academicYear: input.academicYear, managerRole: 'INSTITUTION_MANAGER' }),
    ),
    ...[...featureKeys].map((featureKey) => env.DB.prepare(`INSERT INTO institution_feature_overrides (institution_id,feature_key,enabled,updated_at) VALUES (?,?,1,CURRENT_TIMESTAMP)`).bind(institutionId, featureKey)),
  ];

  try {
    await env.DB.batch(statements);
    const license = input.startTrial ? await startTrial(env, institutionId, user, 7, 'Kurum açılışında otomatik başlatıldı.') : null;
    const notification = await createAccountNotificationBatch(env, user.id, institutionId, [{
      userId: managerId,
      displayName: input.manager.displayName,
      username: input.manager.username,
      email: input.manager.email,
      phone: input.manager.phone,
      password: input.manager.password,
    }], ['EMAIL', 'SMS']);
    return json({
      ok: true,
      institution: { id: institutionId, name: input.name, code: institutionCode, mebCode: input.mebCode, academicYear: input.academicYear, packageCode: input.packageCode },
      manager: { id: managerId, displayName: input.manager.displayName, email: input.manager.email, username: input.manager.username },
      notification,
      license,
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/UNIQUE|constraint/i.test(message)) return json({ ok: false, error: { code: 'INSTITUTION_EXISTS', message: 'Kurum kodu, MEB kodu veya yönetici giriş bilgisi zaten kayıtlı.' } }, 409);
    throw error;
  }
}

async function setInstitutionStatus(request: Request, env: Env, user: AuthUser, institutionId: string): Promise<Response> {
  if (user.role !== 'SUPER_ADMIN') return forbidden();
  const body = await request.json<{ status?: string; reason?: string }>().catch(() => ({} as { status?: string; reason?: string }));
  return changeInstitutionLifecycle(env, user, institutionId, body.status, body.reason);
}

async function listExams(env: Env, user: AuthUser, url: URL): Promise<Response> {
  const institutionId = user.role === 'SUPER_ADMIN' ? url.searchParams.get('institutionId') : user.institution_id;
  const params: unknown[] = [];
  let where = `e.status IN ('ACTIVE','CLOSED') AND NOT EXISTS(SELECT 1 FROM exam_revision_state r WHERE r.exam_id=e.id AND r.app_trashed_at IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM exam_channel_publications p WHERE p.exam_id=e.id AND p.channel='LICENSED' AND p.status<>'ACTIVE')`;
  if (institutionId) {
    where += ` AND ${examOpenToInstitutionSql('e')}`;
    params.push(institutionId, institutionId);
  }
  const rows = await all<any>(env.DB.prepare(`SELECT e.*, srv.verified scoring_verified, sr.authority,
    (SELECT group_concat(code, '/') FROM exam_booklets b WHERE b.exam_id=e.id AND b.active=1) booklet_codes,
    (SELECT count(*) FROM exam_participants ep WHERE ep.exam_id=e.id ${institutionId ? 'AND ep.institution_id=?' : ''}) participant_count
    FROM exams e LEFT JOIN scoring_rule_versions srv ON srv.id=e.scoring_rule_version_id LEFT JOIN scoring_rules sr ON sr.id=srv.rule_id
    WHERE ${where} ORDER BY coalesce(e.exam_date,'9999-12-31') DESC, e.title`).bind(...params, ...(institutionId ? [institutionId] : [])));
  return json({ ok: true, exams: rows });
}

export async function previewExamFile(request: Request, env: Env, user: AuthUser, examId: string): Promise<Response> {
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
  const examScope = await examEvaluationAccess(env, exam, institutionId);
  if (examScope) return examScope;
  const inst = await one<{ status: string }>(env.DB.prepare('SELECT status FROM institutions WHERE id=?').bind(institutionId));
  if (!inst) return notFound('Kurum bulunamadı.');
  // A032b: the Super Admin may still load and correct results of a suspended institution.
  if (inst.status === 'PASSIVE' && user.role !== 'SUPER_ADMIN') return badRequest('Pasif kurumda sınav değerlendirilemez.', 'INSTITUTION_PASSIVE');
  const season = await ensureSeason(env.DB, institutionId, exam.academic_year);
  const text = decodeUploadedBytes(await file.arrayBuffer());
  const globalTemplates = await all<ParserTemplate>(env.DB.prepare(`SELECT v.id, t.name, v.parser_definition FROM optical_template_versions v JOIN optical_templates t ON t.id=v.template_id WHERE v.active=1 AND t.active=1`));
  const boundTemplates = await all<ParserTemplate>(env.DB.prepare(`SELECT DISTINCT v.id, t.name, v.parser_definition FROM exam_optical_bindings b JOIN optical_template_versions v ON v.id=b.optical_template_version_id JOIN optical_templates t ON t.id=v.template_id WHERE b.exam_id=? AND b.active=1 AND v.active=1 AND t.active=1 AND v.parser_definition IS NOT NULL`).bind(examId));
  // In production the preview policy passes the optics this institution may use (A028b.3).
  const policyIds = form.get('policyCandidateIds')?.toString().split(',').filter(Boolean);
  const templates = boundTemplates.length ? boundTemplates : policyIds ? globalTemplates.filter((t) => policyIds.includes(t.id)) : globalTemplates;
  const manualTemplateId = form.get('templateVersionId')?.toString();
  let parsed;
  if (manualTemplateId) {
    const template = templates.find((x) => x.id === manualTemplateId);
    if (!template) return badRequest('Seçilen optik şablon bulunamadı.');
    parsed = parseWithTemplate(text, file.name, template);
    // A028b.3: a TXT holding sayısal and sözel forms is read with the chosen optic and the other allowed one.
    if (!parsed.records.length) {
      const mixed = parseUploadedText(text, file.name, templates);
      if (mixed.forms?.some((f) => f.id === manualTemplateId)) parsed = mixed;
    }
  } else parsed = parseUploadedText(text, file.name, templates);
  if (parsed.records.length === 0) return badRequest(parsed.issues[0] || 'Dosya okunamadı.', parsed.ambiguous ? 'OPTICAL_TEMPLATE_AMBIGUOUS' : 'OPTICAL_TEMPLATE_REQUIRED', { templates: parsed.ambiguous ? (parsed.candidates || templates.map((t) => ({ id: t.id, name: t.name }))) : undefined, issues: parsed.issues });

  const candidates = await loadStudentCandidates(env.DB, institutionId, season.id);
  const allowedBooklets = (await all<{ code: string }>(env.DB.prepare('SELECT code FROM exam_booklets WHERE exam_id=? AND active=1').bind(examId))).map((b) => b.code.toUpperCase());
  // A028b: align the form's test codes to the exam, drop tests nobody answered in this file (the other
  // session's file carries them) and join the two session sheets of one student into one record.
  const examCodes = (await all<{ code: string }>(env.DB.prepare('SELECT s.code FROM exam_subjects es JOIN subjects s ON s.id=es.subject_id WHERE es.exam_id=? ORDER BY es.sort_order').bind(examId))).map((s) => s.code.toUpperCase());
  const aligned = alignRecordsToExam(parsed.records, examCodes);
  const sessions = mergeSessionRecords(aligned.records);
  parsed.records = sessions.records;
  if (!parsed.records.some((r) => Object.keys(r.answers_by_subject).some((code) => examCodes.includes(code)))) return badRequest('Dosyada bu sınavın derslerine ait cevap bulunamadı.', 'NO_EXAM_SUBJECTS_IN_FILE', { warnings: aligned.warnings });
  const fileNotes = [...(parsed.forms ? parsed.issues : []), ...aligned.warnings, ...(sessions.merged.length ? [`${sessions.merged.length} öğrencinin iki oturum optiği tek kayıtta birleştirildi.`] : [])];
  const batchId = uuid('batch');
  const batchStatus = parsed.records.some((r) => r.issues.length) ? 'NEEDS_REVIEW' : 'PREVIEW';
  await env.DB.prepare(`INSERT INTO scan_batches (id,exam_id,institution_id,season_id,source_type,optical_template_version_id,detection_confidence,status,created_by) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(batchId, examId, institutionId, season.id, parsed.records[0]?.source_type || 'TXT', parsed.templateId || null, parsed.confidence, batchStatus, user.id).run();
  // S036: the uploaded file is kept as it was for one academic year (Veri Merkezi).
  { const { storeOriginalUpload } = await import('./lib/result-data-center'); await storeOriginalUpload(env, { batchId, institutionId, academicYear: exam.academic_year, file }); }

  const counts = { active: 0, guest: 0, newGuest: 0, ambiguous: 0, invalid: 0, pending: 0, cancelled: 0 };
  const recordStatements: D1PreparedStatement[] = [];
  for (const record of parsed.records) {
    if (!record.booklet && allowedBooklets.length === 1) record.booklet = allowedBooklets[0];
    const match = matchParticipant(record, candidates);
    const issue = recordBookletIssue(record, allowedBooklets, bookletIssue);
    if (issue) record.issues.push(issue);
    if (match.status === 'ACTIVE_MATCH') counts.active++;
    if (match.status === 'GUEST_MATCH') counts.guest++;
    if (match.status === 'NEW_GUEST') counts.newGuest++;
    if (match.status === 'AMBIGUOUS') counts.ambiguous++;
    if (match.status === 'INVALID') counts.invalid++;
    if (['NEW_GUEST', 'AMBIGUOUS', 'INVALID'].includes(match.status) || record.issues.length || match.issues.length) counts.pending++;
    // Matching can use T.C. identity, but the raw value is not persisted in
    // the scan payload or copied to audit/result-network data.
    const storedRecord = { ...record, tckn: undefined };
    recordStatements.push(env.DB.prepare(`INSERT INTO scan_records (id,batch_id,row_no,canonical_json,matched_student_id,match_status,match_confidence,issues_json) VALUES(?,?,?,?,?,?,?,?)`)
      .bind(uuid('scan'), batchId, record.row_no, JSON.stringify(storedRecord), match.student_id || null, match.status, match.confidence, JSON.stringify([...record.issues, ...match.issues])));
  }
  for (let i = 0; i < recordStatements.length; i += 80) await env.DB.batch(recordStatements.slice(i, i + 80));
  const finalStatus = counts.pending ? 'NEEDS_REVIEW' : 'READY';
  await env.DB.prepare('UPDATE scan_batches SET status=? WHERE id=?').bind(finalStatus, batchId).run();
  await audit(env.DB, user.id, institutionId, 'EXAM_FILE_PREVIEWED', 'scan_batch', batchId, { examId, rows: parsed.records.length, counts, template: parsed.templateName, forms: parsed.forms?.length || 1, renamed: aligned.renamed, missing: aligned.missing, merged: sessions.merged.length });
  return json({ ok: true, batchId, detection: { templateId: parsed.templateId, templateName: parsed.templateName, confidence: parsed.confidence, forms: parsed.forms }, counts, total: parsed.records.length, status: finalStatus, notes: fileNotes, missingSubjects: aligned.missing });
}

export async function getScanBatch(env: Env, user: AuthUser, batchId: string): Promise<Response> {
  if (!canEvaluateExam(user.role)) return forbidden();
  const batch = await one<any>(env.DB.prepare('SELECT * FROM scan_batches WHERE id=?').bind(batchId));
  if (!batch) return notFound();
  if (!(await userCanAccessInstitution(env.DB, user, batch.institution_id))) return forbidden();
  const records = await all<any>(env.DB.prepare(`SELECT r.*, s.first_name || ' ' || s.last_name matched_name FROM scan_records r LEFT JOIN student_entities s ON s.id=r.matched_student_id WHERE batch_id=? ORDER BY row_no`).bind(batchId));
  const mapped = records.map((r) => ({ ...r, canonical: JSON.parse(r.canonical_json) as CanonicalRecord, issues: (r.issues_json ? JSON.parse(r.issues_json) : []) as string[] }));
  const pendingBooklet = mapped.filter((r) => r.resolution_status !== 'CANCELLED' && (r.issues.some(isBookletIssue) || !primaryBooklet(r.canonical)));
  if (pendingBooklet.length) {
    const [booklets, subjects, keys] = await Promise.all([
      all<{ code: string }>(env.DB.prepare('SELECT code FROM exam_booklets WHERE exam_id=? AND active=1 ORDER BY code').bind(batch.exam_id)),
      all<{ subject_id: string; code: string; question_count: number; wrong_divisor: number }>(env.DB.prepare('SELECT es.subject_id,s.code,es.question_count,es.wrong_divisor FROM exam_subjects es JOIN subjects s ON s.id=es.subject_id WHERE es.exam_id=?').bind(batch.exam_id)),
      all<{ subject_id: string; booklet_code: string; question_no: number; correct_answer: string; printed_question_no?: number; accepted_answers?: string | null; question_status?: string }>(env.DB.prepare('SELECT q.subject_id,ak.booklet_code,q.question_no,ak.correct_answer,ak.accepted_answers,coalesce(ak.question_status,q.question_status,\'ACTIVE\') question_status,coalesce(bqo.printed_question_no,q.question_no) printed_question_no FROM exam_questions q JOIN answer_keys ak ON ak.exam_question_id=q.id LEFT JOIN exam_question_booklet_orders bqo ON bqo.exam_question_id=q.id AND bqo.booklet_code=ak.booklet_code WHERE q.exam_id=?').bind(batch.exam_id)),
    ]);
    const codes = booklets.map((b) => b.code);
    const exam = await one<any>(env.DB.prepare('SELECT e.scoring_override_json,srv.config_json FROM exams e LEFT JOIN scoring_rule_versions srv ON srv.id=e.scoring_rule_version_id WHERE e.id=?').bind(batch.exam_id));
    const divisor = bookletDivisor(exam);
    for (const row of pendingBooklet) row.bookletOptions = compareBooklets(row.canonical, codes, subjects, keys, divisor);
  }
  const duplicates = duplicateStudentConflicts(records);
  const duplicateRows = new Set(duplicates.flatMap((d) => d.rows));
  for (const r of mapped) if (duplicateRows.has(r.row_no)) (r as any).duplicateOf = duplicates.find((d) => d.rows.includes(r.row_no))!.rows.filter((n) => n !== r.row_no);
  const counts = {
    duplicates: duplicateRows.size,
    active: mapped.filter((r) => r.match_status === 'ACTIVE_MATCH').length,
    guest: mapped.filter((r) => r.match_status === 'GUEST_MATCH').length,
    newGuest: mapped.filter((r) => r.match_status === 'NEW_GUEST').length,
    ambiguous: mapped.filter((r) => r.match_status === 'AMBIGUOUS').length,
    invalid: mapped.filter((r) => r.match_status === 'INVALID' && r.resolution_status !== 'CANCELLED').length,
    cancelled: mapped.filter((r) => r.resolution_status === 'CANCELLED').length,
    pending: mapped.filter((r) => r.resolution_status !== 'CANCELLED' && (['NEW_GUEST', 'AMBIGUOUS', 'INVALID'].includes(r.match_status) || r.issues.length > 0)).length,
  };
  return json({ ok: true, batch, records: mapped, counts, duplicates });
}

function bookletDivisor(exam: any): (subject: { wrong_divisor: number }) => number {
  let config: any = {}, override: any = null;
  try { config = JSON.parse(exam?.config_json || '{}'); } catch { /* none */ }
  try { override = JSON.parse(exam?.scoring_override_json || 'null'); } catch { /* none */ }
  const method = scoreMethodFor(config);
  return (subject) => effectiveWrongDivisor(subject.wrong_divisor, method, override);
}

export async function resolveScanRecord(request: Request, env: Env, user: AuthUser, batchId: string, recordId: string): Promise<Response> {
  if (!canEvaluateExam(user.role)) return forbidden();
  const batch = await one<any>(env.DB.prepare('SELECT * FROM scan_batches WHERE id=?').bind(batchId));
  if (!batch) return notFound();
  if (!(await userCanAccessInstitution(env.DB, user, batch.institution_id))) return forbidden();
  return withExamOperationLock(env,batch.exam_id,'SCAN_RESOLVE',async(env)=>{
  const currentBatch=await one<any>(env.DB.prepare('SELECT * FROM scan_batches WHERE id=?').bind(batchId));
  if(!currentBatch)return notFound();
  if(currentBatch.status==='COMMITTED')return badRequest('Değerlendirilmiş kayıt değiştirilemez.');
  const publicationGate=await examPublicationGuard(env,batch.exam_id);if(publicationGate)return publicationGate;
  const before = await one<any>(env.DB.prepare('SELECT matched_student_id,match_status,match_confidence,resolution_status,issues_json,canonical_json FROM scan_records WHERE id=? AND batch_id=?').bind(recordId, batchId));
  if (!before) return notFound('Optik satırı bulunamadı.');
  if (before.resolution_status === 'CANCELLED') return badRequest('İptal edilmiş satır değiştirilemez.');
  if (batch.status === 'COMMITTED') return badRequest('Değerlendirilmiş kayıt değiştirilemez.');
  const body = await request.json<{ studentId?: string; asNewGuest?: boolean; bookletCode?: string; action?: 'MATCH' | 'GUEST' | 'CANCEL' | 'BOOKLET' }>();
  const action = body.action || (body.studentId ? 'MATCH' : body.asNewGuest ? 'GUEST' : null);
  const canonical = JSON.parse(before.canonical_json) as CanonicalRecord;
  const existingIssues = JSON.parse(before.issues_json || '[]') as string[];
  let issues = existingIssues;
  let studentId = before.matched_student_id as string | null;
  let matchStatus = before.match_status as string;
  let confidence = Number(before.match_confidence);
  let bookletDecision: Record<string, unknown> | undefined;
  if (action === 'MATCH' && body.studentId) {
    const candidate = await one<any>(env.DB.prepare(`SELECT s.id,s.status FROM student_entities s JOIN student_enrollments e ON e.student_id=s.id WHERE s.id=? AND e.institution_id=? AND e.season_id=? AND e.status='ACTIVE'`).bind(body.studentId, batch.institution_id, batch.season_id));
    if (!candidate) return badRequest('Seçilen öğrenci bu kurum/sezonda bulunamadı.');
    const siblings = await all<any>(env.DB.prepare(`SELECT id,row_no,matched_student_id,resolution_status,canonical_json FROM scan_records WHERE batch_id=? AND id<>? AND matched_student_id=?`).bind(batchId, recordId, candidate.id));
    const clash = duplicateStudentConflicts([...siblings, { row_no: Number((await one<any>(env.DB.prepare('SELECT row_no FROM scan_records WHERE id=?').bind(recordId)))?.row_no || 0), matched_student_id: candidate.id, canonical_json: before.canonical_json }]);
    if (clash.length) return json({ ok: false, error: { code: 'STUDENT_ALREADY_IN_BATCH', message: duplicateMessage(clash) } }, 409);
    studentId = candidate.id;
    matchStatus = candidate.status === 'ACTIVE' ? 'ACTIVE_MATCH' : 'GUEST_MATCH';
    confidence = 1;
    issues = existingIssues.filter((issue) => canonical.issues.includes(issue) || isBookletIssue(issue) || issue.startsWith('KRİTİK:'));
  } else if (action === 'GUEST') {
    if (!canonical.name?.trim()) return badRequest('Misafir katılımcı için ad soyad girilmelidir.');
    studentId = null;
    matchStatus = 'GUEST_MATCH';
    confidence = 1;
    issues = existingIssues.filter((issue) => canonical.issues.includes(issue) || isBookletIssue(issue) || issue.startsWith('KRİTİK:'));
  } else if (action === 'BOOKLET') {
    const code = String(body.bookletCode || '').trim().toUpperCase();
    const allowed = await all<{ code: string }>(env.DB.prepare('SELECT code FROM exam_booklets WHERE exam_id=? AND active=1').bind(batch.exam_id));
    if (!allowed.some((b) => b.code.toUpperCase() === code)) return badRequest('Seçilen kitapçık sınavda tanımlı değil.');
    const [subjects, keys] = await Promise.all([
      all<{ subject_id: string; code: string; question_count: number; wrong_divisor: number }>(env.DB.prepare('SELECT es.subject_id,s.code,es.question_count,es.wrong_divisor FROM exam_subjects es JOIN subjects s ON s.id=es.subject_id WHERE es.exam_id=?').bind(batch.exam_id)),
      all<{ subject_id: string; booklet_code: string; question_no: number; correct_answer: string; printed_question_no?: number; accepted_answers?: string | null; question_status?: string }>(env.DB.prepare('SELECT q.subject_id,ak.booklet_code,q.question_no,ak.correct_answer,ak.accepted_answers,coalesce(ak.question_status,q.question_status,\'ACTIVE\') question_status,coalesce(bqo.printed_question_no,q.question_no) printed_question_no FROM exam_questions q JOIN answer_keys ak ON ak.exam_question_id=q.id LEFT JOIN exam_question_booklet_orders bqo ON bqo.exam_question_id=q.id AND bqo.booklet_code=ak.booklet_code WHERE q.exam_id=?').bind(batch.exam_id)),
    ]);
    const exam = await one<any>(env.DB.prepare('SELECT e.scoring_override_json,srv.config_json FROM exams e LEFT JOIN scoring_rule_versions srv ON srv.id=e.scoring_rule_version_id WHERE e.id=?').bind(batch.exam_id));
    const validOwn = { ...canonical, booklet_by_subject: canonical.booklet_by_subject ? Object.fromEntries(Object.entries(canonical.booklet_by_subject).filter(([, b]) => allowed.some((x) => x.code.toUpperCase() === b))) : undefined };
    const options = compareBooklets(validOwn, allowed.map((b) => b.code.toUpperCase()).sort(), subjects, keys, bookletDivisor(exam));
    const chosen = options.find((o) => o.code === code);
    if (!chosen?.available) return badRequest('Kitapçık için ders yanıtı veya cevap anahtarı eksik.');
    // A027: keep what the person saw when deciding — the previous code and every option's net — in the audit trail.
    bookletDecision = { from: canonical.booklet || null, to: code, options: options.map((o: any) => ({ code: o.code, available: o.available, net: o.net ?? null, correct: o.correct ?? null, wrong: o.wrong ?? null })) };
    canonical.booklet = code;
    // A028b: a session sheet whose own booklet was unreadable or invalid takes the chosen booklet.
    if (canonical.booklet_by_subject) for (const [subjectCode, b] of Object.entries(canonical.booklet_by_subject)) if (!allowed.some((x) => x.code.toUpperCase() === b)) delete canonical.booklet_by_subject[subjectCode];
    canonical.issues = canonical.issues.filter((issue) => !isBookletIssue(issue));
    issues = existingIssues.filter((issue) => !isBookletIssue(issue));
  } else if (action === 'CANCEL') {
    studentId = null;
    matchStatus = 'INVALID';
    confidence = 0;
    issues = ['Kurum tarafından iptal edildi.'];
  } else return badRequest('Eşleştirme veya kitapçık kararı eksik.');
  const unresolved = ['NEW_GUEST','AMBIGUOUS','INVALID'].includes(matchStatus) || issues.length > 0;
  const resolutionStatus = action === 'CANCEL' ? 'CANCELLED' : unresolved ? 'PENDING' : 'RESOLVED';
  const details={batchId,decision:action,bookletCode:action==='BOOKLET'?canonical.booklet:undefined,booklet:bookletDecision,
    before:{matchedStudentId:before.matched_student_id,matchStatus:before.match_status,resolutionStatus:before.resolution_status,issueCount:existingIssues.length},
    after:{matchedStudentId:studentId,matchStatus,resolutionStatus,issueCount:issues.length}};
  await env.DB.batch([
    env.DB.prepare(`UPDATE scan_records SET matched_student_id=?,match_status=?,match_confidence=?,resolution_status=?,issues_json=?,canonical_json=? WHERE id=? AND batch_id=?`)
      .bind(studentId,matchStatus,confidence,resolutionStatus,JSON.stringify(issues),JSON.stringify({...canonical,tckn:undefined}),recordId,batchId),
    env.DB.prepare(`UPDATE scan_batches SET status=CASE WHEN EXISTS(SELECT 1 FROM scan_records WHERE batch_id=? AND resolution_status!='CANCELLED' AND (match_status IN ('NEW_GUEST','AMBIGUOUS','INVALID') OR issues_json!='[]')) THEN 'NEEDS_REVIEW' ELSE 'READY' END WHERE id=?`).bind(batchId,batchId),
    env.DB.prepare('INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,?,?,?,?,?)')
      .bind(uuid('aud'),user.id,batch.institution_id,'SCAN_RECORD_DECISION_RECORDED','scan_record',recordId,JSON.stringify(sanitizeAuditDetails(details))),
  ]);
  return json({ ok: true });
  });
}

export async function searchScanCandidates(env: Env, user: AuthUser, batchId: string, recordId: string, url: URL): Promise<Response> {
  if (!canEvaluateExam(user.role)) return forbidden();
  const batch = await one<any>(env.DB.prepare('SELECT institution_id,season_id FROM scan_batches WHERE id=?').bind(batchId));
  if (!batch) return notFound();
  if (!(await userCanAccessInstitution(env.DB, user, batch.institution_id))) return forbidden();
  const record = await one<any>(env.DB.prepare('SELECT id FROM scan_records WHERE id=? AND batch_id=?').bind(recordId, batchId));
  if (!record) return notFound('Optik satırı bulunamadı.');
  const q = normalizeName(url.searchParams.get('q') || '').slice(0, 80);
  const like = `%${q}%`;
  const identityNumber=/^\d{11}$/.test(q)?q:'';
  const rows = await all<any>(env.DB.prepare(`SELECT s.id,s.first_name,s.last_name,s.status,e.student_number,e.grade_level,e.section,e.class_id
    FROM student_entities s JOIN student_enrollments e ON e.student_id=s.id
    WHERE e.institution_id=? AND e.season_id=? AND e.status='ACTIVE' AND s.status IN ('ACTIVE','GUEST')
      AND (?='' OR s.normalized_name LIKE ? OR e.student_number LIKE ? OR (?<>'' AND s.tckn=?))
    ORDER BY CASE WHEN ?<>'' AND s.tckn=? THEN 0 WHEN e.student_number=? THEN 1 WHEN s.normalized_name=? THEN 2 ELSE 3 END,e.grade_level,e.section,s.normalized_name
    LIMIT 30`).bind(batch.institution_id, batch.season_id, q, like, like, identityNumber, identityNumber, identityNumber, identityNumber, q, q));
  return json({ ok: true, candidates: rows });
}

/** S035: checks every row before anything is written (booklet, key, duplicates, scoring rule). Returns null when ready. */
async function validateBatchForEvaluation(env: Env, user: AuthUser, batchId: string): Promise<Response | null> {
  if (!canEvaluateExam(user.role)) return forbidden();
  const batch = await one<any>(env.DB.prepare('SELECT * FROM scan_batches WHERE id=?').bind(batchId));
  if (!batch) return notFound();
  if (!(await userCanAccessInstitution(env.DB, user, batch.institution_id))) return forbidden();
  // S035: checks first (nothing written if a row is not ready), then the set-based engine shared with the app.
  const checked = await withExamOperationLock(env,batch.exam_id,'EVALUATE',async(env)=>{
  const networkPublication=await one<any>(env.DB.prepare("SELECT id FROM exam_administrations WHERE exam_id=? AND channel='RESULT_NETWORK' AND ranking_frozen_at IS NOT NULL LIMIT 1").bind(batch.exam_id));
  // D-S037 (owner, 28 Oct): a published result-network exam keeps taking new uploads; their students join the live
  // ranks. Only re-evaluating an upload that is already in the publication is refused.
  if(networkPublication&&batch.status==='COMMITTED')return badRequest('Sonuç Ağı yayını düzeltmeye açılmadan değerlendirme yapılamaz.','RESULTS_FROZEN');
  const publication = await one<{ result_freeze_status: string }>(env.DB.prepare('SELECT result_freeze_status FROM exam_delivery_profiles WHERE exam_id=?').bind(batch.exam_id));
  if (publication && ['FROZEN', 'PUBLISHED'].includes(publication.result_freeze_status)) {
    return badRequest('Dondurulmuş veya yayımlanmış sonuçlar yeniden değerlendirilemez. Düzeltme için yeni sonuç sürümü hazırlanmalıdır.', 'RESULTS_FROZEN');
  }
  if (!['READY','COMMITTED'].includes(batch.status)) return badRequest('Önce sorunlu kayıtları düzeltin.', 'BATCH_NEEDS_REVIEW');
  const unresolvedRows = await one<{ c: number }>(env.DB.prepare(`SELECT count(*) c FROM scan_records WHERE batch_id=? AND resolution_status!='CANCELLED' AND (match_status IN ('NEW_GUEST','AMBIGUOUS','INVALID') OR issues_json!='[]')`).bind(batchId));
  if ((unresolvedRows?.c || 0) > 0) return badRequest('Önce sorunlu kayıtları düzeltin.', 'BATCH_NEEDS_REVIEW');
  const dupes = duplicateStudentConflicts(await all<any>(env.DB.prepare('SELECT row_no,matched_student_id,resolution_status,canonical_json FROM scan_records WHERE batch_id=?').bind(batchId)));
  if (dupes.length) return badRequest(duplicateMessage(dupes), 'DUPLICATE_STUDENT_IN_BATCH');
  const exam = await one<any>(env.DB.prepare(`SELECT e.*, srv.verified, srv.id scoring_version_id, srv.config_json, sr.authority FROM exams e LEFT JOIN scoring_rule_versions srv ON srv.id=e.scoring_rule_version_id LEFT JOIN scoring_rules sr ON sr.id=srv.rule_id WHERE e.id=?`).bind(batch.exam_id));
  if (!exam) return notFound('Sınav bulunamadı.');
  const examScope = await examEvaluationAccess(env, exam, batch.institution_id, true);
  if (examScope) return examScope;
  if (!exam.scoring_version_id) return badRequest('Sınavın puanlama kuralı tanımlı değil.', 'SCORING_RULE_REQUIRED');
  assertScoringRuleVerified({ verified: exam.verified, authority: exam.authority });
  const scoringConfig = (() => { try { return JSON.parse(exam.config_json || '{}'); } catch { return {}; } })();
  const scoreMethod = scoreMethodFor(scoringConfig);
  const scoringOverride = (() => { try { return JSON.parse(exam.scoring_override_json || 'null'); } catch { return null; } })();
  const subjects = await all<any>(env.DB.prepare(`SELECT es.subject_id, s.code, s.name, es.question_count, es.wrong_divisor FROM exam_subjects es JOIN subjects s ON s.id=es.subject_id WHERE es.exam_id=? ORDER BY es.sort_order`).bind(exam.id));
  const booklets = await all<{ code: string }>(env.DB.prepare('SELECT code FROM exam_booklets WHERE exam_id=? AND active=1').bind(exam.id));
  const keyRows = await all<any>(env.DB.prepare(`SELECT q.id question_id,q.subject_id,q.question_no,s.code subject_code,ak.booklet_code,ak.correct_answer,ak.accepted_answers,coalesce(ak.question_status,q.question_status,'ACTIVE') question_status,coalesce(bqo.printed_question_no,q.question_no) printed_question_no,
    group_concat(qo.outcome_id) outcome_ids
    FROM exam_questions q JOIN subjects s ON s.id=q.subject_id JOIN answer_keys ak ON ak.exam_question_id=q.id
    LEFT JOIN exam_question_booklet_orders bqo ON bqo.exam_question_id=q.id AND bqo.booklet_code=ak.booklet_code
    LEFT JOIN question_outcomes qo ON qo.exam_question_id=q.id WHERE q.exam_id=?
    GROUP BY q.id,ak.booklet_code ORDER BY q.subject_id,q.question_no`).bind(exam.id));
  const records = await all<any>(env.DB.prepare(`SELECT * FROM scan_records WHERE batch_id=? ORDER BY row_no`).bind(batchId));
  // Validate every row before creating guests or mutating existing results.
  for (const row of records) {
    if (row.resolution_status === 'CANCELLED') continue;
    const record = JSON.parse(row.canonical_json) as CanonicalRecord;
    const booklet = primaryBooklet(record) || (booklets.length === 1 ? booklets[0].code : '');
    if (!booklets.some((b) => b.code === booklet)) return badRequest(`Satır ${row.row_no} için kitapçık seçin.`, 'BOOKLET_REQUIRED');
    if (Object.keys(record.answers_by_subject || {}).some((code) => subjects.some((x: any) => x.code === code) && !booklets.some((b) => b.code === subjectBooklet(record, code, booklet)))) return badRequest(`Satır ${row.row_no} için kitapçık seçin.`, 'BOOKLET_REQUIRED');
    const preview = compareBooklets(record, [booklet], subjects, keyRows)[0];
    if (!preview.available) return badRequest(`Satır ${row.row_no}: ders yanıtı veya cevap anahtarı eksik.`, 'ANSWER_KEY_INCOMPLETE');
  }
  return json({ ok: true, validated: true });
  });
  if (!checked.ok) return checked;
  const verdict: any = await checked.clone().json().catch(() => null);
  return verdict?.validated ? null : checked;
}

export async function evaluateBatch(env: Env, user: AuthUser, batchId: string): Promise<Response> {
  const invalid = await validateBatchForEvaluation(env, user, batchId);
  if (invalid) return invalid;
  const batch = await one<any>(env.DB.prepare('SELECT exam_id FROM scan_batches WHERE id=?').bind(batchId));
  const { evaluateBatchChunk } = await import('./chunked-evaluation-entry');
  for (let step = 0; step < 200; step++) {
    const response = await evaluateBatchChunk(env, user, batchId);
    if (!response.ok) return response;
    const payload: any = await response.clone().json();
    if (payload?.done) return json({ ok: true, processed: payload.processed, batchId, examId: batch.exam_id });
  }
  return json({ ok: false, error: { code: 'EVALUATION_INCOMPLETE', message: 'Değerlendirme tamamlanamadı; işlem güvenle tekrar denenebilir.' } }, 500);
}

/** S035: one step for clients that show progress (sonuc): rows are checked before the first write, then chunks run
 * for up to ~20 s; the answer says how many students are done. Call again while `done` is false. */
export async function evaluateBatchStep(env: Env, user: AuthUser, batchId: string): Promise<Response> {
  const started = await one<{ c: number }>(env.DB.prepare('SELECT count(*) c FROM scan_evaluation_progress WHERE batch_id=?').bind(batchId));
  const status = await one<{ status: string }>(env.DB.prepare('SELECT status FROM scan_batches WHERE id=?').bind(batchId));
  if (!Number(started?.c || 0) && status?.status !== 'COMMITTED') { const invalid = await validateBatchForEvaluation(env, user, batchId); if (invalid) return invalid; }
  const { evaluateBatchChunk } = await import('./chunked-evaluation-entry');
  return evaluateBatchChunk(env, user, batchId);
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
    WHERE ep.student_id=? ${isLearnerRole(user.role) ? `AND ${publishedForLearnersSql('e.id')}` : ''} ORDER BY coalesce(e.exam_date,er.created_at) DESC`).bind(studentId));
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
  const rows = await aggregateStudentOutcomes(env.DB, studentId, threshold, minEvidence, undefined, 200, subjectFilter, isLearnerRole(user.role));
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

async function listOpticalTemplates(env: Env, user: AuthUser, url: URL): Promise<Response> {
  if (!['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role)) return forbidden();
  const institutionId = user.role === 'SUPER_ADMIN' ? url.searchParams.get('institutionId') : user.institution_id;
  const scope = user.role === 'SUPER_ADMIN' && !institutionId
    ? { sql: '', params: [] as unknown[] }
    : {
        sql: ` AND (
          (t.owner_type='INSTITUTION' AND t.owner_id=?)
          OR (
            t.owner_type='CENTRAL'
            AND t.status='READY'
            AND EXISTS (
              SELECT 1 FROM optical_template_versions published
              WHERE published.template_id=t.id AND published.active=1
            )
          )
        )`,
        params: [institutionId],
      };
  const rows = await all<any>(env.DB.prepare(`SELECT t.id template_id,t.name,t.vendor,t.status,t.owner_type,t.owner_id,v.id version_id,v.version,v.page_width_mm,v.page_height_mm,
    v.parser_definition IS NOT NULL has_parser,v.camera_geometry IS NOT NULL has_camera,v.print_fields IS NOT NULL has_print
    FROM optical_templates t LEFT JOIN optical_template_versions v ON v.template_id=t.id AND v.active=1 WHERE t.active=1 ${scope.sql} ORDER BY t.sort_order,t.name`).bind(...scope.params));
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
  const template = await one<any>(env.DB.prepare(`SELECT v.*,t.name template_name,t.owner_type,t.owner_id FROM optical_template_versions v JOIN optical_templates t ON t.id=v.template_id WHERE v.id=? AND t.active=1 AND (t.owner_type='CENTRAL' OR (t.owner_type='INSTITUTION' AND t.owner_id=?))`).bind(body.templateVersionId, printer.institution_id));
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
  let templateVersionId = url.searchParams.get('templateVersionId');
  const examId = url.searchParams.get('examId');
  if (!templateVersionId && examId) {
    const requestedBooklet = (url.searchParams.get('bookletSet') || 'A').split(',')[0].trim().toUpperCase();
    const binding = await one<{ optical_template_version_id: string }>(env.DB.prepare(`SELECT b.optical_template_version_id FROM exam_optical_bindings b WHERE b.exam_id=? AND b.booklet_code=? AND b.active=1`).bind(examId, requestedBooklet));
    templateVersionId = binding?.optical_template_version_id || null;
  }
  const sort = url.searchParams.get('sort') === 'name' ? 'name' : 'number';
  if (!classId || !templateVersionId) return badRequest('Sınıf ve optik şablon seçilmelidir.');
  const c = await one<any>(env.DB.prepare('SELECT * FROM classes WHERE id=?').bind(classId));
  if (!c || !(await userCanAccessInstitution(env.DB, user, c.institution_id))) return forbidden();
  const template = await one<any>(env.DB.prepare(`SELECT v.*,t.name,t.owner_type,t.owner_id FROM optical_template_versions v JOIN optical_templates t ON t.id=v.template_id WHERE v.id=? AND t.active=1 AND (t.owner_type='CENTRAL' OR (t.owner_type='INSTITUTION' AND t.owner_id=?))`).bind(templateVersionId, c.institution_id));
  if (!template) return notFound('Optik şablon bulunamadı.');
  if (!template.print_fields) return badRequest('Bu optik için baskı koordinatları henüz tanımlanmamış.', 'TEMPLATE_DEFINITION_REQUIRED');
  const rows = await all<any>(env.DB.prepare(`SELECT s.id,s.first_name,s.last_name,e.student_number,e.grade_level,e.section FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id WHERE e.class_id=? AND s.status='ACTIVE' ORDER BY ${sort === 'name' ? 's.normalized_name' : `cast(e.student_number as integer),e.student_number`}`).bind(classId));
  return json({ ok: true, template: { id: template.id, name: template.name, pageWidthMm: template.page_width_mm, pageHeightMm: template.page_height_mm, printFields: JSON.parse(template.print_fields) }, class: c, students: rows });
}

/** A049: the new academic year must be exactly the next one of an active season of this institution. */
async function rolloverContext(env: Env, user: AuthUser, body: { institutionId?: string; fromSeasonId?: string; nextAcademicYear?: string; lastGrade?: number }) {
  const institutionId = resolveInstitutionId(user, body.institutionId || null);
  if (!institutionId || !body.fromSeasonId || !body.nextAcademicYear) return { error: badRequest('Kurum, mevcut sezon ve yeni akademik yıl gerekli.') };
  if (!(await userCanAccessInstitution(env.DB, user, institutionId))) return { error: forbidden() };
  const from = await one<any>(env.DB.prepare('SELECT * FROM institution_seasons WHERE id=? AND institution_id=?').bind(body.fromSeasonId, institutionId));
  if (!from) return { error: badRequest('Mevcut sezon bu kuruma ait değil.', 'SEASON_NOT_IN_INSTITUTION') };
  if (from.status !== 'ACTIVE') return { error: badRequest('Yalnız aktif sezondan geçiş yapılır.', 'SEASON_NOT_ACTIVE') };
  const m = /^(\d{4})-(\d{4})$/.exec(String(from.academic_year)); const expected = m ? `${Number(m[1]) + 1}-${Number(m[2]) + 1}` : null;
  if (!expected || body.nextAcademicYear !== expected) return { error: badRequest(`Yeni eğitim yılı ${expected ?? 'bir sonraki yıl'} olmalıdır.`, 'INVALID_NEXT_YEAR') };
  const lastGrade = Number(body.lastGrade);
  if (!Number.isInteger(lastGrade) || lastGrade < 1 || lastGrade > 12) return { error: badRequest('Kurumun son sınıfını seçin (ör. ortaokul 8, lise 12); bu sınıftakiler mezun sayılır.', 'LAST_GRADE_REQUIRED') };
  return { institutionId, from, lastGrade };
}
const rolloverTarget = (grade: number | null, lastGrade: number) => (!grade ? 'UNPLACED' : grade >= lastGrade ? 'GRADUATE' : 'PROMOTE');

async function rolloverPreview(request: Request, env: Env, user: AuthUser): Promise<Response> {
  if (!roleCanManageInstitution(user.role)) return forbidden();
  const body = await request.json<{ institutionId?: string; fromSeasonId?: string; nextAcademicYear?: string; lastGrade?: number }>();
  const c = await rolloverContext(env, user, body); if (c.error) return c.error;
  const rows = await all<any>(env.DB.prepare(`SELECT e.grade_level,count(*) count FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id WHERE e.institution_id=? AND e.season_id=? AND s.status='ACTIVE' AND e.status='ACTIVE' GROUP BY e.grade_level ORDER BY e.grade_level`).bind(c.institutionId, c.from.id));
  return json({ ok: true, nextAcademicYear: body.nextAcademicYear, lastGrade: c.lastGrade, groups: rows.map((r) => { const t = rolloverTarget(r.grade_level, c.lastGrade!); return { from: r.grade_level, to: t === 'PROMOTE' ? nextGrade(r.grade_level) : null, action: t, count: r.count }; }) });
}

/**
 * A049: year transition. The student keeps the same identity; a promoted student gets a new enrolment in the
 * new season one grade up and the old enrolment is archived; the last grade graduates. Results stay where
 * they were (exam participations keep their old season and class). The old season is closed. Licences of
 * the new season are not created here: that needs its own accepted scope.
 */
async function rolloverCommit(request: Request, env: Env, user: AuthUser): Promise<Response> {
  if (!roleCanManageInstitution(user.role)) return forbidden();
  const body = await request.json<{ institutionId?: string; fromSeasonId?: string; nextAcademicYear?: string; keepSections?: boolean; lastGrade?: number }>();
  const c = await rolloverContext(env, user, body); if (c.error) return c.error;
  const institutionId = c.institutionId!;
  let season = await one<any>(env.DB.prepare('SELECT * FROM institution_seasons WHERE institution_id=? AND academic_year=?').bind(institutionId, body.nextAcademicYear));
  if (!season) {
    const id = uuid('season');
    await env.DB.prepare(`INSERT INTO institution_seasons (id,institution_id,academic_year,status,started_at) VALUES(?,?,?,'ACTIVE',date('now'))`).bind(id, institutionId, body.nextAcademicYear).run();
    season = await one<any>(env.DB.prepare('SELECT * FROM institution_seasons WHERE id=?').bind(id));
  }
  const old = await all<any>(env.DB.prepare(`SELECT e.*,s.status student_status FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id WHERE e.institution_id=? AND e.season_id=? AND s.status='ACTIVE' AND e.status='ACTIVE'`).bind(institutionId, c.from.id));
  let promoted = 0, graduated = 0; const unplaced: string[] = [];
  for (const e of old) {
    const target = rolloverTarget(e.grade_level, c.lastGrade!);
    if (target === 'UNPLACED') { unplaced.push(e.student_id); continue; }
    if (target === 'GRADUATE') { await env.DB.prepare(`UPDATE student_enrollments SET status='GRADUATED' WHERE id=? AND status='ACTIVE'`).bind(e.id).run(); graduated++; continue; }
    const grade = nextGrade(e.grade_level)!;
    const section = body.keepSections === false ? null : e.section;
    let classId: string | null = null;
    if (section) {
      const cls = await one<any>(env.DB.prepare('SELECT id FROM classes WHERE season_id=? AND grade_level=? AND upper(section)=upper(?)').bind(season.id, grade, section));
      if (!cls) {
        classId = uuid('class');
        await env.DB.prepare('INSERT INTO classes (id,institution_id,season_id,grade_level,section,name) VALUES(?,?,?,?,?,?)').bind(classId, institutionId, season.id, grade, section, `${grade}/${section}`).run();
      } else classId = cls.id;
    }
    const statements: D1PreparedStatement[] = [env.DB.prepare(`UPDATE student_enrollments SET status='ARCHIVED' WHERE id=? AND status='ACTIVE'`).bind(e.id)];
    const exists = await one<any>(env.DB.prepare('SELECT id FROM student_enrollments WHERE student_id=? AND season_id=?').bind(e.student_id, season.id));
    if (!exists) statements.push(env.DB.prepare(`INSERT INTO student_enrollments (id,student_id,institution_id,season_id,class_id,student_number,grade_level,section,status) VALUES(?,?,?,?,?,?,?,?, 'ACTIVE')`)
      .bind(uuid('enr'), e.student_id, institutionId, season.id, classId, e.student_number, grade, section));
    await env.DB.batch(statements);
    promoted++;
  }
  // students without a grade stay in the old season until someone places them; otherwise the old season closes
  if (!unplaced.length) await env.DB.prepare(`UPDATE institution_seasons SET status='CLOSED' WHERE id=? AND status='ACTIVE'`).bind(c.from.id).run();
  await audit(env.DB, user.id, institutionId, 'SEASON_ROLLOVER', 'season', season.id, { fromSeasonId: c.from.id, nextAcademicYear: body.nextAcademicYear, lastGrade: c.lastGrade, promoted, graduated, unplaced: unplaced.length, oldSeasonClosed: !unplaced.length });
  return json({ ok: true, seasonId: season.id, created: promoted, promoted, graduated, unplaced: unplaced.length, oldSeasonClosed: !unplaced.length });
}

async function importPreview(request: Request, env: Env, user: AuthUser): Promise<Response> {
  if (!roleCanManageInstitution(user.role)) return forbidden();
  const form = await request.formData();
  const file = form.get('file');
  const sourceSystem = (form.get('sourceSystem')?.toString() || 'GENERIC').toUpperCase();
  const institutionId = resolveInstitutionId(user, form.get('institutionId')?.toString() || null);
  if (!(file instanceof File) || !institutionId) return badRequest('Dosya ve kurum gerekli.');
  if (!(await userCanAccessInstitution(env.DB, user, institutionId))) return forbidden();
  const requestedSeason = form.get('seasonId')?.toString() || null;
  // A045: a season of another institution must never receive this institution's students
  if (requestedSeason && !(await one<any>(env.DB.prepare('SELECT 1 FROM institution_seasons WHERE id=? AND institution_id=?').bind(requestedSeason, institutionId)))) return badRequest('Eğitim yılı bu kuruma ait değil.', 'SEASON_NOT_IN_INSTITUTION');
  const seasonId = requestedSeason || (await currentSeason(env.DB, institutionId))?.id;
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
    let m: any = matchParticipant(canonical, candidates);
    // A045: duplicates inside the same file, and impossible grades, are never created silently
    const no = (r.student_number || '').trim(), nm = normalizeName(r.name || '');
    const firstSame = rows.findIndex((o, k) => k < i && ((no && (o.student_number || '').trim() === no) || (!no && !(o.student_number || '').trim() && normalizeName(o.name || '') === nm && o.class_name === r.class_name)));
    if (firstSame >= 0) m = { status: 'REVIEW_DUPLICATE', issues: [no ? `Dosyada ${no} numarası ${firstSame + 2}. satırda da var.` : `Aynı ad ve sınıf ${firstSame + 2}. satırda da var.`] };
    else if (r.grade_level !== undefined && (!Number.isInteger(r.grade_level) || r.grade_level < 1 || r.grade_level > 12)) m = { status: 'REVIEW_GRADE', issues: [`Sınıf düzeyi ${r.grade_level} geçersiz (1–12).`] };
    if (m.status === 'ACTIVE_MATCH' || m.status === 'GUEST_MATCH') matched++; else if (m.status === 'NEW_GUEST') newCount++; else review++;
    await env.DB.prepare(`INSERT INTO import_staging_rows (id,import_job_id,row_no,entity_type,source_json,mapped_json,match_status,issues_json) VALUES(?,?,?,?,?,?,?,?)`)
      .bind(uuid('isr'), id, i + 2, 'STUDENT', JSON.stringify(r), JSON.stringify({ matchedStudentId: m.student_id || null, candidates: m.candidates || [] }), m.status, JSON.stringify(m.issues)).run();
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

const IMPORT_REVIEW_STATUSES = ['AMBIGUOUS', 'INVALID', 'REVIEW_DUPLICATE', 'REVIEW_GRADE'];
/** A045: a person decides each row that needs review: link to an existing student of this institution, create new, or skip. */
async function importResolve(request: Request, env: Env, user: AuthUser, id: string, rowId: string): Promise<Response> {
  if (!roleCanManageInstitution(user.role)) return forbidden();
  const job = await one<any>(env.DB.prepare('SELECT * FROM import_jobs WHERE id=?').bind(id));
  if (!job || !(await userCanAccessInstitution(env.DB, user, job.institution_id))) return notFound();
  if (job.status === 'COMMITTED') return badRequest('Aktarım tamamlanmış; satır değiştirilemez.');
  const row = await one<any>(env.DB.prepare('SELECT * FROM import_staging_rows WHERE id=? AND import_job_id=?').bind(rowId, id));
  if (!row) return notFound();
  const body = await request.json<any>().catch(() => ({}));
  const action = String(body.action || '').toUpperCase();
  const mapped = row.mapped_json ? JSON.parse(row.mapped_json) : {};
  let status: string; let matchedStudentId: string | null = null;
  if (action === 'SKIP') status = 'RESOLVED_SKIP';
  else if (action === 'NEW') { if (row.match_status === 'REVIEW_GRADE') return badRequest('Sınıf düzeyi geçersiz satır yeni öğrenci olarak eklenemez; dosyayı düzeltin veya atlayın.'); status = 'RESOLVED_NEW'; }
  else if (action === 'MATCH') {
    const target = await one<any>(env.DB.prepare(`SELECT s.id,s.status FROM student_entities s JOIN student_enrollments e ON e.student_id=s.id WHERE s.id=? AND e.institution_id=? AND e.season_id=? LIMIT 1`).bind(String(body.studentId || ''), job.institution_id, job.season_id));
    if (!target) return badRequest('Öğrenci bu kurumun bu eğitim yılında kayıtlı değil.');
    status = target.status === 'GUEST' ? 'GUEST_MATCH' : 'ACTIVE_MATCH'; matchedStudentId = target.id;
  } else return badRequest('İşlem MATCH, NEW veya SKIP olmalıdır.');
  await env.DB.prepare('UPDATE import_staging_rows SET match_status=?,mapped_json=? WHERE id=?').bind(status, JSON.stringify({ ...mapped, matchedStudentId, resolvedBy: user.id, resolution: action }), rowId).run();
  const left = await one<any>(env.DB.prepare(`SELECT count(*) c FROM import_staging_rows WHERE import_job_id=? AND match_status IN (${IMPORT_REVIEW_STATUSES.map(() => '?').join(',')})`).bind(id, ...IMPORT_REVIEW_STATUSES));
  await env.DB.prepare('UPDATE import_jobs SET status=? WHERE id=?').bind(Number(left?.c || 0) ? 'NEEDS_REVIEW' : 'READY', id).run();
  await audit(env.DB, user.id, job.institution_id, 'IMPORT_ROW_RESOLVED', 'import_job', id, { rowNo: row.row_no, action, matchedStudentId });
  return json({ ok: true, status, remaining: Number(left?.c || 0) });
}

async function importCommit(env: Env, user: AuthUser, id: string): Promise<Response> {
  if (!roleCanManageInstitution(user.role)) return forbidden();
  const job = await one<any>(env.DB.prepare('SELECT * FROM import_jobs WHERE id=?').bind(id));
  if (!job || !(await userCanAccessInstitution(env.DB, user, job.institution_id))) return notFound();
  if (job.status === 'NEEDS_REVIEW') return badRequest('Kontrol gereken satırlar çözülmeden aktarım yapılamaz.');
  if (job.status === 'COMMITTED') return json({ ok: true, alreadyCommitted: true });
  const rows = await all<any>(env.DB.prepare('SELECT * FROM import_staging_rows WHERE import_job_id=? ORDER BY row_no').bind(id));
  if (rows.some((r) => IMPORT_REVIEW_STATUSES.includes(r.match_status))) return badRequest('Kontrol gereken satırlar çözülmeden aktarım yapılamaz.');
  let created = 0, reused = 0, skipped = 0; const conflicts: number[] = [];
  for (const row of rows) {
    const source = JSON.parse(row.source_json);
    const mapped = row.mapped_json ? JSON.parse(row.mapped_json) : {};
    if (row.match_status === 'RESOLVED_SKIP') { skipped++; continue; }
    if (mapped.matchedStudentId) { reused++; continue; }
    // A045: the number may have been taken since the preview; never create a second student with it
    if (source.student_number && await one<any>(env.DB.prepare('SELECT 1 FROM student_enrollments WHERE institution_id=? AND season_id=? AND student_number=?').bind(job.institution_id, job.season_id, String(source.student_number).trim()))) { conflicts.push(row.row_no); continue; }
    const names = splitName(source.name);
    const studentId = uuid('stu');
    const rowStatements: D1PreparedStatement[] = [env.DB.prepare(`INSERT INTO student_entities (id,first_name,last_name,normalized_name,status,activated_at) VALUES(?,?,?,?, 'ACTIVE',CURRENT_TIMESTAMP)`).bind(studentId, names.firstName, names.lastName, normalizeName(source.name))];
    let classId: string | null = null;
    if (source.grade_level && source.section) {
      let cls = await one<any>(env.DB.prepare('SELECT id FROM classes WHERE season_id=? AND grade_level=? AND upper(section)=upper(?)').bind(job.season_id, source.grade_level, source.section));
      if (!cls) {
        classId = uuid('class');
        await env.DB.prepare('INSERT INTO classes (id,institution_id,season_id,grade_level,section,name) VALUES(?,?,?,?,?,?)').bind(classId, job.institution_id, job.season_id, source.grade_level, source.section, `${source.grade_level}/${source.section}`).run();
      } else classId = cls.id;
    }
    rowStatements.push(env.DB.prepare(`INSERT INTO student_enrollments (id,student_id,institution_id,season_id,class_id,student_number,grade_level,section) VALUES(?,?,?,?,?,?,?,?)`).bind(uuid('enr'), studentId, job.institution_id, job.season_id, classId, source.student_number || null, source.grade_level || null, source.section || null));
    if (source.external_id) rowStatements.push(env.DB.prepare(`INSERT OR IGNORE INTO external_identities (id,institution_id,source_system,entity_type,external_id,internal_id) VALUES(?,?,?,?,?,?)`).bind(uuid('ext'), job.institution_id, job.source_system, 'STUDENT', source.external_id, studentId));
    await env.DB.batch(rowStatements);
    created++;
  }
  await env.DB.prepare(`UPDATE import_jobs SET status='COMMITTED',committed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();
  await audit(env.DB, user.id, job.institution_id, 'IMPORT_COMMITTED', 'import_job', id, { created, reused, skipped, conflicts });
  return json({ ok: true, created, reused, skipped, conflicts });
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

export async function ensureSeason(db: D1Database, institutionId: string, academicYear: string): Promise<any> {
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
  return all<MatchCandidate>(db.prepare(`SELECT s.id student_id,s.status,s.normalized_name,s.tckn,e.student_number,e.grade_level,e.section FROM student_entities s JOIN student_enrollments e ON e.student_id=s.id WHERE e.institution_id=? AND e.season_id=? AND s.status IN ('ACTIVE','GUEST')`).bind(institutionId, seasonId));
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

async function aggregateStudentOutcomes(db: D1Database, studentId: string, threshold: number, minEvidence: number, only?: 'DEVELOPING' | 'STRONG', limit = 200, subjectIds: string[] | null = null, publishedOnly = false): Promise<any[]> {
  const params: unknown[] = [studentId];
  let subjectFilter = '';
  if (subjectIds?.length) { subjectFilter = ` AND o.subject_id IN (${subjectIds.map(()=>'?').join(',')})`; params.push(...subjectIds); }
  const rows = await all<any>(db.prepare(`SELECT o.id,o.title,o.topic,o.subtopic,o.subject_id,s.name subject_name,
    sum(r.evidence_count) evidence_count,sum(r.correct_count) correct_count,
    case when sum(r.evidence_count)>0 then 1.0*sum(r.correct_count)/sum(r.evidence_count) else 0 end success_rate
    FROM outcome_results r JOIN outcomes o ON o.id=r.outcome_id JOIN subjects s ON s.id=o.subject_id
    WHERE r.student_id=? ${subjectFilter} ${publishedOnly ? `AND ${publishedForLearnersSql('r.exam_id')}` : ''} GROUP BY o.id ORDER BY success_rate ASC,evidence_count DESC`).bind(...params));
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
