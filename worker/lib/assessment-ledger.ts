import type { Env } from '../types';
import { all, audit, one, uuid } from './db';

export type AssessmentSource = 'EXAM' | 'FOY' | 'EXTERNAL' | 'QUESTION_BANK' | 'MINI_TEST' | 'ASSIGNMENT';
export type AssessmentDelivery = 'DIGITAL' | 'PDF' | 'OPTICAL';

export interface AssessmentResponseInput {
  questionId?: string | null;
  examQuestionId?: string | null;
  nodeId?: string | null;
  selectedAnswer?: string | null;
  isCorrect?: boolean | null;
  sourceChannel?: 'DIGITAL' | 'PDF' | 'OPTICAL' | 'IMPORT';
}

export interface AssessmentRunInput {
  id: string;
  institutionId: string | null;
  studentId: string;
  sourceType: AssessmentSource;
  sourceId: string;
  assignmentId?: string | null;
  examId?: string | null;
  bookletCode?: string | null;
  deliveryMode: AssessmentDelivery;
  score: number | null;
  metadata?: Record<string, unknown>;
  responses?: AssessmentResponseInput[];
}

export async function recordAssessmentRun(db: D1Database, input: AssessmentRunInput): Promise<string> {
  await db.prepare(`INSERT OR IGNORE INTO assessment_runs
    (id,institution_id,student_id,source_type,source_id,assignment_id,exam_id,booklet_code,delivery_mode,status,score,metadata_json,completed_at)
    VALUES(?,?,?,?,?,?,?,?,?,'SCORED',?,?,CURRENT_TIMESTAMP)`)
    .bind(input.id,input.institutionId,input.studentId,input.sourceType,input.sourceId,input.assignmentId||null,input.examId||null,input.bookletCode||null,input.deliveryMode,input.score,input.metadata?JSON.stringify(input.metadata):null).run();
  await db.prepare(`UPDATE assessment_runs SET status='SCORED',score=?,metadata_json=COALESCE(?,metadata_json),completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP) WHERE id=?`)
    .bind(input.score,input.metadata?JSON.stringify(input.metadata):null,input.id).run();
  await db.prepare('DELETE FROM assessment_responses WHERE run_id=?').bind(input.id).run();
  for (const response of input.responses || []) {
    if (response.examQuestionId) {
      await db.prepare(`INSERT OR IGNORE INTO assessment_responses
        (id,run_id,student_id,exam_question_id,selected_answer,is_correct,source_channel)
        VALUES(?,?,?,?,?,?,?)`).bind(uuid('ars'),input.id,input.studentId,response.examQuestionId,response.selectedAnswer||null,response.isCorrect==null?null:(response.isCorrect?1:0),response.sourceChannel||input.deliveryMode).run();
      continue;
    }
    if (!response.questionId) continue;
    await db.prepare(`INSERT OR IGNORE INTO assessment_responses
      (id,run_id,student_id,question_id,node_id,selected_answer,is_correct,source_channel)
      VALUES(?,?,?,?,?,?,?,?)`).bind(uuid('ars'),input.id,input.studentId,response.questionId,response.nodeId||null,response.selectedAnswer||null,response.isCorrect==null?null:(response.isCorrect?1:0),response.sourceChannel||input.deliveryMode).run();
  }
  return input.id;
}

function deliveryFromScan(sourceType: string): AssessmentDelivery {
  return sourceType === 'CAMERA' ? 'OPTICAL' : sourceType === 'TXT' || sourceType === 'DAT' || sourceType === 'CSV' ? 'PDF' : 'DIGITAL';
}

/**
 * The exam's evidence in the shared assessment ledger: one scored run per participant with every answer.
 * S035: written set-based (a few statements per 250 participants) instead of one query per answer, which broke
 * D1's per-request query limit on real classes. Same rows as before: run id asr_exam_<participant>, score =
 * success % / 100, responses one per answered exam question (INSERT OR IGNORE keeps one per question).
 */
