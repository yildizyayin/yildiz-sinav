import { describe, expect, it } from 'vitest';
import { canAccessClass, canAccessSubjectForClass, canEvaluateExam } from '../worker/lib/permissions';
import type { PermissionScope } from '../worker/types';

function scope(overrides: Partial<PermissionScope> = {}): PermissionScope {
  return {
    role: 'TEACHER',
    institutionId: 'inst-1',
    studentId: null,
    subjectIds: [],
    classIds: [],
    guidanceClassIds: [],
    subjectClassAssignments: [],
    ...overrides,
  };
}

describe('teacher and guidance authorization', () => {
  it('does not over-grant the cartesian product of class and subject assignments', () => {
    const teacher = scope({
      classIds: ['7A', '8A'],
      subjectIds: ['MAT', 'FEN'],
      subjectClassAssignments: [
        { classId: '7A', subjectId: 'MAT' },
        { classId: '8A', subjectId: 'FEN' },
      ],
    });

    expect(canAccessSubjectForClass(teacher, '7A', 'MAT')).toBe(true);
    expect(canAccessSubjectForClass(teacher, '8A', 'FEN')).toBe(true);
    expect(canAccessSubjectForClass(teacher, '7A', 'FEN')).toBe(false);
    expect(canAccessSubjectForClass(teacher, '8A', 'MAT')).toBe(false);
  });

  it('lets a guidance assignment see every subject only in its assigned class', () => {
    const teacherWithGuidance = scope({
      classIds: ['7A'],
      subjectIds: ['MAT'],
      guidanceClassIds: ['8A'],
      subjectClassAssignments: [{ classId: '7A', subjectId: 'MAT' }],
    });

    expect(canAccessSubjectForClass(teacherWithGuidance, '8A', 'MAT')).toBe(true);
    expect(canAccessSubjectForClass(teacherWithGuidance, '8A', 'FEN')).toBe(true);
    expect(canAccessSubjectForClass(teacherWithGuidance, '7A', 'MAT')).toBe(true);
    expect(canAccessSubjectForClass(teacherWithGuidance, '7A', 'FEN')).toBe(false);
    expect(canAccessSubjectForClass(teacherWithGuidance, '8B', 'MAT')).toBe(false);
  });

  it('keeps class visibility scoped to subject or guidance assignments', () => {
    const teacher = scope({
      classIds: ['7A'],
      guidanceClassIds: ['8A'],
      subjectClassAssignments: [{ classId: '7A', subjectId: 'MAT' }],
    });

    expect(canAccessClass(teacher, '7A')).toBe(true);
    expect(canAccessClass(teacher, '8A')).toBe(true);
    expect(canAccessClass(teacher, '8B')).toBe(false);
  });

  it('allows institution managers to access all subjects in their own institution scope', () => {
    const manager = scope({ role: 'INSTITUTION_MANAGER' });
    expect(canAccessSubjectForClass(manager, 'any-class', 'any-subject')).toBe(true);
  });

  it('reserves full exam evaluation for operational roles', () => {
    expect(canEvaluateExam('SUPER_ADMIN')).toBe(true);
    expect(canEvaluateExam('INSTITUTION_MANAGER')).toBe(true);
    expect(canEvaluateExam('TEACHER')).toBe(false);
    expect(canEvaluateExam('GUIDANCE_TEACHER')).toBe(false);
    expect(canEvaluateExam('STUDENT')).toBe(false);
    expect(canEvaluateExam('PARENT')).toBe(false);
  });
});
