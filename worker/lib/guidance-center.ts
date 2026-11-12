/**
 * Rehberlik merkezi R1 (owner, 11–12 Nov 2026): the guidance teacher's day, the student guidance file, meetings,
 * early warning and the "Rehber öğretmenime yaz" channel.
 *
 * Three privacy layers: what the student/parent sees, what stays inside the school, and what only the student's own
 * guidance teacher reads (meeting summaries, messages, private records). The system never labels or diagnoses a
 * student; an early-warning signal always says why it is shown and the counsellor decides. No case management.
 */
import type { AuthUser, Env } from '../types';
import { all, audit, json, one, uuid } from './db';
import { guidanceStudentIds } from './guidance-records';
import { programWarnings } from './guidance-program';
import { screenWarnings } from './guidance-content';

const fail = (status: number, code: string, message: string) => json({ ok: false, error: { code, message } }, status);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const marks = (n: number) => Array.from({ length: n }, () => '?').join(',');

export const MEETING_KINDS = ['INDIVIDUAL', 'GROUP', 'PARENT', 'TEACHER'] as const;
export const MEETING_AREAS = ['ACADEMIC', 'CAREER', 'SOCIAL_EMOTIONAL'] as const;
export const MEETING_TOPICS = ['STUDY', 'EXAM', 'ATTENDANCE', 'EXAM_ANXIETY', 'PEER_BULLYING', 'SCREEN', 'FAMILY', 'FRIENDS', 'CAREER', 'HEALTH', 'OTHER'] as const;
export const MESSAGE_CATEGORIES = ['TALK', 'PEER_BULLYING', 'STUDY', 'FAMILY', 'WORRY', 'OTHER'] as const;

