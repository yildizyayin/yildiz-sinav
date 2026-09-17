import secureApp from './secure-entry';
import type { AuthUser, Env, Role } from './types';
import { getAuthUser, hashPassword } from './lib/auth';
import { all, audit, one, uuid } from './lib/db';

const STAFF_ROLES: Role[] = ['INSTITUTION_MANAGER', 'TEACHER', 'GUIDANCE_TEACHER'];

type AssignmentType = 'SUBJECT' | 'GUIDANCE';

export function canManageUsers(role: Role): boolean {
  return role === 'SUPER_ADMIN' || role === 'INSTITUTION_MANAGER';
}

export function canManageTeacherAssignments(role: Role): boolean {
  return canManageUsers(role);
}

export function assignmentRequiresSubject(type: AssignmentType): boolean {
  return type === 'SUBJECT';
}

export function manageableRoles(role: Role): Role[] {
  if (role === 'SUPER_ADMIN') return [...STAFF_ROLES];
  if (role === 'INSTITUTION_MANAGER') return ['TEACHER', 'GUIDANCE_TEACHER'];
  return [];
}

function responseError(status: number, code: string, message: string): Response {
  return Response.json({ ok: false, error: { code, message } }, { status });
}

async function requireUser(env: Env, request: Request): Promise<AuthUser | Response> {
  const user = await getAuthUser(env, request);
  return user || responseError(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
}

function requestedInstitutionId(user: AuthUser, url: URL, bodyInstitutionId?: string | null): string | null {
  if (user.role === 'SUPER_ADMIN') return bodyInstitutionId || url.searchParams.get('institutionId');
  return user.institution_id || null;
}

async function ensureInstitutionAccess(env: Env, user: AuthUser, institutionId: string): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return Boolean(await one(env.DB.prepare('SELECT id FROM institutions WHERE id=?').bind(institutionId)));
  return user.institution_id === institutionId;
}

async function listUsers(env: Env, user: AuthUser, url: URL): Promise<Response> {
  if (!canManageUsers(user.role)) return responseError(403, 'FORBIDDEN', 'Kullanıcı yönetimi yetkiniz bulunmuyor.');
  const institutionId = requestedInstitutionId(user, url);
  if (!institutionId) return responseError(400, 'INSTITUTION_REQUIRED', 'Kurum seçilmelidir.');
  if (!(await ensureInstitutionAccess(env, user, institutionId))) return responseError(403, 'FORBIDDEN', 'Bu kuruma erişim yetkiniz bulunmuyor.');

  const rows = await all<any>(env.DB.prepare(`
    SELECT u.id,u.institution_id,u.role,u.display_name,u.email,u.phone,u.username,u.active,u.created_at,
           i.name institution_name
    FROM users u
    LEFT JOIN institutions i ON i.id=u.institution_id
    WHERE u.institution_id=? AND u.role!='STUDENT' AND u.role!='PARENT'
    ORDER BY CASE u.role WHEN 'INSTITUTION_MANAGER' THEN 1 WHEN 'GUIDANCE_TEACHER' THEN 2 ELSE 3 END,u.display_name
  `).bind(institutionId));
  return Response.json({ ok: true, users: rows, manageableRoles: manageableRoles(user.role) });
}

