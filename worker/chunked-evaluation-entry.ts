import { withExamOperationLock } from './lib/exam-operation-lock';
import { persistTytOptionalPhilosophyEvidence } from './tyt-optional-philosophy-evaluation';
import reportingApp from './reporting-entry';
import type { CanonicalRecord, Env } from './types';
import { getAuthUser } from './lib/auth';
import { all, audit, badRequest, forbidden, json, normalizeName, notFound, one, splitName, uuid } from './lib/db';
import { canEvaluateExam } from './lib/permissions';
import { examEvaluationAccess } from './lib/exam-evaluation-access';
import { recordExamAssessments, recordExamEvidenceAudit } from './lib/assessment-ledger';
import { blankSubjectsCoveredElsewhere, primaryBooklet, subjectBooklet } from './lib/two-session';
import { duplicateMessage, duplicateStudentConflicts } from './lib/scan-duplicates';
import { assertScoringRuleVerified, calculateExamScore, calculateOverall, calculateSubjectScore, effectiveWrongDivisor, scoreMethodFor } from './lib/scoring';
import { masteryStatus } from './lib/outcome';

/**
 * S035 (owner report 27 Oct: 100 students never finished on sonuc). Students are evaluated in memory and written
 * set-based: every table gets its rows as one JSON parameter (json_each), so a chunk of hundreds of students is a
 * handful of statements in one D1 batch (one query against the per-invocation limit). Chunk size follows the
 * answer-row budget; several chunks run per request until the time budget is used.
 */
const ANSWER_ROWS_PER_CHUNK = 40000;
const MIN_CHUNK = 20, MAX_CHUNK = 400;
const MAX_JSON_BYTES = 900_000;
export const chunkSizeFor = (questionCount: number) => Math.max(MIN_CHUNK, Math.min(MAX_CHUNK, Math.floor(ANSWER_ROWS_PER_CHUNK / Math.max(1, questionCount))));

type AnyRow = Record<string, any>;
import { evaluateAnswer } from './lib/answer-evaluation';
export { evaluateAnswer, parseAcceptedAnswers } from './lib/answer-evaluation';
type AnswerStatus = 'CORRECT' | 'WRONG' | 'BLANK' | 'INVALID';

/** INSERT … SELECT FROM json_each(?): rows travel as one JSON array per statement (split under D1's size limits). */
function bulkInsert(
  db: D1Database,
  table: string,
  columns: string[],
  rows: unknown[][],
  prefix = 'INSERT INTO',
  suffix = '',
): D1PreparedStatement[] {
  if (!rows.length) return [];
  const select = columns.map((_, i) => `json_extract(value,'$[${i}]')`).join(',');
  const sql = `${prefix} ${table} (${columns.join(',')}) SELECT ${select} FROM json_each(?)${suffix ? ` WHERE true ${suffix}` : ''}`;
  const statements: D1PreparedStatement[] = [];
  let current: unknown[][] = [], size = 2;
  for (const row of rows) {
    const bytes = JSON.stringify(row).length + 1;
    if (current.length && size + bytes > MAX_JSON_BYTES) { statements.push(db.prepare(sql).bind(JSON.stringify(current))); current = []; size = 2; }
    current.push(row); size += bytes;
  }
  if (current.length) statements.push(db.prepare(sql).bind(JSON.stringify(current)));
  return statements;
}
const jsonList = (values: unknown[]) => JSON.stringify(values);

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
  const evidenceCount = await recordExamAssessments(env, batch.id);
  await recordExamEvidenceAudit(env, userId, batch.institution_id, batch.id, evidenceCount);
  await env.DB.prepare(`UPDATE exam_results SET institution_rank=(SELECT rn FROM (
    SELECT er2.id,row_number() OVER (ORDER BY COALESCE(er2.score,-1e9) DESC,er2.net DESC,er2.correct_count DESC) rn
    FROM exam_results er2 JOIN exam_participants ep2 ON ep2.id=er2.participant_id
    WHERE ep2.exam_id=? AND ep2.institution_id=?
  ) ranked WHERE ranked.id=exam_results.id)
  WHERE participant_id IN (SELECT id FROM exam_participants WHERE exam_id=? AND institution_id=?)`)
    .bind(batch.exam_id, batch.institution_id, batch.exam_id, batch.institution_id).run();

  await env.DB.prepare(`UPDATE scan_batches SET status='COMMITTED' WHERE id=?`).bind(batch.id).run();
  await audit(env.DB, userId, batch.institution_id, 'EXAM_EVALUATED', 'scan_batch', batch.id, { examId: batch.exam_id, processed: total, chunked: true });
  return json({ ok: true, done: true, processed: total, processedThisRun: 0, total, remaining: 0, batchId: batch.id, examId: batch.exam_id });
}

