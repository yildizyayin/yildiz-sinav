import type { Role } from '../types';

export type PrivacyNoticeAudience =
  | 'STUDENT'
  | 'PARENT'
  | 'TEACHER'
  | 'GUIDANCE_TEACHER'
  | 'INSTITUTION_MANAGER'
  | 'PLATFORM_STAFF'
  | 'OTHER';

export const PRIVACY_REQUEST_TYPES = [
  'ACCESS',
  'INFORMATION',
  'CORRECTION',
  'DELETE',
  'ANONYMIZE',
  'OBJECT',
  'OTHER',
] as const;

export type PrivacyRequestType = (typeof PRIVACY_REQUEST_TYPES)[number];

export function noticeAudienceForRole(role: Role): PrivacyNoticeAudience {
  switch (role) {
    case 'STUDENT':
      return 'STUDENT';
    case 'PARENT':
      return 'PARENT';
    case 'TEACHER':
      return 'TEACHER';
    case 'GUIDANCE_TEACHER':
      return 'GUIDANCE_TEACHER';
    case 'INSTITUTION_MANAGER':
      return 'INSTITUTION_MANAGER';
    case 'SUPER_ADMIN':
      return 'PLATFORM_STAFF';
    default:
      return 'OTHER';
  }
}

export function canManagePrivacyGovernance(role: Role): boolean {
  return role === 'SUPER_ADMIN';
}

export function isPrivacyRequestType(value: unknown): value is PrivacyRequestType {
  return typeof value === 'string' && (PRIVACY_REQUEST_TYPES as readonly string[]).includes(value);
}

export function canRequestForLinkedChild(role: Role): boolean {
  return role === 'PARENT';
}
