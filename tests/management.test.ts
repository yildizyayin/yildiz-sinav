import { describe, expect, it } from 'vitest';
import { canManageUsers, manageableRoles } from '../worker/management-entry';

describe('management gateway role matrix', () => {
  it('allows only super admin and institution manager to manage users', () => {
    expect(canManageUsers('SUPER_ADMIN')).toBe(true);
    expect(canManageUsers('INSTITUTION_MANAGER')).toBe(true);
    expect(canManageUsers('TEACHER')).toBe(false);
    expect(canManageUsers('GUIDANCE_TEACHER')).toBe(false);
    expect(canManageUsers('STUDENT')).toBe(false);
    expect(canManageUsers('PARENT')).toBe(false);
  });

  it('limits institution manager to teacher account roles', () => {
    expect(manageableRoles('INSTITUTION_MANAGER')).toEqual(['TEACHER', 'GUIDANCE_TEACHER']);
  });

  it('allows super admin to provision institution managers and teachers', () => {
    expect(manageableRoles('SUPER_ADMIN')).toEqual(['INSTITUTION_MANAGER', 'TEACHER', 'GUIDANCE_TEACHER']);
  });
});
