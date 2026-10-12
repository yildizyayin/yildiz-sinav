import type {Env} from '../types';

// Only one verified curriculum/program context is allowed per question. Keep
// the student's originally recorded answer status; never recompute score/net.
const evidenceCTE=`WITH valid AS (
 SELECT sa.participant_id,sa.exam_question_id,sa.status,o.id outcome_id,o.code,o.title,o.topic,o.subtopic,o.subject_id,s.name subject_name,
 cv.id curriculum_id,cv.academic_year,COALESCE(o.grade_level,cv.grade_level) grade_level,cv.program_version
 FROM student_answers sa JOIN exam_participants ep ON ep.id=sa.participant_id
 JOIN exams e ON e.id=ep.exam_id JOIN exam_questions q ON q.id=sa.exam_question_id AND q.exam_id=e.id
 JOIN question_outcomes qo ON qo.exam_question_id=q.id JOIN outcomes o ON o.id=qo.outcome_id AND o.subject_id=q.subject_id
 JOIN subjects s ON s.id=o.subject_id JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
 WHERE e.id=? AND ep.participant_status='ACTIVE' AND o.active=1 AND o.official=1 AND cv.verified=1 AND cv.academic_year=e.academic_year
 AND COALESCE(o.grade_level,cv.grade_level)=e.grade_level
 AND cv.program_code=CASE WHEN e.exam_type IN ('TYT','AYT') THEN e.exam_type ELSE 'SCHOOL' END
 AND (SELECT COUNT(DISTINCT o2.curriculum_version_id) FROM question_outcomes qo2 JOIN outcomes o2 ON o2.id=qo2.outcome_id WHERE qo2.exam_question_id=q.id)=1
)`;
export const INSERT_ANALYSIS_REVISION_SQL=`INSERT INTO exam_outcome_analysis_revisions(exam_id,revision,actor_id,published_app_at) SELECT ?,COALESCE(MAX(revision),0)+1,?,CURRENT_TIMESTAMP FROM exam_outcome_analysis_revisions WHERE exam_id=?`;
export const INSERT_ANALYSIS_HISTORY_SQL=`${evidenceCTE}
 INSERT INTO exam_outcome_analysis_history(exam_id,revision,participant_id,student_id,institution_id,academic_year,grade_level,payload_json)
 SELECT ep.exam_id,(SELECT MAX(revision) FROM exam_outcome_analysis_revisions WHERE exam_id=ep.exam_id),ep.id,ep.student_id,ep.institution_id,e.academic_year,e.grade_level,
 json_object('outcomeAnalysisRevision',(SELECT MAX(revision) FROM exam_outcome_analysis_revisions WHERE exam_id=ep.exam_id),'outcomeAnalysisUpdatedAt',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'questionEvidencePolicy','NATIVE_STATUS_AND_CURRICULUM_AT_FREEZE_V1',
 'questionEvidence',json((SELECT json_group_array(json_object('questionId',sa.exam_question_id,'status',sa.status,'outcomeRefs',json((SELECT json_group_array(json_object('outcomeId',v.outcome_id,'subjectId',v.subject_id,'curriculumVersionId',v.curriculum_id,'academicYear',v.academic_year,'gradeLevel',v.grade_level,'programVersion',v.program_version,'verified',1,'outcomeCode',v.code,'outcomeTitle',v.title)) FROM valid v WHERE v.participant_id=ep.id AND v.exam_question_id=sa.exam_question_id)))) FROM student_answers sa JOIN exam_questions q ON q.id=sa.exam_question_id AND q.exam_id=ep.exam_id WHERE sa.participant_id=ep.id)),
 'outcomes',json((SELECT json_group_array(json_object('outcome_id',a.outcome_id,'code',a.code,'topic',a.topic,'subtopic',a.subtopic,'title',a.title,'subject_id',a.subject_id,'subject_name',a.subject_name,'evidence_count',a.evidence_count,'correct_count',a.correct_count)) FROM (SELECT v.*,COUNT(*) evidence_count,SUM(v.status='CORRECT') correct_count FROM valid v WHERE v.participant_id=ep.id AND v.status IN ('CORRECT','WRONG','BLANK') GROUP BY v.outcome_id) a)))
 FROM exam_participants ep JOIN exams e ON e.id=ep.exam_id WHERE ep.exam_id=? AND ep.participant_status='ACTIVE' AND EXISTS(SELECT 1 FROM exam_results er WHERE er.participant_id=ep.id)`;
