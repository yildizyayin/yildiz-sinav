import type {Env} from '../types';
import {SCHOOL_ALIASES,UNIVERSITY_FAMILIES} from './exam-outcome-matching';

/** Exam subject → catalogue subject pairs the mapping screen allows (a TYT Fen question maps to a Fizik outcome). */
const FAMILY_PAIRS=[...Object.entries(UNIVERSITY_FAMILIES),...Object.entries(SCHOOL_ALIASES)].flatMap(([exam,list])=>list.map((o)=>`('${exam}','${o}')`)).join(',');
const SUBJECT_FITS=(q:string,o:string)=>`(${o}.subject_id=${q}.subject_id OR EXISTS(SELECT 1 FROM (SELECT column1 es,column2 os FROM (VALUES ${FAMILY_PAIRS})) f WHERE f.es=${q}.subject_id AND f.os=${o}.subject_id))`;

// A029: guests are participants too: evaluation gives them outcome evidence, so re-analysis must as well
// (it used to delete theirs and rebuild only ACTIVE participants).
// Only one verified curriculum/program context is allowed per question. Keep
// the student's originally recorded answer status; never recompute score/net.
// The scope is the one the mapping screen uses (exam-outcome-matching, owner decision 26 Oct): the verified MEB school
// programme, TYT grades 9–10, AYT 11–12, other exams their own grade; the catalogue year is the exam's or the nearest
// verified one (2026-27 exams use the 2027-28 TYMM catalogue). Mappings are only ever made from that catalogue.
const evidenceCTE=`WITH scope AS MATERIALIZED (SELECT (SELECT substr(min(printf('%04d%04d',abs(CAST(substr(cv2.academic_year,1,4) AS INTEGER)-CAST(substr(e.academic_year,1,4) AS INTEGER)),9999-CAST(substr(cv2.academic_year,1,4) AS INTEGER))||cv2.academic_year),9)
  FROM curriculum_versions cv2 JOIN outcomes o2 ON o2.curriculum_version_id=cv2.id
  WHERE cv2.verified=1 AND cv2.program_code='SCHOOL' AND o2.active=1 AND o2.official=1 AND CASE e.exam_type WHEN 'TYT' THEN COALESCE(o2.grade_level,cv2.grade_level) IN (9,10) WHEN 'AYT' THEN COALESCE(o2.grade_level,cv2.grade_level) IN (11,12) ELSE COALESCE(o2.grade_level,cv2.grade_level)=e.grade_level END) wanted FROM exams e WHERE e.id=?1),
valid AS (
 SELECT sa.participant_id,sa.exam_question_id,sa.status,o.id outcome_id,o.code,o.title,o.topic,o.subtopic,o.subject_id,s.name subject_name,
 cv.id curriculum_id,cv.academic_year,COALESCE(o.grade_level,cv.grade_level) grade_level,cv.program_version
 FROM student_answers sa JOIN exam_participants ep ON ep.id=sa.participant_id
 JOIN exams e ON e.id=ep.exam_id JOIN exam_questions q ON q.id=sa.exam_question_id AND q.exam_id=e.id
 JOIN question_outcomes qo ON qo.exam_question_id=q.id JOIN outcomes o ON o.id=qo.outcome_id AND ${SUBJECT_FITS('q','o')}
 JOIN subjects s ON s.id=o.subject_id JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
 WHERE e.id=?1 AND ep.participant_status IN ('ACTIVE','GUEST') AND o.active=1 AND o.official=1 AND cv.verified=1 AND cv.program_code='SCHOOL'
 AND CASE e.exam_type WHEN 'TYT' THEN COALESCE(o.grade_level,cv.grade_level) IN (9,10) WHEN 'AYT' THEN COALESCE(o.grade_level,cv.grade_level) IN (11,12) ELSE COALESCE(o.grade_level,cv.grade_level)=e.grade_level END
 AND cv.academic_year=(SELECT wanted FROM scope)
 AND (SELECT COUNT(DISTINCT o2.curriculum_version_id) FROM question_outcomes qo2 JOIN outcomes o2 ON o2.id=qo2.outcome_id WHERE qo2.exam_question_id=q.id)=1
)`;
export const INSERT_ANALYSIS_REVISION_SQL=`INSERT INTO exam_outcome_analysis_revisions(exam_id,revision,actor_id,published_app_at) SELECT ?,COALESCE(MAX(revision),0)+1,?,CURRENT_TIMESTAMP FROM exam_outcome_analysis_revisions WHERE exam_id=?`;
export const INSERT_ANALYSIS_HISTORY_SQL=`${evidenceCTE}
 INSERT INTO exam_outcome_analysis_history(exam_id,revision,participant_id,student_id,institution_id,academic_year,grade_level,payload_json)
 SELECT ep.exam_id,(SELECT MAX(revision) FROM exam_outcome_analysis_revisions WHERE exam_id=ep.exam_id),ep.id,ep.student_id,ep.institution_id,e.academic_year,e.grade_level,
 json_object('outcomeAnalysisRevision',(SELECT MAX(revision) FROM exam_outcome_analysis_revisions WHERE exam_id=ep.exam_id),'outcomeAnalysisUpdatedAt',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'questionEvidencePolicy','NATIVE_STATUS_AND_CURRICULUM_AT_FREEZE_V1',
 'questionEvidence',json((SELECT json_group_array(json_object('questionId',sa.exam_question_id,'status',sa.status,'outcomeRefs',json((SELECT json_group_array(json_object('outcomeId',v.outcome_id,'subjectId',v.subject_id,'curriculumVersionId',v.curriculum_id,'academicYear',v.academic_year,'gradeLevel',v.grade_level,'programVersion',v.program_version,'verified',1,'outcomeCode',v.code,'outcomeTitle',v.title)) FROM valid v WHERE v.participant_id=ep.id AND v.exam_question_id=sa.exam_question_id)))) FROM student_answers sa JOIN exam_questions q ON q.id=sa.exam_question_id AND q.exam_id=ep.exam_id WHERE sa.participant_id=ep.id)),
 'outcomes',json((SELECT json_group_array(json_object('outcome_id',a.outcome_id,'code',a.code,'topic',a.topic,'subtopic',a.subtopic,'title',a.title,'subject_id',a.subject_id,'subject_name',a.subject_name,'evidence_count',a.evidence_count,'correct_count',a.correct_count,'wrong_count',a.wrong_count,'blank_count',a.blank_count)) FROM (SELECT v.*,COUNT(*) evidence_count,SUM(v.status='CORRECT') correct_count,SUM(v.status='WRONG') wrong_count,SUM(v.status='BLANK') blank_count FROM valid v WHERE v.participant_id=ep.id AND v.status IN ('CORRECT','WRONG','BLANK') GROUP BY v.outcome_id) a)))
 FROM exam_participants ep JOIN exams e ON e.id=ep.exam_id WHERE ep.exam_id=? AND ep.participant_status IN ('ACTIVE','GUEST') AND EXISTS(SELECT 1 FROM exam_results er WHERE er.participant_id=ep.id)`;
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
 * with an asOf keep the analysis version that existed at job creation.
 * 3 Nov (owner): a revision that found no outcome for this student never erases the outcomes the result was
 * published with; the newest revision that has outcomes wins, otherwise the snapshot stays as published. */
export function examOutcomePayloadSql(alias:string,channel:'APP'|'RESULT'='APP',asOfSql?:string){
 const published=channel==='APP'?'published_app_at':'published_result_at';
 return `COALESCE((SELECT json_patch(${alias}.payload_json,h.payload_json) FROM exam_outcome_analysis_history h JOIN exam_outcome_analysis_revisions r ON r.exam_id=h.exam_id AND r.revision=h.revision WHERE h.exam_id=${alias}.exam_id AND h.participant_id=${alias}.participant_id AND h.student_id IS ${alias}.student_id AND h.institution_id=${alias}.institution_id AND h.academic_year=json_extract(${alias}.payload_json,'$.exam.academic_year') AND h.grade_level IS ${alias}.grade_level AND r.${published} IS NOT NULL AND COALESCE(json_array_length(h.payload_json,'$.outcomes'),0)>0 ${asOfSql?`AND julianday(r.${published})<=julianday(${asOfSql})`:''} ORDER BY h.revision DESC LIMIT 1),${alias}.payload_json)`;
}