async function createUser(request: Request, env: Env, actor: AuthUser): Promise<Response> {
  if (!canManageUsers(actor.role)) return responseError(403, 'FORBIDDEN', 'Kullanıcı oluşturma yetkiniz bulunmuyor.');
  const body = await request.json<{
    institutionId?: string;
    role?: Role;
    displayName?: string;
    email?: string;
    phone?: string;
    username?: string;
    password?: string;
  }>();
  const institutionId = requestedInstitutionId(actor, new URL(request.url), body.institutionId || null);
  if (!institutionId) return responseError(400, 'INSTITUTION_REQUIRED', 'Kurum seçilmelidir.');
  if (!(await ensureInstitutionAccess(env, actor, institutionId))) return responseError(403, 'FORBIDDEN', 'Bu kuruma erişim yetkiniz bulunmuyor.');
  if (!body.role || !manageableRoles(actor.role).includes(body.role)) return responseError(400, 'INVALID_ROLE', 'Bu rolü oluşturma yetkiniz bulunmuyor.');
  const displayName = body.displayName?.trim() || '';
  const email = body.email?.trim().toLowerCase() || null;
  const username = body.username?.trim().toLowerCase() || null;
  const phone = body.phone?.trim() || null;
  const password = body.password || '';
  if (!displayName || !password || (!email && !username)) return responseError(400, 'VALIDATION_ERROR', 'Ad soyad, şifre ve e-posta veya kullanıcı adı gereklidir.');
  if (password.length < 8) return responseError(400, 'WEAK_PASSWORD', 'Şifre en az 8 karakter olmalıdır.');

  if (email) {
    const exists = await one(env.DB.prepare('SELECT id FROM users WHERE lower(email)=lower(?) LIMIT 1').bind(email));
    if (exists) return responseError(409, 'EMAIL_EXISTS', 'Bu e-posta adresi zaten kullanılıyor.');
  }
  if (username) {
    const exists = await one(env.DB.prepare('SELECT id FROM users WHERE lower(username)=lower(?) LIMIT 1').bind(username));
    if (exists) return responseError(409, 'USERNAME_EXISTS', 'Bu kullanıcı adı zaten kullanılıyor.');
  }

  const passwordData = await hashPassword(password);
  const id = uuid('usr');
  await env.DB.prepare(`
    INSERT INTO users (id,institution_id,role,display_name,email,phone,username,password_hash,password_salt,password_iterations,password_algo,active)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,1)
  `).bind(id, institutionId, body.role, displayName, email, phone, username, passwordData.hash, passwordData.salt, passwordData.iterations, 'PBKDF2-SHA256-v1').run();
  await audit(env.DB, actor.id, institutionId, 'USER_CREATED', 'user', id, { role: body.role, displayName, email, username });
  return Response.json({ ok: true, id }, { status: 201 });
}

