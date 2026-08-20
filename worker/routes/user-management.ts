import type { AuthUser, Env, Role } from '../types';
import { hashPassword } from '../lib/auth';
import { all, audit, badRequest, forbidden, json, notFound, one, uuid } from '../lib/db';

type ManagedRole = Exclude<Role, 'SUPER_ADMIN'>;
type AssignmentInput = { classId?: string; subjectId?: string; assignmentType?: 'SUBJECT' | 'GUIDANCE' };

export function canManageUsers(role: Role): boolean {
  return role === 'SUPER_ADMIN' || role === 'INSTITUTION_MANAGER';
}

export function canCreateManagedRole(actorRole: Role, targetRole: Role): boolean {
  if (actorRole === 'SUPER_ADMIN') return targetRole !== 'SUPER_ADMIN';
  if (actorRole === 'INSTITUTION_MANAGER') return ['TEACHER', 'GUIDANCE_TEACHER', 'STUDENT', 'PARENT'].includes(targetRole);
  return false;
}

function passwordIsAcceptable(password: string): boolean {
  return password.length >= 10 && password.length <= 128 && /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(password) && /\d/.test(password);
}

async function currentSeason(env: Env, institutionId: string): Promise<{ id: string; academic_year: string } | null> {
  return one(env.DB.prepare(`SELECT id,academic_year FROM institution_seasons WHERE institution_id=? AND status='ACTIVE' ORDER BY academic_year DESC LIMIT 1`).bind(institutionId));
}

function resolvedInstitutionId(actor: AuthUser, requested: string | null | undefined): string | null {
  return actor.role === 'SUPER_ADMIN' ? requested?.trim() || null : actor.institution_id;
}

async function assertActorInstitutionActive(env: Env, actor: AuthUser): Promise<Response | null> {
  if (actor.role === 'SUPER_ADMIN') return null;
  if (!actor.institution_id) return forbidden();
  const institution = await one<{ status: string }>(env.DB.prepare('SELECT status FROM institutions WHERE id=?').bind(actor.institution_id));
  if (!institution || institution.status !== 'ACTIVE') {
    return forbidden('Kurum hesabı aktif değilken kullanıcı yönetimi yapılamaz.');
  }
  return null;
}

async function targetUser(env: Env, actor: AuthUser, id: string): Promise<any | null> {
  const row = await one<any>(env.DB.prepare(`SELECT u.*,i.status institution_status FROM users u LEFT JOIN institutions i ON i.id=u.institution_id WHERE u.id=?`).bind(id));
  if (!row) return null;
  if (actor.role === 'SUPER_ADMIN') return row;
  if (row.institution_id !== actor.institution_id) return null;
  if (!canCreateManagedRole(actor.role, row.role)) return null;
  return row;
}

async function validateStudentIds(env: Env, institutionId: string, studentIds: string[]): Promise<boolean> {
  if (!studentIds.length) return false;
  const unique = [...new Set(studentIds)];
  const placeholders = unique.map(() => '?').join(',');
  const row = await one<{ c: number }>(env.DB.prepare(`
    SELECT count(DISTINCT s.id) c
    FROM student_entities s
    JOIN student_enrollments e ON e.student_id=s.id
    WHERE s.id IN (${placeholders}) AND e.institution_id=? AND s.status='ACTIVE' AND e.status='ACTIVE'
  `).bind(...unique, institutionId));
  return Number(row?.c ?? 0) === unique.length;
}

async function validateAssignments(env: Env, institutionId: string, role: Role, assignments: AssignmentInput[]): Promise<{ seasonId: string; assignments: Required<AssignmentInput>[] } | Response> {
  const season = await currentSeason(env, institutionId);
  if (!season) return badRequest('Aktif eğitim yılı bulunamadı.', 'ACTIVE_SEASON_REQUIRED');
  const normalized: Required<AssignmentInput>[] = [];
  for (const item of assignments) {
    const assignmentType = item.assignmentType;
    const classId = item.classId?.trim() || '';
    const subjectId = item.subjectId?.trim() || '';
    if (!assignmentType || !classId || !['SUBJECT', 'GUIDANCE'].includes(assignmentType)) return badRequest('Öğretmen yetkilendirme bilgisi eksik.');
    if (role === 'GUIDANCE_TEACHER' && assignmentType !== 'GUIDANCE') return badRequest('Rehber öğretmene branş yetkisi atanamaz.');
    const cls = await one<{ id: string }>(env.DB.prepare('SELECT id FROM classes WHERE id=? AND institution_id=? AND season_id=? AND active=1').bind(classId, institutionId, season.id));
    if (!cls) return badRequest('Atanan sınıf bu kurumun aktif sezonunda bulunamadı.');
    if (assignmentType === 'SUBJECT') {
      if (!subjectId) return badRequest('Branş atamasında ders seçilmelidir.');
      const subject = await one<{ id: string }>(env.DB.prepare('SELECT id FROM subjects WHERE id=? AND active=1').bind(subjectId));
      if (!subject) return badRequest('Seçilen ders bulunamadı.');
      normalized.push({ classId, subjectId, assignmentType });
    } else {
      normalized.push({ classId, subjectId: '', assignmentType });
    }
  }
  return { seasonId: season.id, assignments: normalized };
}

