import app from './index';
import type { AuthUser, Env, Role } from './types';
import { getAuthUser } from './lib/auth';
import { all, one } from './lib/db';

export function canReadInstitutionClassCatalog(role: Role): boolean {
  return role === 'SUPER_ADMIN' || role === 'INSTITUTION_MANAGER' || role === 'TEACHER' || role === 'GUIDANCE_TEACHER';
}

export function canReadOpticalTemplateMetadata(role: Role): boolean {
  return role === 'SUPER_ADMIN' || role === 'INSTITUTION_MANAGER';
}

export function canReadExamCatalog(role: Role): boolean {
  return role !== 'STUDENT' && role !== 'PARENT';
}

export function canReadWorksheets(role: Role): boolean {
  return role !== 'PARENT';
}

function denied(message = 'Bu alana erişim yetkiniz bulunmuyor.'): Response {
  return Response.json({ ok: false, error: { code: 'FORBIDDEN', message } }, { status: 403 });
}

async function currentSeasonId(env: Env, institutionId: string): Promise<string | null> {
  const row = await one<{ id: string }>(env.DB.prepare(`SELECT id FROM institution_seasons WHERE institution_id=? AND status='ACTIVE' ORDER BY academic_year DESC LIMIT 1`).bind(institutionId));
  return row?.id ?? null;
}

async function scopedExamIds(env: Env, user: AuthUser): Promise<Set<string>> {
  if (!user.institution_id || (user.role !== 'TEACHER' && user.role !== 'GUIDANCE_TEACHER')) return new Set();
  const seasonId = await currentSeasonId(env, user.institution_id);
  if (!seasonId) return new Set();

  if (user.role === 'TEACHER') {
    const rows = await all<{ id: string }>(env.DB.prepare(`
      SELECT DISTINCT e.id
      FROM exams e
      WHERE
        EXISTS(
          SELECT 1
          FROM exam_subjects es
          JOIN teacher_assignments ta ON ta.subject_id=es.subject_id
          JOIN classes c ON c.id=ta.class_id
          WHERE es.exam_id=e.id
            AND ta.user_id=?
            AND ta.season_id=?
            AND ta.assignment_type='SUBJECT'
            AND ta.active=1
            AND (e.grade_level IS NULL OR e.grade_level=c.grade_level)
        )
        OR EXISTS(
          SELECT 1
          FROM teacher_assignments ga
          JOIN classes gc ON gc.id=ga.class_id
          WHERE ga.user_id=?
            AND ga.season_id=?
            AND ga.assignment_type='GUIDANCE'
            AND ga.active=1
            AND (e.grade_level IS NULL OR e.grade_level=gc.grade_level)
        )
    `).bind(user.id, seasonId, user.id, seasonId));
    return new Set(rows.map((row) => row.id));
  }

  const rows = await all<{ id: string }>(env.DB.prepare(`
    SELECT DISTINCT e.id
    FROM exams e
    WHERE EXISTS(
      SELECT 1
      FROM teacher_assignments ga
      JOIN classes gc ON gc.id=ga.class_id
      WHERE ga.user_id=?
        AND ga.season_id=?
        AND ga.assignment_type='GUIDANCE'
        AND ga.active=1
        AND (e.grade_level IS NULL OR e.grade_level=gc.grade_level)
    )
  `).bind(user.id, seasonId));
  return new Set(rows.map((row) => row.id));
}

