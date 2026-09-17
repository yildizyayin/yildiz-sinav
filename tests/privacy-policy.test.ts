import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  canManagePrivacyGovernance,
  canRequestForLinkedChild,
  isPrivacyRequestType,
  noticeAudienceForRole,
} from '../worker/lib/privacy-policy';

const privacyEntrySource = readFileSync(new URL('../worker/privacy-entry.ts', import.meta.url), 'utf8');

describe('KVKK privacy policy boundaries', () => {
  it('maps every application role to a dedicated notice audience', () => {
    expect(noticeAudienceForRole('STUDENT')).toBe('STUDENT');
    expect(noticeAudienceForRole('PARENT')).toBe('PARENT');
    expect(noticeAudienceForRole('TEACHER')).toBe('TEACHER');
    expect(noticeAudienceForRole('GUIDANCE_TEACHER')).toBe('GUIDANCE_TEACHER');
    expect(noticeAudienceForRole('INSTITUTION_MANAGER')).toBe('INSTITUTION_MANAGER');
    expect(noticeAudienceForRole('SUPER_ADMIN')).toBe('PLATFORM_STAFF');
  });

  it('reserves privacy governance administration for Super Admin', () => {
    expect(canManagePrivacyGovernance('SUPER_ADMIN')).toBe(true);
    expect(canManagePrivacyGovernance('INSTITUTION_MANAGER')).toBe(false);
    expect(canManagePrivacyGovernance('TEACHER')).toBe(false);
    expect(canManagePrivacyGovernance('GUIDANCE_TEACHER')).toBe(false);
    expect(canManagePrivacyGovernance('STUDENT')).toBe(false);
    expect(canManagePrivacyGovernance('PARENT')).toBe(false);
  });

  it('only allows a parent to open a self-service request for a linked child', () => {
    expect(canRequestForLinkedChild('PARENT')).toBe(true);
    expect(canRequestForLinkedChild('STUDENT')).toBe(false);
    expect(canRequestForLinkedChild('TEACHER')).toBe(false);
    expect(canRequestForLinkedChild('GUIDANCE_TEACHER')).toBe(false);
    expect(canRequestForLinkedChild('INSTITUTION_MANAGER')).toBe(false);
    expect(canRequestForLinkedChild('SUPER_ADMIN')).toBe(false);
  });

  it('accepts only the explicit KVKK request type allowlist', () => {
    for (const type of ['ACCESS', 'INFORMATION', 'CORRECTION', 'DELETE', 'ANONYMIZE', 'OBJECT', 'OTHER']) {
      expect(isPrivacyRequestType(type)).toBe(true);
    }
    expect(isPrivacyRequestType('EXPORT_ALL')).toBe(false);
    expect(isPrivacyRequestType('')).toBe(false);
    expect(isPrivacyRequestType(null)).toBe(false);
  });

  it('keeps linked-child requests tenant-bound as well as relation-bound', () => {
    expect(privacyEntrySource).toContain('p.parent_user_id=? AND p.student_id=? AND p.active=1 AND e.institution_id=?');
    expect(privacyEntrySource).toContain("JOIN student_enrollments e ON e.student_id=p.student_id AND e.status='ACTIVE'");
  });

  it('does not treat notice acknowledgement as consent', () => {
    expect(privacyEntrySource).toContain('PRIVACY_NOTICE_ACKNOWLEDGED');
    expect(privacyEntrySource).not.toMatch(/INSERT INTO consent_records[\s\S]*PRIVACY_NOTICE_ACKNOWLEDGED/);
  });
});