async function replaceAssignments(env: Env, actor: AuthUser, target: any, assignments: AssignmentInput[]): Promise<Response> {
  if (!['TEACHER', 'GUIDANCE_TEACHER'].includes(target.role)) return badRequest('Bu kullanıcıya öğretmen yetkisi atanamaz.');
  const checked = await validateAssignments(env, target.institution_id, target.role, assignments);
  if (checked instanceof Response) return checked;
  await env.DB.prepare('UPDATE teacher_assignments SET active=0 WHERE user_id=? AND season_id=?').bind(target.id, checked.seasonId).run();
  for (const item of checked.assignments) {
    await env.DB.prepare(`INSERT INTO teacher_assignments (id,user_id,institution_id,season_id,class_id,subject_id,assignment_type,active) VALUES(?,?,?,?,?,?,?,1)`)
      .bind(uuid('ta'), target.id, target.institution_id, checked.seasonId, item.classId, item.assignmentType === 'SUBJECT' ? item.subjectId : null, item.assignmentType).run();
  }
  await audit(env.DB, actor.id, target.institution_id, 'TEACHER_ASSIGNMENTS_REPLACED', 'user', target.id, { count: checked.assignments.length, seasonId: checked.seasonId });
  return json({ ok: true, assignmentCount: checked.assignments.length });
}

async function listUsers(env: Env, actor: AuthUser, url: URL): Promise<Response> {
  const institutionId = resolvedInstitutionId(actor, url.searchParams.get('institutionId'));
  if (!institutionId) return badRequest('Kurum seçilmelidir.');
  const rows = await all<any>(env.DB.prepare(`
    SELECT u.id,u.role,u.display_name,u.email,u.phone,u.username,u.active,u.student_id,u.created_at,
      s.first_name || CASE WHEN s.last_name<>'' THEN ' ' || s.last_name ELSE '' END student_name,
      (SELECT count(*) FROM parent_student_links p WHERE p.parent_user_id=u.id AND p.active=1) linked_student_count,
      (SELECT group_concat(
        CASE WHEN ta.assignment_type='GUIDANCE' THEN c.name || ' · Rehberlik' ELSE c.name || ' · ' || coalesce(sb.name,'Ders') END,
        ' | '
      ) FROM teacher_assignments ta LEFT JOIN classes c ON c.id=ta.class_id LEFT JOIN subjects sb ON sb.id=ta.subject_id WHERE ta.user_id=u.id AND ta.active=1) assignment_summary
    FROM users u
    LEFT JOIN student_entities s ON s.id=u.student_id
    WHERE u.institution_id=?
    ORDER BY CASE u.role WHEN 'INSTITUTION_MANAGER' THEN 1 WHEN 'GUIDANCE_TEACHER' THEN 2 WHEN 'TEACHER' THEN 3 WHEN 'STUDENT' THEN 4 ELSE 5 END,u.display_name
  `).bind(institutionId));
  const filtered = actor.role === 'SUPER_ADMIN' ? rows : rows.filter((row) => canCreateManagedRole(actor.role, row.role));
  return json({ ok: true, users: filtered });
}

async function userOptions(env: Env, actor: AuthUser, url: URL): Promise<Response> {
  const institutionId = resolvedInstitutionId(actor, url.searchParams.get('institutionId'));
  if (!institutionId) return badRequest('Kurum seçilmelidir.');
  const institution = await one<any>(env.DB.prepare('SELECT id,name,status FROM institutions WHERE id=?').bind(institutionId));
  if (!institution) return notFound('Kurum bulunamadı.');
  const season = await currentSeason(env, institutionId);
  const classes = season ? await all<any>(env.DB.prepare('SELECT id,name,grade_level,section FROM classes WHERE institution_id=? AND season_id=? AND active=1 ORDER BY grade_level,section').bind(institutionId, season.id)) : [];
  const subjects = await all<any>(env.DB.prepare('SELECT id,code,name FROM subjects WHERE active=1 ORDER BY name'));
  const students = season ? await all<any>(env.DB.prepare(`
    SELECT s.id,e.student_number,e.grade_level,e.section,s.first_name || CASE WHEN s.last_name<>'' THEN ' ' || s.last_name ELSE '' END name
    FROM student_entities s JOIN student_enrollments e ON e.student_id=s.id
    WHERE e.institution_id=? AND e.season_id=? AND e.status='ACTIVE' AND s.status='ACTIVE'
    ORDER BY e.grade_level,e.section,cast(e.student_number as integer),s.normalized_name
  `).bind(institutionId, season.id)) : [];
  return json({ ok: true, institution, season, classes, subjects, students });
}

