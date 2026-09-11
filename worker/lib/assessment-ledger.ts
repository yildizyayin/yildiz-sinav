import type { Env } from '../types';
import { all, audit, one, uuid } from './db';

export type AssessmentSource = 'EXAM' | 'FOY' | 'EXTERNAL' | 'QUESTION_BANK' | 'MINI_TEST' | 'ASSIGNMENT';
export type AssessmentDelivery = 'DIGITAL' | 'PDF' | 'OPTICAL';

export interface AssessmentResponseInput {
  questionId?: string | null;
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

export async function recordExamAssessments(env: Env, batchId: string): Promise<number> {
  const participants = await all<any>(env.DB.prepare(`SELECT ep.id participant_id,ep.exam_id,ep.institution_id,ep.student_id,ep.booklet_code,
      sb.source_type,e.title FROM exam_participants ep JOIN scan_batches sb ON sb.exam_id=ep.exam_id AND sb.id=?
      JOIN exams e ON e.id=ep.exam_id WHERE ep.scan_record_id IN (SELECT id FROM scan_records WHERE batch_id=?)`).bind(batchId,batchId));
  let count = 0;
  for (const participant of participants) {
    const result = await one<any>(env.DB.prepare(`SELECT success_percent FROM exam_results WHERE participant_id=?`).bind(participant.participant_id));
    if (!result) continue;
    const answerRows = await all<any>(env.DB.prepare(`SELECT sa.exam_question_id question_id,sa.answer,sa.status,qo.outcome_id,q.subject_id
      FROM student_answers sa JOIN exam_questions q ON q.id=sa.exam_question_id
      LEFT JOIN question_outcomes qo ON qo.exam_question_id=q.id WHERE sa.participant_id=?`).bind(participant.participant_id));
    const subjectIds = [...new Set(answerRows.map(row => row.subject_id).filter(Boolean))];
    await recordAssessmentRun(env.DB, {
      id:`asr_exam_${participant.participant_id}`, institutionId:participant.institution_id, studentId:participant.student_id,
      sourceType:'EXAM', sourceId:participant.participant_id, examId:participant.exam_id, bookletCode:participant.booklet_code,
      deliveryMode:deliveryFromScan(participant.source_type), score:Number(result.success_percent||0)/100,
      metadata:{title:participant.title,subjectIds,batchId},
      responses:answerRows.map(row => ({questionId:row.question_id,selectedAnswer:row.answer,isCorrect:row.status==='CORRECT',sourceChannel:deliveryFromScan(participant.source_type)==='OPTICAL'?'OPTICAL':'PDF'})),
    });
    count++;
  }
  return count;
}

export async function recordExamEvidenceAudit(env: Env, actorId: string, institutionId: string | null, batchId: string, count: number) {
  await audit(env.DB,actorId,institutionId,'ASSESSMENT_LEDGER_EXAM_RECORDED','scan_batch',batchId,{count,source:'EXAM'});
}
