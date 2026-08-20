import accessApp from './access-entry';
import type { AuthUser, Env, Role } from './types';
import { getAuthUser } from './lib/auth';
import { all, audit, one, uuid } from './lib/db';

export type ExamOwnerType = 'CENTRAL' | 'INSTITUTION';

export function canManageExamDefinitions(role: Role): boolean {
  return role === 'SUPER_ADMIN' || role === 'INSTITUTION_MANAGER';
}

export function ownerTypeAllowed(role: Role, ownerType: ExamOwnerType): boolean {
  if (role === 'SUPER_ADMIN') return ownerType === 'CENTRAL' || ownerType === 'INSTITUTION';
  return role === 'INSTITUTION_MANAGER' && ownerType === 'INSTITUTION';
}

export function normalizeBookletCodes(values: unknown[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    const code = String(value ?? '').trim().toUpperCase();
    if (!code || !/^[A-Z0-9]{1,4}$/.test(code)) continue;
    if (!out.includes(code)) out.push(code);
  }
  return out;
}

export function answerStringValid(value: string, questionCount: number): boolean {
  return value.length === questionCount && /^[A-Z]+$/.test(value);
}

function err(status: number, code: string, message: string, details?: unknown): Response {
  return Response.json({ ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } }, { status });
}

async function actor(env: Env, request: Request): Promise<AuthUser | Response> {
  const user = await getAuthUser(env, request);
  if (!user) return err(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  if (!canManageExamDefinitions(user.role)) return err(403, 'FORBIDDEN', 'Sınav tanımı yönetme yetkiniz bulunmuyor.');
  return user;
}

function requestedInstitution(user: AuthUser, url: URL, bodyInstitutionId?: string | null): string | null {
  if (user.role === 'SUPER_ADMIN') return bodyInstitutionId || url.searchParams.get('institutionId');
  return user.institution_id || null;
}

async function institutionAllowed(env: Env, user: AuthUser, institutionId: string): Promise<boolean> {
  if (user.role !== 'SUPER_ADMIN') return user.institution_id === institutionId;
  return Boolean(await one(env.DB.prepare('SELECT id FROM institutions WHERE id=?').bind(institutionId)));
}

async function managedExam(env: Env, user: AuthUser, examId: string): Promise<any | null> {
  const exam = await one<any>(env.DB.prepare(`
    SELECT e.*,srv.verified scoring_verified,sr.name scoring_name,sr.authority scoring_authority
    FROM exams e
    LEFT JOIN scoring_rule_versions srv ON srv.id=e.scoring_rule_version_id
    LEFT JOIN scoring_rules sr ON sr.id=srv.rule_id
    WHERE e.id=?
  `).bind(examId));
  if (!exam) return null;
  if (user.role === 'SUPER_ADMIN') return exam;
  if (exam.owner_type !== 'INSTITUTION' || exam.institution_id !== user.institution_id) return null;
  return exam;
}

async function options(env: Env, user: AuthUser, url: URL): Promise<Response> {
  const gradeLevelRaw = url.searchParams.get('gradeLevel');
  const subjectId = url.searchParams.get('subjectId');
  const gradeLevel = gradeLevelRaw ? Number(gradeLevelRaw) : null;
  const [subjects, scoringVersions, institutions] = await Promise.all([
    all<any>(env.DB.prepare(`SELECT id,code,name,category FROM subjects WHERE active=1 ORDER BY name`)),
    all<any>(env.DB.prepare(`
      SELECT srv.id,srv.academic_year,srv.version,srv.verified,srv.source_url,sr.code rule_code,sr.name rule_name,sr.authority,sr.official
      FROM scoring_rule_versions srv JOIN scoring_rules sr ON sr.id=srv.rule_id
      ORDER BY srv.verified DESC,srv.academic_year DESC,sr.name,srv.version
    `)),
    user.role === 'SUPER_ADMIN'
      ? all<any>(env.DB.prepare(`SELECT id,name,code,city,district,status FROM institutions ORDER BY status,name`))
      : Promise.resolve([]),
  ]);
  const params: unknown[] = [];
  let where = 'o.active=1';
  if (gradeLevel && Number.isInteger(gradeLevel)) { where += ' AND (o.grade_level=? OR o.grade_level IS NULL)'; params.push(gradeLevel); }
  if (subjectId) { where += ' AND o.subject_id=?'; params.push(subjectId); }
  const outcomes = await all<any>(env.DB.prepare(`
    SELECT o.id,o.subject_id,o.grade_level,o.code,o.topic,o.subtopic,o.title,o.official,s.name subject_name
    FROM outcomes o JOIN subjects s ON s.id=o.subject_id
    WHERE ${where}
    ORDER BY s.name,o.topic,o.title
    LIMIT 1000
  `).bind(...params));
  return Response.json({ ok: true, subjects, scoringVersions, institutions, outcomes });
}

async function listDefinitions(env: Env, user: AuthUser): Promise<Response> {
  const params: unknown[] = [];
  let where = '1=1';
  if (user.role === 'INSTITUTION_MANAGER') {
    where += ` AND e.owner_type='INSTITUTION' AND e.institution_id=?`;
    params.push(user.institution_id);
  }
  const exams = await all<any>(env.DB.prepare(`
    SELECT e.*,i.name institution_name,srv.verified scoring_verified,sr.name scoring_name,
      (SELECT count(*) FROM exam_subjects es WHERE es.exam_id=e.id) subject_count,
      (SELECT coalesce(sum(question_count),0) FROM exam_subjects es WHERE es.exam_id=e.id) question_count,
      (SELECT count(*) FROM exam_booklets eb WHERE eb.exam_id=e.id AND eb.active=1) booklet_count,
      (SELECT count(*) FROM answer_keys ak JOIN exam_questions q ON q.id=ak.exam_question_id WHERE q.exam_id=e.id) answer_count,
      (SELECT count(DISTINCT qo.exam_question_id) FROM question_outcomes qo JOIN exam_questions q ON q.id=qo.exam_question_id WHERE q.exam_id=e.id) outcome_mapped_count,
      (SELECT count(*) FROM exam_institutions ei WHERE ei.exam_id=e.id AND ei.enabled=1) institution_count,
      (SELECT count(*) FROM exam_participants ep WHERE ep.exam_id=e.id) participant_count
    FROM exams e
    LEFT JOIN institutions i ON i.id=e.institution_id
    LEFT JOIN scoring_rule_versions srv ON srv.id=e.scoring_rule_version_id
    LEFT JOIN scoring_rules sr ON sr.id=srv.rule_id
    WHERE ${where}
    ORDER BY CASE e.status WHEN 'DRAFT' THEN 0 WHEN 'ACTIVE' THEN 1 ELSE 2 END,coalesce(e.exam_date,'9999-12-31') DESC,e.title
  `).bind(...params));
  return Response.json({ ok: true, exams });
}

async function createDefinition(request: Request, env: Env, user: AuthUser): Promise<Response> {
  const body = await request.json<{
    ownerType?: ExamOwnerType;
    institutionId?: string | null;
    academicYear?: string;
    title?: string;
    examType?: string;
    gradeLevel?: number | null;
    examDate?: string | null;
    scoringRuleVersionId?: string | null;
  }>();
  const ownerType = body.ownerType || (user.role === 'SUPER_ADMIN' ? 'CENTRAL' : 'INSTITUTION');
  if (!ownerTypeAllowed(user.role, ownerType)) return err(403, 'OWNER_TYPE_FORBIDDEN', 'Bu sınav sahipliği türünü oluşturma yetkiniz bulunmuyor.');
  const title = body.title?.trim() || '';
  const academicYear = body.academicYear?.trim() || '';
  const examType = body.examType?.trim().toUpperCase() || '';
  if (!title || !/^20\d{2}-20\d{2}$/.test(academicYear) || !examType) return err(400, 'VALIDATION_ERROR', 'Sınav adı, eğitim yılı ve sınav türü gereklidir.');
  const gradeLevel = body.gradeLevel == null ? null : Number(body.gradeLevel);
  if (gradeLevel != null && (!Number.isInteger(gradeLevel) || gradeLevel < 1 || gradeLevel > 12)) return err(400, 'INVALID_GRADE', 'Sınıf düzeyi 1-12 arasında olmalıdır.');

  let institutionId: string | null = null;
  if (ownerType === 'INSTITUTION') {
    institutionId = requestedInstitution(user, new URL(request.url), body.institutionId || null);
    if (!institutionId) return err(400, 'INSTITUTION_REQUIRED', 'Kurum sınavında kurum seçilmelidir.');
    if (!(await institutionAllowed(env, user, institutionId))) return err(403, 'FORBIDDEN', 'Bu kuruma erişim yetkiniz bulunmuyor.');
  }
  if (body.scoringRuleVersionId) {
    const scoring = await one<any>(env.DB.prepare('SELECT id,verified FROM scoring_rule_versions WHERE id=?').bind(body.scoringRuleVersionId));
    if (!scoring) return err(404, 'SCORING_NOT_FOUND', 'Puanlama kuralı bulunamadı.');
  }
  const id = uuid('exam');
  await env.DB.prepare(`
    INSERT INTO exams (id,owner_type,institution_id,academic_year,title,exam_type,grade_level,exam_date,status,scoring_rule_version_id,sponsor_mode,created_by)
    VALUES (?,?,?,?,?,?,?,?, 'DRAFT',?,?,?)
  `).bind(
    id, ownerType, institutionId, academicYear, title, examType, gradeLevel,
    body.examDate || null, body.scoringRuleVersionId || null,
    ownerType === 'CENTRAL' ? 'ADMIN_SPONSORED' : 'INSTITUTION', user.id,
  ).run();
  await audit(env.DB, user.id, institutionId, 'EXAM_DEFINITION_CREATED', 'exam', id, { ownerType, academicYear, title, examType, gradeLevel });
  return Response.json({ ok: true, id }, { status: 201 });
}

async function readiness(env: Env, examId: string): Promise<any> {
  const row = await one<any>(env.DB.prepare(`
    SELECT
      (SELECT count(*) FROM exam_subjects WHERE exam_id=?) subject_count,
      (SELECT coalesce(sum(question_count),0) FROM exam_subjects WHERE exam_id=?) expected_questions,
      (SELECT count(*) FROM exam_questions WHERE exam_id=?) actual_questions,
      (SELECT count(*) FROM exam_booklets WHERE exam_id=? AND active=1) booklet_count,
      (SELECT count(*) FROM answer_keys ak JOIN exam_questions q ON q.id=ak.exam_question_id WHERE q.exam_id=?) actual_answers,
      (SELECT count(DISTINCT qo.exam_question_id) FROM question_outcomes qo JOIN exam_questions q ON q.id=qo.exam_question_id WHERE q.exam_id=?) outcome_mapped_questions,
      (SELECT coalesce(srv.verified,0) FROM exams e LEFT JOIN scoring_rule_versions srv ON srv.id=e.scoring_rule_version_id WHERE e.id=?) scoring_verified
  `).bind(examId, examId, examId, examId, examId, examId, examId));
  const expectedAnswers = Number(row?.expected_questions || 0) * Number(row?.booklet_count || 0);
  const readyToPublish = Number(row?.subject_count || 0) > 0
    && Number(row?.booklet_count || 0) > 0
    && Number(row?.actual_questions || 0) === Number(row?.expected_questions || 0)
    && Number(row?.actual_answers || 0) === expectedAnswers
    && Number(row?.scoring_verified || 0) === 1;
  return { ...row, expected_answers: expectedAnswers, ready_to_publish: readyToPublish };
}

async function getDefinition(env: Env, user: AuthUser, examId: string): Promise<Response> {
  const exam = await managedExam(env, user, examId);
  if (!exam) return err(404, 'NOT_FOUND', 'Sınav tanımı bulunamadı.');
  const [subjects, booklets, institutions, keys, ready] = await Promise.all([
    all<any>(env.DB.prepare(`SELECT es.*,s.code,s.name,s.category FROM exam_subjects es JOIN subjects s ON s.id=es.subject_id WHERE es.exam_id=? ORDER BY es.sort_order,s.name`).bind(examId)),
    all<any>(env.DB.prepare(`SELECT id,code,active FROM exam_booklets WHERE exam_id=? ORDER BY code`).bind(examId)),
    all<any>(env.DB.prepare(`SELECT ei.institution_id,ei.enabled,i.name,i.code FROM exam_institutions ei JOIN institutions i ON i.id=ei.institution_id WHERE ei.exam_id=? ORDER BY i.name`).bind(examId)),
    all<any>(env.DB.prepare(`
      SELECT q.id question_id,q.subject_id,q.question_no,q.global_no,ak.booklet_code,ak.correct_answer,
             group_concat(DISTINCT qo.outcome_id) outcome_ids
      FROM exam_questions q
      LEFT JOIN answer_keys ak ON ak.exam_question_id=q.id
      LEFT JOIN question_outcomes qo ON qo.exam_question_id=q.id
      WHERE q.exam_id=?
      GROUP BY q.id,ak.booklet_code
      ORDER BY q.global_no,ak.booklet_code
    `).bind(examId)),
    readiness(env, examId),
  ]);
  return Response.json({ ok: true, exam, subjects, booklets, institutions, answerKey: keys, readiness: ready });
}

async function updateGeneral(request: Request, env: Env, user: AuthUser, examId: string): Promise<Response> {
  const exam = await managedExam(env, user, examId);
  if (!exam) return err(404, 'NOT_FOUND', 'Sınav tanımı bulunamadı.');
  if (exam.status !== 'DRAFT') return err(409, 'EXAM_LOCKED', 'Aktif veya kapanmış sınavın temel tanımı değiştirilemez.');
  const body = await request.json<{ title?: string; examType?: string; gradeLevel?: number | null; examDate?: string | null; scoringRuleVersionId?: string | null }>();
  const title = body.title?.trim() || exam.title;
  const examType = body.examType?.trim().toUpperCase() || exam.exam_type;
  const gradeLevel = body.gradeLevel === undefined ? exam.grade_level : body.gradeLevel == null ? null : Number(body.gradeLevel);
  if (gradeLevel != null && (!Number.isInteger(gradeLevel) || gradeLevel < 1 || gradeLevel > 12)) return err(400, 'INVALID_GRADE', 'Sınıf düzeyi 1-12 arasında olmalıdır.');
  if (body.scoringRuleVersionId) {
    const scoring = await one<any>(env.DB.prepare('SELECT id FROM scoring_rule_versions WHERE id=?').bind(body.scoringRuleVersionId));
    if (!scoring) return err(404, 'SCORING_NOT_FOUND', 'Puanlama kuralı bulunamadı.');
  }
  await env.DB.prepare(`UPDATE exams SET title=?,exam_type=?,grade_level=?,exam_date=?,scoring_rule_version_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(title, examType, gradeLevel, body.examDate === undefined ? exam.exam_date : body.examDate || null,
      body.scoringRuleVersionId === undefined ? exam.scoring_rule_version_id : body.scoringRuleVersionId || null, examId).run();
  await audit(env.DB, user.id, exam.institution_id, 'EXAM_DEFINITION_UPDATED', 'exam', examId, { title, examType, gradeLevel });
  return Response.json({ ok: true });
}

async function replaceStructure(request: Request, env: Env, user: AuthUser, examId: string): Promise<Response> {
  const exam = await managedExam(env, user, examId);
  if (!exam) return err(404, 'NOT_FOUND', 'Sınav tanımı bulunamadı.');
  if (exam.status !== 'DRAFT') return err(409, 'EXAM_LOCKED', 'Sınav yapısı yalnız taslak durumunda değiştirilebilir.');
  const participant = await one<{ c: number }>(env.DB.prepare('SELECT count(*) c FROM exam_participants WHERE exam_id=?').bind(examId));
  if ((participant?.c || 0) > 0) return err(409, 'EXAM_HAS_RESULTS', 'Katılımcısı bulunan sınavın soru yapısı değiştirilemez.');
  const body = await request.json<{ booklets?: unknown[]; subjects?: Array<{ subjectId?: string; questionCount?: number; wrongDivisor?: number; sortOrder?: number }> }>();
  const booklets = normalizeBookletCodes(body.booklets || []);
  if (!booklets.length || booklets.length > 8) return err(400, 'INVALID_BOOKLETS', 'En az 1, en fazla 8 geçerli kitapçık tanımlayın.');
  const subjects = (body.subjects || []).map((s, index) => ({
    subjectId: String(s.subjectId || ''), questionCount: Number(s.questionCount), wrongDivisor: Number(s.wrongDivisor ?? 4), sortOrder: Number(s.sortOrder ?? index + 1),
  })).filter((s) => s.subjectId);
  if (!subjects.length) return err(400, 'SUBJECT_REQUIRED', 'En az bir ders tanımlayın.');
  if (new Set(subjects.map((s) => s.subjectId)).size !== subjects.length) return err(400, 'DUPLICATE_SUBJECT', 'Aynı ders birden fazla kez eklenemez.');
  for (const s of subjects) {
    if (!Number.isInteger(s.questionCount) || s.questionCount < 1 || s.questionCount > 200) return err(400, 'INVALID_QUESTION_COUNT', 'Ders soru sayısı 1-200 arasında olmalıdır.');
    if (!Number.isFinite(s.wrongDivisor) || s.wrongDivisor <= 0 || s.wrongDivisor > 20) return err(400, 'INVALID_WRONG_DIVISOR', 'Yanlış götürme böleni geçersiz.');
    const subject = await one(env.DB.prepare('SELECT id FROM subjects WHERE id=? AND active=1').bind(s.subjectId));
    if (!subject) return err(404, 'SUBJECT_NOT_FOUND', 'Seçilen derslerden biri bulunamadı.');
  }

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`DELETE FROM question_outcomes WHERE exam_question_id IN (SELECT id FROM exam_questions WHERE exam_id=?)`).bind(examId),
    env.DB.prepare(`DELETE FROM answer_keys WHERE exam_question_id IN (SELECT id FROM exam_questions WHERE exam_id=?)`).bind(examId),
    env.DB.prepare('DELETE FROM exam_questions WHERE exam_id=?').bind(examId),
    env.DB.prepare('DELETE FROM exam_subjects WHERE exam_id=?').bind(examId),
    env.DB.prepare('DELETE FROM exam_booklets WHERE exam_id=?').bind(examId),
  ];
  let globalNo = 1;
  for (const [index, s] of subjects.entries()) {
    statements.push(env.DB.prepare(`INSERT INTO exam_subjects (id,exam_id,subject_id,question_count,sort_order,wrong_divisor) VALUES(?,?,?,?,?,?)`)
      .bind(uuid('es'), examId, s.subjectId, s.questionCount, s.sortOrder || index + 1, s.wrongDivisor));
    for (let q = 1; q <= s.questionCount; q++) {
      statements.push(env.DB.prepare(`INSERT INTO exam_questions (id,exam_id,subject_id,question_no,global_no) VALUES(?,?,?,?,?)`)
        .bind(uuid('q'), examId, s.subjectId, q, globalNo++));
    }
  }
  for (const code of booklets) statements.push(env.DB.prepare(`INSERT INTO exam_booklets (id,exam_id,code,active) VALUES(?,?,?,1)`).bind(uuid('book'), examId, code));
  await env.DB.batch(statements);
  await audit(env.DB, user.id, exam.institution_id, 'EXAM_STRUCTURE_REPLACED', 'exam', examId, { booklets, subjects });
  return Response.json({ ok: true, questionCount: globalNo - 1, booklets });
}

async function replaceAnswerKey(request: Request, env: Env, user: AuthUser, examId: string): Promise<Response> {
  const exam = await managedExam(env, user, examId);
  if (!exam) return err(404, 'NOT_FOUND', 'Sınav tanımı bulunamadı.');
  if (exam.status !== 'DRAFT') return err(409, 'EXAM_LOCKED', 'Cevap anahtarı yalnız taslak sınavda değiştirilebilir.');
  const body = await request.json<{
    entries?: Array<{ subjectId?: string; bookletCode?: string; answers?: string }>;
    outcomeMappings?: Array<{ subjectId?: string; questionNo?: number; outcomeId?: string }>;
  }>();
  const subjects = await all<any>(env.DB.prepare(`SELECT subject_id,question_count FROM exam_subjects WHERE exam_id=? ORDER BY sort_order`).bind(examId));
  const booklets = await all<{ code: string }>(env.DB.prepare(`SELECT code FROM exam_booklets WHERE exam_id=? AND active=1 ORDER BY code`).bind(examId));
  if (!subjects.length || !booklets.length) return err(409, 'STRUCTURE_REQUIRED', 'Önce ders ve kitapçık yapısını kaydedin.');
  const entryMap = new Map<string, string>();
  for (const entry of body.entries || []) {
    const subjectId = String(entry.subjectId || '');
    const bookletCode = String(entry.bookletCode || '').trim().toUpperCase();
    const answers = String(entry.answers || '').replace(/\s+/g, '').toUpperCase();
    entryMap.set(`${subjectId}::${bookletCode}`, answers);
  }
  for (const subject of subjects) {
    for (const booklet of booklets) {
      const answers = entryMap.get(`${subject.subject_id}::${booklet.code}`) || '';
      if (!answerStringValid(answers, Number(subject.question_count))) {
        return err(400, 'ANSWER_KEY_INCOMPLETE', `${subject.subject_id} / ${booklet.code} cevap anahtarı ${subject.question_count} karakter olmalıdır.`);
      }
    }
  }

  const questions = await all<any>(env.DB.prepare(`SELECT id,subject_id,question_no FROM exam_questions WHERE exam_id=? ORDER BY global_no`).bind(examId));
  const questionMap = new Map(questions.map((q) => [`${q.subject_id}::${q.question_no}`, q]));
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`DELETE FROM answer_keys WHERE exam_question_id IN (SELECT id FROM exam_questions WHERE exam_id=?)`).bind(examId),
    env.DB.prepare(`DELETE FROM question_outcomes WHERE exam_question_id IN (SELECT id FROM exam_questions WHERE exam_id=?)`).bind(examId),
  ];
  for (const subject of subjects) {
    for (const booklet of booklets) {
      const answers = entryMap.get(`${subject.subject_id}::${booklet.code}`)!;
      for (let n = 1; n <= Number(subject.question_count); n++) {
        const question = questionMap.get(`${subject.subject_id}::${n}`);
        if (!question) return err(500, 'QUESTION_STRUCTURE_ERROR', 'Soru yapısı cevap anahtarıyla uyuşmuyor.');
        statements.push(env.DB.prepare(`INSERT INTO answer_keys (id,exam_question_id,booklet_code,correct_answer) VALUES(?,?,?,?)`)
          .bind(uuid('ak'), question.id, booklet.code, answers[n - 1]));
      }
    }
  }

  const seenMappings = new Set<string>();
  for (const mapping of body.outcomeMappings || []) {
    const subjectId = String(mapping.subjectId || '');
    const questionNo = Number(mapping.questionNo);
    const outcomeId = String(mapping.outcomeId || '');
    if (!subjectId || !Number.isInteger(questionNo) || !outcomeId) continue;
    const question = questionMap.get(`${subjectId}::${questionNo}`);
    if (!question) return err(400, 'QUESTION_NOT_FOUND', 'Kazanım eşleştirmesinde geçersiz soru bulundu.');
    const outcome = await one<any>(env.DB.prepare('SELECT id,subject_id FROM outcomes WHERE id=? AND active=1').bind(outcomeId));
    if (!outcome || outcome.subject_id !== subjectId) return err(400, 'OUTCOME_SUBJECT_MISMATCH', 'Kazanım ilgili dersle eşleşmiyor.');
    const key = `${question.id}::${outcomeId}`;
    if (seenMappings.has(key)) continue;
    seenMappings.add(key);
    statements.push(env.DB.prepare(`INSERT INTO question_outcomes (exam_question_id,outcome_id) VALUES(?,?)`).bind(question.id, outcomeId));
  }
  await env.DB.batch(statements);
  await audit(env.DB, user.id, exam.institution_id, 'EXAM_ANSWER_KEY_REPLACED', 'exam', examId, { entryCount: entryMap.size, outcomeMappingCount: seenMappings.size });
  return Response.json({ ok: true, answerCount: subjects.reduce((sum, s) => sum + Number(s.question_count), 0) * booklets.length, outcomeMappingCount: seenMappings.size });
}

async function replaceInstitutions(request: Request, env: Env, user: AuthUser, examId: string): Promise<Response> {
  const exam = await managedExam(env, user, examId);
  if (!exam) return err(404, 'NOT_FOUND', 'Sınav tanımı bulunamadı.');
  if (user.role !== 'SUPER_ADMIN' || exam.owner_type !== 'CENTRAL') return err(403, 'FORBIDDEN', 'Kurum dağıtımı yalnız merkezi sınavlarda Super Admin tarafından yönetilir.');
  const body = await request.json<{ institutionIds?: string[] }>();
  const ids = [...new Set((body.institutionIds || []).map((x) => String(x).trim()).filter(Boolean))];
  for (const id of ids) {
    if (!(await one(env.DB.prepare('SELECT id FROM institutions WHERE id=?').bind(id)))) return err(404, 'INSTITUTION_NOT_FOUND', 'Seçilen kurumlardan biri bulunamadı.');
  }
  const statements: D1PreparedStatement[] = [env.DB.prepare('DELETE FROM exam_institutions WHERE exam_id=?').bind(examId)];
  for (const institutionId of ids) statements.push(env.DB.prepare(`INSERT INTO exam_institutions (id,exam_id,institution_id,enabled) VALUES(?,?,?,1)`).bind(uuid('ei'), examId, institutionId));
  await env.DB.batch(statements);
  await audit(env.DB, user.id, null, 'EXAM_INSTITUTIONS_REPLACED', 'exam', examId, { institutionIds: ids });
  return Response.json({ ok: true, institutionCount: ids.length });
}

async function setStatus(request: Request, env: Env, user: AuthUser, examId: string): Promise<Response> {
  const exam = await managedExam(env, user, examId);
  if (!exam) return err(404, 'NOT_FOUND', 'Sınav tanımı bulunamadı.');
  const body = await request.json<{ status?: 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED' }>();
  const next = body.status;
  if (!next || !['DRAFT','ACTIVE','CLOSED','ARCHIVED'].includes(next)) return err(400, 'INVALID_STATUS', 'Geçersiz sınav durumu.');
  const allowed: Record<string, string[]> = { DRAFT: ['ACTIVE','ARCHIVED'], ACTIVE: ['CLOSED','ARCHIVED'], CLOSED: ['ARCHIVED'], ARCHIVED: [] };
  if (!allowed[exam.status]?.includes(next)) return err(409, 'INVALID_STATUS_TRANSITION', `${exam.status} durumundan ${next} durumuna geçilemez.`);
  if (next === 'ACTIVE') {
    const ready = await readiness(env, examId);
    if (!ready.ready_to_publish) return err(409, 'EXAM_NOT_READY', 'Sınav yayınlanmaya hazır değil. Ders, kitapçık, tam cevap anahtarı ve doğrulanmış puanlama kuralını kontrol edin.', ready);
    if (exam.owner_type === 'CENTRAL') {
      const assigned = await one<{ c: number }>(env.DB.prepare('SELECT count(*) c FROM exam_institutions WHERE exam_id=? AND enabled=1').bind(examId));
      if (!assigned?.c) return err(409, 'INSTITUTION_ASSIGNMENT_REQUIRED', 'Merkezi sınavı yayınlamadan önce en az bir kurum seçin.');
    }
  }
  await env.DB.prepare('UPDATE exams SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(next, examId).run();
  await audit(env.DB, user.id, exam.institution_id, `EXAM_STATUS_${next}`, 'exam', examId, { previous: exam.status, next });
  return Response.json({ ok: true, status: next });
}

async function filterCatalogByInstitution(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname !== '/api/exams') return null;
  const user = await getAuthUser(env, request);
  if (!user) return null;
  const institutionId = user.role === 'SUPER_ADMIN' ? url.searchParams.get('institutionId') : user.institution_id;
  if (!institutionId) return null;
  const response = await accessApp.fetch(request, env);
  if (!response.ok) return response;
  const payload = await response.json<any>();
  const visible = await all<{ id: string }>(env.DB.prepare(`
    SELECT e.id FROM exams e
    WHERE e.status IN ('ACTIVE','CLOSED')
      AND (e.institution_id=? OR EXISTS(SELECT 1 FROM exam_institutions ei WHERE ei.exam_id=e.id AND ei.institution_id=? AND ei.enabled=1))
  `).bind(institutionId, institutionId));
  const allowed = new Set(visible.map((x) => x.id));
  return Response.json({ ...payload, exams: (payload.exams || []).filter((e: any) => allowed.has(e.id)) }, { status: response.status });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const filteredCatalog = await filterCatalogByInstitution(request, env);
    if (filteredCatalog) return filteredCatalog;

    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/exam-definitions')) return accessApp.fetch(request, env);
    const auth = await actor(env, request);
    if (auth instanceof Response) return auth;

    if (url.pathname === '/api/exam-definitions/options' && request.method === 'GET') return options(env, auth, url);
    if (url.pathname === '/api/exam-definitions') {
      if (request.method === 'GET') return listDefinitions(env, auth);
      if (request.method === 'POST') return createDefinition(request, env, auth);
      return err(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
    }

    const detail = url.pathname.match(/^\/api\/exam-definitions\/([^/]+)$/);
    if (detail) {
      if (request.method === 'GET') return getDefinition(env, auth, detail[1]);
      if (request.method === 'PATCH') return updateGeneral(request, env, auth, detail[1]);
      return err(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
    }
    const structure = url.pathname.match(/^\/api\/exam-definitions\/([^/]+)\/structure$/);
    if (structure) return request.method === 'PUT' ? replaceStructure(request, env, auth, structure[1]) : err(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
    const answerKey = url.pathname.match(/^\/api\/exam-definitions\/([^/]+)\/answer-key$/);
    if (answerKey) return request.method === 'PUT' ? replaceAnswerKey(request, env, auth, answerKey[1]) : err(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
    const institutions = url.pathname.match(/^\/api\/exam-definitions\/([^/]+)\/institutions$/);
    if (institutions) return request.method === 'PUT' ? replaceInstitutions(request, env, auth, institutions[1]) : err(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
    const status = url.pathname.match(/^\/api\/exam-definitions\/([^/]+)\/status$/);
    if (status) return request.method === 'PATCH' ? setStatus(request, env, auth, status[1]) : err(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');

    return err(404, 'NOT_FOUND', 'Sınav tanımı API yolu bulunamadı.');
  },
} satisfies ExportedHandler<Env>;