async function evaluateChunkUnlocked(env: Env, user: { id: string }, batchId: string): Promise<Response> {
  const batch = await one<AnyRow>(env.DB.prepare('SELECT * FROM scan_batches WHERE id=?').bind(batchId));
  if (!batch) return notFound();
  const networkPublication=await one<any>(env.DB.prepare("SELECT id FROM exam_administrations WHERE exam_id=? AND channel='RESULT_NETWORK' AND ranking_frozen_at IS NOT NULL LIMIT 1").bind(batch.exam_id));
  if(networkPublication)return badRequest('Sonuç Ağı yayını düzeltmeye açılmadan değerlendirme yapılamaz.','RESULTS_FROZEN');
  const publication = await one<{ result_freeze_status: string }>(env.DB.prepare('SELECT result_freeze_status FROM exam_delivery_profiles WHERE exam_id=?').bind(batch.exam_id));
  if (publication && ['FROZEN', 'PUBLISHED'].includes(publication.result_freeze_status)) {
    return badRequest('Dondurulmuş veya yayımlanmış sonuçlar yeniden değerlendirilemez. Düzeltme için yeni sonuç sürümü hazırlanmalıdır.', 'RESULTS_FROZEN');
  }

  const totalRow = await one<{ c: number }>(env.DB.prepare("SELECT count(*) c FROM scan_records WHERE batch_id=? AND resolution_status!='CANCELLED'").bind(batchId));
  const total = Number(totalRow?.c || 0);
  const progressRow = await one<{ c: number }>(env.DB.prepare('SELECT count(*) c FROM scan_evaluation_progress WHERE batch_id=?').bind(batchId));
  const alreadyProcessed = Number(progressRow?.c || 0);

  if (batch.status === 'COMMITTED') return json({ ok: true, done: true, processed: alreadyProcessed || total, processedThisRun: 0, total, remaining: 0, batchId, examId: batch.exam_id });
  if (batch.status !== 'READY') return badRequest('Önce sorunlu kayıtları düzeltin.', 'BATCH_NEEDS_REVIEW');
  const batchRows = await all<AnyRow>(env.DB.prepare('SELECT id,row_no,matched_student_id,resolution_status,canonical_json FROM scan_records WHERE batch_id=?').bind(batch.id));
  const dupes = duplicateStudentConflicts(batchRows as any);
  if (dupes.length) return badRequest(duplicateMessage(dupes), 'DUPLICATE_STUDENT_IN_BATCH');
  if (!total) return badRequest('Değerlendirilecek optik kaydı bulunamadı.', 'EMPTY_BATCH');

  const exam = await one<AnyRow>(env.DB.prepare(`SELECT e.*,srv.verified,srv.id scoring_version_id,srv.config_json,sr.authority
    FROM exams e LEFT JOIN scoring_rule_versions srv ON srv.id=e.scoring_rule_version_id
    LEFT JOIN scoring_rules sr ON sr.id=srv.rule_id WHERE e.id=?`).bind(batch.exam_id));
  if (!exam) return notFound('Sınav bulunamadı.');
  const examScope = await examEvaluationAccess(env, exam as any, batch.institution_id, true);
  if (examScope) return examScope;
  if (!exam.scoring_version_id) return badRequest('Sınavın puanlama kuralı tanımlı değil.', 'SCORING_RULE_REQUIRED');
  assertScoringRuleVerified({ verified: exam.verified, authority: exam.authority });
  const scoringConfig = (() => { try { return JSON.parse(exam.config_json || '{}'); } catch { return {}; } })();
  const scoreMethod = scoreMethodFor(scoringConfig);
  const scoringOverride = (() => { try { return JSON.parse(exam.scoring_override_json || 'null'); } catch { return null; } })();

  const [subjects, booklets, keyRows, classes] = await Promise.all([
    all<AnyRow>(env.DB.prepare(`SELECT es.subject_id,s.code,s.name,es.question_count,es.wrong_divisor
      FROM exam_subjects es JOIN subjects s ON s.id=es.subject_id WHERE es.exam_id=? ORDER BY es.sort_order`).bind(exam.id)),
    all<{ code: string }>(env.DB.prepare('SELECT code FROM exam_booklets WHERE exam_id=? AND active=1').bind(exam.id)),
    all<AnyRow>(env.DB.prepare(`SELECT q.id question_id,q.subject_id,q.question_no,s.code subject_code,
      ak.booklet_code,ak.correct_answer,ak.accepted_answers,
      coalesce(ak.question_status,q.question_status,'ACTIVE') question_status,
      coalesce(bqo.printed_question_no,q.question_no) printed_question_no,
      group_concat(DISTINCT coalesce(sbo.outcome_id,qo.outcome_id)) outcome_ids
      FROM exam_questions q
      JOIN subjects s ON s.id=q.subject_id
      JOIN answer_keys ak ON ak.exam_question_id=q.id
      LEFT JOIN exam_question_booklet_orders bqo ON bqo.exam_question_id=q.id AND bqo.booklet_code=ak.booklet_code
      LEFT JOIN question_outcomes qo ON qo.exam_question_id=q.id
        AND NOT EXISTS (SELECT 1 FROM studio_exam_booklet_positions sp
          WHERE sp.exam_id=q.exam_id AND sp.booklet_code=ak.booklet_code)
      LEFT JOIN studio_exam_booklet_outcomes sbo ON sbo.exam_id=q.exam_id
        AND sbo.booklet_code=ak.booklet_code
        AND sbo.printed_question_no=coalesce(bqo.printed_question_no,q.global_no,q.question_no)
      WHERE q.exam_id=?
      GROUP BY q.id,ak.booklet_code
      ORDER BY q.subject_id,ak.booklet_code,coalesce(bqo.printed_question_no,q.question_no)`).bind(exam.id)),
    batch.season_id ? all<AnyRow>(env.DB.prepare('SELECT id,grade_level,section FROM classes WHERE season_id=?').bind(batch.season_id)) : Promise.resolve([] as AnyRow[]),
  ]);
  const records = await all<AnyRow>(env.DB.prepare(`SELECT sr.* FROM scan_records sr
      LEFT JOIN scan_evaluation_progress p ON p.batch_id=sr.batch_id AND p.scan_record_id=sr.id
      WHERE sr.batch_id=? AND sr.resolution_status!='CANCELLED' AND p.scan_record_id IS NULL
      ORDER BY sr.row_no LIMIT ?`).bind(batchId, chunkSizeFor(subjects.reduce((n, x) => n + Number(x.question_count || 0), 0))));

  if (!records.length) return finaliseBatch(env, user.id, batch, total);

  const prepared = records.map((row) => ({ row, record: JSON.parse(row.canonical_json) as CanonicalRecord }));
  const resolved: Array<{ row: AnyRow; record: CanonicalRecord; studentId: string; studentStatus: 'ACTIVE' | 'GUEST'; isNewGuest: boolean }> = [];
  for (const item of prepared) {
    const { row, record } = item;
    if (['AMBIGUOUS', 'INVALID'].includes(row.match_status)) return badRequest(`Satır ${row.row_no} için eşleştirme tamamlanmalıdır.`, 'BATCH_NEEDS_REVIEW');
    if (row.match_status === 'NEW_GUEST' || (row.match_status === 'GUEST_MATCH' && !row.matched_student_id)) {
      resolved.push({ row, record, studentId: uuid('stu'), studentStatus: 'GUEST', isNewGuest: true });
    } else {
      if (!row.matched_student_id) return badRequest(`Satır ${row.row_no} için öğrenci eşleştirmesi bulunamadı.`, 'UNRESOLVED_PARTICIPANT');
      resolved.push({ row, record, studentId: row.matched_student_id, studentStatus: row.match_status === 'ACTIVE_MATCH' ? 'ACTIVE' : 'GUEST', isNewGuest: false });
    }
  }

  // A028b: two sheets of one student (one per session) must not be written in the same chunk: the second
  // would create a second participant instead of merging into the first. Later sheets wait for the next chunk.
  const seenStudents = new Set<string>();
  for (let i = 0; i < resolved.length; i++) {
    if (seenStudents.has(resolved[i].studentId)) resolved.splice(i--, 1); else seenStudents.add(resolved[i].studentId);
  }
  const coveredElsewhere = blankSubjectsCoveredElsewhere(batchRows as any);
  const studentIds = resolved.map((x) => x.studentId);
  const existingParticipants = studentIds.length
    ? await all<{ id: string; student_id: string }>(env.DB.prepare(`SELECT id,student_id FROM exam_participants WHERE exam_id=? AND institution_id=? AND student_id IN (SELECT value FROM json_each(?))`).bind(exam.id, batch.institution_id, jsonList(studentIds)))
    : [];
  const participantByStudent = new Map(existingParticipants.map((x) => [x.student_id, x.id]));
  const existingParticipantIds = existingParticipants.map((x) => x.id);
  const existingSubjectResults = existingParticipantIds.length
    ? await all<AnyRow>(env.DB.prepare(`SELECT participant_id,subject_id,correct_count,wrong_count,blank_count,net,success_percent FROM subject_results WHERE participant_id IN (SELECT value FROM json_each(?))`).bind(jsonList(existingParticipantIds)))
    : [];
  const existingOutcomeEvidence = existingParticipantIds.length
    ? await all<AnyRow>(env.DB.prepare(`SELECT sa.participant_id,q.subject_id,qo.outcome_id,sa.status
      FROM student_answers sa JOIN exam_questions q ON q.id=sa.exam_question_id JOIN question_outcomes qo ON qo.exam_question_id=q.id
      WHERE sa.participant_id IN (SELECT value FROM json_each(?)) AND sa.status<>'INVALID'`).bind(jsonList(existingParticipantIds)))
    : [];

  const statements: D1PreparedStatement[] = [];
  const guestLinkRows: string[][] = [];
  const replaced = new Map<string, string[]>(); // subject set → participants whose earlier answers in those subjects are replaced
  const participantRows: unknown[][] = [];
  const answerRows: unknown[][] = [];
  const subjectResultRows: unknown[][] = [];
  const examResultRows: unknown[][] = [];
  const outcomeRows: unknown[][] = [];
  const progressRows: unknown[][] = [];
  const newStudentRows: unknown[][] = [];
  const newEnrollmentRows: unknown[][] = [];
  const newGuestProfileRows: unknown[][] = [];
  const outcomeStudentIds: string[] = [];

  for (const item of resolved) {
    const { row, record, studentId, studentStatus, isNewGuest } = item;
    const booklet = primaryBooklet(record) || (booklets.length === 1 ? booklets[0].code : '');
    if (!booklet || !booklets.some((b) => b.code === booklet)) return badRequest(`Satır ${row.row_no} için geçerli kitapçık türü bulunamadı.`, 'BOOKLET_REQUIRED');

    const participantId = participantByStudent.get(studentId) || uuid('part');
    outcomeStudentIds.push(studentId);
    const skipHere = coveredElsewhere.get(row.id);
    const incomingSubjects = subjects.filter((subject) => Object.prototype.hasOwnProperty.call(record.answers_by_subject || {}, subject.code) && !skipHere?.has(subject.code));
    if (!incomingSubjects.length) return badRequest(`Satır ${row.row_no} için sınava ait ders cevap alanı bulunamadı.`, 'ANSWER_SUBJECT_REQUIRED');
    const incomingSubjectIds = new Set(incomingSubjects.map((subject) => subject.subject_id));

    if (isNewGuest) {
      const names = splitName(record.name);
      const classRow = classes.find((c) => Number(c.grade_level) === Number(record.grade_level) && (!record.section || !c.section || String(c.section).toLocaleUpperCase('tr-TR') === String(record.section).toLocaleUpperCase('tr-TR')));
      newStudentRows.push([studentId, names.firstName, names.lastName, normalizeName(record.name), 'GUEST']);
      newEnrollmentRows.push([uuid('enr'), studentId, batch.institution_id, batch.season_id || null, classRow?.id || null, record.student_number || null, record.grade_level || null, record.section || null]);
      newGuestProfileRows.push([studentId, exam.id]);
      // A028b.1: linked only after the guest student row exists (below); D1 enforces the foreign key.
      guestLinkRows.push([row.id, studentId]);
    }

    participantRows.push([
      participantId, exam.id, batch.institution_id, batch.season_id || null, studentId, row.id,
      record.student_number || null, record.name, record.class_name || null, booklet, studentStatus,
    ]);

    const subjectScores = existingSubjectResults.filter((score) => score.participant_id === participantId && !incomingSubjectIds.has(score.subject_id)).map((score) => ({
      correct: Number(score.correct_count), wrong: Number(score.wrong_count), blank: Number(score.blank_count),
      net: Number(score.net), successPercent: Number(score.success_percent),
      wrongDivisor: effectiveWrongDivisor(subjects.find((subject) => subject.subject_id === score.subject_id)?.wrong_divisor, scoreMethod, scoringOverride),
      subjectId: score.subject_id, code: subjects.find((subject) => subject.subject_id === score.subject_id)?.code,
      questionCount: Number(subjects.find((subject) => subject.subject_id === score.subject_id)?.question_count || 0),
    }));
    const outcomeAccumulator = new Map<string, { evidence: number; correct: number }>();
    for (const evidence of existingOutcomeEvidence.filter((x) => x.participant_id === participantId && !incomingSubjectIds.has(x.subject_id))) {
      const acc = outcomeAccumulator.get(evidence.outcome_id) || { evidence: 0, correct: 0 };
      acc.evidence += 1;
      if (evidence.status === 'CORRECT') acc.correct += 1;
      outcomeAccumulator.set(evidence.outcome_id, acc);
    }

    for (const subject of incomingSubjects) {
      const answerString = record.answers_by_subject?.[subject.code] || '';
      const subjectKeys = keyRows
        .filter((k) => k.subject_id === subject.subject_id && k.booklet_code === subjectBooklet(record, subject.code, booklet))
        .sort((a, b) => Number(a.printed_question_no) - Number(b.printed_question_no));
      if (subjectKeys.length !== Number(subject.question_count)) {
        return badRequest(`${subject.name} için ${subjectBooklet(record, subject.code, booklet)} kitapçığı cevap anahtarı eksik.`, 'ANSWER_KEY_INCOMPLETE');
      }

      let correct = 0, wrong = 0, blank = 0, activeQuestionCount = 0;
      for (let i = 0; i < subjectKeys.length; i++) {
        const key = subjectKeys[i];
        const assessed = evaluateAnswer(answerString[i], key);
        const raw = String(answerString[i] || '').trim().toLocaleUpperCase('tr-TR');
        if (assessed.contributesToScore) {
          activeQuestionCount += 1;
          if (assessed.status === 'CORRECT') correct++;
          else if (assessed.status === 'WRONG') wrong++;
          else if (assessed.status === 'BLANK') blank++;
        }
        answerRows.push([uuid('ans'), participantId, key.question_id, raw && raw !== '_' ? raw : null, assessed.status, record.confidence]);

        if (assessed.contributesToOutcome) {
          const outcomeIds = key.outcome_ids ? String(key.outcome_ids).split(',').filter(Boolean) : [];
          for (const outcomeId of outcomeIds) {
            const acc = outcomeAccumulator.get(outcomeId) || { evidence: 0, correct: 0 };
            acc.evidence += 1;
            if (assessed.status === 'CORRECT') acc.correct += 1;
            outcomeAccumulator.set(outcomeId, acc);
          }
        }
      }
      const score = calculateSubjectScore({ correct, wrong, blank, wrongDivisor: effectiveWrongDivisor(subject.wrong_divisor, scoreMethod, scoringOverride), questionCount: activeQuestionCount });
      subjectScores.push({ ...score, subjectId: subject.subject_id, code: subject.code });
      subjectResultRows.push([uuid('sr'), participantId, subject.subject_id, correct, wrong, blank, score.net, score.successPercent]);
    }

    // A028b: a student with a session not yet read (or absent) gets nets but no score, like the ÖSYM estimate:
    // a share over only the tests taken would overstate it.
    const overall = calculateOverall(subjectScores);
    examResultRows.push([uuid('er'), participantId, exam.scoring_version_id, overall.correct, overall.wrong, overall.blank, overall.net, (subjectScores.length >= subjects.length ? calculateExamScore(scoreMethod, subjectScores, scoringOverride, scoringConfig) : null), overall.successPercent]);
    for (const [outcomeId, acc] of outcomeAccumulator) {
      const rate = acc.evidence ? acc.correct / acc.evidence : 0;
      outcomeRows.push([uuid('or'), studentId, exam.id, outcomeId, acc.evidence, acc.correct, rate, masteryStatus(acc.correct, acc.evidence)]);
    }
    if (participantByStudent.has(studentId)) {
      const key = incomingSubjects.map((subject) => subject.subject_id).sort().join(',');
      replaced.set(key, [...(replaced.get(key) || []), participantId]);
    }
    progressRows.push([batchId, row.id, studentId, participantId]);
  }

  for (const [key, ids] of replaced) {
    const subjectList = jsonList(key.split(',')), idList = jsonList(ids);
    statements.push(
      env.DB.prepare(`DELETE FROM student_answers WHERE participant_id IN (SELECT value FROM json_each(?)) AND exam_question_id IN (SELECT id FROM exam_questions WHERE exam_id=? AND subject_id IN (SELECT value FROM json_each(?)))`).bind(idList, exam.id, subjectList),
      env.DB.prepare(`DELETE FROM subject_results WHERE participant_id IN (SELECT value FROM json_each(?)) AND subject_id IN (SELECT value FROM json_each(?))`).bind(idList, subjectList),
      env.DB.prepare(`DELETE FROM exam_results WHERE participant_id IN (SELECT value FROM json_each(?))`).bind(idList),
    );
  }

  if (newStudentRows.length) {
    statements.push(...bulkInsert(env.DB, 'student_entities', ['id','first_name','last_name','normalized_name','status'], newStudentRows));
    statements.push(...bulkInsert(env.DB, 'student_enrollments', ['id','student_id','institution_id','season_id','class_id','student_number','grade_level','section'], newEnrollmentRows));
    statements.push(...bulkInsert(env.DB, 'guest_profiles', ['student_id','first_seen_exam_id'], newGuestProfileRows, 'INSERT OR REPLACE INTO'));
    statements.push(env.DB.prepare(`UPDATE scan_records SET matched_student_id=(SELECT json_extract(value,'$[1]') FROM json_each(?1) WHERE json_extract(value,'$[0]')=scan_records.id),match_status='GUEST_MATCH',match_confidence=1 WHERE batch_id=?2 AND id IN (SELECT json_extract(value,'$[0]') FROM json_each(?1))`).bind(JSON.stringify(guestLinkRows), batchId));
  }

  if (outcomeStudentIds.length) {
    statements.push(env.DB.prepare(`DELETE FROM outcome_results WHERE exam_id=? AND student_id IN (SELECT value FROM json_each(?))`).bind(exam.id, jsonList(outcomeStudentIds)));
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
  return json({ ok: true, done: false, processed, processedThisRun: resolved.length, total, remaining, batchId, examId: exam.id });
}

/**
 * One evaluation step for an already authorised user: chunks run back to back until the batch is done or the time
 * budget is used (each chunk is one D1 batch, so a request stays far below the per-invocation query limit).
 * The client calls again while `done` is false; progress is kept in scan_evaluation_progress, so retrying is safe.
 */
export async function evaluateBatchChunk(env: Env, user: { id: string }, batchId: string, budgetMs = 20000): Promise<Response> {
  const batch = await one<AnyRow>(env.DB.prepare('SELECT exam_id FROM scan_batches WHERE id=?').bind(batchId)); if (!batch) return notFound();
  const started = Date.now();
  return withExamOperationLock(env, batch.exam_id, 'EVALUATE', async (env) => {
    let response: Response;
    do {
      response = await evaluateChunkUnlocked(env, user, batchId);
      if (!response.ok) return response;
      const payload = await response.clone().json() as any;
      if (payload?.done) break;
    } while (Date.now() - started < budgetMs);
    const payload = await response.clone().json() as any;
    if (payload?.ok && payload?.done) {
      try { await persistTytOptionalPhilosophyEvidence(env, batchId); } catch (error) {
        if (error instanceof Error && error.message.includes('EXAM_OPERATION_OWNERSHIP_LOST')) throw error;
        console.error('TYT optional philosophy evidence persistence failed', error);
        await env.DB.prepare("UPDATE scan_batches SET status='READY' WHERE id=?").bind(batchId).run();
        return json({ ok: false, error: { code: 'TYT_OPTIONAL_EVIDENCE_FAILED', message: 'TYT seçmeli Felsefe kanıt sonucu kaydedilemedi. Ana 120 soruluk değerlendirme değiştirilmedi; işlem güvenli şekilde tekrar denenebilir.' } }, 500);
      }
    }
    return response;
  });
}

async function evaluateChunk(request:Request,env:Env,batchId:string):Promise<Response>{
  const batch=await one<AnyRow>(env.DB.prepare('SELECT * FROM scan_batches WHERE id=?').bind(batchId));if(!batch)return notFound();
  const access=await ensureAccess(env,request,batch);if(access.response||!access.user)return access.response!;
  return evaluateBatchChunk(env,access.user,batchId);
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
