// Callers must authorize snapshots and narrow subject scope before returning
// diagnostics. This reducer never joins current answers or current curricula.
export function frozenExamReport(rows: any[], subjectIds: string[] | null) {
  const groups = new Map<string, any>();
  let legacySnapshots = 0, excludedEvidence = 0;
  for (const row of rows) {
    let payload: any;
    try { payload = JSON.parse(row.payload_json); } catch { legacySnapshots++; continue; }
    if (payload?.schemaVersion !== 1 || payload.questionEvidencePolicy !== 'NATIVE_STATUS_AND_CURRICULUM_AT_FREEZE_V1' || !Array.isArray(payload.questionEvidence)) { legacySnapshots++; continue; }
    const seen = new Set<string>();
    for (const evidence of payload.questionEvidence) {
      const refs = Array.isArray(evidence?.outcomeRefs) ? evidence.outcomeRefs : [];
      // Never disclose another branch's missing-mapping or question counts.
      if (subjectIds && (!refs.length || refs.some((ref: any) => !ref || !subjectIds.includes(ref.subjectId)))) continue;
      if (typeof evidence?.questionId !== 'string' || !evidence.questionId || seen.has(evidence.questionId) || !['CORRECT', 'WRONG', 'BLANK', 'INVALID'].includes(evidence.status)) { excludedEvidence++; continue; }
      seen.add(evidence.questionId);
      if (!refs.length || refs.some((ref: any) => !ref || ref.verified !== 1 || typeof ref.curriculumVersionId !== 'string' || !ref.curriculumVersionId || typeof ref.subjectId !== 'string' || !ref.subjectId || ref.academicYear !== row.academic_year || ref.gradeLevel !== row.grade_level)) { excludedEvidence++; continue; }
      const contexts = new Set(refs.map((ref: any) => JSON.stringify([ref.subjectId, ref.curriculumVersionId, ref.programVersion??null])));
      if (contexts.size !== 1) { excludedEvidence++; continue; }
      const first = refs[0], key = JSON.stringify([first.subjectId, first.curriculumVersionId, row.grade_level, row.academic_year, first.programVersion??null]);
      let group = groups.get(key);
      if (!group) {
        group = { subjectId: first.subjectId, subjectName: Array.isArray(payload.subjects)?payload.subjects.find((subject:any)=>subject.subject_id===first.subjectId)?.subject_name||null:null, curriculumVersionId: first.curriculumVersionId, academicYear:row.academic_year, programVersion: typeof first.programVersion==='string'?first.programVersion:null, gradeLevel: row.grade_level, correct: 0, wrong: 0, blank: 0, invalid: 0, examIds: new Set<string>() };
        groups.set(key, group);
      }
      group[evidence.status.toLowerCase()]++;
      group.examIds.add(row.exam_id);
    }
  }
  return {
    calculationPolicy: 'SELECTED_FROZEN_EXAM_QUESTION_ACCURACY_V1',
    groups: [...groups.values()].map(({ examIds, ...group }) => {
      const count = group.correct + group.wrong + group.blank;
      return { ...group, examCount: examIds.size, evidenceCount: count, accuracyPercent: count ? Math.round(group.correct / count * 10000) / 100 : null };
    }),
    // Restricted staff do not receive cross-branch cohort diagnostics.
    coverage: subjectIds ? null : { legacySnapshots, excludedEvidence },
    officialScore: null, nationalRank: null,
  };
}
