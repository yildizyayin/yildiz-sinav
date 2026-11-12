/**
 * Rehberlik R5 — raporlar (owner, 12 Nov 2026).
 *  - Faaliyet raporu: what the guidance service did in a period, in the shape needed to enter it into e-Rehberlik
 *    (ANUNEX does not connect to e-Rehberlik). The guidance teacher sees their own work; the school manager sees the
 *    school's totals only — never a student's name, a meeting note or a message.
 *  - Sınıf raporu: the guidance picture of one class for its guidance teacher.
 */
import type { AuthUser, Env } from '../types';
import { all, json, one } from './db';
import { guidanceStudentIds } from './guidance-records';
import { computeWarnings } from './guidance-center';
import { mondayOf, programProgress, istanbulToday } from './guidance-program';

const fail = (status: number, code: string, message: string) => json({ ok: false, error: { code, message } }, status);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const valid = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

async function activity(env: Env, user: AuthUser, url: URL) {
  const today = istanbulToday();
  const from = text(url.searchParams.get('from'), 10) || `${Number(today.slice(5, 7)) >= 9 ? today.slice(0, 4) : Number(today.slice(0, 4)) - 1}-09-01`;
  const to = text(url.searchParams.get('to'), 10) || today;
  if (!valid(from) || !valid(to) || from > to) return fail(400, 'VALIDATION_ERROR', 'Tarih aralığı geçersiz.');
  const inst = user.institution_id;
  const mine = user.role === 'GUIDANCE_TEACHER';
  const who = mine ? 'AND m.counselor_id=?' : '';
  const args = (extra: unknown[] = []) => (mine ? [inst, from, to, user.id, ...extra] : [inst, from, to, ...extra]);
  const meetings = await all<any>(env.DB.prepare(`SELECT m.kind,m.area,m.topic,count(*) n,sum((SELECT count(*) FROM guidance_meeting_students ms WHERE ms.meeting_id=m.id)) students FROM guidance_meetings m
    WHERE m.institution_id=? AND m.status='DONE' AND substr(m.scheduled_at,1,10) BETWEEN ? AND ? ${who} GROUP BY m.kind,m.area,m.topic`).bind(...args()));
  const messages = await one<any>(env.DB.prepare(`SELECT count(*) n,sum(urgent) urgent,sum(anonymous) anonymous,sum(sender_role='STUDENT') student,sum(sender_role='PARENT') parent,sum(sender_role='TEACHER') teacher FROM guidance_messages WHERE institution_id=? AND date(created_at,'+3 hours') BETWEEN ? AND ?`).bind(inst, from, to));
  const programs = await one<any>(env.DB.prepare(`SELECT count(*) n,count(DISTINCT student_id) students FROM guidance_programs p WHERE p.institution_id=? AND p.status='GIVEN' AND p.week_start BETWEEN ? AND ? ${mine ? 'AND p.given_by=?' : ''}`).bind(...(mine ? [inst, from, to, user.id] : [inst, from, to])));
  const activities = await one<any>(env.DB.prepare(`SELECT count(*) n,sum(status='DONE') done FROM guidance_activity_assignments g WHERE g.institution_id=? AND date(g.created_at,'+3 hours') BETWEEN ? AND ? ${mine ? 'AND g.assigned_by=?' : ''}`).bind(...(mine ? [inst, from, to, user.id] : [inst, from, to])));
  const planDone = await all<any>(env.DB.prepare(`SELECT e.kind,count(*) n FROM guidance_plan_entries e JOIN guidance_annual_plans p ON p.id=e.plan_id WHERE p.institution_id=? AND e.status='DONE' AND coalesce(e.target_date,date(e.created_at,'+3 hours')) BETWEEN ? AND ? GROUP BY e.kind`).bind(inst, from, to));
  const tests = await all<any>(env.DB.prepare(`SELECT i.title,count(*) n,sum(s.status IN ('SUBMITTED','REVIEWED')) answered FROM guidance_assessment_sessions s JOIN guidance_assessment_instruments i ON i.id=s.instrument_id WHERE s.institution_id=? AND date(s.created_at,'+3 hours') BETWEEN ? AND ? GROUP BY i.title ORDER BY n DESC`).bind(inst, from, to));
  const surveys = await all<any>(env.DB.prepare(`SELECT s.title,(SELECT count(*) FROM guidance_survey_invites i WHERE i.survey_id=s.id) invited,(SELECT count(*) FROM guidance_survey_responses r WHERE r.survey_id=s.id) responded FROM guidance_surveys s WHERE s.institution_id=? AND date(s.created_at,'+3 hours') BETWEEN ? AND ?`).bind(inst, from, to));
  const diary = await one<any>(env.DB.prepare(`SELECT count(DISTINCT student_id) n FROM guidance_screen_logs WHERE institution_id=? AND log_date BETWEEN ? AND ?`).bind(inst, from, to));
  const sum = (k: string) => meetings.filter((m) => m.kind === k).reduce((a, m) => a + Number(m.n), 0);
  return json({ ok: true, scope: mine ? 'COUNSELOR' : 'SCHOOL', from, to,
    totals: { individual: sum('INDIVIDUAL'), group: sum('GROUP'), parent: sum('PARENT'), teacher: sum('TEACHER'), studentsReached: meetings.reduce((a, m) => a + Number(m.students || 0), 0) },
    meetings, messages: { total: Number(messages?.n || 0), urgent: Number(messages?.urgent || 0), anonymous: Number(messages?.anonymous || 0), student: Number(messages?.student || 0), parent: Number(messages?.parent || 0), teacher: Number(messages?.teacher || 0) },
    programs: { given: Number(programs?.n || 0), students: Number(programs?.students || 0) }, activities: { given: Number(activities?.n || 0), done: Number(activities?.done || 0) },
    planDone, tests, surveys, diaryStudents: Number(diary?.n || 0),
    note: 'Bu rapor e-Rehberlik sistemine giriş yaparken kullanılmak içindir; ANUNEX e-Rehberlik’e bağlanmaz. Okul özetinde öğrenci adı, görüşme notu ya da mesaj metni yer almaz.' });
}