/** Today in Türkiye (YYYY-MM-DD); meetings are stored as local "YYYY-MM-DDTHH:MM". */
export function istanbulDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
const addDays = (date: string, days: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

// Words that make a message urgent. Matching is on a Turkish-folded copy; the message itself is stored as written.
const fold = (s: string) => s.toLocaleLowerCase('tr').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u');
const URGENT_WORDS = ['intihar', 'kendimi oldur', 'olmek istiyorum', 'yasamak istemiyorum', 'kendime zarar', 'kendimi kes', 'beni dovuyor', 'bana vuruyor', 'taciz', 'istismar', 'tehdit ediyor', 'zorbalik', 'siddet'];
export function isUrgentMessage(category: string, body: string) {
  if (category === 'PEER_BULLYING') return true;
  const f = fold(body);
  return URGENT_WORDS.some((w) => f.includes(w));
}

async function counselorScope(env: Env, user: AuthUser) {
  const ids = await guidanceStudentIds(env, user);
  const classes = (await all<{ class_id: string | null }>(env.DB.prepare(`SELECT DISTINCT class_id FROM teacher_assignments WHERE user_id=? AND institution_id=? AND assignment_type='GUIDANCE' AND active=1`).bind(user.id, user.institution_id))).map((r) => r.class_id);
  return { ids, schoolWide: classes.includes(null), classIds: classes.filter(Boolean) as string[] };
}
async function canCounsel(env: Env, user: AuthUser, studentId: string) {
  return user.role === 'GUIDANCE_TEACHER' && (await guidanceStudentIds(env, user)).includes(studentId);
}

// ---------------------------------------------------------------- early warning
export type Warning = { studentId: string; key: string; reason: string; level: 'HIGH' | 'MEDIUM'; watched?: boolean };

/** The computed signals for these students. Each carries its reason; nothing is stored about the student here. */
export async function computeWarnings(env: Env, studentIds: string[], today = istanbulDate()): Promise<Warning[]> {
  if (!studentIds.length) return [];
  const out: Warning[] = [];
  const m = marks(studentIds.length);
  const absences = await all<{ student_id: string; n: number }>(env.DB.prepare(`SELECT r.student_id,count(*) n FROM attendance_records r JOIN attendance_sessions s ON s.id=r.session_id
    WHERE r.student_id IN (${m}) AND r.attendance_status='ABSENT' AND s.attendance_date>=? GROUP BY r.student_id HAVING count(*)>=3`).bind(...studentIds, addDays(today, -30)));
  for (const a of absences) out.push({ studentId: a.student_id, key: 'ATTENDANCE', level: a.n >= 6 ? 'HIGH' : 'MEDIUM', reason: `Son 30 günde ${a.n} gün devamsız.` });
  const nets = await all<{ student_id: string; net: number; title: string; rn: number }>(env.DB.prepare(`SELECT * FROM (SELECT snap.student_id,snap.net,e.title,
      ROW_NUMBER() OVER (PARTITION BY snap.student_id ORDER BY coalesce(e.exam_date,p.published_at) DESC) rn
    FROM exam_result_snapshots snap JOIN exam_delivery_profiles p ON p.exam_id=snap.exam_id AND p.snapshot_version=snap.snapshot_version JOIN exams e ON e.id=snap.exam_id
    WHERE snap.student_id IN (${m}) AND p.result_freeze_status='PUBLISHED' AND p.published_at IS NOT NULL) WHERE rn<=2`).bind(...studentIds));
  const byStudent = new Map<string, { net: number; title: string }[]>();
  for (const n of nets) { const list = byStudent.get(n.student_id) || []; list[n.rn - 1] = { net: Number(n.net), title: n.title }; byStudent.set(n.student_id, list); }
  for (const [sid, [last, prev]] of byStudent) {
    if (!last || !prev || prev.net <= 0) continue;
    if (last.net < prev.net * 0.85) out.push({ studentId: sid, key: 'NET_DROP', level: last.net < prev.net * 0.7 ? 'HIGH' : 'MEDIUM', reason: `Son denemede net ${fmt(prev.net)} → ${fmt(last.net)} (${last.title}).` });
  }
  const loops = await all<{ student_id: string; n: number }>(env.DB.prepare(`SELECT student_id,count(*) n FROM nibiru_outcome_loops WHERE student_id IN (${m}) AND status='TEACHER_REVIEW' GROUP BY student_id`).bind(...studentIds));
  for (const l of loops) out.push({ studentId: l.student_id, key: 'SUPPORT_LOOP', level: 'MEDIUM', reason: `${l.n} kazanımda destek döngüsü tamamlanamadı; öğretmen incelemesinde.` });
  const msgs = await all<{ student_id: string; n: number; urgent: number }>(env.DB.prepare(`SELECT student_id,count(*) n,max(urgent) urgent FROM guidance_messages WHERE student_id IN (${m}) AND status<>'CLOSED' GROUP BY student_id`).bind(...studentIds));
  for (const g of msgs) out.push({ studentId: g.student_id, key: 'MESSAGE', level: g.urgent ? 'HIGH' : 'MEDIUM', reason: g.urgent ? 'Acil olarak işaretlenen bir rehberlik mesajı var.' : `${g.n} açık rehberlik mesajı var.` });
  out.push(...await programWarnings(env, studentIds, today));
  out.push(...await screenWarnings(env, studentIds));
  const actions = await all<{ student_id: string; signal_key: string; action: string; until_date: string | null }>(env.DB.prepare(`SELECT student_id,signal_key,action,until_date FROM guidance_warning_actions WHERE student_id IN (${m})`).bind(...studentIds));
  const act = new Map(actions.map((a) => [`${a.student_id}|${a.signal_key}`, a]));
  return out.filter((w) => {
    const a = act.get(`${w.studentId}|${w.key}`);
    if (!a) return true;
    if (a.action === 'DISMISS') return !!a.until_date && a.until_date < today;
    w.watched = true; return true;
  }).sort((a, b) => (a.level === b.level ? 0 : a.level === 'HIGH' ? -1 : 1));
}
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString('tr-TR');

// ---------------------------------------------------------------- students
async function studentRows(env: Env, ids: string[]) {
  if (!ids.length) return [];
  return all<any>(env.DB.prepare(`SELECT s.id,s.first_name,s.last_name,e.student_number,e.grade_level,c.id class_id,c.name class_name FROM student_entities s
    JOIN student_enrollments e ON e.student_id=s.id AND e.status='ACTIVE' LEFT JOIN classes c ON c.id=e.class_id WHERE s.id IN (${marks(ids.length)}) ORDER BY c.name,e.student_number,s.last_name`).bind(...ids));
}

async function studentList(env: Env, user: AuthUser) {
  const ids = await guidanceStudentIds(env, user);
  const rows = await studentRows(env, ids);
  const warnings = await computeWarnings(env, ids);
  const meetings = ids.length ? await all<any>(env.DB.prepare(`SELECT ms.student_id,max(m.scheduled_at) last FROM guidance_meeting_students ms JOIN guidance_meetings m ON m.id=ms.meeting_id WHERE ms.student_id IN (${marks(ids.length)}) AND m.status='DONE' AND m.counselor_id=? GROUP BY ms.student_id`).bind(...ids, user.id)) : [];
  const plans = ids.length ? await all<any>(env.DB.prepare(`SELECT student_id,status FROM guidance_support_plans WHERE student_id IN (${marks(ids.length)})`).bind(...ids)) : [];
  const last = new Map(meetings.map((r) => [r.student_id, r.last]));
  const plan = new Map(plans.map((r) => [r.student_id, r.status]));
  return json({ ok: true, students: rows.map((s) => ({ id: s.id, name: `${s.first_name} ${s.last_name}`, number: s.student_number, grade: s.grade_level, classId: s.class_id, className: s.class_name,
    warnings: warnings.filter((w) => w.studentId === s.id).map((w) => ({ key: w.key, level: w.level, reason: w.reason, watched: !!w.watched })), lastMeeting: last.get(s.id) || null, planStatus: plan.get(s.id) || null })) });
}

async function studentFile(env: Env, user: AuthUser, studentId: string) {
  if (!(await canCounsel(env, user, studentId))) return fail(403, 'FORBIDDEN', 'Rehberlik dosyasını öğrencinin rehber öğretmeni görür.');
  const [s] = await studentRows(env, [studentId]);
  if (!s) return fail(404, 'NOT_FOUND', 'Öğrenci bulunamadı.');
  const today = istanbulDate();
  const parents = await all<any>(env.DB.prepare(`SELECT u.id,u.display_name name FROM parent_student_links l JOIN users u ON u.id=l.parent_user_id WHERE l.student_id=? AND l.active=1 AND u.active=1`).bind(studentId));
  const attendance = await one<any>(env.DB.prepare(`SELECT sum(r.attendance_status='ABSENT') absent,sum(r.attendance_status='LATE') late,sum(r.attendance_status='EXCUSED') excused,count(*) total FROM attendance_records r JOIN attendance_sessions x ON x.id=r.session_id WHERE r.student_id=? AND x.attendance_date>=?`).bind(studentId, addDays(today, -60)));
  const exams = await all<any>(env.DB.prepare(`SELECT e.title,e.exam_date,snap.net,snap.score FROM exam_result_snapshots snap JOIN exam_delivery_profiles p ON p.exam_id=snap.exam_id AND p.snapshot_version=snap.snapshot_version JOIN exams e ON e.id=snap.exam_id
    WHERE snap.student_id=? AND p.result_freeze_status='PUBLISHED' AND p.published_at IS NOT NULL ORDER BY coalesce(e.exam_date,p.published_at) DESC LIMIT 6`).bind(studentId));
  const loops = await one<any>(env.DB.prepare(`SELECT sum(status='ACTIVE') active,sum(status='PASSED') passed,sum(status='TEACHER_REVIEW') review FROM nibiru_outcome_loops WHERE student_id=?`).bind(studentId));
  const professions = await all<any>(env.DB.prepare(`SELECT p.title,t.priority FROM student_profession_targets t JOIN profession_catalog p ON p.code=t.profession_code WHERE t.student_id=? AND t.status='ACTIVE' ORDER BY t.priority`).bind(studentId)).catch(() => []);
  const target = await one<any>(env.DB.prepare(`SELECT target_type FROM student_academic_targets WHERE student_id=? AND status='ACTIVE' ORDER BY rowid DESC LIMIT 1`).bind(studentId)).catch(() => null);
  const signals = await all<any>(env.DB.prepare(`SELECT g.signal_key,g.score,g.created_at FROM guidance_development_signals g JOIN guidance_assessment_sessions ss ON ss.id=g.source_session_id AND ss.status='REVIEWED' WHERE g.student_id=? ORDER BY g.created_at DESC LIMIT 12`).bind(studentId));
  const assessments = await all<any>(env.DB.prepare(`SELECT ss.id,ss.status,ss.created_at,i.title FROM guidance_assessment_sessions ss JOIN guidance_assessment_instruments i ON i.id=ss.instrument_id WHERE ss.student_id=? ORDER BY ss.created_at DESC LIMIT 12`).bind(studentId));
  const meetings = await all<any>(env.DB.prepare(`SELECT m.id,m.kind,m.area,m.topic,m.title,m.scheduled_at,m.status,m.summary,m.next_step,m.follow_up_date FROM guidance_meetings m JOIN guidance_meeting_students ms ON ms.meeting_id=m.id WHERE ms.student_id=? AND m.counselor_id=? ORDER BY m.scheduled_at DESC LIMIT 30`).bind(studentId, user.id));
  const messages = await all<any>(env.DB.prepare(`SELECT id,sender_role,category,body,urgent,status,created_at FROM guidance_messages WHERE student_id=? ORDER BY created_at DESC LIMIT 20`).bind(studentId));
  const plan = await one<any>(env.DB.prepare('SELECT goals,actions,review_date,status,shared_with_student,shared_with_parent,version,updated_at FROM guidance_support_plans WHERE student_id=?').bind(studentId));
  const privateCount = Number((await one<any>(env.DB.prepare('SELECT count(*) c FROM guidance_private_records WHERE student_id=?').bind(studentId)))?.c || 0);
  const warnings = (await computeWarnings(env, [studentId], today)).map((w) => ({ key: w.key, level: w.level, reason: w.reason, watched: !!w.watched }));
  await audit(env.DB, user.id, user.institution_id, 'GUIDANCE_FILE_READ', 'student', studentId, {});
  return json({ ok: true, student: { id: s.id, name: `${s.first_name} ${s.last_name}`, number: s.student_number, grade: s.grade_level, className: s.class_name, parents, targetType: target?.target_type || null, professions: professions.map((x: any) => x.title) },
    attendance: { days: 60, absent: Number(attendance?.absent || 0), late: Number(attendance?.late || 0), excused: Number(attendance?.excused || 0), total: Number(attendance?.total || 0) },
    exams, supportLoops: { active: Number(loops?.active || 0), passed: Number(loops?.passed || 0), review: Number(loops?.review || 0) },
    signals, assessments, meetings, messages, plan, privateRecordCount: privateCount, warnings });
}

// ---------------------------------------------------------------- meetings
function meetingInput(b: any) {
  const kind = MEETING_KINDS.includes(b?.kind) ? b.kind : null;
  const area = MEETING_AREAS.includes(b?.area) ? b.area : null;
  const topic = MEETING_TOPICS.includes(b?.topic) ? b.topic : null;
  const scheduledAt = text(b?.scheduledAt, 16);
  if (!kind || !area || !topic) return { error: 'Görüşme türü, alanı ve konusu seçilmelidir.' };
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(scheduledAt)) return { error: 'Görüşme tarihi ve saati seçilmelidir.' };
  const followUp = text(b?.followUpDate, 10) || null;
  if (followUp && !/^\d{4}-\d{2}-\d{2}$/.test(followUp)) return { error: 'İzleme tarihi YYYY-AA-GG olmalıdır.' };
  const studentIds: string[] = Array.isArray(b?.studentIds) ? [...new Set(b.studentIds.map(String))].slice(0, 40) as string[] : [];
  if (kind !== 'GROUP' && studentIds.length !== 1) return { error: 'Bu görüşme türü için bir öğrenci seçilmelidir.' };
  if (kind === 'GROUP' && studentIds.length < 2) return { error: 'Grup görüşmesi için en az iki öğrenci seçilmelidir.' };
  return { kind, area, topic, scheduledAt, followUp, studentIds, title: text(b?.title, 120) || null };
}

