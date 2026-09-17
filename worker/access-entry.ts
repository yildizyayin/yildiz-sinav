import managementApp from './management-entry';
import type { AuthUser, Env, Role } from './types';
import { getAuthUser, hashPassword } from './lib/auth';
import { all, audit, one, uuid } from './lib/db';

export function canManageAccessAccounts(role: Role): boolean {
  return role === 'SUPER_ADMIN' || role === 'INSTITUTION_MANAGER';
}

export function studentEligibleForAccount(status: string): boolean {
  return status === 'ACTIVE';
}

function error(status: number, code: string, message: string): Response {
  return Response.json({ ok: false, error: { code, message } }, { status });
}

async function requireActor(env: Env, request: Request): Promise<AuthUser | Response> {
  const user = await getAuthUser(env, request);
  if (!user) return error(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  if (!canManageAccessAccounts(user.role)) return error(403, 'FORBIDDEN', 'Öğrenci/veli erişim hesaplarını yönetme yetkiniz bulunmuyor.');
  return user;
}

function institutionFrom(actor: AuthUser, url: URL, bodyInstitutionId?: string | null): string | null {
  if (actor.role === 'SUPER_ADMIN') return bodyInstitutionId || url.searchParams.get('institutionId');
  return actor.institution_id || null;
}

async function ensureInstitution(env: Env, actor: AuthUser, institutionId: string): Promise<boolean> {
  if (actor.role !== 'SUPER_ADMIN') return actor.institution_id === institutionId;
  return Boolean(await one(env.DB.prepare('SELECT id FROM institutions WHERE id=?').bind(institutionId)));
}

async function identifierAvailable(env: Env, email: string | null, username: string | null): Promise<Response | null> {
  if (email) {
    const row = await one(env.DB.prepare('SELECT id FROM users WHERE lower(email)=lower(?) LIMIT 1').bind(email));
    if (row) return error(409, 'EMAIL_EXISTS', 'Bu e-posta adresi zaten kullanılıyor.');
  }
  if (username) {
    const row = await one(env.DB.prepare('SELECT id FROM users WHERE lower(username)=lower(?) LIMIT 1').bind(username));
    if (row) return error(409, 'USERNAME_EXISTS', 'Bu kullanıcı adı zaten kullanılıyor.');
  }
  return null;
}

async function listAccessAccounts(env: Env, actor: AuthUser, url: URL): Promise<Response> {
  const institutionId = institutionFrom(actor, url);
  if (!institutionId) return error(400, 'INSTITUTION_REQUIRED', 'Kurum seçilmelidir.');
  if (!(await ensureInstitution(env, actor, institutionId))) return error(403, 'FORBIDDEN', 'Bu kuruma erişim yetkiniz bulunmuyor.');

  const students = await all<any>(env.DB.prepare(`
    SELECT s.id,s.first_name,s.last_name,s.status,e.student_number,e.grade_level,e.section,e.class_id,
           su.id student_user_id,su.email student_email,su.username student_username,su.active student_user_active,
           (SELECT count(DISTINCT p.parent_user_id) FROM parent_student_links p WHERE p.student_id=s.id AND p.active=1) parent_count
    FROM student_entities s
    JOIN student_enrollments e ON e.student_id=s.id
    JOIN institution_seasons se ON se.id=e.season_id
    LEFT JOIN users su ON su.student_id=s.id AND su.role='STUDENT'
    WHERE e.institution_id=? AND e.status='ACTIVE' AND se.status='ACTIVE' AND s.status='ACTIVE'
    ORDER BY e.grade_level,e.section,cast(e.student_number as integer),s.normalized_name
  `).bind(institutionId));

  const parents = await all<any>(env.DB.prepare(`
    SELECT u.id,u.display_name,u.email,u.phone,u.username,u.active,u.created_at,
           count(CASE WHEN p.active=1 THEN 1 END) linked_student_count,
           group_concat(CASE WHEN p.active=1 THEN s.first_name || ' ' || s.last_name END, ', ') children
    FROM users u
    LEFT JOIN parent_student_links p ON p.parent_user_id=u.id
    LEFT JOIN student_entities s ON s.id=p.student_id
    WHERE u.institution_id=? AND u.role='PARENT'
    GROUP BY u.id
    ORDER BY u.display_name
  `).bind(institutionId));

  return Response.json({ ok: true, institutionId, students, parents });
}

async function createStudentAccount(request: Request, env: Env, actor: AuthUser, studentId: string): Promise<Response> {
  const body = await request.json<{ institutionId?: string; email?: string; username?: string; password?: string }>();
  const row = await one<any>(env.DB.prepare(`
    SELECT s.id,s.first_name,s.last_name,s.status,e.institution_id
    FROM student_entities s
    JOIN student_enrollments e ON e.student_id=s.id
    JOIN institution_seasons se ON se.id=e.season_id
    WHERE s.id=? AND e.status='ACTIVE' AND se.status='ACTIVE'
    ORDER BY e.created_at DESC LIMIT 1
  `).bind(studentId));
  if (!row) return error(404, 'STUDENT_NOT_FOUND', 'Öğrenci bulunamadı.');
  const institutionId = institutionFrom(actor, new URL(request.url), body.institutionId || row.institution_id);
  if (!institutionId || row.institution_id !== institutionId || !(await ensureInstitution(env, actor, institutionId))) return error(403, 'FORBIDDEN', 'Bu öğrenciye erişim yetkiniz bulunmuyor.');
  if (!studentEligibleForAccount(row.status)) return error(409, 'STUDENT_NOT_ACTIVE', 'Yalnız aktif/lisanslı öğrencilere giriş hesabı açılabilir.');
  const existing = await one(env.DB.prepare(`SELECT id FROM users WHERE student_id=? AND role='STUDENT' LIMIT 1`).bind(studentId));
  if (existing) return error(409, 'STUDENT_ACCOUNT_EXISTS', 'Bu öğrencinin zaten bir giriş hesabı var.');

  const email = body.email?.trim().toLowerCase() || null;
  const username = body.username?.trim().toLowerCase() || null;
  const password = body.password || '';
  if ((!email && !username) || password.length < 8) return error(400, 'VALIDATION_ERROR', 'E-posta veya kullanıcı adı ile en az 8 karakterli şifre gereklidir.');
  const duplicate = await identifierAvailable(env, email, username);
  if (duplicate) return duplicate;

  const passwordData = await hashPassword(password);
  const id = uuid('usr');
  await env.DB.prepare(`
    INSERT INTO users (id,institution_id,student_id,role,display_name,email,username,password_hash,password_salt,password_iterations,password_algo,active)
    VALUES (?,?,?,'STUDENT',?,?,?,?,?,?,?,'PBKDF2-SHA256-v1',1)
  `).bind(id, institutionId, studentId, `${row.first_name} ${row.last_name}`, email, username, passwordData.hash, passwordData.salt, passwordData.iterations).run();
  await audit(env.DB, actor.id, institutionId, 'STUDENT_ACCESS_CREATED', 'user', id, { studentId, email, username });
  return Response.json({ ok: true, userId: id, studentId }, { status: 201 });
}

async function activeStudentInInstitution(env: Env, studentId: string, institutionId: string): Promise<boolean> {
  const row = await one<{ status: string }>(env.DB.prepare(`
    SELECT s.status FROM student_entities s
    JOIN student_enrollments e ON e.student_id=s.id
    JOIN institution_seasons se ON se.id=e.season_id
    WHERE s.id=? AND e.institution_id=? AND e.status='ACTIVE' AND se.status='ACTIVE'
    ORDER BY e.created_at DESC LIMIT 1
  `).bind(studentId, institutionId));
  return Boolean(row && studentEligibleForAccount(row.status));
}

async function createParentAccount(request: Request, env: Env, actor: AuthUser): Promise<Response> {
  const body = await request.json<{
    institutionId?: string;
    displayName?: string;
    email?: string;
    phone?: string;
    username?: string;
    password?: string;
    studentIds?: string[];
    relationship?: string;
  }>();
  const institutionId = institutionFrom(actor, new URL(request.url), body.institutionId || null);
  if (!institutionId) return error(400, 'INSTITUTION_REQUIRED', 'Kurum seçilmelidir.');
  if (!(await ensureInstitution(env, actor, institutionId))) return error(403, 'FORBIDDEN', 'Bu kuruma erişim yetkiniz bulunmuyor.');
  const displayName = body.displayName?.trim() || '';
  const email = body.email?.trim().toLowerCase() || null;
  const username = body.username?.trim().toLowerCase() || null;
  const phone = body.phone?.trim() || null;
  const password = body.password || '';
  const studentIds = [...new Set(body.studentIds || [])];
  if (!displayName || (!email && !username) || password.length < 8 || studentIds.length === 0) return error(400, 'VALIDATION_ERROR', 'Veli adı, e-posta veya kullanıcı adı, en az 8 karakterli şifre ve en az bir öğrenci gereklidir.');
  const duplicate = await identifierAvailable(env, email, username);
  if (duplicate) return duplicate;
  for (const studentId of studentIds) {
    if (!(await activeStudentInInstitution(env, studentId, institutionId))) return error(409, 'STUDENT_NOT_ACTIVE', 'Veli yalnız aktif/lisanslı öğrenciye bağlanabilir.');
  }

  const passwordData = await hashPassword(password);
  const userId = uuid('usr');
  await env.DB.prepare(`
    INSERT INTO users (id,institution_id,role,display_name,email,phone,username,password_hash,password_salt,password_iterations,password_algo,active)
    VALUES (?,?,'PARENT',?,?,?,?,?,?,?,?,1)
  `).bind(userId, institutionId, displayName, email, phone, username, passwordData.hash, passwordData.salt, passwordData.iterations, 'PBKDF2-SHA256-v1').run();
  for (const studentId of studentIds) {
    await env.DB.prepare(`INSERT INTO parent_student_links (id,parent_user_id,student_id,relationship,active) VALUES (?,?,?,?,1)`)
      .bind(uuid('plink'), userId, studentId, body.relationship?.trim() || 'Veli').run();
  }
  await audit(env.DB, actor.id, institutionId, 'PARENT_ACCESS_CREATED', 'user', userId, { studentIds, email, username });
  return Response.json({ ok: true, userId, linkedStudents: studentIds.length }, { status: 201 });
}

async function linkParentStudent(request: Request, env: Env, actor: AuthUser, parentUserId: string): Promise<Response> {
  const body = await request.json<{ studentId?: string; relationship?: string }>();
  if (!body.studentId) return error(400, 'STUDENT_REQUIRED', 'Öğrenci seçilmelidir.');
  const parent = await one<any>(env.DB.prepare(`SELECT id,institution_id,role FROM users WHERE id=? AND role='PARENT'`).bind(parentUserId));
  if (!parent?.institution_id || !(await ensureInstitution(env, actor, parent.institution_id))) return error(404, 'PARENT_NOT_FOUND', 'Veli hesabı bulunamadı.');
  if (!(await activeStudentInInstitution(env, body.studentId, parent.institution_id))) return error(409, 'STUDENT_NOT_ACTIVE', 'Yalnız aktif/lisanslı öğrenci veliye bağlanabilir.');
  await env.DB.prepare(`
    INSERT INTO parent_student_links (id,parent_user_id,student_id,relationship,active) VALUES (?,?,?,?,1)
    ON CONFLICT(parent_user_id,student_id) DO UPDATE SET relationship=excluded.relationship,active=1
  `).bind(uuid('plink'), parentUserId, body.studentId, body.relationship?.trim() || 'Veli').run();
  await audit(env.DB, actor.id, parent.institution_id, 'PARENT_STUDENT_LINKED', 'user', parentUserId, { studentId: body.studentId });
  return Response.json({ ok: true });
}

async function unlinkParentStudent(env: Env, actor: AuthUser, parentUserId: string, studentId: string): Promise<Response> {
  const parent = await one<any>(env.DB.prepare(`SELECT id,institution_id FROM users WHERE id=? AND role='PARENT'`).bind(parentUserId));
  if (!parent?.institution_id || !(await ensureInstitution(env, actor, parent.institution_id))) return error(404, 'PARENT_NOT_FOUND', 'Veli hesabı bulunamadı.');
  await env.DB.prepare('UPDATE parent_student_links SET active=0 WHERE parent_user_id=? AND student_id=?').bind(parentUserId, studentId).run();
  await audit(env.DB, actor.id, parent.institution_id, 'PARENT_STUDENT_UNLINKED', 'user', parentUserId, { studentId });
  return Response.json({ ok: true });
}

async function setAccessUserStatus(request: Request, env: Env, actor: AuthUser, userId: string): Promise<Response> {
  const target = await one<any>(env.DB.prepare(`SELECT id,institution_id,role,active FROM users WHERE id=? AND role IN ('STUDENT','PARENT')`).bind(userId));
  if (!target?.institution_id || !(await ensureInstitution(env, actor, target.institution_id))) return error(404, 'ACCESS_USER_NOT_FOUND', 'Öğrenci/veli hesabı bulunamadı.');
  const body = await request.json<{ active?: boolean }>();
  if (typeof body.active !== 'boolean') return error(400, 'VALIDATION_ERROR', 'Aktiflik durumu belirtilmelidir.');
  await env.DB.prepare('UPDATE users SET active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(body.active ? 1 : 0, userId).run();
  if (!body.active) await env.DB.prepare('UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND revoked_at IS NULL').bind(userId).run();
  await audit(env.DB, actor.id, target.institution_id, body.active ? 'ACCESS_USER_ACTIVATED' : 'ACCESS_USER_DEACTIVATED', 'user', userId, { role: target.role });
  return Response.json({ ok: true, active: body.active });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return managementApp.fetch(request, env);

    if (url.pathname === '/api/access-accounts' && request.method === 'GET') {
      const actor = await requireActor(env, request);
      if (actor instanceof Response) return actor;
      return listAccessAccounts(env, actor, url);
    }

    const studentAccountMatch = url.pathname.match(/^\/api\/students\/([^/]+)\/access-account$/);
    if (studentAccountMatch && request.method === 'POST') {
      const actor = await requireActor(env, request);
      if (actor instanceof Response) return actor;
      return createStudentAccount(request, env, actor, studentAccountMatch[1]);
    }

    if (url.pathname === '/api/parent-access' && request.method === 'POST') {
      const actor = await requireActor(env, request);
      if (actor instanceof Response) return actor;
      return createParentAccount(request, env, actor);
    }

    const parentLinkMatch = url.pathname.match(/^\/api\/parents\/([^/]+)\/links$/);
    if (parentLinkMatch && request.method === 'POST') {
      const actor = await requireActor(env, request);
      if (actor instanceof Response) return actor;
      return linkParentStudent(request, env, actor, parentLinkMatch[1]);
    }

    const parentUnlinkMatch = url.pathname.match(/^\/api\/parents\/([^/]+)\/links\/([^/]+)$/);
    if (parentUnlinkMatch && request.method === 'DELETE') {
      const actor = await requireActor(env, request);
      if (actor instanceof Response) return actor;
      return unlinkParentStudent(env, actor, parentUnlinkMatch[1], parentUnlinkMatch[2]);
    }

    const accessStatusMatch = url.pathname.match(/^\/api\/access-users\/([^/]+)\/status$/);
    if (accessStatusMatch && request.method === 'PATCH') {
      const actor = await requireActor(env, request);
      if (actor instanceof Response) return actor;
      return setAccessUserStatus(request, env, actor, accessStatusMatch[1]);
    }

    return managementApp.fetch(request, env);
  },
} satisfies ExportedHandler<Env>;
