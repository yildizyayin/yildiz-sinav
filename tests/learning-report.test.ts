import { describe, expect, it } from 'vitest';
import { buildLearningReport, type LearningEvidence } from '../worker/lib/learning-report';
const selection = { studentId: 's', institutionId: 'i', academicYear: '2026-2027', runIds: ['r1','r2'], visibility: 'PUBLISHED' as const };
const row: LearningEvidence = { runId: 'r1', questionId: 'q', studentId: 's', institutionId: 'i', academicYear: '2026-2027', curriculumVersion: 'maarif-v1', gradeLevel: 7, subjectId: 'mat', outcomeId: 'o', source: 'EXAM', completedAt: '2026-09-01T10:00:00Z', status: 'WRONG', published: true };
describe('learning report calculation contract', () => {
  it('keeps first and latest attempts separate without inflating evidence', () => {
    const result = buildLearningReport(selection, [row,row,{ ...row, runId: 'r2', source: 'FOY', completedAt: '2026-09-02T10:00:00Z', status: 'CORRECT' }]);
    expect(result.summaries[0]).toMatchObject({ firstAttempt: { evidenceCount: 1, accuracyPercent: 0 }, latestAttempt: { evidenceCount: 1, accuracyPercent: 100 }, repeatedAttemptCount: 1, duplicateEvidenceCount: 1 });
  });
  it('does not count excluded questions or unverified game evidence', () => {
    const result = buildLearningReport(selection, [{ ...row, status: 'INVALID' },{ ...row, source: 'MINI_GAME', runId: 'r2', status: 'CORRECT' }]);
    expect(result.summaries).toEqual([]); expect(result.excludedGameEvidence).toBe(1); expect(result.excludedInvalidEvidence).toBe(1); expect(result.officialScore).toBeNull();
  });
  it('separates curriculum versions and subjects', () => {
    const result = buildLearningReport(selection, [row,{ ...row, runId: 'r2', curriculumVersion: 'legacy-v1' }]);
    expect(result.summaries).toHaveLength(2);
  });
  it('rejects cross-student evidence and unpublished student reports', () => {
    expect(() => buildLearningReport(selection, [{ ...row, studentId: 'other' }])).toThrow('REPORT_SCOPE_MISMATCH');
    expect(() => buildLearningReport(selection, [{ ...row, published: false }])).toThrow('REPORT_NOT_PUBLISHED');
  });
  it('reports missing activities explicitly instead of scoring them zero', () => {
    const result = buildLearningReport(selection, [row]); expect(result.unavailableRunIds).toEqual(['r2']);
    expect(result.summaries[0].firstAttempt.evidenceCount).toBe(1);
  });
});

it('rejects conflicting copies of one response instead of silently selecting one', () => {
  expect(() => buildLearningReport(selection, [row,{ ...row, status:'CORRECT' }])).toThrow('REPORT_EVIDENCE_CONFLICT');
});
it('rejects invalid runtime visibility and answer status', () => {
  expect(() => buildLearningReport({ ...selection, visibility:'UNKNOWN' } as any, [row])).toThrow('REPORT_VISIBILITY_INVALID');
  expect(() => buildLearningReport(selection, [{ ...row, status:'UNKNOWN' } as any])).toThrow('REPORT_EVIDENCE_INVALID');
});