async function meetings(request: Request, env: Env, user: AuthUser, url: URL) {
  if (request.method === 'GET') {
    const from = text(url.searchParams.get('from'), 10) || addDays(istanbulDate(), -30);
    const to = text(url.searchParams.get('to'), 10) || addDays(istanbulDate(), 60);
    const rows = await all<any>(env.DB.prepare(`SELECT m.*,(SELECT json_group_array(json_object('id',s.id,'name',s.first_name||' '||s.last_name)) FROM guidance_meeting_students ms JOIN student_entities s ON s.id=ms.student_id WHERE ms.meeting_id=m.id) students
      FROM guidance_meetings m WHERE m.counselor_id=? AND substr(m.scheduled_at,1,10) BETWEEN ? AND ? ORDER BY m.scheduled_at`).bind(user.id, from, to));
    return json({ ok: true, meetings: rows.map((r) => ({ ...r, students: JSON.parse(r.students || '[]') })) });
  }
  if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
  const b = await request.json().catch(() => ({})) as any;
  const input = meetingInput(b);
  if ('error' in input) return fail(400, 'VALIDATION_ERROR', input.error!);
  const scope = await guidanceStudentIds(env, user);
  if (input.studentIds.some((id) => !scope.includes(id))) return fail(403, 'FORBIDDEN', 'Yalnız rehberliğini yaptığınız öğrencilerle görüşme planlanabilir.');
  let sourceMessageId: string | null = null;
  if (b?.sourceMessageId) {
    const msg = await one<any>(env.DB.prepare(`SELECT id,student_id,anonymous FROM guidance_messages WHERE id=? AND institution_id=?`).bind(String(b.sourceMessageId), user.institution_id));
    if (!msg || msg.anonymous || !input.studentIds.includes(msg.student_id)) return fail(400, 'VALIDATION_ERROR', 'Bu mesaj görüşmeye bağlanamaz.');
    sourceMessageId = msg.id;
  }
  const id = uuid('gmt');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO guidance_meetings(id,institution_id,counselor_id,kind,area,topic,title,scheduled_at,follow_up_date,source_message_id) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(id, user.institution_id, user.id, input.kind, input.area, input.topic, input.title, input.scheduledAt, input.followUp, sourceMessageId),
    ...input.studentIds.map((sid) => env.DB.prepare(`INSERT INTO guidance_meeting_students(meeting_id,student_id) VALUES(?,?)`).bind(id, sid)),
    ...(sourceMessageId ? [env.DB.prepare(`UPDATE guidance_messages SET status='SEEN',handled_by=?,handled_at=CURRENT_TIMESTAMP WHERE id=? AND status='NEW'`).bind(user.id, sourceMessageId)] : []),
  ]);
  await audit(env.DB, user.id, user.institution_id, 'GUIDANCE_MEETING_PLANNED', 'guidance_meeting', id, { kind: input.kind, topic: input.topic, students: input.studentIds.length });
  return json({ ok: true, id }, 201);
}

