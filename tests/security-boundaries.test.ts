import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canEvaluateExam } from '../worker/lib/permissions';

const workerSource = readFileSync(new URL('../worker/index.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const loginSource = readFileSync(new URL('../src/pages/Login.tsx', import.meta.url), 'utf8');
const layoutSource = readFileSync(new URL('../src/components/Layout.tsx', import.meta.url), 'utf8');

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
