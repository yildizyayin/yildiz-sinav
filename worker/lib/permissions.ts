import type { AuthUser, PermissionScope, Role } from '../types';
import { all } from './db';

export function roleCanManageInstitution(role: Role): boolean {
  return role === 'SUPER_ADMIN' || role === 'INSTITUTION_MANAGER';
}

export function canSeeCommercial(role: Role): boolean {
  return role === 'SUPER_ADMIN' || role === 'INSTITUTION_MANAGER';
}

export function canEvaluateExam(role: Role): boolean {
  return role === 'SUPER_ADMIN' || role === 'INSTITUTION_MANAGER' || role === 'TEACHER' || role === 'GUIDANCE_TEACHER';
}

export async function loadPermissionScope(db: D1Database, user: AuthUser, seasonId?: string | null): Promise<PermissionScope> {
  const scope: PermissionScope = {
    role: user.role,
    institutionId: user.institution_id,
    studentId: user.student_id,
    subjectIds: [],
    classIds: [],
    guidanceClassIds: [],
    subjectClassAssignments: [],
  };
  if ((user.role === 'TEACHER' || user.role === 'GUIDANCE_TEACHER') && user.institution_id) {
    const params: unknown[] = [user.id];
    let sql = `SELECT class_id, subject_id, assignment_type FROM teacher_assignments WHERE user_id = ? AND active = 1`;
    if (seasonId) {
      sql += ' AND season_id = ?';
      params.push(seasonId);
    }
    const rows = await all<{ class_id: string | null; subject_id: string | null; assignment_type: 'SUBJECT' | 'GUIDANCE' }>(db.prepare(sql).bind(...params));
    for (const row of rows) {
      if (row.assignment_type === 'SUBJECT' && row.class_id && row.subject_id) {
        if (!scope.classIds.includes(row.class_id)) scope.classIds.push(row.class_id);
        if (!scope.subjectIds.includes(row.subject_id)) scope.subjectIds.push(row.subject_id);
        if (!scope.subjectClassAssignments.some((assignment) => assignment.classId === row.class_id && assignment.subjectId === row.subject_id)) {
          scope.subjectClassAssignments.push({ classId: row.class_id, subjectId: row.subject_id });
        }
      } else if (row.assignment_type === 'GUIDANCE' && row.class_id && !scope.guidanceClassIds.includes(row.class_id)) {
        scope.guidanceClassIds.push(row.class_id);
      }
    }
  }
  return scope;
}

export function canAccessClass(scope: PermissionScope, classId: string): boolean {
  if (scope.role === 'SUPER_ADMIN' || scope.role === 'INSTITUTION_MANAGER') return true;
  if (scope.guidanceClassIds.includes(classId)) return true;
  return scope.classIds.includes(classId);
}

export function canAccessSubjectForClass(scope: PermissionScope, classId: string, subjectId: string): boolean {
  if (scope.role === 'SUPER_ADMIN' || scope.role === 'INSTITUTION_MANAGER') return true;
  if (scope.guidanceClassIds.includes(classId)) return true;
  return scope.subjectClassAssignments.some((assignment) => assignment.classId === classId && assignment.subjectId === subjectId);
}
