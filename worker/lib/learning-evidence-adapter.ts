import type { LearningEvidence, LearningSource } from './learning-report';

/** Enrichment must come from authorized period, curriculum and publication joins. */
export type EvidenceContext = {
  academicYear: string; curriculumVersion: string; gradeLevel: number;
  subjectId: string; outcomeId?: string; published: boolean;
};
export type AssessmentEvidenceRow = {
  runId: string; responseId: string; questionId: string | null;
  studentId: string; institutionId: string | null; source: string;
  runStatus: string; completedAt: string | null; selectedAnswer: string | null;
  isCorrect: number | boolean | null;
  nativeAnswerStatus?: string;
  context?: EvidenceContext;
};
const ledgerSources = new Set<LearningSource>(['EXAM','FOY','EXTERNAL','QUESTION_BANK','MINI_TEST','ASSIGNMENT']);
export function adaptAssessmentEvidence(rows: AssessmentEvidenceRow[]) {
  const evidence: LearningEvidence[] = [];
  const excluded: { runId: string; responseId: string; reason: string }[] = [];
  for (const row of rows) {
    const reject = (reason: string) => excluded.push({ runId: row.runId, responseId: row.responseId, reason });
    if (!ledgerSources.has(row.source as LearningSource)) { reject('SOURCE_NOT_SUPPORTED'); continue; }
    if (row.runStatus !== 'SCORED') { reject('RUN_NOT_SCORED'); continue; }
    if (!row.questionId || !row.institutionId || !row.studentId) { reject('IDENTITY_CONTEXT_MISSING'); continue; }
    const c = row.context;
    if (!c?.academicYear || !c.curriculumVersion || !c.subjectId || !Number.isInteger(c.gradeLevel) || typeof c.published !== 'boolean') { reject('CURRICULUM_CONTEXT_MISSING'); continue; }
    if (!row.completedAt || !Number.isFinite(Date.parse(row.completedAt))) { reject('COMPLETION_TIME_MISSING'); continue; }
    let status: LearningEvidence['status'];
    if (row.source === 'EXAM') {
      if (!['CORRECT','WRONG','BLANK','INVALID'].includes(row.nativeAnswerStatus || '')) { reject('NATIVE_EXAM_STATUS_REQUIRED'); continue; }
      status = row.nativeAnswerStatus as LearningEvidence['status'];
    } else {
      const answer = String(row.selectedAnswer || '').trim();
      if (!answer || answer === '_') {
        if (row.isCorrect === true || row.isCorrect === 1) { reject('ANSWER_STATUS_CONFLICT'); continue; }
        status = 'BLANK';
      } else if (row.isCorrect === true || row.isCorrect === 1) status = 'CORRECT';
      else if (row.isCorrect === false || row.isCorrect === 0) status = 'WRONG';
      else { reject('ANSWER_NOT_ASSESSED'); continue; }
    }
    evidence.push({ runId: row.runId, questionId: row.questionId, studentId: row.studentId,
      institutionId: row.institutionId, source: row.source as LearningSource,
      completedAt: row.completedAt, status, ...c });
  }
  return { evidence, excluded };
}
