import reportingApp from './reporting-entry';
import type { CanonicalRecord, Env } from './types';
import { getAuthUser } from './lib/auth';
import { all, audit, badRequest, forbidden, json, normalizeName, notFound, one, splitName, uuid } from './lib/db';
import { canEvaluateExam } from './lib/permissions';
import { assertScoringRuleVerified, calculateOverall, calculateSubjectScore } from './lib/scoring';
import { masteryStatus } from './lib/outcome';

const CHUNK_SIZE = 5;
// Cloudflare D1 allows at most 100 bound parameters per individual query.
// Keep headroom for future columns and platform changes.
const MAX_BINDINGS_PER_STATEMENT = 90;

type AnyRow = Record<string, any>;

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(',');
}

function bulkInsert(
  db: D1Database,
  table: string,
  columns: string[],
  rows: unknown[][],
  prefix = 'INSERT INTO',
  suffix = '',
): D1PreparedStatement[] {
  if (!rows.length) return [];
  const maxRows = Math.max(1, Math.floor(MAX_BINDINGS_PER_STATEMENT / columns.length));
  const statements: D1PreparedStatement[] = [];
  for (let offset = 0; offset < rows.length; offset += maxRows) {
    const chunk = rows.slice(offset, offset + maxRows);
    const valuesSql = chunk.map(() => `(${placeholders(columns.length)})`).join(',');
    const sql = `${prefix} ${table} (${columns.join(',')}) VALUES ${valuesSql}${suffix ? ` ${suffix}` : ''}`;
    statements.push(db.prepare(sql).bind(...chunk.flat()));
  }
  return statements;
}