async function classReport(env: Env, user: AuthUser, url: URL) {
  const classId = text(url.searchParams.get('classId'), 80);
  const scope = await guidanceStudentIds(env, user);
  const students = (await all<any>(env.DB.prepare(`SELECT s.id,s.first_name||' '||s.last_name name,e.student_number,c.name class_name FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id JOIN classes c ON c.id=e.class_id WHERE e.class_id=? AND e.status='ACTIVE' ORDER BY e.student_number,s.last_name`).bind(classId))).filter((s) => scope.includes(s.id));
  if (!students.length) return fail(403, 'FORBIDDEN', 'Bu sınıfın rehber öğretmeni değilsiniz.');
  const ids = students.map((s) => s.id);
  const warnings = await computeWarnings(env, ids);
  const week = mondayOf(istanbulToday());
  const rows = [];
  for (const s of students) {
    const meetings = await one<any>(env.DB.prepare(`SELECT count(*) n,max(m.scheduled_at) last FROM guidance_meeting_students ms JOIN guidance_meetings m ON m.id=ms.meeting_id WHERE ms.student_id=? AND m.status='DONE'`).bind(s.id));
    const prog = await one<any>(env.DB.prepare(`SELECT id FROM guidance_programs WHERE student_id=? AND week_start=? AND status='GIVEN'`).bind(s.id, week));
    const p = prog ? await programProgress(env, prog.id) : null;
    const tests = await one<any>(env.DB.prepare(`SELECT count(*) n FROM guidance_assessment_sessions WHERE student_id=? AND status IN ('SUBMITTED','REVIEWED')`).bind(s.id));
    const plan = await one<any>(env.DB.prepare(`SELECT status FROM guidance_support_plans WHERE student_id=?`).bind(s.id));
    rows.push({ id: s.id, name: s.name, number: s.student_number, warnings: warnings.filter((w) => w.studentId === s.id).map((w) => ({ key: w.key, reason: w.reason })), meetings: Number(meetings?.n || 0), lastMeeting: meetings?.last || null,
      programCompletion: p ? p.completion : null, tests: Number(tests?.n || 0), supportPlan: plan?.status || null });
  }
  return json({ ok: true, className: students[0].class_name, week, students: rows,
    summary: { students: rows.length, withWarnings: rows.filter((r) => r.warnings.length).length, met: rows.filter((r) => r.meetings).length, withProgram: rows.filter((r) => r.programCompletion != null).length, supportPlans: rows.filter((r) => r.supportPlan === 'ACTIVE').length } });
}

export async function handleGuidanceReports(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/guidance-summary')) return null;
  const { getAuthUser } = await import('./auth');
  const user = await getAuthUser(env, request);
  if (!user) return fail(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  if (user.must_change_password) return fail(403, 'PASSWORD_CHANGE_REQUIRED', 'Önce şifrenizi değiştirin.');
  if (request.method !== 'GET') return fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
  const p = url.pathname.replace(/\/+$/, '');
  if (p === '/api/guidance-summary/activity') {
    if (!['GUIDANCE_TEACHER', 'INSTITUTION_MANAGER'].includes(user.role) || !user.institution_id) return fail(403, 'FORBIDDEN', 'Faaliyet raporu rehber öğretmen ve kurum yöneticisine açıktır.');
    return activity(env, user, url);
  }
  if (p === '/api/guidance-summary/class') {
    if (user.role !== 'GUIDANCE_TEACHER') return fail(403, 'FORBIDDEN', 'Sınıf rehberlik raporu rehber öğretmene açıktır.');
    return classReport(env, user, url);
  }
  return fail(404, 'NOT_FOUND', 'Yol bulunamadı.');
}
