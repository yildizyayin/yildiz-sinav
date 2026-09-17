import curriculumApp from './curriculum-admin-entry';
import type { CanonicalRecord, Env } from './types';
import { getAuthUser } from './lib/auth';
import { all, audit, json, one, uuid } from './lib/db';
import { calculateOverall, calculateSubjectScore } from './lib/scoring';
import { masteryStatus } from './lib/outcome';

interface SubjectRow {
  subject_id: string;
  code: string;
  question_count: number;
  wrong_divisor: number;
}

interface ParticipantRow {
  id: string;
  student_id: string | null;
  canonical_json: string;
}

async function repairBlankPositions(env: Env, batchId: string): Promise<{ repaired: number; participants: number }> {
  const batch = await one<any>(env.DB.prepare('SELECT id,exam_id,institution_id,status FROM scan_batches WHERE id=?').bind(batchId));
  if (!batch || batch.status !== 'COMMITTED') return { repaired: 0, participants: 0 };

  const subjects = await all<SubjectRow>(env.DB.prepare(`
    SELECT es.subject_id,s.code,es.question_count,es.wrong_divisor
    FROM exam_subjects es JOIN subjects s ON s.id=es.subject_id
    WHERE es.exam_id=? ORDER BY es.sort_order
  `).bind(batch.exam_id));

  const questionRows = await all<{ id: string; subject_id: string; question_no: number }>(env.DB.prepare(`
    SELECT id,subject_id,question_no FROM exam_questions WHERE exam_id=? ORDER BY subject_id,question_no
  `).bind(batch.exam_id));
  const questions = new Map<string, Map<number, string>>();
  for (const q of questionRows) {
    if (!questions.has(q.subject_id)) questions.set(q.subject_id, new Map());
    questions.get(q.subject_id)!.set(Number(q.question_no), q.id);
  }

  const participants = await all<ParticipantRow>(env.DB.prepare(`
    SELECT ep.id,ep.student_id,sr.canonical_json
    FROM exam_participants ep
    JOIN scan_records sr ON sr.id=ep.scan_record_id
    WHERE sr.batch_id=?
  `).bind(batchId));

  let repaired = 0;
  for (const participant of participants) {
    let record: CanonicalRecord;
    try { record = JSON.parse(participant.canonical_json) as CanonicalRecord; } catch { continue; }

    for (const subject of subjects) {
      const sequence = record.answers_by_subject?.[subject.code] || '';
      const qMap = questions.get(subject.subject_id);
      if (!qMap) continue;
      for (let i = 0; i < Math.min(sequence.length, Number(subject.question_count)); i++) {
        if (sequence[i] !== '_') continue;
        const questionId = qMap.get(i + 1);
        if (!questionId) continue;
        const result = await env.DB.prepare(`UPDATE student_answers SET answer=NULL,status='BLANK' WHERE participant_id=? AND exam_question_id=? AND status!='BLANK'`).bind(participant.id, questionId).run();
        repaired += Number(result.meta?.changes || 0);
      }
    }

    const subjectScores = [];
    for (const subject of subjects) {
      const counts = await one<{ correct: number; wrong: number; blank: number }>(env.DB.prepare(`
        SELECT
          sum(CASE WHEN sa.status='CORRECT' THEN 1 ELSE 0 END) correct,
          sum(CASE WHEN sa.status='WRONG' THEN 1 ELSE 0 END) wrong,
          sum(CASE WHEN sa.status='BLANK' THEN 1 ELSE 0 END) blank
        FROM student_answers sa
        JOIN exam_questions q ON q.id=sa.exam_question_id
        WHERE sa.participant_id=? AND q.subject_id=?
      `).bind(participant.id, subject.subject_id));
      const score = calculateSubjectScore({
        correct: Number(counts?.correct || 0),
        wrong: Number(counts?.wrong || 0),
        blank: Number(counts?.blank || 0),
        wrongDivisor: Number(subject.wrong_divisor),
        questionCount: Number(subject.question_count),
      });
      subjectScores.push(score);
      await env.DB.prepare(`UPDATE subject_results SET correct_count=?,wrong_count=?,blank_count=?,net=?,success_percent=? WHERE participant_id=? AND subject_id=?`)
        .bind(score.correct, score.wrong, score.blank, score.net, score.successPercent, participant.id, subject.subject_id).run();
    }

    const overall = calculateOverall(subjectScores);
    await env.DB.prepare(`UPDATE exam_results SET correct_count=?,wrong_count=?,blank_count=?,net=?,success_percent=? WHERE participant_id=?`)
      .bind(overall.correct, overall.wrong, overall.blank, overall.net, overall.successPercent, participant.id).run();

    if (participant.student_id) {
      await env.DB.prepare('DELETE FROM outcome_results WHERE student_id=? AND exam_id=?').bind(participant.student_id, batch.exam_id).run();
      const outcomeRows = await all<{ outcome_id: string; evidence: number; correct: number }>(env.DB.prepare(`
        SELECT qo.outcome_id,count(*) evidence,sum(CASE WHEN sa.status='CORRECT' THEN 1 ELSE 0 END) correct
        FROM student_answers sa
        JOIN question_outcomes qo ON qo.exam_question_id=sa.exam_question_id
        WHERE sa.participant_id=?
        GROUP BY qo.outcome_id
      `).bind(participant.id));
      for (const outcome of outcomeRows) {
        const evidence = Number(outcome.evidence || 0);
        const correct = Number(outcome.correct || 0);
        await env.DB.prepare(`INSERT INTO outcome_results (id,student_id,exam_id,outcome_id,evidence_count,correct_count,success_rate,mastery_status) VALUES (?,?,?,?,?,?,?,?)`)
          .bind(uuid('or'), participant.student_id, batch.exam_id, outcome.outcome_id, evidence, correct, evidence ? correct / evidence : 0, masteryStatus(correct, evidence)).run();
      }
    }
  }

  await env.DB.prepare(`UPDATE exam_results SET institution_rank=(SELECT rn FROM (
    SELECT er2.id,row_number() OVER (ORDER BY er2.net DESC,er2.correct_count DESC) rn
    FROM exam_results er2 JOIN exam_participants ep2 ON ep2.id=er2.participant_id
    WHERE ep2.exam_id=? AND ep2.institution_id=?
  ) ranked WHERE ranked.id=exam_results.id)
  WHERE participant_id IN (SELECT id FROM exam_participants WHERE exam_id=? AND institution_id=?)`)
    .bind(batch.exam_id, batch.institution_id, batch.exam_id, batch.institution_id).run();

  return { repaired, participants: participants.length };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/scan-batches\/([^/]+)\/evaluate$/);
    if (!match || request.method !== 'POST') return curriculumApp.fetch(request, env);

    const actor = await getAuthUser(env, request);
    const response = await curriculumApp.fetch(request, env);
    if (!response.ok) return response;
    const payload = await response.clone().json<any>().catch(() => null);
    if (!payload?.ok) return response;

    try {
      const repair = await repairBlankPositions(env, match[1]);
      if (repair.repaired > 0 && actor) {
        const batch = await one<any>(env.DB.prepare('SELECT institution_id FROM scan_batches WHERE id=?').bind(match[1]));
        await audit(env.DB, actor.id, batch?.institution_id || null, 'BLANK_ANSWER_POSITIONS_REPAIRED', 'scan_batch', match[1], repair);
      }
      return json({ ...payload, blankPositionRepair: repair });
    } catch (error) {
      console.error('Blank answer repair failed', error);
      await env.DB.prepare(`UPDATE scan_batches SET status='FAILED' WHERE id=?`).bind(match[1]).run().catch(() => undefined);
      return json({ ok: false, error: { code: 'ANSWER_POSITION_REPAIR_FAILED', message: 'Cevap pozisyonları doğrulanırken hata oluştu. Batch güvenli olarak FAILED durumuna alındı.' } }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
