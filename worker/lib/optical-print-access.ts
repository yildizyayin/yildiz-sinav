import type { AuthUser } from '../types';

/** Deimos print access is independent of Phobos parser/camera readiness. */
export function canReadPrintTemplate(user: AuthUser, template: { owner_type: string; owner_id: string | null; template_status: string }): boolean {
  if (user.role === 'SUPER_ADMIN') return true;
  if (user.role !== 'INSTITUTION_MANAGER' || !user.institution_id) return false;
  return (template.owner_type === 'INSTITUTION' && template.owner_id === user.institution_id)
    || (template.owner_type === 'CENTRAL' && template.template_status === 'READY');
}