async function scopedWorksheetIds(env: Env, user: AuthUser): Promise<Set<string> | null> {
  if (user.role === 'SUPER_ADMIN' || user.role === 'INSTITUTION_MANAGER') return null;

  if (user.role === 'STUDENT') {
    if (!user.student_id) return new Set();
    const enrollment = await one<{ grade_level: number | null }>(env.DB.prepare(`
      SELECT grade_level
      FROM student_enrollments
      WHERE student_id=? AND status='ACTIVE'
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(user.student_id));
    if (!enrollment?.grade_level) return new Set();
    const rows = await all<{ id: string }>(env.DB.prepare(`SELECT id FROM worksheets WHERE status='PUBLISHED' AND grade_level=?`).bind(enrollment.grade_level));
    return new Set(rows.map((row) => row.id));
  }

  if (!user.institution_id || (user.role !== 'TEACHER' && user.role !== 'GUIDANCE_TEACHER')) return new Set();
  const seasonId = await currentSeasonId(env, user.institution_id);
  if (!seasonId) return new Set();

  if (user.role === 'TEACHER') {
    const rows = await all<{ id: string }>(env.DB.prepare(`
      SELECT DISTINCT w.id
      FROM worksheets w
      WHERE w.status='PUBLISHED' AND (
        EXISTS(
          SELECT 1
          FROM worksheet_subjects ws
          JOIN teacher_assignments ta ON ta.subject_id=ws.subject_id
          JOIN classes c ON c.id=ta.class_id
          WHERE ws.worksheet_id=w.id
            AND ta.user_id=?
            AND ta.season_id=?
            AND ta.assignment_type='SUBJECT'
            AND ta.active=1
            AND (w.grade_level IS NULL OR w.grade_level=c.grade_level)
        )
        OR EXISTS(
          SELECT 1
          FROM teacher_assignments ga
          JOIN classes gc ON gc.id=ga.class_id
          WHERE ga.user_id=?
            AND ga.season_id=?
            AND ga.assignment_type='GUIDANCE'
            AND ga.active=1
            AND (w.grade_level IS NULL OR w.grade_level=gc.grade_level)
        )
      )
    `).bind(user.id, seasonId, user.id, seasonId));
    return new Set(rows.map((row) => row.id));
  }

  const rows = await all<{ id: string }>(env.DB.prepare(`
    SELECT DISTINCT w.id
    FROM worksheets w
    WHERE w.status='PUBLISHED' AND EXISTS(
      SELECT 1
      FROM teacher_assignments ga
      JOIN classes gc ON gc.id=ga.class_id
      WHERE ga.user_id=?
        AND ga.season_id=?
        AND ga.assignment_type='GUIDANCE'
        AND ga.active=1
        AND (w.grade_level IS NULL OR w.grade_level=gc.grade_level)
    )
  `).bind(user.id, seasonId));
  return new Set(rows.map((row) => row.id));
}

async function filterJsonCollection(response: Response, key: string, allowedIds: Set<string>): Promise<Response> {
  if (!response.ok) return response;
  const payload = await response.json<any>();
  const values = Array.isArray(payload?.[key]) ? payload[key] : [];
  return Response.json({ ...payload, [key]: values.filter((item: any) => allowedIds.has(String(item.id))) }, { status: response.status });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'GET' || !url.pathname.startsWith('/api/')) return app.fetch(request, env);

    if (url.pathname === '/api/exams' || url.pathname === '/api/classes' || url.pathname === '/api/worksheets' || url.pathname === '/api/optical-templates') {
      const user = await getAuthUser(env, request);
      if (!user) return app.fetch(request, env);

      if (url.pathname === '/api/classes' && !canReadInstitutionClassCatalog(user.role)) return denied();
      if (url.pathname === '/api/optical-templates' && !canReadOpticalTemplateMetadata(user.role)) return denied();
      if (url.pathname === '/api/exams') {
        if (!canReadExamCatalog(user.role)) return denied();
        const response = await app.fetch(request, env);
        if (user.role === 'TEACHER' || user.role === 'GUIDANCE_TEACHER') {
          return filterJsonCollection(response, 'exams', await scopedExamIds(env, user));
        }
        return response;
      }
      if (url.pathname === '/api/worksheets') {
        if (!canReadWorksheets(user.role)) return denied();
        const response = await app.fetch(request, env);
        const scoped = await scopedWorksheetIds(env, user);
        return scoped ? filterJsonCollection(response, 'worksheets', scoped) : response;
      }
    }

    return app.fetch(request, env);
  },
} satisfies ExportedHandler<Env>;
