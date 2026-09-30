/** Calculation contract. Callers must authorize inputs before loading evidence. */
export type LearningSource = 'EXAM' | 'FOY' | 'QUESTION_BANK' | 'MINI_TEST' | 'MINI_GAME' | 'ASSIGNMENT' | 'EXTERNAL';
export type LearningEvidence = {
  runId: string; questionId: string; studentId: string; institutionId: string;
  academicYear: string; curriculumVersion: string; gradeLevel: number; subjectId: string;
  outcomeId?: string; source: LearningSource; completedAt: string;
  status: 'CORRECT' | 'WRONG' | 'BLANK' | 'INVALID';
  published: boolean; academicEvidenceVerified?: boolean;
};
export type LearningReportSelection = {
  studentId: string; institutionId: string; academicYear: string; runIds: string[];
  visibility: 'PUBLISHED' | 'STAFF_PREVIEW';
};
type Counts = { correct: number; wrong: number; blank: number; evidenceCount: number; accuracyPercent: number | null };
function counts(rows: LearningEvidence[]): Counts {
  const correct = rows.filter(r => r.status === 'CORRECT').length;
  const wrong = rows.filter(r => r.status === 'WRONG').length;
  const blank = rows.filter(r => r.status === 'BLANK').length;
  const evidenceCount = correct + wrong + blank;
  return { correct, wrong, blank, evidenceCount, accuracyPercent: evidenceCount ? Math.round(correct / evidenceCount * 10000) / 100 : null };
}
export function buildLearningReport(selection: LearningReportSelection, evidence: LearningEvidence[]) {
  const selected = new Set(selection.runIds);
  if (!selected.size) throw new Error('REPORT_SELECTION_REQUIRED');
  const rows = evidence.filter(r => selected.has(r.runId));
  if (rows.some(r => r.studentId !== selection.studentId || r.institutionId !== selection.institutionId || r.academicYear !== selection.academicYear)) throw new Error('REPORT_SCOPE_MISMATCH');
  if (selection.visibility === 'PUBLISHED' && rows.some(r => !r.published)) throw new Error('REPORT_NOT_PUBLISHED');
  if (rows.some(r => !r.questionId || !r.subjectId || !r.curriculumVersion || !Number.isInteger(r.gradeLevel) || !Number.isFinite(Date.parse(r.completedAt)))) throw new Error('REPORT_EVIDENCE_INVALID');
  const unavailableRunIds = [...selected].filter(id => !rows.some(r => r.runId === id));
  const excludedGameEvidence = rows.filter(r => r.source === 'MINI_GAME' && !r.academicEvidenceVerified).length;
  const excludedInvalidEvidence = rows.filter(r => r.status === 'INVALID').length;
  const eligible = rows.filter(r => r.status !== 'INVALID' && (r.source !== 'MINI_GAME' || r.academicEvidenceVerified));
  const groups = new Map<string, LearningEvidence[]>();
  for (const row of eligible) {
    const key = JSON.stringify([row.subjectId,row.curriculumVersion,row.gradeLevel]);
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  const summaries = [...groups.values()].map(group => {
    const attempts = new Map<string, LearningEvidence[]>();
    const seen = new Set<string>();
    let duplicateEvidenceCount = 0;
    for (const row of [...group].sort((a,b) => Date.parse(a.completedAt)-Date.parse(b.completedAt) || a.runId.localeCompare(b.runId))) {
      const eventKey = JSON.stringify([row.runId,row.questionId]);
      if (seen.has(eventKey)) { duplicateEvidenceCount++; continue; }
      seen.add(eventKey);
      attempts.set(row.questionId, [...(attempts.get(row.questionId) || []), row]);
    }
    const first = [...attempts.values()].map(a => a[0]);
    const latest = [...attempts.values()].map(a => a[a.length-1]);
    const outcomes = [...new Set(first.map(r => r.outcomeId).filter(Boolean))].map(outcomeId => ({ outcomeId, ...counts(first.filter(r => r.outcomeId === outcomeId)) }));
    const sources = [...new Set(first.map(r => r.source))].map(source => ({ source, ...counts(first.filter(r => r.source === source)) }));
    return {
      subjectId: group[0].subjectId, curriculumVersion: group[0].curriculumVersion, gradeLevel: group[0].gradeLevel,
      firstAttempt: counts(first), latestAttempt: counts(latest),
      repeatedAttemptCount: [...attempts.values()].reduce((total,a) => total+a.length-1,0), duplicateEvidenceCount,
      unmappedEvidenceCount: first.filter(r => !r.outcomeId).length, sources, outcomes,
    };
  });
  return {
    schemaVersion: 1, calculationPolicy: 'FIRST_UNIQUE_QUESTION_DESCRIPTIVE_ACCURACY_V1',
    selection: { ...selection, runIds: [...selected] }, summaries,
    unavailableRunIds, excludedGameEvidence, excludedInvalidEvidence,
    // Descriptive accuracy is not an official exam score or an equated ability score.
    officialScore: null, nationalRank: null,
  };
}
