/**
 * A053: guidance report. The guidance teacher sees the development (reviewed guidance signals and recent
 * published exam trend) and support plan of the students of their guidance classes. Private counselling
 * records are separate: only that guidance teacher (and the Super Admin, logged) can read them; branch
 * teachers, managers, students and parents never see them — the report only says how many exist.
 */
import type { AuthUser, Env } from '../types';
import { all, audit, json, one, uuid } from './db';

const fail = (status: number, code: string, message: string) => json({ ok: false, error: { code, message } }, status);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Students the guidance teacher is assigned to (active enrolment in a guidance class of theirs). */
async function guidanceStudentIds(env: Env, user: AuthUser): Promise<string[]> {
  // same rule as the counsellor queue (guidance-assessments.ts): a GUIDANCE assignment for the class, or a school-wide one (class_id NULL)
  if (user.role !== 'GUIDANCE_TEACHER' || !user.institution_id) return [];
  return (await all<{ id: string }>(env.DB.prepare(`SELECT DISTINCT e.student_id id FROM student_enrollments e JOIN teacher_assignments ta ON ta.institution_id=e.institution_id AND (ta.class_id=e.class_id OR ta.class_id IS NULL)
    WHERE ta.user_id=? AND ta.institution_id=? AND ta.assignment_type='GUIDANCE' AND ta.active=1 AND e.status='ACTIVE'`).bind(user.id, user.institution_id))).map((r) => r.id);
}
async function canCounsel(env: Env, user: AuthUser, studentId: string) {
  if (user.role === 'SUPER_ADMIN') return !!(await one(env.DB.prepare('SELECT 1 FROM student_entities WHERE id=?').bind(studentId)));
  return (await guidanceStudentIds(env, user)).includes(studentId);
}
async function studentInstitution(env: Env, studentId: string) {
  return (await one<{ institution_id: string }>(env.DB.prepare(`SELECT institution_id FROM student_enrollments WHERE student_id=? ORDER BY CASE status WHEN 'ACTIVE' THEN 0 ELSE 1 END,created_at DESC LIMIT 1`).bind(studentId)))?.institution_id ?? null;
}

async function report(env: Env, user: AuthUser) {
  const ids = await guidanceStudentIds(env, user);
  if (!ids.length) return json({ ok: true, students: [] });
  const marks = ids.map(() => '?').join(',');
  const students = await all<any>(env.DB.prepare(`SELECT s.id,s.first_name,s.last_name,e.student_number,c.name class_name FROM student_entities s JOIN student_enrollments e ON e.student_id=s.id AND e.status='ACTIVE' LEFT JOIN classes c ON c.id=e.class_id WHERE s.id IN (${marks}) ORDER BY c.name,e.student_number`).bind(...ids));
  const out = [];
  for (const s of students) {
    const signals = await all<any>(env.DB.prepare(`SELECT g.signal_key,g.score,g.created_at FROM guidance_development_signals g JOIN guidance_assessment_sessions ss ON ss.id=g.source_session_id AND ss.status='REVIEWED' WHERE g.student_id=? ORDER BY g.created_at DESC LIMIT 12`).bind(s.id));
    const exams = await all<any>(env.DB.prepare(`SELECT e.title,e.exam_date,snap.net FROM exam_result_snapshots snap JOIN exam_delivery_profiles p ON p.exam_id=snap.exam_id AND p.snapshot_version=snap.snapshot_version JOIN exams e ON e.id=snap.exam_id
      WHERE snap.student_id=? AND p.result_freeze_status='PUBLISHED' AND p.published_at IS NOT NULL ORDER BY coalesce(e.exam_date,p.published_at) DESC LIMIT 5`).bind(s.id));
    const plan = await one<any>(env.DB.prepare('SELECT status,review_date,shared_with_student,shared_with_parent,version,updated_at FROM guidance_support_plans WHERE student_id=?').bind(s.id));
    const privateCount = Number((await one<any>(env.DB.prepare('SELECT count(*) c FROM guidance_private_records WHERE student_id=?').bind(s.id)))?.c || 0);
    out.push({ ...s, signals, recentExams: exams, plan: plan || null, privateRecordCount: privateCount });
  }
  return json({ ok: true, students: out, note: 'Özel rehberlik kayıtlarının içeriği bu raporda yer almaz; yalnız sayısı gösterilir.' });
}