export const REBUILD_OUTCOME_RESULTS_SQL=`${evidenceCTE}
 INSERT INTO outcome_results(id,student_id,exam_id,outcome_id,evidence_count,correct_count,success_rate,mastery_status)
 SELECT 'orh_'||hex(randomblob(16)),ep.student_id,ep.exam_id,v.outcome_id,COUNT(*),SUM(v.status='CORRECT'),CAST(SUM(v.status='CORRECT') AS REAL)/COUNT(*),
 CASE WHEN COUNT(*)<3 THEN 'INSUFFICIENT_EVIDENCE' WHEN CAST(SUM(v.status='CORRECT') AS REAL)/COUNT(*)>=0.6 THEN 'STRONG' ELSE 'DEVELOPING' END
 FROM valid v JOIN exam_participants ep ON ep.id=v.participant_id WHERE ep.student_id IS NOT NULL AND v.status IN ('CORRECT','WRONG','BLANK') AND EXISTS(SELECT 1 FROM exam_results er WHERE er.participant_id=ep.id)
 GROUP BY ep.student_id,ep.exam_id,v.outcome_id`;
export function buildExamOutcomeAnalysisStatements(env:Env,examId:string,actorId:string){return [
 env.DB.prepare(INSERT_ANALYSIS_REVISION_SQL).bind(examId,actorId,examId),
 env.DB.prepare(INSERT_ANALYSIS_HISTORY_SQL).bind(examId,examId),
 env.DB.prepare('DELETE FROM outcome_results WHERE exam_id=?').bind(examId),
 env.DB.prepare(REBUILD_OUTCOME_RESULTS_SQL).bind(examId),
 env.DB.prepare('SELECT MAX(revision) revision,(SELECT COUNT(*) FROM exam_outcome_analysis_history WHERE exam_id=? AND revision=(SELECT MAX(revision) FROM exam_outcome_analysis_revisions WHERE exam_id=?)) participant_count FROM exam_outcome_analysis_revisions WHERE exam_id=?').bind(examId,examId,examId),
]}
/** D1 batches are transactional: mappings, derived evidence and history rollback together. */
export async function refreshExamOutcomeAnalysis(env:Env,examId:string,actorId:string,mappingMutations:D1PreparedStatement[]=[]){
 const batches=await env.DB.batch([...mappingMutations,...buildExamOutcomeAnalysisStatements(env,examId,actorId)]);
 const row=batches[batches.length-1].results?.[0] as any;
 return {revision:Number(row?.revision||0),participantCount:Number(row?.participant_count||0)};
}
/** Only explicitly published analysis overlays current report data; exports
 * with an asOf keep the analysis version that existed at job creation. */
export function examOutcomePayloadSql(alias:string,channel:'APP'|'RESULT'='APP',asOfSql?:string){
 const published=channel==='APP'?'published_app_at':'published_result_at';
 return `COALESCE((SELECT json_patch(${alias}.payload_json,h.payload_json) FROM exam_outcome_analysis_history h JOIN exam_outcome_analysis_revisions r ON r.exam_id=h.exam_id AND r.revision=h.revision WHERE h.exam_id=${alias}.exam_id AND h.participant_id=${alias}.participant_id AND h.student_id IS ${alias}.student_id AND h.institution_id=${alias}.institution_id AND h.academic_year=json_extract(${alias}.payload_json,'$.exam.academic_year') AND h.grade_level IS ${alias}.grade_level AND r.${published} IS NOT NULL ${asOfSql?`AND julianday(r.${published})<=julianday(${asOfSql})`:''} ORDER BY h.revision DESC LIMIT 1),${alias}.payload_json)`;
}