async function ensureAccess(env: Env, request: Request, batch: AnyRow) {
  const user = await getAuthUser(env, request);
  if (!user) return { response: json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Oturum açmanız gerekiyor.' } }, 401), user: null };
  if (!canEvaluateExam(user.role)) return { response: forbidden(), user: null };
  if (user.role !== 'SUPER_ADMIN' && user.institution_id !== batch.institution_id) return { response: forbidden(), user: null };
  if (user.role !== 'SUPER_ADMIN') {
    const institution = await one<{ status: string }>(env.DB.prepare('SELECT status FROM institutions WHERE id=?').bind(batch.institution_id));
    if (institution?.status === 'PASSIVE') {
      return { response: json({ ok: false, error: { code: 'INSTITUTION_PASSIVE', message: 'Kurum hesabınız şu anda aktif değildir. Lütfen kurum yöneticinizle iletişime geçin.' } }, 403), user: null };
    }
  }
  return { response: null, user };
}

async function finaliseBatch(env: Env, userId: string, batch: AnyRow, total: number): Promise<Response> {
  await env.DB.prepare(`UPDATE exam_results SET institution_rank=(SELECT rn FROM (
    SELECT er2.id,row_number() OVER (ORDER BY er2.net DESC,er2.correct_count DESC) rn
    FROM exam_results er2 JOIN exam_participants ep2 ON ep2.id=er2.participant_id
    WHERE ep2.exam_id=? AND ep2.institution_id=?
  ) ranked WHERE ranked.id=exam_results.id)
  WHERE participant_id IN (SELECT id FROM exam_participants WHERE exam_id=? AND institution_id=?)`)
    .bind(batch.exam_id, batch.institution_id, batch.exam_id, batch.institution_id).run();

  await env.DB.prepare(`UPDATE scan_batches SET status='COMMITTED' WHERE id=?`).bind(batch.id).run();
  await audit(env.DB, userId, batch.institution_id, 'EXAM_EVALUATED', 'scan_batch', batch.id, { examId: batch.exam_id, processed: total, chunked: true });
  return json({ ok: true, done: true, processed: total, processedThisRun: 0, total, remaining: 0, batchId: batch.id, examId: batch.exam_id });
}

async function evaluateChunk(request: Request, env: Env, batchId: string): Promise<Response> {
  const batch = await one<AnyRow>(env.DB.prepare('SELECT * FROM scan_batches WHERE id=?').bind(batchId));
  if (!batch) return notFound();

  const access = await ensureAccess(env, request, batch);
  if (access.response || !access.user) return access.response!;
  const user = access.user;

  const totalRow = await one<{ c: number }>(env.DB.prepare('SELECT count(*) c FROM scan_records WHERE batch_id=?').bind(batchId));
  const total = Number(totalRow?.c || 0);
  const progressRow = await one<{ c: number }>(env.DB.prepare('SELECT count(*) c FROM scan_evaluation_progress WHERE batch_id=?').bind(batchId));
  const alreadyProcessed = Number(progressRow?.c || 0);

  if (batch.status === 'COMMITTED') return json({ ok: true, done: true, processed: alreadyProcessed || total, processedThisRun: 0, total, remaining: 0, batchId, examId: batch.exam_id });
  if (batch.status !== 'READY') return badRequest('Önce sorunlu kayıtları düzeltin.', 'BATCH_NEEDS_REVIEW');
  if (!total) return badRequest('Değerlendirilecek optik kaydı bulunamadı.', 'EMPTY_BATCH');

  const exam = await one<AnyRow>(env.DB.prepare(`SELECT e.*,srv.verified,srv.id scoring_version_id,srv.config_json,sr.authority
    FROM exams e LEFT JOIN scoring_rule_versions srv ON srv.id=e.scoring_rule_version_id
    LEFT JOIN scoring_rules sr ON sr.id=srv.rule_id WHERE e.id=?`).bind(batch.exam_id));
  if (!exam) return notFound('Sınav bulunamadı.');
  if (!exam.scoring_version_id) return badRequest('Sınavın puanlama kuralı tanımlı değil.', 'SCORING_RULE_REQUIRED');
  assertScoringRuleVerified({ verified: exam.verified, authority: exam.authority });

  const [subjects, booklets, keyRows, classes, records] = await Promise.all([
    all<AnyRow>(env.DB.prepare(`SELECT es.subject_id,s.code,s.name,es.question_count,es.wrong_divisor
      FROM exam_subjects es JOIN subjects s ON s.id=es.subject_id WHERE es.exam_id=? ORDER BY es.sort_order`).bind(exam.id)),
    all<{ code: string }>(env.DB.prepare('SELECT code FROM exam_booklets WHERE exam_id=? AND active=1').bind(exam.id)),
    all<AnyRow>(env.DB.prepare(`SELECT q.id question_id,q.subject_id,q.question_no,s.code subject_code,ak.booklet_code,ak.correct_answer,
      group_concat(qo.outcome_id) outcome_ids
      FROM exam_questions q JOIN subjects s ON s.id=q.subject_id JOIN answer_keys ak ON ak.exam_question_id=q.id
      LEFT JOIN question_outcomes qo ON qo.exam_question_id=q.id WHERE q.exam_id=?
      GROUP BY q.id,ak.booklet_code ORDER BY q.subject_id,q.question_no`).bind(exam.id)),
    batch.season_id ? all<AnyRow>(env.DB.prepare('SELECT id,grade_level,section FROM classes WHERE season_id=?').bind(batch.season_id)) : Promise.resolve([] as AnyRow[]),
    all<AnyRow>(env.DB.prepare(`SELECT sr.* FROM scan_records sr
      LEFT JOIN scan_evaluation_progress p ON p.batch_id=sr.batch_id AND p.scan_record_id=sr.id
      WHERE sr.batch_id=? AND p.scan_record_id IS NULL
      ORDER BY sr.row_no LIMIT ?`).bind(batchId, CHUNK_SIZE)),
  ]);

  if (!records.length) return finaliseBatch(env, user.id, batch, total);

  const prepared = records.map((row) => ({ row, record: JSON.parse(row.canonical_json) as CanonicalRecord }));
  const resolved: Array<{ row: AnyRow; record: CanonicalRecord; studentId: string; studentStatus: 'ACTIVE' | 'GUEST'; isNewGuest: boolean }> = [];
  for (const item of prepared) {
    const { row, record } = item;
    if (['AMBIGUOUS', 'INVALID'].includes(row.match_status)) return badRequest(`Satır ${row.row_no} için eşleştirme tamamlanmalıdır.`, 'BATCH_NEEDS_REVIEW');
    if (row.match_status === 'NEW_GUEST') {
      resolved.push({ row, record, studentId: uuid('stu'), studentStatus: 'GUEST', isNewGuest: true });
    } else {
      if (!row.matched_student_id) return badRequest(`Satır ${row.row_no} için öğrenci eşleştirmesi bulunamadı.`, 'UNRESOLVED_PARTICIPANT');
      resolved.push({ row, record, studentId: row.matched_student_id, studentStatus: row.match_status === 'ACTIVE_MATCH' ? 'ACTIVE' : 'GUEST', isNewGuest: false });
    }
  }

  const studentIds = resolved.map((x) => x.studentId);
  const existingParticipants = studentIds.length
    ? await all<{ id: string; student_id: string }>(env.DB.prepare(`SELECT id,student_id FROM exam_participants WHERE exam_id=? AND institution_id=? AND student_id IN (${placeholders(studentIds.length)})`).bind(exam.id, batch.institution_id, ...studentIds))
    : [];
  const participantByStudent = new Map(existingParticipants.map((x) => [x.student_id, x.id]));

  const statements: D1PreparedStatement[] = [];
  const participantRows: unknown[][] = [];
  const answerRows: unknown[][] = [];
  const subjectResultRows: unknown[][] = [];
  const examResultRows: unknown[][] = [];
  const outcomeRows: unknown[][] = [];
  const progressRows: unknown[][] = [];
  const newStudentRows: unknown[][] = [];
  const newEnrollmentRows: unknown[][] = [];
  const newGuestProfileRows: unknown[][] = [];
  const participantIds: string[] = [];
  const outcomeStudentIds: string[] = [];

  for (const item of resolved) {
    const { row, record, studentId, studentStatus, isNewGuest } = item;
    const booklet = (record.booklet || '').toUpperCase() || (booklets.length === 1 ? booklets[0].code : '');
    if (!booklet || !booklets.some((b) => b.code === booklet)) return badRequest(`Satır ${row.row_no} için geçerli kitapçık türü bulunamadı.`, 'BOOKLET_REQUIRED');

    const participantId = participantByStudent.get(studentId) || uuid('part');
    participantIds.push(participantId);
    outcomeStudentIds.push(studentId);

    if (isNewGuest) {
      const names = splitName(record.name);
      const classRow = classes.find((c) => Number(c.grade_level) === Number(record.grade_level) && (!record.section || !c.section || String(c.section).toLocaleUpperCase('tr-TR') === String(record.section).toLocaleUpperCase('tr-TR')));
      newStudentRows.push([studentId, names.firstName, names.lastName, normalizeName(record.name), 'GUEST']);
      newEnrollmentRows.push([uuid('enr'), studentId, batch.institution_id, batch.season_id || null, classRow?.id || null, record.student_number || null, record.grade_level || null, record.section || null]);
      newGuestProfileRows.push([studentId, exam.id]);
      statements.push(env.DB.prepare(`UPDATE scan_records SET matched_student_id=?,match_status='GUEST_MATCH',match_confidence=1 WHERE id=? AND batch_id=?`).bind(studentId, row.id, batchId));
    }

    participantRows.push([
      participantId, exam.id, batch.institution_id, batch.season_id || null, studentId, row.id,
      record.student_number || null, record.name, record.class_name || null, booklet, studentStatus,
    ]);

    const subjectScores = [];
    const outcomeAccumulator = new Map<string, { evidence: number; correct: number }>();
    for (const subject of subjects) {
      const answerString = record.answers_by_subject?.[subject.code] || '';
      const subjectKeys = keyRows.filter((k) => k.subject_id === subject.subject_id && k.booklet_code === booklet).sort((a, b) => Number(a.question_no) - Number(b.question_no));
      let correct = 0, wrong = 0, blank = 0;
      for (let i = 0; i < Number(subject.question_count); i++) {
        const key = subjectKeys[i];
        if (!key) return badRequest(`${subject.name} ${i + 1}. soru için cevap anahtarı eksik.`, 'ANSWER_KEY_INCOMPLETE');
        const raw = (answerString[i] || '').toLocaleUpperCase('tr-TR');
        const isBlank = !raw || raw === '_';
        const status = isBlank ? 'BLANK' : raw === key.correct_answer ? 'CORRECT' : 'WRONG';
        if (status === 'CORRECT') correct++; else if (status === 'WRONG') wrong++; else blank++;
        answerRows.push([uuid('ans'), participantId, key.question_id, isBlank ? null : raw, status, record.confidence]);
        const outcomeIds = key.outcome_ids ? String(key.outcome_ids).split(',').filter(Boolean) : [];
        for (const outcomeId of outcomeIds) {
          const acc = outcomeAccumulator.get(outcomeId) || { evidence: 0, correct: 0 };
          acc.evidence += 1;
          if (status === 'CORRECT') acc.correct += 1;
          outcomeAccumulator.set(outcomeId, acc);
        }
      }
      const score = calculateSubjectScore({ correct, wrong, blank, wrongDivisor: Number(subject.wrong_divisor), questionCount: Number(subject.question_count) });
      subjectScores.push(score);
      subjectResultRows.push([uuid('sr'), participantId, subject.subject_id, correct, wrong, blank, score.net, score.successPercent]);
    }

    const overall = calculateOverall(subjectScores);
    examResultRows.push([uuid('er'), participantId, exam.scoring_version_id, overall.correct, overall.wrong, overall.blank, overall.net, null, overall.successPercent]);
    for (const [outcomeId, acc] of outcomeAccumulator) {
      const rate = acc.evidence ? acc.correct / acc.evidence : 0;
      outcomeRows.push([uuid('or'), studentId, exam.id, outcomeId, acc.evidence, acc.correct, rate, masteryStatus(acc.correct, acc.evidence)]);
    }
    progressRows.push([batchId, row.id, studentId, participantId]);
  }

  if (newStudentRows.length) {
    statements.push(...bulkInsert(env.DB, 'student_entities', ['id','first_name','last_name','normalized_name','status'], newStudentRows));
    statements.push(...bulkInsert(env.DB, 'student_enrollments', ['id','student_id','institution_id','season_id','class_id','student_number','grade_level','section'], newEnrollmentRows));
    statements.push(...bulkInsert(env.DB, 'guest_profiles', ['student_id','first_seen_exam_id'], newGuestProfileRows, 'INSERT OR REPLACE INTO'));
  }

  if (participantIds.length) {
    statements.push(env.DB.prepare(`DELETE FROM student_answers WHERE participant_id IN (${placeholders(participantIds.length)})`).bind(...participantIds));
    statements.push(env.DB.prepare(`DELETE FROM subject_results WHERE participant_id IN (${placeholders(participantIds.length)})`).bind(...participantIds));
    statements.push(env.DB.prepare(`DELETE FROM exam_results WHERE participant_id IN (${placeholders(participantIds.length)})`).bind(...participantIds));
  }
  if (outcomeStudentIds.length) {
    statements.push(env.DB.prepare(`DELETE FROM outcome_results WHERE exam_id=? AND student_id IN (${placeholders(outcomeStudentIds.length)})`).bind(exam.id, ...outcomeStudentIds));
  }

  statements.push(...bulkInsert(
    env.DB,
    'exam_participants',
    ['id','exam_id','institution_id','season_id','student_id','scan_record_id','student_number_snapshot','name_snapshot','class_snapshot','booklet_code','participant_status'],
    participantRows,
    'INSERT INTO',
    `ON CONFLICT(exam_id,institution_id,student_id) DO UPDATE SET scan_record_id=excluded.scan_record_id,season_id=excluded.season_id,student_number_snapshot=excluded.student_number_snapshot,name_snapshot=excluded.name_snapshot,class_snapshot=excluded.class_snapshot,booklet_code=excluded.booklet_code,participant_status=excluded.participant_status`,
  ));
  statements.push(...bulkInsert(env.DB, 'student_answers', ['id','participant_id','exam_question_id','answer','status','confidence'], answerRows));
  statements.push(...bulkInsert(env.DB, 'subject_results', ['id','participant_id','subject_id','correct_count','wrong_count','blank_count','net','success_percent'], subjectResultRows));
  statements.push(...bulkInsert(env.DB, 'exam_results', ['id','participant_id','scoring_rule_version_id','correct_count','wrong_count','blank_count','net','score','success_percent'], examResultRows));
  statements.push(...bulkInsert(env.DB, 'outcome_results', ['id','student_id','exam_id','outcome_id','evidence_count','correct_count','success_rate','mastery_status'], outcomeRows));
  statements.push(...bulkInsert(env.DB, 'scan_evaluation_progress', ['batch_id','scan_record_id','student_id','participant_id'], progressRows, 'INSERT OR REPLACE INTO'));

  try {
    await env.DB.batch(statements);
  } catch (error) {
    console.error('Chunked evaluation transaction failed', error);
    const details = env.ENVIRONMENT === 'staging' && error instanceof Error ? error.message : undefined;
    return json({ ok: false, error: { code: 'EVALUATION_CHUNK_FAILED', message: 'Sınav değerlendirme grubunda işlem hatası oluştu. İşlem güvenli şekilde tekrar denenebilir.', details } }, 500);
  }

  const processedRow = await one<{ c: number }>(env.DB.prepare('SELECT count(*) c FROM scan_evaluation_progress WHERE batch_id=?').bind(batchId));
  const processed = Number(processedRow?.c || 0);
  const remaining = Math.max(0, total - processed);
  if (remaining === 0) return finaliseBatch(env, user.id, batch, total);
  return json({ ok: true, done: false, processed, processedThisRun: records.length, total, remaining, batchId, examId: exam.id });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/scan-batches\/([^/]+)\/evaluate$/);
    if (!match || request.method !== 'POST') return reportingApp.fetch(request, env);
    try {
      return await evaluateChunk(request, env, match[1]);
    } catch (error) {
      console.error('Chunked evaluation failed', error);
      const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
      if (message === 'OFFICIAL_SCORING_RULE_REQUIRED') return badRequest('Bu sınav için doğrulanmış resmî puanlama kuralı tanımlanmalıdır.', message);
      return json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Sınav değerlendirilirken sunucu hatası oluştu.', details: env.ENVIRONMENT === 'staging' ? message : undefined } }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
