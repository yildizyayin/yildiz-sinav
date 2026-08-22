import type { Env } from '../types';
import { all } from './db';

// Core national/city/district/institution/grade/class ranks already live in the compact exam_result_snapshots row.
// This extension only materializes the many-to-many NETWORK dimension so 500k-participant national exams do not duplicate every rank seven times.
export async function materializeNetworkAndPublisherAnalytics(env:Env,examId:string,version:number){
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM exam_result_scope_ranks WHERE exam_id=? AND snapshot_version=?`).bind(examId,version),
    env.DB.prepare(`DELETE FROM publisher_question_analytics WHERE exam_id=? AND snapshot_version=?`).bind(examId,version),
  ]);
  await env.DB.prepare(`INSERT INTO exam_result_scope_ranks(id,exam_id,participant_id,snapshot_version,scope_type,scope_id,rank,participant_count,score,net)
    SELECT 'rk_'||lower(hex(randomblob(16))),s.exam_id,s.participant_id,s.snapshot_version,'NETWORK',m.network_id,
      RANK() OVER(PARTITION BY m.network_id ORDER BY COALESCE(s.score,s.net) DESC),
      COUNT(*) OVER(PARTITION BY m.network_id),s.score,s.net
    FROM exam_result_snapshots s
    JOIN institution_network_members m ON m.institution_id=s.institution_id AND m.active=1
    WHERE s.exam_id=? AND s.snapshot_version=?`).bind(examId,version).run();
  await env.DB.prepare(`INSERT INTO publisher_question_analytics(exam_id,snapshot_version,exam_question_id,subject_id,question_no,participant_count,correct_count,wrong_count,blank_count,invalid_count,success_percent)
    SELECT ?,?,q.id,q.subject_id,q.question_no,COUNT(a.id),
      SUM(CASE WHEN a.status='CORRECT' THEN 1 ELSE 0 END),SUM(CASE WHEN a.status='WRONG' THEN 1 ELSE 0 END),SUM(CASE WHEN a.status='BLANK' THEN 1 ELSE 0 END),SUM(CASE WHEN a.status='INVALID' THEN 1 ELSE 0 END),
      ROUND(100.0*SUM(CASE WHEN a.status='CORRECT' THEN 1 ELSE 0 END)/NULLIF(COUNT(a.id),0),2)
    FROM exam_questions q
    LEFT JOIN student_answers a ON a.exam_question_id=q.id
    LEFT JOIN exam_participants ep ON ep.id=a.participant_id AND ep.exam_id=?
    WHERE q.exam_id=? AND (a.id IS NULL OR ep.id IS NOT NULL)
    GROUP BY q.id,q.subject_id,q.question_no`).bind(examId,version,examId,examId).run();
}

export async function networkRanksForParticipant(env:Env,examId:string,participantId:string,version:number){
  return all<any>(env.DB.prepare(`SELECT r.scope_type,r.scope_id,r.rank,r.participant_count,n.name network_name
    FROM exam_result_scope_ranks r JOIN institution_networks n ON n.id=r.scope_id
    WHERE r.exam_id=? AND r.participant_id=? AND r.snapshot_version=? AND r.scope_type='NETWORK'
    ORDER BY n.name`).bind(examId,participantId,version));
}

export async function publisherQuestionAnalytics(env:Env,publisherId:string,examId:string|null){
  if(!examId)return {selectedExamId:null,questionAnalytics:[] as any[]};
  const profile=await env.DB.prepare(`SELECT snapshot_version FROM exam_delivery_profiles WHERE exam_id=? AND publisher_id=?`).bind(examId,publisherId).first<any>();
  if(!profile)return {selectedExamId:null,questionAnalytics:[] as any[]};
  const rows=await all<any>(env.DB.prepare(`SELECT a.*,s.name subject_name FROM publisher_question_analytics a JOIN subjects s ON s.id=a.subject_id
    WHERE a.exam_id=? AND a.snapshot_version=? ORDER BY s.name,a.question_no`).bind(examId,profile.snapshot_version));
  return {selectedExamId:examId,questionAnalytics:rows};
}
