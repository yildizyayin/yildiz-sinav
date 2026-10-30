import type { Env } from '../types';

// A new snapshot version receives its report payload once. Existing versions
// are never backfilled from mutable results because their original state is unknown.
// Hotfix 30 Oct: outcome lookups are driven by the mapping tables (`o.id IN (...)`), never by scanning every
// outcome per answer; with ~3k outcomes and 13k answers the old OR/EXISTS form ran past D1's time limit and the
// freeze failed with a bare server error.
export const REPORT_SNAPSHOT_SQL = `UPDATE exam_result_snapshots AS snap SET payload_json=json_object(
  'schemaVersion',1,
  'exam',(SELECT json_object('exam_id',e.id,'title',e.title,'exam_date',e.exam_date,'exam_type',e.exam_type,'academic_year',e.academic_year,
    'correct_count',er.correct_count,'wrong_count',er.wrong_count,'blank_count',er.blank_count,
    'net',snap.net,'score',snap.score,'success_percent',er.success_percent,
    'institution_rank',snap.institution_rank,'booklet_code',ep.booklet_code)
    FROM exam_participants ep JOIN exams e ON e.id=ep.exam_id JOIN exam_results er ON er.participant_id=ep.id WHERE ep.id=snap.participant_id),
  'participant',(SELECT json_object('name_snapshot',ep.name_snapshot,'student_number_snapshot',ep.student_number_snapshot,'class_snapshot',ep.class_snapshot) FROM exam_participants ep WHERE ep.id=snap.participant_id),
  'wrongQuestionIds',json((SELECT json_group_array(sa.exam_question_id) FROM student_answers sa WHERE sa.participant_id=snap.participant_id AND sa.status='WRONG')),
  'questionEvidencePolicy','NATIVE_STATUS_AND_CURRICULUM_AT_FREEZE_V1',
  'questionEvidence',json((SELECT json_group_array(json_object(
    'questionId',sa.exam_question_id,'status',sa.status,
    'outcomeRefs',json((SELECT json_group_array(json_object(
      'outcomeId',o.id,'subjectId',o.subject_id,'curriculumVersionId',cv.id,
      'academicYear',cv.academic_year,'gradeLevel',cv.grade_level,
      'programVersion',cv.program_version,'verified',COALESCE(cv.verified,0)))
      FROM outcomes o
      LEFT JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
      WHERE o.id IN (
       SELECT sbo.outcome_id FROM studio_exam_booklet_outcomes sbo
        JOIN exam_participants ep ON ep.id=sa.participant_id
        JOIN exam_questions eq ON eq.id=sa.exam_question_id
        WHERE sbo.exam_id=ep.exam_id AND sbo.booklet_code=coalesce(ep.booklet_code,'A')
        AND sbo.printed_question_no=coalesce(eq.global_no,eq.question_no)
       UNION
       SELECT qo.outcome_id FROM question_outcomes qo
        WHERE qo.exam_question_id=sa.exam_question_id
        AND NOT EXISTS(SELECT 1 FROM studio_exam_booklet_positions sp
         JOIN exam_participants ep ON ep.exam_id=sp.exam_id
         WHERE ep.id=sa.participant_id AND sp.booklet_code=coalesce(ep.booklet_code,'A'))
      )))))
    FROM student_answers sa WHERE sa.participant_id=snap.participant_id)),
  'subjects',json((SELECT json_group_array(json_object('subject_id',s.id,'subject_code',s.code,'subject_name',s.name,
    'correct_count',sr.correct_count,'wrong_count',sr.wrong_count,'blank_count',sr.blank_count,'net',sr.net,'success_percent',sr.success_percent))
    FROM subject_results sr JOIN subjects s ON s.id=sr.subject_id WHERE sr.participant_id=snap.participant_id)),
  'outcomes',json((SELECT json_group_array(json_object('outcome_id',o.id,'code',o.code,'topic',o.topic,'subtopic',o.subtopic,'title',o.title,
    'subject_id',s.id,'subject_name',s.name,'evidence_count',r.evidence_count,'correct_count',r.correct_count))
    FROM (SELECT qo.outcome_id,COUNT(*) evidence_count,SUM(CASE WHEN sa.status='CORRECT' THEN 1 ELSE 0 END) correct_count
      FROM student_answers sa JOIN exam_participants ep ON ep.id=sa.participant_id
      JOIN exam_questions eq ON eq.id=sa.exam_question_id
      JOIN outcomes out ON out.id IN (
       SELECT sbo.outcome_id FROM studio_exam_booklet_outcomes sbo WHERE sbo.exam_id=ep.exam_id
        AND sbo.booklet_code=coalesce(ep.booklet_code,'A') AND sbo.printed_question_no=coalesce(eq.global_no,eq.question_no)
       UNION
       SELECT qo.outcome_id FROM question_outcomes qo WHERE qo.exam_question_id=eq.id
        AND NOT EXISTS(SELECT 1 FROM studio_exam_booklet_positions sp WHERE sp.exam_id=ep.exam_id AND sp.booklet_code=coalesce(ep.booklet_code,'A'))
      )
      JOIN (SELECT id outcome_id FROM outcomes) qo ON qo.outcome_id=out.id
      WHERE sa.participant_id=snap.participant_id AND sa.status<>'INVALID' GROUP BY qo.outcome_id) r
    JOIN outcomes o ON o.id=r.outcome_id JOIN subjects s ON s.id=o.subject_id)),
  'optionalPhilosophy',json((SELECT json_group_array(json_object('subject_id',r.subject_id,'booklet_code',r.booklet_code,
    'correct_count',r.correct_count,'wrong_count',r.wrong_count,'blank_count',r.blank_count,'invalid_count',r.invalid_count,
    'evidence_count',r.evidence_count,'success_percent',r.success_percent))
    FROM tyt_optional_philosophy_results r WHERE r.participant_id=snap.participant_id))
) WHERE snap.exam_id=? AND snap.snapshot_version=? AND snap.payload_json IS NULL`;

export async function captureReportSnapshot(env: Env, examId: string, version: number): Promise<void> {
  await env.DB.prepare(REPORT_SNAPSHOT_SQL).bind(examId, version).run();
}