async function setUserStatus(request: Request, env: Env, actor: AuthUser, targetId: string): Promise<Response> {
  if (!canManageUsers(actor.role)) return responseError(403, 'FORBIDDEN', 'Kullanıcı yönetimi yetkiniz bulunmuyor.');
  if (actor.id === targetId) return responseError(400, 'SELF_STATUS_CHANGE', 'Kendi hesabınızı bu ekrandan pasife alamazsınız.');
  const target = await one<any>(env.DB.prepare('SELECT id,institution_id,role,active,display_name FROM users WHERE id=?').bind(targetId));
  if (!target) return responseError(404, 'NOT_FOUND', 'Kullanıcı bulunamadı.');
  if (!target.institution_id || !(await ensureInstitutionAccess(env, actor, target.institution_id))) return responseError(403, 'FORBIDDEN', 'Bu kullanıcıya erişim yetkiniz bulunmuyor.');
  if (!manageableRoles(actor.role).includes(target.role as Role)) return responseError(403, 'FORBIDDEN', 'Bu kullanıcı rolünü değiştirme yetkiniz bulunmuyor.');

  const body = await request.json<{ active?: boolean }>();
  if (typeof body.active !== 'boolean') return responseError(400, 'VALIDATION_ERROR', 'Aktiflik durumu belirtilmelidir.');
  await env.DB.prepare('UPDATE users SET active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(body.active ? 1 : 0, targetId).run();
  if (!body.active) await env.DB.prepare('UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND revoked_at IS NULL').bind(targetId).run();
  await audit(env.DB, actor.id, target.institution_id, body.active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', 'user', targetId, { displayName: target.display_name });
  return Response.json({ ok: true, active: body.active });
}

async function listSeasons(env: Env, user: AuthUser, url: URL): Promise<Response> {
  if (!canManageUsers(user.role)) return responseError(403, 'FORBIDDEN', 'Sezon yönetimi yetkiniz bulunmuyor.');
  const institutionId = requestedInstitutionId(user, url);
  if (!institutionId) return responseError(400, 'INSTITUTION_REQUIRED', 'Kurum seçilmelidir.');
  if (!(await ensureInstitutionAccess(env, user, institutionId))) return responseError(403, 'FORBIDDEN', 'Bu kuruma erişim yetkiniz bulunmuyor.');
  const rows = await all<any>(env.DB.prepare(`
    SELECT s.id,s.academic_year,s.status,s.started_at,s.ended_at,s.created_at,
           coalesce(l.licensed_student_limit,0) licensed_student_limit,
           coalesce(l.licensed_student_count,0) licensed_student_count,
           coalesce(l.agreement_status,'PENDING') agreement_status,
           (SELECT count(*) FROM student_enrollments e WHERE e.season_id=s.id AND e.status='ACTIVE') enrollment_count
    FROM institution_seasons s
    LEFT JOIN institution_license_state l ON l.season_id=s.id
    WHERE s.institution_id=?
    ORDER BY s.academic_year DESC
  `).bind(institutionId));
  return Response.json({ ok: true, seasons: rows });
}

async function assignmentOptions(env: Env, actor: AuthUser, url: URL): Promise<Response> {
  if (!canManageTeacherAssignments(actor.role)) return responseError(403, 'FORBIDDEN', 'Öğretmen yetkisi yönetme izniniz bulunmuyor.');
  const institutionId = requestedInstitutionId(actor, url);
  if (!institutionId) return responseError(400, 'INSTITUTION_REQUIRED', 'Kurum seçilmelidir.');
  if (!(await ensureInstitutionAccess(env, actor, institutionId))) return responseError(403, 'FORBIDDEN', 'Bu kuruma erişim yetkiniz bulunmuyor.');
  const requestedSeasonId = url.searchParams.get('seasonId');
  const season = requestedSeasonId
    ? await one<any>(env.DB.prepare('SELECT * FROM institution_seasons WHERE id=? AND institution_id=?').bind(requestedSeasonId, institutionId))
    : await one<any>(env.DB.prepare(`SELECT * FROM institution_seasons WHERE institution_id=? ORDER BY CASE status WHEN 'ACTIVE' THEN 0 ELSE 1 END, academic_year DESC LIMIT 1`).bind(institutionId));
  if (!season) return Response.json({ ok: true, season: null, seasons: [], teachers: [], classes: [], subjects: [] });
  const [seasons, teachers, classes, subjects] = await Promise.all([
    all<any>(env.DB.prepare('SELECT id,academic_year,status FROM institution_seasons WHERE institution_id=? ORDER BY academic_year DESC').bind(institutionId)),
    all<any>(env.DB.prepare(`SELECT id,display_name,role,email,username FROM users WHERE institution_id=? AND active=1 AND role IN ('TEACHER','GUIDANCE_TEACHER') ORDER BY display_name`).bind(institutionId)),
    all<any>(env.DB.prepare(`SELECT id,name,grade_level,section FROM classes WHERE institution_id=? AND season_id=? AND active=1 ORDER BY grade_level,section`).bind(institutionId, season.id)),
    all<any>(env.DB.prepare(`SELECT id,code,name,category FROM subjects WHERE active=1 ORDER BY name`)),
  ]);
  return Response.json({ ok: true, season: { id: season.id, academic_year: season.academic_year, status: season.status }, seasons, teachers, classes, subjects });
}

async function listTeacherAssignments(env: Env, actor: AuthUser, url: URL): Promise<Response> {
  if (!canManageTeacherAssignments(actor.role)) return responseError(403, 'FORBIDDEN', 'Öğretmen yetkisi yönetme izniniz bulunmuyor.');
  const institutionId = requestedInstitutionId(actor, url);
  if (!institutionId) return responseError(400, 'INSTITUTION_REQUIRED', 'Kurum seçilmelidir.');
  if (!(await ensureInstitutionAccess(env, actor, institutionId))) return responseError(403, 'FORBIDDEN', 'Bu kuruma erişim yetkiniz bulunmuyor.');
  const seasonId = url.searchParams.get('seasonId');
  const rows = await all<any>(env.DB.prepare(`
    SELECT ta.id,ta.user_id,ta.season_id,ta.class_id,ta.subject_id,ta.assignment_type,ta.active,
           u.display_name teacher_name,u.role teacher_role,c.name class_name,c.grade_level,c.section,
           s.name subject_name,se.academic_year
    FROM teacher_assignments ta
    JOIN users u ON u.id=ta.user_id
    LEFT JOIN classes c ON c.id=ta.class_id
    LEFT JOIN subjects s ON s.id=ta.subject_id
    JOIN institution_seasons se ON se.id=ta.season_id
    WHERE ta.institution_id=? AND (? IS NULL OR ta.season_id=?)
    ORDER BY se.academic_year DESC,u.display_name,c.grade_level,c.section,ta.assignment_type,s.name
  `).bind(institutionId, seasonId, seasonId));
  return Response.json({ ok: true, assignments: rows });
}

async function createTeacherAssignment(request: Request, env: Env, actor: AuthUser): Promise<Response> {
  if (!canManageTeacherAssignments(actor.role)) return responseError(403, 'FORBIDDEN', 'Öğretmen yetkisi yönetme izniniz bulunmuyor.');
  const body = await request.json<{ institutionId?: string; userId?: string; classId?: string; subjectId?: string | null; assignmentType?: AssignmentType }>();
  const institutionId = requestedInstitutionId(actor, new URL(request.url), body.institutionId || null);
  if (!institutionId || !body.userId || !body.classId || !body.assignmentType) return responseError(400, 'VALIDATION_ERROR', 'Kurum, öğretmen, sınıf ve yetki türü gereklidir.');
  if (!(await ensureInstitutionAccess(env, actor, institutionId))) return responseError(403, 'FORBIDDEN', 'Bu kuruma erişim yetkiniz bulunmuyor.');
  if (!['SUBJECT', 'GUIDANCE'].includes(body.assignmentType)) return responseError(400, 'INVALID_ASSIGNMENT_TYPE', 'Geçersiz öğretmen yetki türü.');
  if (assignmentRequiresSubject(body.assignmentType) && !body.subjectId) return responseError(400, 'SUBJECT_REQUIRED', 'Branş yetkisinde ders seçilmelidir.');

  const teacher = await one<any>(env.DB.prepare(`SELECT id,institution_id,role,display_name FROM users WHERE id=? AND active=1 AND role IN ('TEACHER','GUIDANCE_TEACHER')`).bind(body.userId));
  if (!teacher || teacher.institution_id !== institutionId) return responseError(404, 'TEACHER_NOT_FOUND', 'Öğretmen bulunamadı.');
  const cls = await one<any>(env.DB.prepare('SELECT id,institution_id,season_id,name FROM classes WHERE id=? AND active=1').bind(body.classId));
  if (!cls || cls.institution_id !== institutionId) return responseError(404, 'CLASS_NOT_FOUND', 'Sınıf bulunamadı.');
  if (body.subjectId) {
    const subject = await one(env.DB.prepare('SELECT id FROM subjects WHERE id=? AND active=1').bind(body.subjectId));
    if (!subject) return responseError(404, 'SUBJECT_NOT_FOUND', 'Ders bulunamadı.');
  }

  const subjectId = body.assignmentType === 'SUBJECT' ? body.subjectId! : null;
  const duplicate = await one(env.DB.prepare(`
    SELECT id FROM teacher_assignments
    WHERE user_id=? AND season_id=? AND class_id=? AND assignment_type=? AND coalesce(subject_id,'')=coalesce(?,'') AND active=1
    LIMIT 1
  `).bind(body.userId, cls.season_id, body.classId, body.assignmentType, subjectId));
  if (duplicate) return responseError(409, 'ASSIGNMENT_EXISTS', 'Bu öğretmen yetkisi zaten tanımlı.');

  const id = uuid('tassign');
  await env.DB.prepare(`INSERT INTO teacher_assignments (id,user_id,institution_id,season_id,class_id,subject_id,assignment_type,active) VALUES (?,?,?,?,?,?,?,1)`)
    .bind(id, body.userId, institutionId, cls.season_id, body.classId, subjectId, body.assignmentType).run();
  await audit(env.DB, actor.id, institutionId, 'TEACHER_ASSIGNMENT_CREATED', 'teacher_assignment', id, { teacherId: body.userId, classId: body.classId, subjectId, assignmentType: body.assignmentType });
  return Response.json({ ok: true, id }, { status: 201 });
}

async function setTeacherAssignmentStatus(request: Request, env: Env, actor: AuthUser, assignmentId: string): Promise<Response> {
  if (!canManageTeacherAssignments(actor.role)) return responseError(403, 'FORBIDDEN', 'Öğretmen yetkisi yönetme izniniz bulunmuyor.');
  const assignment = await one<any>(env.DB.prepare(`SELECT ta.*,u.display_name FROM teacher_assignments ta JOIN users u ON u.id=ta.user_id WHERE ta.id=?`).bind(assignmentId));
  if (!assignment) return responseError(404, 'NOT_FOUND', 'Öğretmen yetkisi bulunamadı.');
  if (!(await ensureInstitutionAccess(env, actor, assignment.institution_id))) return responseError(403, 'FORBIDDEN', 'Bu kayda erişim yetkiniz bulunmuyor.');
  const body = await request.json<{ active?: boolean }>();
  if (typeof body.active !== 'boolean') return responseError(400, 'VALIDATION_ERROR', 'Aktiflik durumu belirtilmelidir.');
  await env.DB.prepare('UPDATE teacher_assignments SET active=? WHERE id=?').bind(body.active ? 1 : 0, assignmentId).run();
  await audit(env.DB, actor.id, assignment.institution_id, body.active ? 'TEACHER_ASSIGNMENT_ACTIVATED' : 'TEACHER_ASSIGNMENT_DEACTIVATED', 'teacher_assignment', assignmentId, { teacherId: assignment.user_id });
  return Response.json({ ok: true, active: body.active });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return secureApp.fetch(request, env);

    if (url.pathname === '/api/users') {
      const auth = await requireUser(env, request);
      if (auth instanceof Response) return auth;
      if (request.method === 'GET') return listUsers(env, auth, url);
      if (request.method === 'POST') return createUser(request, env, auth);
      return responseError(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
    }

    const statusMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/status$/);
    if (statusMatch) {
      const auth = await requireUser(env, request);
      if (auth instanceof Response) return auth;
      if (request.method === 'PATCH') return setUserStatus(request, env, auth, statusMatch[1]);
      return responseError(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
    }

    if (url.pathname === '/api/seasons' && request.method === 'GET') {
      const auth = await requireUser(env, request);
      if (auth instanceof Response) return auth;
      return listSeasons(env, auth, url);
    }

    if (url.pathname === '/api/teacher-assignment-options' && request.method === 'GET') {
      const auth = await requireUser(env, request);
      if (auth instanceof Response) return auth;
      return assignmentOptions(env, auth, url);
    }

    if (url.pathname === '/api/teacher-assignments') {
      const auth = await requireUser(env, request);
      if (auth instanceof Response) return auth;
      if (request.method === 'GET') return listTeacherAssignments(env, auth, url);
      if (request.method === 'POST') return createTeacherAssignment(request, env, auth);
      return responseError(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
    }

    const assignmentStatusMatch = url.pathname.match(/^\/api\/teacher-assignments\/([^/]+)\/status$/);
    if (assignmentStatusMatch) {
      const auth = await requireUser(env, request);
      if (auth instanceof Response) return auth;
      if (request.method === 'PATCH') return setTeacherAssignmentStatus(request, env, auth, assignmentStatusMatch[1]);
      return responseError(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
    }

    return secureApp.fetch(request, env);
  },
} satisfies ExportedHandler<Env>;
