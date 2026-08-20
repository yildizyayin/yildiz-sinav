import { describe, expect, it } from 'vitest';
import { answerStringValid, canManageExamDefinitions, normalizeBookletCodes, ownerTypeAllowed } from '../worker/exam-admin-entry';

describe('exam definition center rules', () => {
  it('allows only super admin and institution manager to manage definitions', () => {
    expect(canManageExamDefinitions('SUPER_ADMIN')).toBe(true);
    expect(canManageExamDefinitions('INSTITUTION_MANAGER')).toBe(true);
    expect(canManageExamDefinitions('TEACHER')).toBe(false);
    expect(canManageExamDefinitions('GUIDANCE_TEACHER')).toBe(false);
    expect(canManageExamDefinitions('STUDENT')).toBe(false);
    expect(canManageExamDefinitions('PARENT')).toBe(false);
  });

  it('limits central exam ownership to super admin', () => {
    expect(ownerTypeAllowed('SUPER_ADMIN', 'CENTRAL')).toBe(true);
    expect(ownerTypeAllowed('SUPER_ADMIN', 'INSTITUTION')).toBe(true);
    expect(ownerTypeAllowed('INSTITUTION_MANAGER', 'CENTRAL')).toBe(false);
    expect(ownerTypeAllowed('INSTITUTION_MANAGER', 'INSTITUTION')).toBe(true);
  });

  it('normalizes variable booklet codes without hardcoding four booklets', () => {
    expect(normalizeBookletCodes(['a', ' B ', 'a', 'C1', '', '***'])).toEqual(['A', 'B', 'C1']);
    expect(normalizeBookletCodes(['A'])).toEqual(['A']);
    expect(normalizeBookletCodes(['A', 'B', 'C', 'D'])).toEqual(['A', 'B', 'C', 'D']);
  });

  it('requires a complete answer string for each subject/booklet', () => {
    expect(answerStringValid('ABCDE', 5)).toBe(true);
    expect(answerStringValid('ABCD', 5)).toBe(false);
    expect(answerStringValid('ABC?E', 5)).toBe(false);
  });
});
