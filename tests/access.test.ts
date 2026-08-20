import { describe, expect, it } from 'vitest';
import { canManageAccessAccounts, studentEligibleForAccount } from '../worker/access-entry';

describe('student and parent access account rules', () => {
  it('allows only super admin and institution manager to manage access accounts', () => {
    expect(canManageAccessAccounts('SUPER_ADMIN')).toBe(true);
    expect(canManageAccessAccounts('INSTITUTION_MANAGER')).toBe(true);
    expect(canManageAccessAccounts('TEACHER')).toBe(false);
    expect(canManageAccessAccounts('GUIDANCE_TEACHER')).toBe(false);
    expect(canManageAccessAccounts('STUDENT')).toBe(false);
    expect(canManageAccessAccounts('PARENT')).toBe(false);
  });

  it('permits login accounts only for active students', () => {
    expect(studentEligibleForAccount('ACTIVE')).toBe(true);
    expect(studentEligibleForAccount('GUEST')).toBe(false);
    expect(studentEligibleForAccount('ARCHIVED')).toBe(false);
  });
});