async function createUser(request: Request, env: Env, actor: AuthUser): Promise<Response> {
  const body = await request.json<{
    institutionId?: string; role?: ManagedRole; displayName?: string; email?: string; phone?: string; username?: string; password?: string;
    studentId?: string; linkedStudentIds?: string[]; assignments?: AssignmentInput[];
  }>();
  const institutionId = resolvedInstitutionId(actor, body.institutionId);
  if (!institutionId) return badRequest('Kurum seçilmelidir.');
  if (!body.role || !canCreateManagedRole(actor.role, body.role)) return forbidden('Bu kullanıcı rolünü oluşturamazsınız.');
  const displayName = body.displayName?.trim() || '';
  const email = body.email?.trim().toLowerCase() || null;
  const username = body.username?.trim().toLowerCase() || null;
  const phone = body.phone?.trim() || null;
  const password = body.password || '';
  if (displayName.length < 2) return badRequest('Ad soyad en az 2 karakter olmalıdır.');
  if (!email && !username && !phone) return badRequest('En az bir giriş bilgisi (e-posta, kullanıcı adı veya telefon) gereklidir.');
  if (!passwordIsAcceptable(password)) return badRequest('Şifre en az 10 karakter olmalı ve harf ile rakam içermelidir.', 'WEAK_PASSWORD');
  const institution = await one<{ id: string }>(env.DB.prepare('SELECT id FROM institutions WHERE id=?').bind(institutionId));
  if (!institution) return notFound('Kurum bulunamadı.');

  const duplicate = await one<{ id: string }>(env.DB.prepare(`SELECT id FROM users WHERE (? IS NOT NULL AND lower(email)=lower(?)) OR (? IS NOT NULL AND lower(username)=lower(?)) LIMIT 1`).bind(email, email, username, username));
  if (duplicate) return badRequest('E-posta veya kullanıcı adı zaten kullanımda.', 'USER_IDENTIFIER_EXISTS');

  let studentId: string | null = null;
  let linkedStudentIds: string[] = [];
  if (body.role === 'STUDENT') {
    studentId = body.studentId?.trim() || null;
    if (!studentId || !(await validateStudentIds(env, institutionId, [studentId]))) return badRequest('Öğrenci hesabı yalnız aktif ve bu kuruma kayıtlı öğrenciye bağlanabilir.');
    const alreadyLinked = await one<{ id: string }>(env.DB.prepare(`SELECT id FROM users WHERE student_id=? AND role='STUDENT' LIMIT 1`).bind(studentId));
    if (alreadyLinked) return badRequest('Bu öğrencinin zaten bir kullanıcı hesabı var.', 'STUDENT_ACCOUNT_EXISTS');
  }
  if (body.role === 'PARENT') {
    linkedStudentIds = [...new Set((body.linkedStudentIds || []).map((x) => x.trim()).filter(Boolean))];
    if (!(await validateStudentIds(env, institutionId, linkedStudentIds))) return badRequest('Veli en az bir aktif kurum öğrencisine bağlanmalıdır.');
  }

  const assignments = body.assignments || [];
  let checkedAssignments: { seasonId: string; assignments: Required<AssignmentInput>[] } | null = null;
  if (body.role === 'TEACHER' || body.role === 'GUIDANCE_TEACHER') {
    const checked = await validateAssignments(env, institutionId, body.role, assignments);
    if (checked instanceof Response) return checked;
    checkedAssignments = checked;
  }

  const passwordData = await hashPassword(password);
  const id = uuid('usr');
  try {
    await env.DB.prepare(`INSERT INTO users (id,institution_id,student_id,role,display_name,email,phone,username,password_hash,password_salt,password_iterations,password_algo,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,'PBKDF2-SHA256-v1',1)`)
      .bind(id, institutionId, studentId, body.role, displayName, email, phone, username, passwordData.hash, passwordData.salt, passwordData.iterations).run();
  } catch (error) {
    console.error('create user failed', error);
    return badRequest('Kullanıcı oluşturulamadı. Giriş bilgilerinin benzersiz olduğunu kontrol edin.', 'USER_CREATE_FAILED');
  }

  for (const linkedId of linkedStudentIds) {
    await env.DB.prepare(`INSERT INTO parent_student_links (id,parent_user_id,student_id,relationship,active) VALUES(?,?,?,'VELI',1)`).bind(uuid('psl'), id, linkedId).run();
  }
  if (checkedAssignments) {
    for (const item of checkedAssignments.assignments) {
      await env.DB.prepare(`INSERT INTO teacher_assignments (id,user_id,institution_id,season_id,class_id,subject_id,assignment_type,active) VALUES(?,?,?,?,?,?,?,1)`)
        .bind(uuid('ta'), id, institutionId, checkedAssignments.seasonId, item.classId, item.assignmentType === 'SUBJECT' ? item.subjectId : null, item.assignmentType).run();
    }
  }
  await audit(env.DB, actor.id, institutionId, 'USER_CREATED', 'user', id, { role: body.role, studentId, linkedStudentCount: linkedStudentIds.length, assignmentCount: checkedAssignments?.assignments.length ?? 0 });
  return json({ ok: true, id });
}

