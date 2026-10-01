import { describe, expect, it } from 'vitest';
import { adaptAssessmentEvidence, type AssessmentEvidenceRow } from '../worker/lib/learning-evidence-adapter';
import { buildLearningReport } from '../worker/lib/learning-report';
const row: AssessmentEvidenceRow = { runId: 'r', responseId: 'a', questionId: 'q', studentId: 's', institutionId: 'i', source: 'FOY', runStatus: 'SCORED', completedAt: '2026-09-30T10:00:00Z', selectedAnswer: 'A', isCorrect: 1, context: { academicYear: '2026-2027', curriculumVersion: 'maarif-7-v1', gradeLevel: 7, subjectId: 'mat', published: true } };
describe('assessment to learning report adapter', () => {
  it('adapts FOY and QUESTION_BANK records into a selectable report', () => {
    const adapted = adaptAssessmentEvidence([row,{ ...row, runId: 'r2', questionId: 'q2', source: 'QUESTION_BANK', isCorrect: 0 }]);
    expect(adapted.excluded).toEqual([]);
    const result = buildLearningReport({ studentId:'s', institutionId:'i', academicYear:'2026-2027', runIds:['r','r2'], visibility:'PUBLISHED' }, adapted.evidence);
    expect(result.summaries[0].firstAttempt).toMatchObject({ correct:1, wrong:1, evidenceCount:2, accuracyPercent:50 });
  });
  it('preserves native exam exclusion rather than treating it as an incorrect answer', () => {
    expect(adaptAssessmentEvidence([{ ...row, source:'EXAM', nativeAnswerStatus:'INVALID', isCorrect:0 }]).evidence[0].status).toBe('INVALID');
    expect(adaptAssessmentEvidence([{ ...row, source:'EXAM' }]).excluded[0].reason).toBe('NATIVE_EXAM_STATUS_REQUIRED');
  });
  it('reports missing curriculum context and unverified game source explicitly', () => {
    expect(adaptAssessmentEvidence([{ ...row, context:undefined },{ ...row, source:'MINI_GAME' }]).excluded.map(r=>r.reason)).toEqual(['CURRICULUM_CONTEXT_MISSING','SOURCE_NOT_SUPPORTED']);
  });
  it('preserves blanks and rejects inconsistent or unassessed answers', () => {
    expect(adaptAssessmentEvidence([{ ...row, selectedAnswer:'_', isCorrect:0 }]).evidence[0].status).toBe('BLANK');
    expect(adaptAssessmentEvidence([{ ...row, selectedAnswer:'_', isCorrect:1 },{ ...row, isCorrect:null }]).excluded.map(r=>r.reason)).toEqual(['ANSWER_STATUS_CONFLICT','ANSWER_NOT_ASSESSED']);
  });
});