export async function recordExamAssessments(env: Env, batchId: string): Promise<number> {
  const participants = await all<any>(env.DB.prepare(`SELECT ep.id participant_id,ep.exam_id,ep.institution_id,ep.student_id,ep.booklet_code,
      sb.source_type,e.title,er.success_percent,
      (SELECT json_group_array(subject_id) FROM (SELECT q.subject_id FROM student_answers sa JOIN exam_questions q ON q.id=sa.exam_question_id WHERE sa.participant_id=ep.id GROUP BY q.subject_id ORDER BY min(sa.rowid))) subject_ids
    FROM exam_participants ep JOIN scan_batches sb ON sb.exam_id=ep.exam_id AND sb.id=? JOIN exams e ON e.id=ep.exam_id
    JOIN exam_results er ON er.participant_id=ep.id
    WHERE ep.scan_record_id IN (SELECT id FROM scan_records WHERE batch_id=?)`).bind(batchId, batchId));
  for (let i = 0; i < participants.length; i += 250) {
    const group = participants.slice(i, i + 250);
    const runs = group.map((p) => {
      const delivery = deliveryFromScan(p.source_type);
      let subjectIds: string[] = []; try { subjectIds = JSON.parse(p.subject_ids || '[]'); } catch { /* */ }
      return [`asr_exam_${p.participant_id}`, p.institution_id, p.student_id, p.participant_id, p.exam_id, p.booklet_code || null, delivery, Number(p.success_percent || 0) / 100,
        JSON.stringify({ title: p.title, subjectIds, batchId }), p.participant_id, delivery === 'OPTICAL' ? 'OPTICAL' : 'PDF'];
    });
    const json = JSON.stringify(runs);
    const col = (k: number) => `json_extract(value,'$[${k}]')`;
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO assessment_runs (id,institution_id,student_id,source_type,source_id,assignment_id,exam_id,booklet_code,delivery_mode,status,score,metadata_json,completed_at)
        SELECT ${col(0)},${col(1)},${col(2)},'EXAM',${col(3)},NULL,${col(4)},${col(5)},${col(6)},'SCORED',${col(7)},${col(8)},CURRENT_TIMESTAMP FROM json_each(?)`).bind(json),
      env.DB.prepare(`UPDATE assessment_runs SET status='SCORED',score=(SELECT ${col(7)} FROM json_each(?1) WHERE ${col(0)}=assessment_runs.id),
        metadata_json=COALESCE((SELECT ${col(8)} FROM json_each(?1) WHERE ${col(0)}=assessment_runs.id),metadata_json),completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP)
        WHERE id IN (SELECT ${col(0)} FROM json_each(?1))`).bind(json),
      env.DB.prepare(`DELETE FROM assessment_responses WHERE run_id IN (SELECT ${col(0)} FROM json_each(?))`).bind(json),
      env.DB.prepare(`INSERT OR IGNORE INTO assessment_responses (id,run_id,student_id,exam_question_id,selected_answer,is_correct,source_channel)
        SELECT 'ars_'||lower(hex(randomblob(16))),${col(0).replace('value', 'r.value')},ep.student_id,sa.exam_question_id,NULLIF(sa.answer,''),CASE WHEN sa.status='CORRECT' THEN 1 ELSE 0 END,${col(10).replace('value', 'r.value')}
        FROM json_each(?) r JOIN student_answers sa ON sa.participant_id=${col(9).replace('value', 'r.value')} JOIN exam_participants ep ON ep.id=sa.participant_id
        ORDER BY sa.participant_id,sa.rowid`).bind(json),
    ]);
  }
  return participants.length;
}

export async function recordExamEvidenceAudit(env: Env, actorId: string, institutionId: string | null, batchId: string, count: number) {
  await audit(env.DB,actorId,institutionId,'ASSESSMENT_LEDGER_EXAM_RECORDED','scan_batch',batchId,{count,source:'EXAM'});
}