async function privateRecords(request: Request, env: Env, user: AuthUser, studentId: string) {
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'GUIDANCE_TEACHER') return fail(403, 'FORBIDDEN', 'Özel rehberlik kayıtlarını yalnız öğrencinin rehber öğretmeni görür.');
  if (!(await canCounsel(env, user, studentId))) return fail(403, 'FORBIDDEN', 'Özel rehberlik kayıtlarını yalnız öğrencinin rehber öğretmeni görür.');
  const inst = await studentInstitution(env, studentId);
  if (request.method === 'GET') {
    const rows = await all<any>(env.DB.prepare(`SELECT r.id,r.body,r.created_at,u.display_name author FROM guidance_private_records r LEFT JOIN users u ON u.id=r.author_id WHERE r.student_id=? ORDER BY r.created_at DESC,r.rowid DESC`).bind(studentId));
    await audit(env.DB, user.id, inst, 'GUIDANCE_PRIVATE_RECORDS_READ', 'student', studentId, { count: rows.length, role: user.role });
    return json({ ok: true, records: rows });
  }
  if (request.method === 'POST') {
    if (user.role === 'SUPER_ADMIN') return fail(403, 'FORBIDDEN', 'Özel rehberlik kaydını rehber öğretmen yazar.');
    const body = await request.json().catch(() => ({})) as any;
    const t = text(body?.body, 4000); if (!t) return fail(400, 'VALIDATION_ERROR', 'Kayıt metni boş olamaz.');
    const id = uuid('gpr');
    await env.DB.prepare('INSERT INTO guidance_private_records(id,institution_id,student_id,author_id,body) VALUES(?,?,?,?,?)').bind(id, inst, studentId, user.id, t).run();
    await audit(env.DB, user.id, inst, 'GUIDANCE_PRIVATE_RECORD_ADDED', 'student', studentId, { recordId: id });
    return json({ ok: true, id }, 201);
  }
  return fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
}

async function supportPlan(request: Request, env: Env, user: AuthUser, studentId: string) {
  const counsel = await canCounsel(env, user, studentId);
  if (request.method === 'GET') {
    const plan = await one<any>(env.DB.prepare('SELECT * FROM guidance_support_plans WHERE student_id=?').bind(studentId));
    // the shared part: the student and a linked parent see it only when the guidance teacher shared it
    let allowed = counsel;
    if (!allowed && user.role === 'STUDENT') allowed = user.student_id === studentId && !!plan?.shared_with_student;
    if (!allowed && user.role === 'PARENT') allowed = !!plan?.shared_with_parent && !!(await one(env.DB.prepare('SELECT 1 FROM parent_student_links WHERE parent_user_id=? AND student_id=? AND active=1').bind(user.id, studentId)));
    if (!allowed) return fail(403, 'FORBIDDEN', 'Destek planı sizinle paylaşılmamış.');
    return json({ ok: true, plan: plan ? { goals: plan.goals, actions: plan.actions, reviewDate: plan.review_date, status: plan.status, version: plan.version, updatedAt: plan.updated_at, ...(counsel ? { sharedWithStudent: !!plan.shared_with_student, sharedWithParent: !!plan.shared_with_parent } : {}) } : null });
  }
  if (request.method !== 'PUT') return fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
  if (!counsel || user.role === 'SUPER_ADMIN') return fail(403, 'FORBIDDEN', 'Destek planını öğrencinin rehber öğretmeni yazar.');
  const b = await request.json().catch(() => ({})) as any;
  const goals = text(b?.goals, 2000), actions = text(b?.actions, 3000);
  if (!goals || !actions) return fail(400, 'VALIDATION_ERROR', 'Hedefler ve yapılacaklar yazılmalıdır.');
  const reviewDate = text(b?.reviewDate, 10) || null; if (reviewDate && !/^\d{4}-\d{2}-\d{2}$/.test(reviewDate)) return fail(400, 'VALIDATION_ERROR', 'Gözden geçirme tarihi YYYY-AA-GG olmalıdır.');
  const status = b?.status === 'CLOSED' ? 'CLOSED' : 'ACTIVE';
  const inst = await studentInstitution(env, studentId);
  await env.DB.prepare(`INSERT INTO guidance_support_plans(student_id,institution_id,goals,actions,review_date,status,shared_with_student,shared_with_parent,version,updated_by) VALUES(?,?,?,?,?,?,?,?,1,?)
    ON CONFLICT(student_id) DO UPDATE SET goals=excluded.goals,actions=excluded.actions,review_date=excluded.review_date,status=excluded.status,shared_with_student=excluded.shared_with_student,shared_with_parent=excluded.shared_with_parent,version=guidance_support_plans.version+1,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
    .bind(studentId, inst, goals, actions, reviewDate, status, b?.sharedWithStudent ? 1 : 0, b?.sharedWithParent ? 1 : 0, user.id).run();
  await audit(env.DB, user.id, inst, 'GUIDANCE_SUPPORT_PLAN_SAVED', 'student', studentId, { status, sharedWithStudent: !!b?.sharedWithStudent, sharedWithParent: !!b?.sharedWithParent });
  return json({ ok: true });
}

export async function handleGuidanceRecords(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/guidance-report')) return null;
  const { getAuthUser } = await import('./auth');
  const user = await getAuthUser(env, request);
  if (!user) return fail(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) return fail(403, 'FORBIDDEN', 'İsteği ANUNEX üzerinden başlatın.');
  if (url.pathname === '/api/guidance-report' && request.method === 'GET') {
    if (user.role !== 'GUIDANCE_TEACHER' || user.must_change_password) return fail(403, 'FORBIDDEN', 'Rehberlik karnesi rehber öğretmene açıktır.');
    return report(env, user);
  }
  const m = url.pathname.match(/^\/api\/guidance-report\/students\/([^/]+)\/(private-records|support-plan)$/);
  if (!m) return fail(404, 'NOT_FOUND', 'Yol bulunamadı.');
  return m[2] === 'private-records' ? privateRecords(request, env, user, m[1]) : supportPlan(request, env, user, m[1]);
}
