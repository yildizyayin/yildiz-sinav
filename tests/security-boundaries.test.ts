import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canEvaluateExam } from '../worker/lib/permissions';

const workerSource = readFileSync(new URL('../worker/index.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const loginSource = readFileSync(new URL('../src/pages/Login.tsx', import.meta.url), 'utf8');
const layoutSource = readFileSync(new URL('../src/components/Layout.tsx', import.meta.url), 'utf8');
const opticalAdminSource = readFileSync(new URL('../worker/optical-admin-entry.ts', import.meta.url), 'utf8');
const examAdminSource = readFileSync(new URL('../worker/exam-admin-entry.ts', import.meta.url), 'utf8');

describe('approved V1 security boundaries', () => {
  it('reserves full exam evaluation for Super Admin and Institution Manager', () => {
    expect(canEvaluateExam('SUPER_ADMIN')).toBe(true);
    expect(canEvaluateExam('INSTITUTION_MANAGER')).toBe(true);
    expect(canEvaluateExam('TEACHER')).toBe(false);
    expect(canEvaluateExam('GUIDANCE_TEACHER')).toBe(false);
    expect(canEvaluateExam('STUDENT')).toBe(false);
    expect(canEvaluateExam('PARENT')).toBe(false);
  });

  it('protects all scan-batch operational endpoints with canEvaluateExam', () => {
    expect(workerSource).toMatch(/async function previewExamFile[\s\S]*?if \(!canEvaluateExam\(user\.role\)\) return forbidden\(\);/);
    expect(workerSource).toMatch(/async function getScanBatch[\s\S]*?if \(!canEvaluateExam\(user\.role\)\) return forbidden\(\);/);
    expect(workerSource).toMatch(/async function resolveScanRecord[\s\S]*?if \(!canEvaluateExam\(user\.role\)\) return forbidden\(\);/);
    expect(workerSource).toMatch(/async function evaluateBatch[\s\S]*?if \(!canEvaluateExam\(user\.role\)\) return forbidden\(\);/);
  });

  it('does not evaluate cancelled rows and creates a guest for an explicit guest decision', () => {
    expect(workerSource).toContain("if (row.resolution_status === 'CANCELLED') continue;");
    expect(workerSource).toContain("row.match_status === 'NEW_GUEST' || (row.match_status === 'GUEST_MATCH' && !studentId)");
  });

  it('records old/new scan decision state in the immutable audit stream', () => {
    expect(workerSource).toMatch(/export async function resolveScanRecord[\s\S]*?const before = await one<any>\([\s\S]*?SCAN_RECORD_DECISION_RECORDED/);
    expect(workerSource).toMatch(/SCAN_RECORD_DECISION_RECORDED[\s\S]*?before:[\s\S]*?after[,}]/);
  });

  it('keeps optical template writes inside the owning institution scope', () => {
    expect(opticalAdminSource).toMatch(/async function updateTemplate[\s\S]*?if \(!canEditTemplate\(actor, template\)\) return forbidden/);
    expect(opticalAdminSource).toMatch(/async function createVersion[\s\S]*?if \(!canEditTemplate\(actor, template\)\) return forbidden/);
    expect(opticalAdminSource).toMatch(/async function updateSection[\s\S]*?if \(!canEditTemplate\(actor, row\)\) return forbidden/);
    expect(opticalAdminSource).toMatch(/async function importFmt[\s\S]*?if \(!canEditTemplate\(actor, row\)\) return forbidden/);
    expect(opticalAdminSource).toMatch(/async function publishVersion[\s\S]*?if \(!canEditTemplate\(actor, row\)\) return forbidden/);
    expect(opticalAdminSource).toMatch(/async function archiveTemplate[\s\S]*?if \(!canEditTemplate\(actor, template\)\) return forbidden/);
    expect(opticalAdminSource).toMatch(/async function deleteVersion[\s\S]*?if \(!canEditTemplate\(actor, row\)\) return forbidden/);
  });

  it('audits editable definitions with old/new values and protects used records', () => {
    expect(examAdminSource).toMatch(/async function updateGeneral[\s\S]*?const before = [\s\S]*?const after = [\s\S]*?EXAM_DEFINITION_UPDATED/);
    expect(examAdminSource).toMatch(/async function replaceStructure[\s\S]*?before: \{ booklets:[\s\S]*?after: \{ booklets/);
    expect(examAdminSource).toMatch(/async function replaceAnswerKey[\s\S]*?EXAM_ANSWER_KEY_REPLACED[\s\S]*?before:[\s\S]*?after:/);
    expect(examAdminSource).toMatch(/async function replaceInstitutions[\s\S]*?EXAM_INSTITUTIONS_REPLACED[\s\S]*?before:[\s\S]*?after:/);
    expect(examAdminSource).toMatch(/async function setStatus[\s\S]*?before: \{ status: exam\.status \}[\s\S]*?after: \{ status: next \}/);
    expect(opticalAdminSource).toMatch(/async function updateSection[\s\S]*?const before = [\s\S]*?OPTICAL_DEFINITION_UPDATED[\s\S]*?before[\s\S]*?after/);
    expect(opticalAdminSource).toMatch(/async function deleteVersion[\s\S]*?OPTICAL_VERSION_IN_USE/);
  });

  it('keeps guest students out of teacher and guidance academic access', () => {
    expect(workerSource).toContain("const status = (user.role === 'TEACHER' || user.role === 'GUIDANCE_TEACHER') ? 'ACTIVE' : requestedStatus;");
    expect(workerSource).toContain("if (enrollment.student_status !== 'ACTIVE') return { allowed: false };");
  });

  it('keeps teacher outcome filtering tied to exact class-subject assignments', () => {
    expect(workerSource).toContain("scope.subjectClassAssignments.filter((assignment) => assignment.classId === access.classId).map((assignment) => assignment.subjectId)");
  });

  it('does not expose the evaluation route to teacher or guidance roles in the UI', () => {
    const match = appSource.match(/path=\"exams\/:examId\/evaluate\"[\s\S]*?allowed=\{\[([^\]]+)\]\}/);
    expect(match?.[1]).toContain("'SUPER_ADMIN'");
    expect(match?.[1]).toContain("'INSTITUTION_MANAGER'");
    expect(match?.[1]).not.toContain("'TEACHER'");
    expect(match?.[1]).not.toContain("'GUIDANCE_TEACHER'");
  });

  it('does not show known no-op Settings or Forgot Password controls', () => {
    expect(layoutSource).not.toContain('title="Ayarlar"');
    expect(loginSource).not.toContain('>Şifremi unuttum<');
  });
});