async function updateMeeting(request: Request, env: Env, user: AuthUser, id: string) {
  if (request.method !== 'PATCH') return fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
  const m = await one<any>(env.DB.prepare(`SELECT * FROM guidance_meetings WHERE id=? AND counselor_id=?`).bind(id, user.id));
  if (!m) return fail(404, 'NOT_FOUND', 'Görüşme bulunamadı.');
  const b = await request.json().catch(() => ({})) as any;
  const status = ['PLANNED', 'DONE', 'CANCELLED'].includes(b?.status) ? b.status : m.status;
  const summary = b?.summary !== undefined ? text(b.summary, 4000) || null : m.summary;
  const nextStep = b?.nextStep !== undefined ? text(b.nextStep, 1000) || null : m.next_step;
  const followUp = b?.followUpDate !== undefined ? (text(b.followUpDate, 10) || null) : m.follow_up_date;
  if (followUp && !/^\d{4}-\d{2}-\d{2}$/.test(followUp)) return fail(400, 'VALIDATION_ERROR', 'İzleme tarihi YYYY-AA-GG olmalıdır.');
  const scheduledAt = b?.scheduledAt !== undefined ? text(b.scheduledAt, 16) : m.scheduled_at;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(scheduledAt)) return fail(400, 'VALIDATION_ERROR', 'Görüşme tarihi ve saati geçersiz.');
  if (status === 'DONE' && !summary) return fail(400, 'VALIDATION_ERROR', 'Tamamlanan görüşme için kısa bir özet yazılmalıdır.');
  await env.DB.prepare(`UPDATE guidance_meetings SET status=?,summary=?,next_step=?,follow_up_date=?,scheduled_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status, summary, nextStep, followUp, scheduledAt, id).run();
  await audit(env.DB, user.id, user.institution_id, 'GUIDANCE_MEETING_UPDATED', 'guidance_meeting', id, { status });
  return json({ ok: true });
}

// ---------------------------------------------------------------- messages
async function sendMessage(request: Request, env: Env, user: AuthUser) {
  if (!['STUDENT', 'PARENT', 'TEACHER'].includes(user.role) || !user.institution_id) return fail(403, 'FORBIDDEN', 'Rehberlik mesajı öğrenci, veli ya da öğretmen tarafından gönderilir.');
  const b = await request.json().catch(() => ({})) as any;
  const category = MESSAGE_CATEGORIES.includes(b?.category) ? b.category : null;
  const body = text(b?.body, 2000);
  if (!category || body.length < 3) return fail(400, 'VALIDATION_ERROR', 'Konu seçip kısa bir mesaj yazın.');
  let studentId: string | null = null; let classId: string | null = null; let anonymous = 0;
  if (user.role === 'STUDENT') {
    const enr = await one<any>(env.DB.prepare(`SELECT student_id,class_id FROM student_enrollments WHERE student_id=? AND institution_id=? AND status='ACTIVE' LIMIT 1`).bind(user.student_id, user.institution_id));
    if (!enr) return fail(403, 'FORBIDDEN', 'Aktif öğrenci kaydı bulunamadı.');
    classId = enr.class_id; anonymous = b?.anonymous ? 1 : 0; studentId = anonymous ? null : enr.student_id;
  } else {
    const sid = text(b?.studentId, 80);
    if (user.role === 'PARENT') {
      const link = await one<any>(env.DB.prepare(`SELECT e.student_id,e.class_id FROM parent_student_links l JOIN student_enrollments e ON e.student_id=l.student_id AND e.status='ACTIVE' AND e.institution_id=? WHERE l.parent_user_id=? AND l.student_id=? AND l.active=1 LIMIT 1`).bind(user.institution_id, user.id, sid));
      if (!link) return fail(403, 'FORBIDDEN', 'Yalnız kendi çocuğunuz için yazabilirsiniz.');
      studentId = link.student_id; classId = link.class_id;
    } else if (sid) {
      const own = await one<any>(env.DB.prepare(`SELECT e.student_id,e.class_id FROM student_enrollments e JOIN teacher_assignments ta ON ta.class_id=e.class_id AND ta.user_id=? AND ta.active=1 WHERE e.student_id=? AND e.institution_id=? AND e.status='ACTIVE' LIMIT 1`).bind(user.id, sid, user.institution_id));
      if (!own) return fail(403, 'FORBIDDEN', 'Yalnız derse girdiğiniz sınıflardaki öğrenciler için yazabilirsiniz.');
      studentId = own.student_id; classId = own.class_id;
    }
  }
  // a little brake against floods: 5 messages a day for a sender; anonymous ones per class and hour
  const recent = anonymous
    ? await one<any>(env.DB.prepare(`SELECT count(*) n FROM guidance_messages WHERE anonymous=1 AND class_id IS ? AND created_at>=datetime('now','-1 hour')`).bind(classId))
    : await one<any>(env.DB.prepare(`SELECT count(*) n FROM guidance_messages WHERE sender_user_id=? AND created_at>=datetime('now','-1 day')`).bind(user.id));
  if (Number(recent?.n || 0) >= (anonymous ? 10 : 5)) return fail(429, 'TOO_MANY', 'Kısa sürede çok mesaj gönderildi; biraz sonra yeniden deneyin ya da rehber öğretmeninizle yüz yüze görüşün.');
  const urgent = isUrgentMessage(category, body) ? 1 : 0;
  const id = uuid('gms');
  await env.DB.prepare(`INSERT INTO guidance_messages(id,institution_id,class_id,student_id,sender_user_id,sender_role,anonymous,category,body,urgent) VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, user.institution_id, classId, studentId, anonymous ? null : user.id, user.role, anonymous, category, body, urgent).run();
  // tell the guidance teachers who look after this student or class (school-wide ones too); nothing of the text goes into the notice
  const counselors = await all<{ user_id: string }>(env.DB.prepare(`SELECT DISTINCT ta.user_id FROM teacher_assignments ta JOIN users u ON u.id=ta.user_id AND u.active=1 AND u.role='GUIDANCE_TEACHER'
    WHERE ta.institution_id=? AND ta.assignment_type='GUIDANCE' AND ta.active=1 AND (ta.class_id IS NULL OR ta.class_id IS ? OR ? IS NULL)`).bind(user.institution_id, classId, classId));
  if (counselors.length) await env.DB.batch(counselors.map((c) => env.DB.prepare(`INSERT INTO notifications(id,recipient_user_id,institution_id,type,title,body,action_url,entity_type,entity_id) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(uuid('ntf'), c.user_id, user.institution_id, 'GUIDANCE_MESSAGE', urgent ? 'Acil rehberlik mesajı' : 'Yeni rehberlik mesajı', urgent ? 'Acil olarak işaretlenen bir mesaj geldi. Lütfen hemen bakın.' : 'Rehberlik servisine yeni bir mesaj geldi.', '/', 'guidance_message', id)));
  await audit(env.DB, anonymous ? null : user.id, user.institution_id, 'GUIDANCE_MESSAGE_SENT', 'guidance_message', id, { category, urgent: !!urgent, anonymous: !!anonymous, role: user.role });
  return json({ ok: true, id, urgent: !!urgent, emergency: urgent ? { lines: [{ label: 'Acil durum', number: '112' }, { label: 'Alo 147 Çocuk Destek Hattı', number: '147' }] } : null }, 201);
}

async function myMessages(env: Env, user: AuthUser) {
  const rows = await all<any>(env.DB.prepare(`SELECT m.id,m.category,m.body,m.status,m.created_at,s.first_name||' '||s.last_name student FROM guidance_messages m LEFT JOIN student_entities s ON s.id=m.student_id WHERE m.sender_user_id=? ORDER BY m.created_at DESC LIMIT 30`).bind(user.id));
  let children: any[] = [];
  if (user.role === 'PARENT') children = await all<any>(env.DB.prepare(`SELECT s.id,s.first_name||' '||s.last_name name FROM parent_student_links l JOIN student_entities s ON s.id=l.student_id JOIN student_enrollments e ON e.student_id=s.id AND e.status='ACTIVE' AND e.institution_id=? WHERE l.parent_user_id=? AND l.active=1 ORDER BY s.first_name`).bind(user.institution_id, user.id));
  if (user.role === 'TEACHER') children = await all<any>(env.DB.prepare(`SELECT DISTINCT s.id,s.first_name||' '||s.last_name name,c.name class_name FROM teacher_assignments ta JOIN student_enrollments e ON e.class_id=ta.class_id AND e.status='ACTIVE' JOIN student_entities s ON s.id=e.student_id JOIN classes c ON c.id=e.class_id WHERE ta.user_id=? AND ta.active=1 AND ta.institution_id=? ORDER BY c.name,s.first_name`).bind(user.id, user.institution_id));
  return json({ ok: true, messages: rows, students: children });
}

async function counselorMessages(env: Env, user: AuthUser, statusFilter: string | null) {
  const scope = await counselorScope(env, user);
  const rows = await all<any>(env.DB.prepare(`SELECT m.id,m.class_id,m.student_id,m.sender_role,m.anonymous,m.category,m.body,m.urgent,m.status,m.created_at,c.name class_name,s.first_name||' '||s.last_name student,u.display_name sender
    FROM guidance_messages m LEFT JOIN classes c ON c.id=m.class_id LEFT JOIN student_entities s ON s.id=m.student_id LEFT JOIN users u ON u.id=m.sender_user_id
    WHERE m.institution_id=? AND (? IS NULL OR m.status=?) ORDER BY m.urgent DESC,m.created_at DESC LIMIT 200`).bind(user.institution_id, statusFilter, statusFilter));
  const visible = rows.filter((m) => scope.schoolWide || (m.student_id ? scope.ids.includes(m.student_id) : !m.class_id || scope.classIds.includes(m.class_id)));
  return visible.map((m) => ({ ...m, sender: m.anonymous ? null : m.sender, student: m.anonymous ? null : m.student }));
}

async function updateMessage(request: Request, env: Env, user: AuthUser, id: string) {
  if (request.method !== 'PATCH') return fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
  const visible = await counselorMessages(env, user, null);
  if (!visible.some((m) => m.id === id)) return fail(404, 'NOT_FOUND', 'Mesaj bulunamadı.');
  const b = await request.json().catch(() => ({})) as any;
  if (!['SEEN', 'CLOSED'].includes(b?.status)) return fail(400, 'VALIDATION_ERROR', 'Durum geçersiz.');
  await env.DB.prepare(`UPDATE guidance_messages SET status=?,handled_by=?,handled_at=CURRENT_TIMESTAMP WHERE id=?`).bind(b.status, user.id, id).run();
  await audit(env.DB, user.id, user.institution_id, 'GUIDANCE_MESSAGE_STATUS', 'guidance_message', id, { status: b.status });
  return json({ ok: true });
}

// ---------------------------------------------------------------- today
async function today(env: Env, user: AuthUser) {
  const day = istanbulDate();
  const ids = await guidanceStudentIds(env, user);
  const messages = (await counselorMessages(env, user, null)).filter((m) => m.status !== 'CLOSED').slice(0, 20);
  const todays = await all<any>(env.DB.prepare(`SELECT m.id,m.kind,m.topic,m.title,m.scheduled_at,m.status,(SELECT json_group_array(s.first_name||' '||s.last_name) FROM guidance_meeting_students ms JOIN student_entities s ON s.id=ms.student_id WHERE ms.meeting_id=m.id) students
    FROM guidance_meetings m WHERE m.counselor_id=? AND substr(m.scheduled_at,1,10)=? AND m.status<>'CANCELLED' ORDER BY m.scheduled_at`).bind(user.id, day));
  const followUps = await all<any>(env.DB.prepare(`SELECT m.id,m.topic,m.follow_up_date,m.next_step,(SELECT json_group_array(s.first_name||' '||s.last_name) FROM guidance_meeting_students ms JOIN student_entities s ON s.id=ms.student_id WHERE ms.meeting_id=m.id) students
    FROM guidance_meetings m WHERE m.counselor_id=? AND m.status='DONE' AND m.follow_up_date IS NOT NULL AND m.follow_up_date<=? ORDER BY m.follow_up_date LIMIT 10`).bind(user.id, addDays(day, 7)));
  const warnings = await computeWarnings(env, ids, day);
  const names = new Map((await studentRows(env, [...new Set(warnings.map((w) => w.studentId))])).map((s) => [s.id, { name: `${s.first_name} ${s.last_name}`, className: s.class_name }]));
  return json({ ok: true, date: day, studentCount: ids.length,
    messages, meetings: todays.map((m) => ({ ...m, students: JSON.parse(m.students || '[]') })), followUps: followUps.map((m) => ({ ...m, students: JSON.parse(m.students || '[]') })),
    warnings: warnings.slice(0, 12).map((w) => ({ ...w, ...names.get(w.studentId) })), warningCount: warnings.length });
}

export async function handleGuidanceCenter(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/guidance-center')) return null;
  const { getAuthUser } = await import('./auth');
  const user = await getAuthUser(env, request);
  if (!user) return fail(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  if (user.must_change_password) return fail(403, 'PASSWORD_CHANGE_REQUIRED', 'Önce şifrenizi değiştirin.');
  if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) return fail(403, 'FORBIDDEN', 'İsteği ANUNEX üzerinden başlatın.');
  const p = url.pathname.replace(/\/+$/, '');
  // the sender side: students, parents and teachers
  if (p === '/api/guidance-center/messages' && request.method === 'POST') return sendMessage(request, env, user);
  if (p === '/api/guidance-center/messages/mine' && request.method === 'GET') {
    if (!['STUDENT', 'PARENT', 'TEACHER'].includes(user.role)) return fail(403, 'FORBIDDEN', 'Bu bölüm öğrenci, veli ve öğretmenler içindir.');
    return myMessages(env, user);
  }
  // everything else is the guidance teacher's own work
  if (user.role !== 'GUIDANCE_TEACHER' || !user.institution_id) return fail(403, 'FORBIDDEN', 'Rehberlik merkezi rehber öğretmene açıktır.');
  if (p === '/api/guidance-center/today' && request.method === 'GET') return today(env, user);
  if (p === '/api/guidance-center/students' && request.method === 'GET') return studentList(env, user);
  let m = p.match(/^\/api\/guidance-center\/students\/([^/]+)$/);
  if (m && request.method === 'GET') return studentFile(env, user, decodeURIComponent(m[1]));
  if (p === '/api/guidance-center/meetings') return meetings(request, env, user, url);
  m = p.match(/^\/api\/guidance-center\/meetings\/([^/]+)$/);
  if (m) return updateMeeting(request, env, user, decodeURIComponent(m[1]));
  if (p === '/api/guidance-center/messages' && request.method === 'GET') return json({ ok: true, messages: await counselorMessages(env, user, text(url.searchParams.get('status'), 10) || null) });
  m = p.match(/^\/api\/guidance-center\/messages\/([^/]+)$/);
  if (m) return updateMessage(request, env, user, decodeURIComponent(m[1]));
  if (p === '/api/guidance-center/warnings' && request.method === 'GET') {
    const ids = await guidanceStudentIds(env, user);
    const warnings = await computeWarnings(env, ids);
    const names = new Map((await studentRows(env, [...new Set(warnings.map((w) => w.studentId))])).map((s) => [s.id, { name: `${s.first_name} ${s.last_name}`, className: s.class_name }]));
    return json({ ok: true, warnings: warnings.map((w) => ({ ...w, ...names.get(w.studentId) })) });
  }
  m = p.match(/^\/api\/guidance-center\/warnings\/([^/]+)\/([A-Z_]+)$/);
  if (m && request.method === 'POST') {
    const sid = decodeURIComponent(m[1]);
    if (!(await canCounsel(env, user, sid))) return fail(403, 'FORBIDDEN', 'Bu öğrencinin rehber öğretmeni değilsiniz.');
    const b = await request.json().catch(() => ({})) as any;
    if (b?.action === 'CLEAR') { await env.DB.prepare(`DELETE FROM guidance_warning_actions WHERE student_id=? AND signal_key=?`).bind(sid, m[2]).run(); return json({ ok: true }); }
    if (!['WATCH', 'DISMISS'].includes(b?.action)) return fail(400, 'VALIDATION_ERROR', 'İşlem geçersiz.');
    const until = b.action === 'DISMISS' ? (text(b?.untilDate, 10) || addDays(istanbulDate(), 30)) : null;
    if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) return fail(400, 'VALIDATION_ERROR', 'Tarih YYYY-AA-GG olmalıdır.');
    await env.DB.prepare(`INSERT INTO guidance_warning_actions(student_id,signal_key,action,until_date,decided_by) VALUES(?,?,?,?,?) ON CONFLICT(student_id,signal_key) DO UPDATE SET action=excluded.action,until_date=excluded.until_date,decided_by=excluded.decided_by,decided_at=CURRENT_TIMESTAMP`).bind(sid, m[2], b.action, until, user.id).run();
    await audit(env.DB, user.id, user.institution_id, 'GUIDANCE_WARNING_DECIDED', 'student', sid, { signal: m[2], action: b.action, until });
    return json({ ok: true });
  }
  return fail(404, 'NOT_FOUND', 'Yol bulunamadı.');
}
