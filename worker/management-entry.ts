import secureApp from './secure-entry';
import type { AuthUser, Env, Role } from './types';
import { getAuthUser, hashPassword } from './lib/auth';
import { all, audit, one, uuid } from './lib/db';

const STAFF_ROLES: Role[] = ['INSTITUTION_MANAGER', 'TEACHER', 'GUIDANCE_TEACHER'];

export function canManageUsers(role: Role): boolean {
  return role === 'SUPER_ADMIN' || role === 'INSTITUTION_MANAGER';
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

    return secureApp.fetch(request, env);
  },
} satisfies ExportedHandler<Env>;