async function setUserStatus(request: Request, env: Env, actor: AuthUser, id: string): Promise<Response> {
  const target = await targetUser(env, actor, id);
  if (!target) return notFound('Kullanıcı bulunamadı.');
  const body = await request.json<{ active?: boolean }>();
  if (typeof body.active !== 'boolean') return badRequest('Aktif/pasif durumu belirtilmelidir.');
  if (actor.id === id && body.active === false) return badRequest('Kendi hesabınızı pasife alamazsınız.');
  await env.DB.prepare('UPDATE users SET active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(body.active ? 1 : 0, id).run();
  if (!body.active) await env.DB.prepare('UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND revoked_at IS NULL').bind(id).run();
  await audit(env.DB, actor.id, target.institution_id, body.active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', 'user', id);
  return json({ ok: true, active: body.active });
}

async function resetPassword(request: Request, env: Env, actor: AuthUser, id: string): Promise<Response> {
  const target = await targetUser(env, actor, id);
  if (!target) return notFound('Kullanıcı bulunamadı.');
  const body = await request.json<{ password?: string }>();
  const password = body.password || '';
  if (!passwordIsAcceptable(password)) return badRequest('Yeni şifre en az 10 karakter olmalı ve harf ile rakam içermelidir.', 'WEAK_PASSWORD');
  const passwordData = await hashPassword(password);
  await env.DB.prepare(`UPDATE users SET password_hash=?,password_salt=?,password_iterations=?,password_algo='PBKDF2-SHA256-v1',updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(passwordData.hash, passwordData.salt, passwordData.iterations, id).run();
  await env.DB.prepare('UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND revoked_at IS NULL').bind(id).run();
  await audit(env.DB, actor.id, target.institution_id, 'USER_PASSWORD_RESET', 'user', id);
  return json({ ok: true });
}

export async function handleUserManagement(request: Request, env: Env, actor: AuthUser, url: URL): Promise<Response | null> {
  if (!url.pathname.startsWith('/api/admin/users') && url.pathname !== '/api/admin/user-options') return null;
  if (!canManageUsers(actor.role)) return forbidden();
  const inactive = await assertActorInstitutionActive(env, actor);
  if (inactive) return inactive;

  if (url.pathname === '/api/admin/users' && request.method === 'GET') return listUsers(env, actor, url);
  if (url.pathname === '/api/admin/users' && request.method === 'POST') return createUser(request, env, actor);
  if (url.pathname === '/api/admin/user-options' && request.method === 'GET') return userOptions(env, actor, url);

  const statusMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/status$/);
  if (statusMatch && request.method === 'POST') return setUserStatus(request, env, actor, statusMatch[1]);
  const resetMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/reset-password$/);
  if (resetMatch && request.method === 'POST') return resetPassword(request, env, actor, resetMatch[1]);
  const assignmentMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/assignments$/);
  if (assignmentMatch && request.method === 'POST') {
    const target = await targetUser(env, actor, assignmentMatch[1]);
    if (!target) return notFound('Kullanıcı bulunamadı.');
    const body = await request.json<{ assignments?: AssignmentInput[] }>();
    return replaceAssignments(env, actor, target, body.assignments || []);
  }
  return null;
}
