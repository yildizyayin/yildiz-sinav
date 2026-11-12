/**
 * Rehberlik R4 (owner, 12 Nov 2026): the school's annual guidance plan, the class activity pool (given to a class
 * teacher, marked done), the resource library shared with students, parents or teachers, and the screen & sleep diary.
 * ANUNEX-written activities and resources stay in review until the Super Admin approves them. The diary is a
 * self-report for conversation: it never labels a child as addicted.
 */
import type { AuthUser, Env } from '../types';
import { all, audit, json, one, uuid } from './db';
import { guidanceStudentIds } from './guidance-records';

const fail = (status: number, code: string, message: string) => json({ ok: false, error: { code, message } }, status);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const marks = (n: number) => Array.from({ length: n }, () => '?').join(',');
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const KINDS = ['CLASS_ACTIVITY', 'PARENT_SEMINAR', 'TEACHER_INFO', 'SURVEY', 'GROUP', 'CAREER', 'PREVENTION', 'OTHER'];
const AREAS = ['ACADEMIC', 'CAREER', 'SOCIAL_EMOTIONAL'];

/** The school year a date belongs to (starts in September). */
export function schoolYearOf(date = today()) { const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7)); const s = m >= 9 ? y : y - 1; return `${s}-${s + 1}`; }

// ---------------------------------------------------------------- annual plan
async function plan(request: Request, env: Env, user: AuthUser, url: URL) {
  const year = text(url.searchParams.get('year'), 9) || schoolYearOf();
  if (!/^\d{4}-\d{4}$/.test(year)) return fail(400, 'VALIDATION_ERROR', 'Eğitim yılı geçersiz.');
  if (request.method === 'PUT') {
    const b = await request.json().catch(() => ({})) as any;
    await env.DB.prepare(`INSERT INTO guidance_annual_plans(id,institution_id,academic_year,theme,priorities,updated_by) VALUES(?,?,?,?,?,?) ON CONFLICT(institution_id,academic_year) DO UPDATE SET theme=excluded.theme,priorities=excluded.priorities,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
      .bind(uuid('gap'), user.institution_id, year, text(b?.theme, 200) || null, text(b?.priorities, 2000) || null, user.id).run();
    return json({ ok: true });
  }
  const p = await one<any>(env.DB.prepare(`SELECT * FROM guidance_annual_plans WHERE institution_id=? AND academic_year=?`).bind(user.institution_id, year));
  const entries = p ? await all<any>(env.DB.prepare(`SELECT e.*,a.title activity_title FROM guidance_plan_entries e LEFT JOIN guidance_activities a ON a.id=e.activity_id WHERE e.plan_id=? ORDER BY CASE WHEN e.month>=9 THEN e.month-9 ELSE e.month+3 END,e.target_date,e.created_at`).bind(p.id)) : [];
  // suggestions from the latest closed or open RİBA of the school: its five most-needed items
  const riba = await one<any>(env.DB.prepare(`SELECT s.id FROM guidance_surveys s JOIN guidance_survey_templates t ON t.id=s.template_id WHERE s.institution_id=? AND t.kind='RIBA' ORDER BY s.created_at DESC LIMIT 1`).bind(user.institution_id));
  let ribaTop: any[] = [];
  if (riba) {
    const rows = await all<any>(env.DB.prepare(`SELECT form_code,answers_json FROM guidance_survey_responses WHERE survey_id=?`).bind(riba.id));
    const s = await one<any>(env.DB.prepare(`SELECT forms_json FROM guidance_surveys WHERE id=?`).bind(riba.id));
    const forms = JSON.parse(s?.forms_json || '{}').forms || [];
    for (const f of forms) {
      const rs = rows.filter((r) => r.form_code === f.code); if (rs.length < 5) continue;
      for (const it of f.items) { const vals = rs.map((r) => JSON.parse(r.answers_json)[it.id]); const a = vals.filter((v) => v === 'A').length; ribaTop.push({ form: f.title, text: it.text, aPct: a / vals.length }); }
    }
    ribaTop = ribaTop.sort((x, y) => y.aPct - x.aPct).slice(0, 5);
  }
  const teacherCount = await one<any>(env.DB.prepare(`SELECT count(*) n FROM users WHERE institution_id=? AND role='TEACHER' AND active=1`).bind(user.institution_id));
  return json({ ok: true, year, plan: p, entries, ribaTop, teacherCount: Number(teacherCount?.n || 0) });
}

async function planEntry(request: Request, env: Env, user: AuthUser, id?: string) {
  if (!id) {
    const b = await request.json().catch(() => ({})) as any;
    const year = text(b?.year, 9) || schoolYearOf();
    const month = Math.round(Number(b?.month)); const kind = KINDS.includes(b?.kind) ? b.kind : null; const area = AREAS.includes(b?.area) ? b.area : null; const title = text(b?.title, 200);
    if (!(month >= 1 && month <= 12) || !kind || !area || !title) return fail(400, 'VALIDATION_ERROR', 'Ay, tür, alan ve başlık seçilmelidir.');
    const date = text(b?.targetDate, 10) || null; if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(400, 'VALIDATION_ERROR', 'Tarih geçersiz.');
    await env.DB.prepare(`INSERT OR IGNORE INTO guidance_annual_plans(id,institution_id,academic_year,updated_by) VALUES(?,?,?,?)`).bind(uuid('gap'), user.institution_id, year, user.id).run();
    const p = await one<any>(env.DB.prepare(`SELECT id FROM guidance_annual_plans WHERE institution_id=? AND academic_year=?`).bind(user.institution_id, year));
    const eid = uuid('gpe');
    await env.DB.prepare(`INSERT INTO guidance_plan_entries(id,plan_id,month,kind,area,title,grade_min,grade_max,activity_id,target_date,note,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(eid, p.id, month, kind, area, title, Number(b?.gradeMin) || null, Number(b?.gradeMax) || null, text(b?.activityId, 80) || null, date, text(b?.note, 500) || null, user.id).run();
    return json({ ok: true, id: eid }, 201);
  }
  const e = await one<any>(env.DB.prepare(`SELECT e.id FROM guidance_plan_entries e JOIN guidance_annual_plans p ON p.id=e.plan_id WHERE e.id=? AND p.institution_id=?`).bind(id, user.institution_id));
  if (!e) return fail(404, 'NOT_FOUND', 'Plan satırı bulunamadı.');
  if (request.method === 'DELETE') { await env.DB.prepare(`DELETE FROM guidance_plan_entries WHERE id=?`).bind(id).run(); return json({ ok: true }); }
  const b = await request.json().catch(() => ({})) as any;
  const status = ['PLANNED', 'DONE', 'CANCELLED'].includes(b?.status) ? b.status : null;
  await env.DB.prepare(`UPDATE guidance_plan_entries SET status=COALESCE(?,status),note=COALESCE(?,note) WHERE id=?`).bind(status, b?.note !== undefined ? text(b.note, 500) : null, id).run();
  return json({ ok: true });
}

// ---------------------------------------------------------------- activities
async function activities(env: Env, user: AuthUser) {
  const rows = await all<any>(env.DB.prepare(`SELECT * FROM guidance_activities WHERE active=1 AND (institution_id IS NULL OR institution_id=?) ORDER BY grade_min,title`).bind(user.institution_id));
  const assignments = await all<any>(env.DB.prepare(`SELECT g.*,a.title,c.name class_name,u.display_name teacher FROM guidance_activity_assignments g JOIN guidance_activities a ON a.id=g.activity_id JOIN classes c ON c.id=g.class_id LEFT JOIN users u ON u.id=g.teacher_id WHERE g.institution_id=? ORDER BY g.created_at DESC LIMIT 200`).bind(user.institution_id));
  const pending = await one<any>(env.DB.prepare(`SELECT count(*) n FROM guidance_activities WHERE review_status='REVIEW'`));
  return json({ ok: true, activities: rows.map((r) => ({ ...r, steps: JSON.parse(r.steps_json || '[]'), steps_json: undefined })), assignments, pendingReview: Number(pending?.n || 0) });
}

async function assignActivity(request: Request, env: Env, user: AuthUser) {
  const b = await request.json().catch(() => ({})) as any;
  const act = await one<any>(env.DB.prepare(`SELECT * FROM guidance_activities WHERE id=? AND active=1 AND (institution_id IS NULL OR institution_id=?)`).bind(text(b?.activityId, 80), user.institution_id));
  if (!act) return fail(404, 'NOT_FOUND', 'Etkinlik bulunamadı ya da henüz onaylanmadı.');
  const classId = text(b?.classId, 80);
  const scope = await guidanceStudentIds(env, user);
  const inClass = await all<any>(env.DB.prepare(`SELECT student_id FROM student_enrollments WHERE class_id=? AND status='ACTIVE'`).bind(classId));
  if (!inClass.length || !inClass.some((s) => scope.includes(s.student_id))) return fail(403, 'FORBIDDEN', 'Yalnız rehberliğini yaptığınız sınıflara etkinlik verilir.');
  const teacherId = text(b?.teacherId, 80) || null;
  if (teacherId && !(await one(env.DB.prepare(`SELECT 1 FROM teacher_assignments WHERE user_id=? AND class_id=? AND active=1`).bind(teacherId, classId)))) return fail(400, 'VALIDATION_ERROR', 'Seçilen öğretmen bu sınıfa girmiyor.');
  const id = uuid('gaa'); const due = text(b?.dueDate, 10) || null;
  await env.DB.prepare(`INSERT INTO guidance_activity_assignments(id,institution_id,activity_id,class_id,teacher_id,assigned_by,due_date,plan_entry_id) VALUES(?,?,?,?,?,?,?,?)`).bind(id, user.institution_id, act.id, classId, teacherId, user.id, due, text(b?.planEntryId, 80) || null).run();
  if (teacherId) await env.DB.prepare(`INSERT INTO notifications(id,recipient_user_id,institution_id,type,title,body,action_url,entity_type,entity_id) VALUES(?,?,?,?,?,?,?,?,?)`).bind(uuid('ntf'), teacherId, user.institution_id, 'GUIDANCE_ACTIVITY', 'Sınıf rehberlik etkinliği', `${act.title} etkinliği sınıfınız için planlandı.`, '/rehberlik-etkinliklerim', 'guidance_activity_assignment', id).run();
  await audit(env.DB, user.id, user.institution_id, 'GUIDANCE_ACTIVITY_ASSIGNED', 'guidance_activity_assignment', id, { activity: act.id, classId });
  return json({ ok: true, id }, 201);
}

// ---------------------------------------------------------------- resources
async function resources(env: Env, user: AuthUser) {
  const rows = await all<any>(env.DB.prepare(`SELECT r.*,(SELECT json_group_array(coalesce(c.name,'Tüm okul')) FROM guidance_resource_shares s LEFT JOIN classes c ON c.id=s.class_id WHERE s.resource_id=r.id AND s.institution_id=?) shared FROM guidance_resources r WHERE r.active=1 AND (r.institution_id IS NULL OR r.institution_id=?) ORDER BY r.audience,r.title`).bind(user.institution_id, user.institution_id));
  return json({ ok: true, resources: rows.map((r) => ({ ...r, shared: JSON.parse(r.shared || '[]') })) });
}
async function myResources(env: Env, user: AuthUser) {
  const audience = user.role === 'STUDENT' ? 'STUDENT' : user.role === 'PARENT' ? 'PARENT' : 'TEACHER';
  let classIds: string[] = [];
  if (user.role === 'STUDENT') classIds = (await all<any>(env.DB.prepare(`SELECT class_id FROM student_enrollments WHERE student_id=? AND status='ACTIVE'`).bind(user.student_id))).map((r) => r.class_id).filter(Boolean);
  if (user.role === 'PARENT') classIds = (await all<any>(env.DB.prepare(`SELECT e.class_id FROM parent_student_links l JOIN student_enrollments e ON e.student_id=l.student_id AND e.status='ACTIVE' WHERE l.parent_user_id=? AND l.active=1`).bind(user.id))).map((r) => r.class_id).filter(Boolean);
  const rows = await all<any>(env.DB.prepare(`SELECT DISTINCT r.id,r.title,r.topic,r.body,r.url FROM guidance_resources r JOIN guidance_resource_shares s ON s.resource_id=r.id AND s.institution_id=?
    WHERE r.active=1 AND r.audience=? AND (s.class_id IS NULL OR s.class_id IN (${classIds.length ? marks(classIds.length) : "''"})) ORDER BY s.shared_at DESC`).bind(user.institution_id, audience, ...classIds));
  return json({ ok: true, resources: rows });
}

// ---------------------------------------------------------------- screen & sleep diary
export async function screenSummary(env: Env, studentIds: string[], day = today()) {
  if (!studentIds.length) return new Map<string, { days: number; avgMinutes: number; lateNights: number }>();
  const rows = await all<any>(env.DB.prepare(`SELECT student_id,log_date,entered_by,screen_minutes,bedtime FROM guidance_screen_logs WHERE student_id IN (${marks(studentIds.length)}) AND log_date BETWEEN ? AND ?`).bind(...studentIds, addDays(day, -6), day));
  const out = new Map<string, { days: number; avgMinutes: number; lateNights: number }>();
  for (const sid of studentIds) {
    const byDate = new Map<string, any>();
    for (const r of rows.filter((x) => x.student_id === sid)) { const cur = byDate.get(r.log_date); if (!cur || r.entered_by === 'STUDENT') byDate.set(r.log_date, r); }
    const list = [...byDate.values()]; if (!list.length) continue;
    // a bedtime after 23:30 (or after midnight, before 05:00) counts as a late night
    const late = list.filter((r) => r.bedtime && (r.bedtime >= '23:30' || r.bedtime < '05:00')).length;
    out.set(sid, { days: list.length, avgMinutes: Math.round(list.reduce((a, r) => a + Number(r.screen_minutes), 0) / list.length), lateNights: late });
  }
  return out;
}
/** Erken uyarı: a week of the diary with a high daily average or many late nights. */
export async function screenWarnings(env: Env, studentIds: string[]) {
  const s = await screenSummary(env, studentIds);
  const out: { studentId: string; key: string; level: 'MEDIUM'; reason: string }[] = [];
  for (const [sid, v] of s) {
    if (v.days < 4) continue;
    if (v.avgMinutes > 240 || v.lateNights >= 4) out.push({ studentId: sid, key: 'SCREEN', level: 'MEDIUM', reason: `Ekran günlüğünde son 7 günde ${v.days} kayıt: günlük ortalama ${Math.floor(v.avgMinutes / 60)} sa ${v.avgMinutes % 60} dk${v.lateNights ? `, ${v.lateNights} gece 23.30’dan sonra yatış` : ''}.` });
  }
  return out;
}

async function screenMine(request: Request, env: Env, user: AuthUser, url: URL) {
  let studentId = user.student_id;
  if (user.role === 'PARENT') {
    const children = await all<any>(env.DB.prepare(`SELECT s.id,s.first_name||' '||s.last_name name FROM parent_student_links l JOIN student_entities s ON s.id=l.student_id WHERE l.parent_user_id=? AND l.active=1 ORDER BY s.first_name`).bind(user.id));
    const want = request.method === 'GET' ? text(url.searchParams.get('studentId'), 80) : text(((await request.clone().json().catch(() => ({}))) as any)?.studentId, 80);
    studentId = want || children[0]?.id || null;
    if (!studentId || !children.some((c) => c.id === studentId)) return request.method === 'GET' ? json({ ok: true, children, logs: [] }) : fail(403, 'FORBIDDEN', 'Yalnız kendi çocuğunuz için kayıt girebilirsiniz.');
    if (request.method === 'GET') return json({ ok: true, children, studentId, logs: await all<any>(env.DB.prepare(`SELECT * FROM guidance_screen_logs WHERE student_id=? AND log_date>=? ORDER BY log_date DESC`).bind(studentId, addDays(today(), -13))) });
  } else if (user.role !== 'STUDENT' || !studentId) return fail(403, 'FORBIDDEN', 'Ekran günlüğü öğrenci ve veliler içindir.');
  if (request.method === 'GET') return json({ ok: true, logs: await all<any>(env.DB.prepare(`SELECT * FROM guidance_screen_logs WHERE student_id=? AND log_date>=? ORDER BY log_date DESC`).bind(studentId, addDays(today(), -13))) });
  const b = await request.json().catch(() => ({})) as any;
  const date = text(b?.date, 10) || today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today() || date < addDays(today(), -6)) return fail(400, 'VALIDATION_ERROR', 'Kayıt yalnız son yedi gün için girilebilir.');
  const minutes = Math.round(Number(b?.screenMinutes)); if (!(minutes >= 0 && minutes <= 1440)) return fail(400, 'VALIDATION_ERROR', 'Ekran süresi geçersiz.');
  const bedtime = text(b?.bedtime, 5) || null; if (bedtime && !/^[0-2]\d:[0-5]\d$/.test(bedtime)) return fail(400, 'VALIDATION_ERROR', 'Yatış saati SS:DD olmalıdır.');
  const enr = await one<any>(env.DB.prepare(`SELECT institution_id FROM student_enrollments WHERE student_id=? AND status='ACTIVE' LIMIT 1`).bind(studentId));
  if (!enr) return fail(403, 'FORBIDDEN', 'Aktif öğrenci kaydı bulunamadı.');
  await env.DB.prepare(`INSERT INTO guidance_screen_logs(student_id,institution_id,log_date,entered_by,screen_minutes,bedtime) VALUES(?,?,?,?,?,?) ON CONFLICT(student_id,log_date,entered_by) DO UPDATE SET screen_minutes=excluded.screen_minutes,bedtime=excluded.bedtime,created_at=CURRENT_TIMESTAMP`)
    .bind(studentId, enr.institution_id, date, user.role === 'PARENT' ? 'PARENT' : 'STUDENT', minutes, bedtime).run();
  return json({ ok: true });
}

async function screenClass(env: Env, user: AuthUser, url: URL) {
  const classId = text(url.searchParams.get('classId'), 80);
  const scope = await guidanceStudentIds(env, user);
  const students = (await all<any>(env.DB.prepare(`SELECT s.id,s.first_name||' '||s.last_name name FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id WHERE e.class_id=? AND e.status='ACTIVE' ORDER BY s.first_name`).bind(classId))).filter((s) => scope.includes(s.id));
  if (!students.length) return fail(403, 'FORBIDDEN', 'Bu sınıfın rehber öğretmeni değilsiniz.');
  const sum = await screenSummary(env, students.map((s) => s.id));
  const logged = [...sum.values()];
  return json({ ok: true, students: students.map((s) => ({ ...s, ...(sum.get(s.id) || { days: 0, avgMinutes: null, lateNights: 0 }) })),
    classAvgMinutes: logged.length ? Math.round(logged.reduce((a, v) => a + v.avgMinutes, 0) / logged.length) : null, loggedStudents: logged.length });
}

// ---------------------------------------------------------------- router
export async function handleGuidanceContent(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/guidance-content')) return null;
  const { getAuthUser } = await import('./auth');
  const user = await getAuthUser(env, request);
  if (!user) return fail(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  if (user.must_change_password) return fail(403, 'PASSWORD_CHANGE_REQUIRED', 'Önce şifrenizi değiştirin.');
  if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) return fail(403, 'FORBIDDEN', 'İsteği ANUNEX üzerinden başlatın.');
  const p = url.pathname.replace(/\/+$/, '');
  if (p === '/api/guidance-content/resources/mine' && request.method === 'GET') { if (!['STUDENT', 'PARENT', 'TEACHER'].includes(user.role) || !user.institution_id) return fail(403, 'FORBIDDEN', 'Bu bölüm öğrenci, veli ve öğretmenler içindir.'); return myResources(env, user); }
  if (p === '/api/guidance-content/screen/mine') return screenMine(request, env, user, url);
  if (p === '/api/guidance-content/my-activities' && request.method === 'GET') {
    if (!['TEACHER', 'GUIDANCE_TEACHER'].includes(user.role)) return fail(403, 'FORBIDDEN', 'Bu bölüm öğretmenler içindir.');
    const rows = await all<any>(env.DB.prepare(`SELECT g.*,a.title,a.goal,a.steps_json,a.materials,a.duration_min,c.name class_name FROM guidance_activity_assignments g JOIN guidance_activities a ON a.id=g.activity_id JOIN classes c ON c.id=g.class_id WHERE g.teacher_id=? ORDER BY g.status,g.due_date`).bind(user.id));
    return json({ ok: true, assignments: rows.map((r) => ({ ...r, steps: JSON.parse(r.steps_json || '[]'), steps_json: undefined })) });
  }
  let m = p.match(/^\/api\/guidance-content\/my-activities\/([^/]+)$/);
  if (m && request.method === 'PATCH') {
    const b = await request.json().catch(() => ({})) as any;
    const r = await env.DB.prepare(`UPDATE guidance_activity_assignments SET status='DONE',done_at=CURRENT_TIMESTAMP,teacher_note=? WHERE id=? AND teacher_id=? AND status='ASSIGNED'`).bind(text(b?.note, 500) || null, decodeURIComponent(m[1]), user.id).run();
    return r.meta.changes ? json({ ok: true }) : fail(404, 'NOT_FOUND', 'Etkinlik bulunamadı.');
  }
  if (user.role === 'SUPER_ADMIN') {
    if (p === '/api/guidance-content/review' && request.method === 'GET') {
      const acts = await all<any>(env.DB.prepare(`SELECT * FROM guidance_activities WHERE review_status='REVIEW' ORDER BY created_at`));
      const res = await all<any>(env.DB.prepare(`SELECT * FROM guidance_resources WHERE review_status='REVIEW' ORDER BY created_at`));
      return json({ ok: true, activities: acts.map((a) => ({ ...a, steps: JSON.parse(a.steps_json || '[]') })), resources: res });
    }
    m = p.match(/^\/api\/guidance-content\/review\/(activities|resources)\/([^/]+)$/);
    if (m && request.method === 'POST') {
      const b = await request.json().catch(() => ({})) as any; const ok = b?.decision === 'APPROVE';
      if (!ok && b?.decision !== 'REJECT') return fail(400, 'VALIDATION_ERROR', 'Karar geçersiz.');
      const table = m[1] === 'activities' ? 'guidance_activities' : 'guidance_resources';
      const r = await env.DB.prepare(`UPDATE ${table} SET review_status=?,review_note=?,active=? WHERE id=?`).bind(ok ? 'APPROVED' : 'REJECTED', text(b?.note, 600) || null, ok ? 1 : 0, decodeURIComponent(m[2])).run();
      if (!r.meta.changes) return fail(404, 'NOT_FOUND', 'Kayıt bulunamadı.');
      await audit(env.DB, user.id, null, ok ? 'GUIDANCE_CONTENT_APPROVED' : 'GUIDANCE_CONTENT_REJECTED', table, decodeURIComponent(m[2]), {});
      return json({ ok: true });
    }
  }
  if (/^\/api\/guidance-content\/review/.test(p)) return fail(403, 'FORBIDDEN', 'Bu işlem Süper Admin’e açıktır.');
  if (user.role !== 'GUIDANCE_TEACHER' || !user.institution_id) return fail(403, 'FORBIDDEN', 'Bu bölüm rehber öğretmene açıktır.');
  if (p === '/api/guidance-content/plan' && (request.method === 'GET' || request.method === 'PUT')) return plan(request, env, user, url);
  if (p === '/api/guidance-content/plan/entries' && request.method === 'POST') return planEntry(request, env, user);
  m = p.match(/^\/api\/guidance-content\/plan\/entries\/([^/]+)$/);
  if (m && (request.method === 'PATCH' || request.method === 'DELETE')) return planEntry(request, env, user, decodeURIComponent(m[1]));
  if (p === '/api/guidance-content/activities' && request.method === 'GET') return activities(env, user);
  if (p === '/api/guidance-content/activities/assign' && request.method === 'POST') return assignActivity(request, env, user);
  if (p === '/api/guidance-content/class-teachers' && request.method === 'GET') {
    return json({ ok: true, teachers: await all<any>(env.DB.prepare(`SELECT DISTINCT u.id,u.display_name name,s.name subject FROM teacher_assignments ta JOIN users u ON u.id=ta.user_id AND u.active=1 LEFT JOIN subjects s ON s.id=ta.subject_id WHERE ta.class_id=? AND ta.active=1 AND ta.assignment_type='SUBJECT' ORDER BY u.display_name`).bind(text(url.searchParams.get('classId'), 80))) });
  }
  if (p === '/api/guidance-content/resources' && request.method === 'GET') return resources(env, user);
  m = p.match(/^\/api\/guidance-content\/resources\/([^/]+)\/share$/);
  if (m && (request.method === 'POST' || request.method === 'DELETE')) {
    const b = await request.json().catch(() => ({})) as any; const classId = text(b?.classId, 80) || null; const rid = decodeURIComponent(m[1]);
    if (!(await one(env.DB.prepare(`SELECT 1 FROM guidance_resources WHERE id=? AND active=1 AND (institution_id IS NULL OR institution_id=?)`).bind(rid, user.institution_id)))) return fail(404, 'NOT_FOUND', 'Kaynak bulunamadı ya da henüz onaylanmadı.');
    if (request.method === 'DELETE') { await env.DB.prepare(`DELETE FROM guidance_resource_shares WHERE resource_id=? AND institution_id=? AND class_id IS ?`).bind(rid, user.institution_id, classId).run(); return json({ ok: true }); }
    if (classId && !(await one(env.DB.prepare(`SELECT 1 FROM classes WHERE id=? AND institution_id=?`).bind(classId, user.institution_id)))) return fail(400, 'VALIDATION_ERROR', 'Sınıf bulunamadı.');
    const exists = await one(env.DB.prepare(`SELECT 1 FROM guidance_resource_shares WHERE resource_id=? AND institution_id=? AND class_id IS ?`).bind(rid, user.institution_id, classId));
    if (!exists) await env.DB.prepare(`INSERT INTO guidance_resource_shares(id,resource_id,institution_id,class_id,shared_by) VALUES(?,?,?,?,?)`).bind(uuid('grs'), rid, user.institution_id, classId, user.id).run();
    return json({ ok: true }, 201);
  }
  if (p === '/api/guidance-content/screen/class' && request.method === 'GET') return screenClass(env, user, url);
  return fail(404, 'NOT_FOUND', 'Yol bulunamadı.');
}
