/**
 * Rehberlik R2 — hazır haftalık program ve akademik takip (owner, 12 Nov 2026).
 *
 * The system prepares a week for a student from what is known about them, with plain rules and no AI:
 *  - weak outcomes of the last published exams (wrong + blank), outcomes with a running support loop first;
 *  - the worksheets (föy) planned for the class that week;
 *  - the subject teachers' targets for the class;
 *  - one review day for the week's mistakes;
 *  - the pace of the previous week (a student who did half is not handed twice as much).
 * Every row says why it is there. The guidance teacher edits and gives it; the student sees it on "Bu Haftam".
 * Questions solved inside ANUNEX are counted automatically (verified); what the student enters from a book is a
 * declaration and is always shown apart.
 */
import type { AuthUser, Env } from '../types';
import { all, audit, json, one, uuid } from './db';
import { SERVABLE_VIDEO_SQL } from './video-links';
import { outcomeClip } from './outcome-videos';
import { guidanceStudentIds } from './guidance-records';
import { publishedForLearnersSql } from './exam-schedule';

const fail = (status: number, code: string, message: string) => json({ ok: false, error: { code, message } }, status);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v: unknown, min: number, max: number, dflt: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt; };
const marks = (n: number) => Array.from({ length: n }, () => '?').join(',');

export const SOURCES = ['MAVI_FOY', 'KIRMIZI_FOY', 'DEJAVU', 'SIFIR_HATA', 'OKUL_KITABI', 'ANUNEX', 'DIGER'] as const;
const isSource = (s: unknown): s is typeof SOURCES[number] => SOURCES.includes(s as any);

// ---------------------------------------------------------------- dates (Türkiye)
export function istanbulToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function addDays(date: string, days: number) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
export function mondayOf(date: string) { const d = new Date(`${date}T12:00:00Z`); const dow = (d.getUTCDay() + 6) % 7; return addDays(date, -dow); }
const validWeek = (w: string) => /^\d{4}-\d{2}-\d{2}$/.test(w) && mondayOf(w) === w;

// ---------------------------------------------------------------- generation
export type ProgramSettings = { weeklyTarget: number; weakPct: number; worksheetPct: number; reviewPct: number; studyDays: number[]; reviewDay: number; showSignature: boolean };
export function readSettings(b: any): ProgramSettings | { error: string } {
  const weeklyTarget = int(b?.weeklyTarget, 0, 3000, 0);
  if (weeklyTarget < 10) return { error: 'Haftalık toplam soru hedefini yazın (en az 10).' };
  const weakPct = int(b?.weakPct, 0, 100, 60), worksheetPct = int(b?.worksheetPct, 0, 100, 30), reviewPct = int(b?.reviewPct, 0, 100, 10);
  if (weakPct + worksheetPct + reviewPct !== 100) return { error: 'Eksik konu, föy ve tekrar oranlarının toplamı 100 olmalıdır.' };
  const studyDays = (Array.isArray(b?.studyDays) ? b.studyDays : [1, 2, 3, 4, 5, 6]).map(Number).filter((d: number) => d >= 1 && d <= 7);
  const reviewDay = int(b?.reviewDay, 1, 7, 7);
  const days = [...new Set(studyDays as number[])].sort();
  if (!days.length) return { error: 'En az bir çalışma günü seçin.' };
  return { weeklyTarget, weakPct, worksheetPct, reviewPct, studyDays: days, reviewDay, showSignature: b?.showSignature !== false };
}

type Draft = { day: number; subject_id: string | null; outcome_id: string | null; topic: string; source: string; source_detail: string | null; target_count: number; origin: string; kind: string; reason: string };
const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

/** Builds the rows of a week for one student. Pure apart from reading the student's data. */
export async function buildWeek(env: Env, studentId: string, weekStart: string, s: ProgramSettings) {
  const enr = await one<any>(env.DB.prepare(`SELECT e.institution_id,e.class_id,e.grade_level FROM student_enrollments e WHERE e.student_id=? AND e.status='ACTIVE' ORDER BY e.created_at DESC LIMIT 1`).bind(studentId));
  if (!enr) return null;
  const notes: string[] = [];
  // the pace of last week
  let total = s.weeklyTarget;
  const last = await one<any>(env.DB.prepare(`SELECT id,weekly_target FROM guidance_programs WHERE student_id=? AND week_start=? AND status='GIVEN'`).bind(studentId, addDays(weekStart, -7)));
  if (last) {
    const p = await programProgress(env, last.id);
    if (p && p.target > 0) {
      const factor = Math.min(1.15, Math.max(0.7, p.completion / 0.8));
      if (Math.abs(factor - 1) >= 0.05) { total = Math.max(10, Math.round(total * factor / 5) * 5); notes.push(`Geçen hafta programın %${Math.round(p.completion * 100)}’i yapıldı; bu hafta toplam ${total} soru olarak ayarlandı.`); }
    }
  }
  // weak outcomes of the last three published exams
  const weak = await all<any>(env.DB.prepare(`WITH last_exams AS (SELECT ep.id participant_id FROM exam_participants ep JOIN exams e ON e.id=ep.exam_id
      WHERE ep.student_id=? AND ${publishedForLearnersSql('ep.exam_id')} ORDER BY coalesce(e.exam_date,e.created_at) DESC LIMIT 3)
    SELECT o.id outcome_id,o.subject_id,o.code,o.title,o.topic,sum(sa.status IN ('WRONG','BLANK')) miss,count(*) total FROM student_answers sa
    JOIN last_exams le ON le.participant_id=sa.participant_id JOIN question_outcomes qo ON qo.exam_question_id=sa.exam_question_id JOIN outcomes o ON o.id=qo.outcome_id
    GROUP BY o.id HAVING miss>0 ORDER BY (miss*1.0/total) DESC,miss DESC LIMIT 12`).bind(studentId));
  const loops = await all<any>(env.DB.prepare(`SELECT l.outcome_id,o.subject_id,o.code,o.title,o.topic FROM nibiru_outcome_loops l JOIN outcomes o ON o.id=l.outcome_id WHERE l.student_id=? AND l.status='ACTIVE' ORDER BY l.created_at DESC LIMIT 4`).bind(studentId));
  // the worksheets planned for the class this week
  const sheets = enr.class_id ? await all<any>(env.DB.prepare(`SELECT DISTINCT w.id,w.title,ws.subject_id,ws.question_count,sub.name subject_name FROM worksheet_calendar_entries c JOIN worksheets w ON w.id=c.worksheet_id
    JOIN worksheet_subjects ws ON ws.worksheet_id=w.id JOIN subjects sub ON sub.id=ws.subject_id
    WHERE (c.class_id=? OR (c.class_id IS NULL AND c.institution_id=? AND w.grade_level=?)) AND c.status NOT IN ('SKIPPED','CANCELLED') AND c.planned_date BETWEEN ? AND ?`).bind(enr.class_id, enr.institution_id, enr.grade_level, weekStart, addDays(weekStart, 6))) : [];
  const sheetOutcomes = sheets.length ? await all<any>(env.DB.prepare(`SELECT wo.worksheet_id,wo.outcome_id FROM worksheet_outcomes wo WHERE wo.worksheet_id IN (${marks(new Set(sheets.map((x) => x.id)).size)})`).bind(...new Set(sheets.map((x) => x.id)))) : [];
  const teacherTargets = enr.class_id ? await all<any>(env.DB.prepare(`SELECT t.*,u.display_name teacher FROM guidance_subject_targets t JOIN users u ON u.id=t.teacher_id WHERE t.class_id=? AND t.week_start=? AND t.status='ACTIVE' ORDER BY t.created_at`).bind(enr.class_id, weekStart)) : [];

  const sheetSource = (title: string) => (/kırmızı|kirmizi/i.test(title) && [8, 12].includes(Number(enr.grade_level)) ? 'KIRMIZI_FOY' : 'MAVI_FOY');
  const rows: Draft[] = [];
  let weakBudget = Math.round(total * s.weakPct / 100), sheetBudget = Math.round(total * s.worksheetPct / 100);
  const reviewBudget = total - weakBudget - sheetBudget;
  const focus = [...loops.map((l) => ({ ...l, miss: 0, total: 0, loop: true })), ...weak.filter((w) => !loops.some((l) => l.outcome_id === w.outcome_id))].slice(0, 10);
  if (!sheets.length) { weakBudget += sheetBudget; sheetBudget = 0; }
  if (!focus.length) { sheetBudget += weakBudget; weakBudget = 0; }
  if (focus.length && weakBudget > 0) {
    const weight = (f: any) => f.loop ? 3 : Math.max(1, Number(f.miss));
    const sum = focus.reduce((a, f) => a + weight(f), 0);
    for (const f of focus) {
      const n = round5(weakBudget * weight(f) / sum);
      const inSheet = sheetOutcomes.find((x) => x.outcome_id === f.outcome_id);
      const sheet = inSheet ? sheets.find((x) => x.id === inSheet.worksheet_id) : null;
      rows.push({ day: 0, subject_id: f.subject_id, outcome_id: f.outcome_id, topic: `${f.code ? `${f.code} · ` : ''}${f.topic || f.title}`, source: sheet ? sheetSource(sheet.title) : 'ANUNEX', source_detail: sheet ? sheet.title : 'Soru Çöz',
        target_count: n, origin: 'SYSTEM', kind: f.loop ? 'SUPPORT' : 'WEAK', reason: f.loop ? 'Bu kazanımda destek döngüsü devam ediyor.' : `Son denemelerde bu kazanımda ${f.total} sorudan ${f.miss}’i yanlış ya da boş.` });
    }
  }
  if (sheets.length && sheetBudget > 0) {
    const sum = sheets.reduce((a, x) => a + Number(x.question_count || 0), 0) || sheets.length;
    for (const x of sheets) rows.push({ day: 0, subject_id: x.subject_id, outcome_id: null, topic: `${x.subject_name} föyü`, source: sheetSource(x.title), source_detail: x.title,
      target_count: round5(sheetBudget * (Number(x.question_count || 0) || 1) / sum), origin: 'SYSTEM', kind: 'WORKSHEET', reason: 'Bu haftanın föy takviminde.' });
  }
  if (!rows.length) {
    rows.push({ day: 0, subject_id: null, outcome_id: null, topic: 'Derslerden serbest tekrar', source: 'OKUL_KITABI', source_detail: null, target_count: round5(total - reviewBudget), origin: 'SYSTEM', kind: 'EXTRA', reason: 'Henüz deneme ya da föy verisi yok; rehber öğretmen konuları belirler.' });
    notes.push('Bu öğrenci için henüz yayımlanmış deneme sonucu ya da bu haftaya planlı föy yok.');
  }
  for (const t of teacherTargets) rows.push({ day: 0, subject_id: t.subject_id, outcome_id: null, topic: t.topic, source: t.source, source_detail: t.note || null, target_count: t.target_count, origin: 'TEACHER', kind: 'TEACHER', reason: `${t.teacher} öğretmenin bu haftaki ders hedefi.` });
  // spread over the study days: biggest first, never the same subject twice on a day when it can be helped
  const days = s.studyDays.filter((d) => d !== s.reviewDay).length ? s.studyDays.filter((d) => d !== s.reviewDay) : s.studyDays;
  const load = new Map(days.map((d) => [d, 0]));
  const subj = new Map(days.map((d) => [d, new Set<string>()]));
  for (const r of [...rows].sort((a, b) => b.target_count - a.target_count)) {
    const order = [...days].sort((a, b) => (load.get(a)! - load.get(b)!) || a - b);
    const pick = order.find((d) => !r.subject_id || !subj.get(d)!.has(r.subject_id)) ?? order[0];
    r.day = pick; load.set(pick, load.get(pick)! + r.target_count); if (r.subject_id) subj.get(pick)!.add(r.subject_id);
  }
  if (reviewBudget > 0) rows.push({ day: s.reviewDay, subject_id: null, outcome_id: null, topic: 'Haftanın yanlışlarını tekrar', source: 'ANUNEX', source_detail: 'Yanlış / Boş Sorularım', target_count: round5(reviewBudget), origin: 'SYSTEM', kind: 'REVIEW', reason: 'Hafta içinde yanlış yapılan ve boş bırakılan soruların tekrarı.' });
  rows.sort((a, b) => a.day - b.day || b.target_count - a.target_count);
  return { institutionId: enr.institution_id as string, classId: enr.class_id as string | null, total, rows, notes };
}

// ---------------------------------------------------------------- progress
export async function programProgress(env: Env, programId: string) {
  const p = await one<any>(env.DB.prepare(`SELECT * FROM guidance_programs WHERE id=?`).bind(programId));
  if (!p) return null;
  const end = addDays(p.week_start, 6);
  const items = await all<any>(env.DB.prepare(`SELECT i.*,s.name subject_name FROM guidance_program_items i LEFT JOIN subjects s ON s.id=i.subject_id WHERE i.program_id=? ORDER BY i.day,i.sort,i.rowid`).bind(programId));
  // verified: questions solved inside ANUNEX this week (question practice, Nibiru denemesi …), by subject
  const verified = await all<any>(env.DB.prepare(`SELECT q.subject_id,count(*) n,sum(a.is_correct) correct FROM question_practice_attempts a JOIN question_bank q ON q.id=a.question_id
    WHERE a.student_id=? AND date(a.created_at,'+3 hours') BETWEEN ? AND ? GROUP BY q.subject_id`).bind(p.student_id, p.week_start, end));
  const declared = await all<any>(env.DB.prepare(`SELECT subject_id,sum(solved) n,sum(correct) correct,sum(wrong) wrong,sum(blank) blank FROM guidance_study_logs WHERE student_id=? AND log_date BETWEEN ? AND ? GROUP BY subject_id`).bind(p.student_id, p.week_start, end));
  const activeDays = await all<any>(env.DB.prepare(`SELECT d FROM (SELECT date(a.created_at,'+3 hours') d FROM question_practice_attempts a WHERE a.student_id=? AND date(a.created_at,'+3 hours') BETWEEN ? AND ?
    UNION SELECT log_date FROM guidance_study_logs WHERE student_id=? AND log_date BETWEEN ? AND ? UNION SELECT date(done_at,'+3 hours') FROM guidance_program_items WHERE program_id=? AND done=1 AND done_at IS NOT NULL)`).bind(p.student_id, p.week_start, end, p.student_id, p.week_start, end, programId));
  const key = (s: string | null) => s || '_';
  const bySubject = new Map<string, { subjectId: string | null; name: string; target: number; done: number; verified: number; verifiedCorrect: number; declared: number; declaredCorrect: number }>();
  const ensure = (sid: string | null, name: string) => { const k = key(sid); if (!bySubject.has(k)) bySubject.set(k, { subjectId: sid, name, target: 0, done: 0, verified: 0, verifiedCorrect: 0, declared: 0, declaredCorrect: 0 }); return bySubject.get(k)!; };
  for (const i of items) { const b = ensure(i.subject_id, i.subject_name || 'Genel'); b.target += Number(i.target_count); if (i.done) b.done += Number(i.target_count); }
  const names = new Map(items.filter((i) => i.subject_id).map((i) => [i.subject_id, i.subject_name]));
  for (const v of verified) { const b = ensure(v.subject_id, names.get(v.subject_id) || 'Diğer dersler'); b.verified += Number(v.n); b.verifiedCorrect += Number(v.correct || 0); }
  for (const d of declared) { const b = ensure(d.subject_id, names.get(d.subject_id) || 'Diğer dersler'); b.declared += Number(d.n); b.declaredCorrect += Number(d.correct || 0); }
  let target = 0, achieved = 0, verifiedN = 0, verifiedCorrect = 0, declaredN = 0, declaredCorrect = 0;
  const subjects = [...bySubject.values()].map((b) => {
    const got = Math.max(b.verified + b.declared, b.done);
    target += b.target; achieved += Math.min(got, b.target); verifiedN += b.verified; verifiedCorrect += b.verifiedCorrect; declaredN += b.declared; declaredCorrect += b.declaredCorrect;
    return { ...b, achieved: got, completion: b.target ? Math.min(1, got / b.target) : null };
  });
  return { programId, studentId: p.student_id as string, weekStart: p.week_start as string, status: p.status as string, target, achieved, completion: target ? achieved / target : 0,
    verified: { solved: verifiedN, correct: verifiedCorrect, accuracy: verifiedN ? verifiedCorrect / verifiedN : null },
    declared: { solved: declaredN, correct: declaredCorrect, accuracy: declaredN ? declaredCorrect / declaredN : null },
    activeDays: activeDays.filter((r) => r.d).length, subjects, itemsDone: items.filter((i) => i.done).length, itemCount: items.length };
}

/** Early-warning signals of the weekly programme (used by the guidance centre). */
export async function programWarnings(env: Env, studentIds: string[], today = istanbulToday()) {
  if (!studentIds.length) return [] as { studentId: string; key: string; level: 'HIGH' | 'MEDIUM'; reason: string }[];
  const thisWeek = mondayOf(today);
  const out: { studentId: string; key: string; level: 'HIGH' | 'MEDIUM'; reason: string }[] = [];
  const progs = await all<any>(env.DB.prepare(`SELECT id,student_id,week_start FROM guidance_programs WHERE status='GIVEN' AND student_id IN (${marks(studentIds.length)}) AND week_start BETWEEN ? AND ? ORDER BY week_start DESC`).bind(...studentIds, addDays(thisWeek, -14), thisWeek));
  for (const sid of studentIds) {
    const mine = progs.filter((p) => p.student_id === sid);
    const past = mine.filter((p) => p.week_start < thisWeek).slice(0, 2);
    if (past.length === 2) {
      const done = await Promise.all(past.map((p) => programProgress(env, p.id)));
      if (done.every((d) => d && d.target > 0 && d.completion < 0.5)) out.push({ studentId: sid, key: 'PROGRAM', level: 'MEDIUM', reason: `Son iki haftada programın %${Math.round(done[1]!.completion * 100)} ve %${Math.round(done[0]!.completion * 100)}’i yapıldı.` });
    }
    const current = mine.find((p) => p.week_start === thisWeek);
    if (current && today >= addDays(thisWeek, 3)) {
      const p = await programProgress(env, current.id);
      if (p && p.activeDays === 0 && p.achieved === 0) out.push({ studentId: sid, key: 'PROGRAM', level: 'MEDIUM', reason: 'Bu hafta programdan henüz çalışma kaydı yok.' });
    }
  }
  // one PROGRAM signal per student at most
  return out.filter((w, i) => out.findIndex((x) => x.studentId === w.studentId) === i);
}

// ---------------------------------------------------------------- access
async function counselorOf(env: Env, user: AuthUser, studentId: string) {
  return user.role === 'GUIDANCE_TEACHER' && (await guidanceStudentIds(env, user)).includes(studentId);
}
async function canSee(env: Env, user: AuthUser, studentId: string) {
  if (await counselorOf(env, user, studentId)) return 'COUNSELOR';
  if (user.role === 'STUDENT' && user.student_id === studentId) return 'STUDENT';
  if (user.role === 'PARENT' && await one(env.DB.prepare(`SELECT 1 FROM parent_student_links WHERE parent_user_id=? AND student_id=? AND active=1`).bind(user.id, studentId))) return 'PARENT';
  return null;
}

async function insertRows(env: Env, programId: string, rows: Draft[]) {
  if (!rows.length) return;
  await env.DB.batch(rows.map((r, k) => env.DB.prepare(`INSERT INTO guidance_program_items(id,program_id,day,subject_id,outcome_id,topic,source,source_detail,target_count,origin,kind,reason,sort) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(uuid('gpi'), programId, r.day, r.subject_id, r.outcome_id, r.topic.slice(0, 200), r.source, r.source_detail, r.target_count, r.origin, r.kind, r.reason, k)));
}

async function generate(request: Request, env: Env, user: AuthUser) {
  const b = await request.json().catch(() => ({})) as any;
  const week = text(b?.week, 10);
  if (!validWeek(week)) return fail(400, 'VALIDATION_ERROR', 'Hafta pazartesi günüyle seçilmelidir.');
  const settings = readSettings(b);
  if ('error' in settings) return fail(400, 'VALIDATION_ERROR', settings.error);
  const scope = await guidanceStudentIds(env, user);
  let ids: string[] = Array.isArray(b?.studentIds) ? b.studentIds.map(String) : [];
  if (b?.classId) ids = (await all<any>(env.DB.prepare(`SELECT student_id FROM student_enrollments WHERE class_id=? AND status='ACTIVE'`).bind(String(b.classId)))).map((r) => r.student_id);
  ids = [...new Set(ids)];
  if (!ids.length) return fail(400, 'VALIDATION_ERROR', 'Öğrenci ya da sınıf seçin.');
  if (ids.some((id) => !scope.includes(id))) return fail(403, 'FORBIDDEN', 'Yalnız rehberliğini yaptığınız öğrenciler için program hazırlanır.');
  const results: any[] = [];
  for (const sid of ids.slice(0, 60)) {
    const existing = await one<any>(env.DB.prepare(`SELECT id,status FROM guidance_programs WHERE student_id=? AND week_start=?`).bind(sid, week));
    if (existing?.status === 'GIVEN') { results.push({ studentId: sid, programId: existing.id, skipped: 'GIVEN' }); continue; }
    const built = await buildWeek(env, sid, week, settings);
    if (!built) { results.push({ studentId: sid, skipped: 'NO_ENROLLMENT' }); continue; }
    let id = existing?.id as string | undefined;
    if (id) {
      await env.DB.batch([env.DB.prepare(`DELETE FROM guidance_program_items WHERE program_id=? AND origin IN ('SYSTEM','TEACHER')`).bind(id),
        env.DB.prepare(`UPDATE guidance_programs SET weekly_target=?,show_signature=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(built.total, settings.showSignature ? 1 : 0, id)]);
    } else {
      id = uuid('gpr');
      await env.DB.prepare(`INSERT INTO guidance_programs(id,institution_id,student_id,week_start,weekly_target,show_signature,created_by) VALUES(?,?,?,?,?,?,?)`).bind(id, built.institutionId, sid, week, built.total, settings.showSignature ? 1 : 0, user.id).run();
    }
    await insertRows(env, id, built.rows);
    results.push({ studentId: sid, programId: id, total: built.total, rows: built.rows.length, notes: built.notes });
  }
  await audit(env.DB, user.id, user.institution_id, 'GUIDANCE_PROGRAM_PREPARED', 'guidance_program', week, { students: ids.length });
  return json({ ok: true, results });
}

async function programDetail(env: Env, user: AuthUser, id: string) {
  const p = await one<any>(env.DB.prepare(`SELECT p.*,s.first_name||' '||s.last_name student_name,e.student_number,c.name class_name,i.name institution_name FROM guidance_programs p JOIN student_entities s ON s.id=p.student_id
    LEFT JOIN student_enrollments e ON e.student_id=p.student_id AND e.status='ACTIVE' LEFT JOIN classes c ON c.id=e.class_id JOIN institutions i ON i.id=p.institution_id WHERE p.id=?`).bind(id));
  if (!p) return fail(404, 'NOT_FOUND', 'Program bulunamadı.');
  const who = await canSee(env, user, p.student_id);
  if (!who || (who !== 'COUNSELOR' && p.status !== 'GIVEN')) return fail(404, 'NOT_FOUND', 'Program bulunamadı.');
  const items = await all<any>(env.DB.prepare(`SELECT i.*,s.name subject_name FROM guidance_program_items i LEFT JOIN subjects s ON s.id=i.subject_id WHERE i.program_id=? ORDER BY i.day,i.sort,i.rowid`).bind(id));
  const logs = await all<any>(env.DB.prepare(`SELECT l.*,s.name subject_name FROM guidance_study_logs l LEFT JOIN subjects s ON s.id=l.subject_id WHERE l.student_id=? AND l.log_date BETWEEN ? AND ? ORDER BY l.log_date DESC,l.created_at DESC`).bind(p.student_id, p.week_start, addDays(p.week_start, 6)));
  // owner 12 Nov 2026: each outcome row carries its video — system video, else the school's link, else the automatic segment
  for (const it of items) if (it.outcome_id) it.video = await programItemVideo(env, it.outcome_id, p.institution_id);
  const progress = await programProgress(env, id);
  const counselor = await one<any>(env.DB.prepare(`SELECT display_name FROM users WHERE id=?`).bind(p.given_by || p.created_by));
  return json({ ok: true, viewer: who, program: { ...p, counselor: counselor?.display_name || null }, items, logs, progress });
}

async function editProgram(request: Request, env: Env, user: AuthUser, id: string) {
  const p = await one<any>(env.DB.prepare(`SELECT * FROM guidance_programs WHERE id=?`).bind(id));
  if (!p || !(await counselorOf(env, user, p.student_id))) return fail(404, 'NOT_FOUND', 'Program bulunamadı.');
  const b = await request.json().catch(() => ({})) as any;
  const note = b?.note !== undefined ? text(b.note, 600) || null : p.note;
  const sig = b?.showSignature !== undefined ? (b.showSignature ? 1 : 0) : p.show_signature;
  await env.DB.prepare(`UPDATE guidance_programs SET note=?,show_signature=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(note, sig, id).run();
  return json({ ok: true });
}

async function addItem(request: Request, env: Env, user: AuthUser, programId: string) {
  const p = await one<any>(env.DB.prepare(`SELECT * FROM guidance_programs WHERE id=?`).bind(programId));
  if (!p) return fail(404, 'NOT_FOUND', 'Program bulunamadı.');
  const who = await canSee(env, user, p.student_id);
  if (who !== 'COUNSELOR' && !(who === 'STUDENT' && p.status === 'GIVEN')) return fail(403, 'FORBIDDEN', 'Bu programa satır ekleyemezsiniz.');
  const b = await request.json().catch(() => ({})) as any;
  const topic = text(b?.topic, 200); const source = isSource(b?.source) ? b.source : 'DIGER';
  const day = int(b?.day, 1, 7, 1); const count = int(b?.targetCount, 0, 500, 0);
  if (!topic || count < 1) return fail(400, 'VALIDATION_ERROR', 'Konu ve soru sayısı yazılmalıdır.');
  const subjectId = text(b?.subjectId, 80) || null;
  if (subjectId && !(await one(env.DB.prepare(`SELECT 1 FROM subjects WHERE id=?`).bind(subjectId)))) return fail(400, 'VALIDATION_ERROR', 'Ders bulunamadı.');
  const id = uuid('gpi');
  const origin = who === 'STUDENT' ? 'STUDENT' : 'COUNSELOR';
  await env.DB.prepare(`INSERT INTO guidance_program_items(id,program_id,day,subject_id,topic,source,source_detail,target_count,origin,kind,reason,sort) VALUES(?,?,?,?,?,?,?,?,?,?,?,99)`)
    .bind(id, programId, day, subjectId, topic, source, text(b?.sourceDetail, 120) || null, count, origin, origin === 'STUDENT' ? 'OWN' : 'EXTRA', origin === 'STUDENT' ? 'Kendi hedefim.' : 'Rehber öğretmen ekledi.').run();
  return json({ ok: true, id }, 201);
}

async function editItem(request: Request, env: Env, user: AuthUser, itemId: string) {
  const it = await one<any>(env.DB.prepare(`SELECT i.*,p.student_id,p.status FROM guidance_program_items i JOIN guidance_programs p ON p.id=i.program_id WHERE i.id=?`).bind(itemId));
  if (!it) return fail(404, 'NOT_FOUND', 'Satır bulunamadı.');
  const who = await canSee(env, user, it.student_id);
  const studentSide = who === 'STUDENT' && it.status === 'GIVEN';
  if (who !== 'COUNSELOR' && !studentSide) return fail(404, 'NOT_FOUND', 'Satır bulunamadı.');
  if (request.method === 'DELETE') {
    if (who !== 'COUNSELOR' && it.origin !== 'STUDENT') return fail(403, 'FORBIDDEN', 'Yalnız kendi eklediğin hedefi silebilirsin.');
    await env.DB.prepare(`DELETE FROM guidance_program_items WHERE id=?`).bind(itemId).run();
    return json({ ok: true });
  }
  const b = await request.json().catch(() => ({})) as any;
  if (b?.done !== undefined) {
    const done = b.done ? 1 : 0;
    await env.DB.prepare(`UPDATE guidance_program_items SET done=?,done_at=CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=?`).bind(done, done, itemId).run();
  }
  if (who === 'COUNSELOR' || it.origin === 'STUDENT') {
    const day = b?.day !== undefined ? int(b.day, 1, 7, it.day) : it.day;
    const count = b?.targetCount !== undefined ? int(b.targetCount, 0, 500, it.target_count) : it.target_count;
    const topic = b?.topic !== undefined ? (text(b.topic, 200) || it.topic) : it.topic;
    const source = b?.source !== undefined && isSource(b.source) ? b.source : it.source;
    const detail = b?.sourceDetail !== undefined ? (text(b.sourceDetail, 120) || null) : it.source_detail;
    await env.DB.prepare(`UPDATE guidance_program_items SET day=?,target_count=?,topic=?,source=?,source_detail=? WHERE id=?`).bind(day, count, topic, source, detail, itemId).run();
  }
  return json({ ok: true });
}

async function give(env: Env, user: AuthUser, programIds: string[]) {
  let given = 0;
  for (const id of programIds) {
    const p = await one<any>(env.DB.prepare(`SELECT * FROM guidance_programs WHERE id=?`).bind(id));
    if (!p || !(await counselorOf(env, user, p.student_id))) continue;
    const n = await one<any>(env.DB.prepare(`SELECT count(*) n FROM guidance_program_items WHERE program_id=?`).bind(id));
    if (!Number(n?.n)) continue;
    if (p.status !== 'GIVEN') {
      await env.DB.prepare(`UPDATE guidance_programs SET status='GIVEN',given_by=?,given_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(user.id, id).run();
      const to = await all<any>(env.DB.prepare(`SELECT id FROM users WHERE student_id=? AND role='STUDENT' AND active=1 UNION SELECT parent_user_id FROM parent_student_links WHERE student_id=? AND active=1`).bind(p.student_id, p.student_id));
      if (to.length) await env.DB.batch(to.map((u) => env.DB.prepare(`INSERT INTO notifications(id,recipient_user_id,institution_id,type,title,body,action_url,entity_type,entity_id) VALUES(?,?,?,?,?,?,?,?,?)`)
        .bind(uuid('ntf'), u.id, p.institution_id, 'GUIDANCE_PROGRAM', 'Haftalık program hazır', 'Rehber öğretmen bu haftanın çalışma programını hazırladı.', '/bu-haftam', 'guidance_program', id)));
      given++;
    }
  }
  await audit(env.DB, user.id, user.institution_id, 'GUIDANCE_PROGRAM_GIVEN', 'guidance_program', programIds[0] || '', { count: given });
  return given;
}

async function overview(env: Env, user: AuthUser, url: URL) {
  const week = text(url.searchParams.get('week'), 10) || mondayOf(istanbulToday());
  if (!validWeek(week)) return fail(400, 'VALIDATION_ERROR', 'Hafta pazartesi günüyle seçilmelidir.');
  const scope = await guidanceStudentIds(env, user);
  const classes = scope.length ? await all<any>(env.DB.prepare(`SELECT DISTINCT c.id,c.name,c.grade_level FROM student_enrollments e JOIN classes c ON c.id=e.class_id WHERE e.student_id IN (${marks(scope.length)}) AND e.status='ACTIVE' ORDER BY c.grade_level,c.name`).bind(...scope)) : [];
  const classId = text(url.searchParams.get('classId'), 80) || classes[0]?.id || '';
  const students = classId ? await all<any>(env.DB.prepare(`SELECT s.id,s.first_name||' '||s.last_name name,e.student_number FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id WHERE e.class_id=? AND e.status='ACTIVE' ORDER BY e.student_number,s.last_name`).bind(classId)) : [];
  const rows = [];
  for (const s of students.filter((x) => scope.includes(x.id))) {
    const p = await one<any>(env.DB.prepare(`SELECT id,status,weekly_target FROM guidance_programs WHERE student_id=? AND week_start=?`).bind(s.id, week));
    const prog = p ? await programProgress(env, p.id) : null;
    const nets = await all<any>(env.DB.prepare(`SELECT snap.net FROM exam_result_snapshots snap JOIN exam_delivery_profiles dp ON dp.exam_id=snap.exam_id AND dp.snapshot_version=snap.snapshot_version JOIN exams e ON e.id=snap.exam_id
      WHERE snap.student_id=? AND dp.result_freeze_status='PUBLISHED' AND dp.published_at IS NOT NULL ORDER BY coalesce(e.exam_date,dp.published_at) DESC LIMIT 2`).bind(s.id));
    rows.push({ ...s, program: p ? { id: p.id, status: p.status, target: prog?.target ?? 0, achieved: prog?.achieved ?? 0, completion: prog?.completion ?? 0, verified: prog?.verified, declared: prog?.declared, activeDays: prog?.activeDays ?? 0 } : null,
      netTrend: nets.length === 2 ? Number(nets[0].net) - Number(nets[1].net) : null, lastNet: nets[0] ? Number(nets[0].net) : null });
  }
  const templates = await all<any>(env.DB.prepare(`SELECT * FROM guidance_program_templates WHERE owner_id=? ORDER BY created_at DESC`).bind(user.id));
  const lastTarget = await one<any>(env.DB.prepare(`SELECT weekly_target FROM guidance_programs WHERE created_by=? ORDER BY created_at DESC LIMIT 1`).bind(user.id));
  return json({ ok: true, week, classId, classes, students: rows, templates, lastWeeklyTarget: lastTarget?.weekly_target || null });
}

// ---------------------------------------------------------------- student / parent
async function studentWeek(env: Env, user: AuthUser, studentId: string, week: string) {
  const p = await one<any>(env.DB.prepare(`SELECT id FROM guidance_programs WHERE student_id=? AND week_start=? AND status='GIVEN'`).bind(studentId, week));
  if (p) return programDetail(env, user, p.id);
  const logs = await all<any>(env.DB.prepare(`SELECT l.*,s.name subject_name FROM guidance_study_logs l LEFT JOIN subjects s ON s.id=l.subject_id WHERE l.student_id=? AND l.log_date BETWEEN ? AND ? ORDER BY l.log_date DESC`).bind(studentId, week, addDays(week, 6)));
  return json({ ok: true, viewer: user.role === 'PARENT' ? 'PARENT' : 'STUDENT', program: null, items: [], logs, progress: null, week });
}

async function addLog(request: Request, env: Env, user: AuthUser) {
  if (user.role !== 'STUDENT' || !user.student_id) return fail(403, 'FORBIDDEN', 'Çalışma kaydını öğrenci girer.');
  const b = await request.json().catch(() => ({})) as any;
  const date = text(b?.date, 10) || istanbulToday();
  const today = istanbulToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today || date < addDays(today, -7)) return fail(400, 'VALIDATION_ERROR', 'Kayıt yalnız son yedi gün için girilebilir.');
  const solved = int(b?.solved, 0, 500, 0), correct = int(b?.correct, 0, 500, 0), wrong = int(b?.wrong, 0, 500, 0), blank = int(b?.blank, 0, 500, 0);
  if (solved < 1 || correct + wrong + blank > solved) return fail(400, 'VALIDATION_ERROR', 'Çözülen soru sayısı doğru, yanlış ve boşların toplamından az olamaz.');
  const source = isSource(b?.source) ? b.source : 'OKUL_KITABI';
  if (source === 'ANUNEX') return fail(400, 'VALIDATION_ERROR', 'ANUNEX içinde çözdüğün sorular zaten kendiliğinden sayılıyor.');
  const subjectId = text(b?.subjectId, 80) || null;
  const enr = await one<any>(env.DB.prepare(`SELECT institution_id FROM student_enrollments WHERE student_id=? AND status='ACTIVE' LIMIT 1`).bind(user.student_id));
  if (!enr) return fail(403, 'FORBIDDEN', 'Aktif öğrenci kaydı bulunamadı.');
  let itemId: string | null = text(b?.itemId, 80) || null;
  if (itemId && !(await one(env.DB.prepare(`SELECT 1 FROM guidance_program_items i JOIN guidance_programs p ON p.id=i.program_id WHERE i.id=? AND p.student_id=?`).bind(itemId, user.student_id)))) itemId = null;
  const today3 = await one<any>(env.DB.prepare(`SELECT count(*) n FROM guidance_study_logs WHERE student_id=? AND created_at>=datetime('now','-1 day')`).bind(user.student_id));
  if (Number(today3?.n || 0) >= 30) return fail(429, 'TOO_MANY', 'Bugün için çok fazla kayıt girildi.');
  const id = uuid('gsl');
  await env.DB.prepare(`INSERT INTO guidance_study_logs(id,institution_id,student_id,log_date,subject_id,source,solved,correct,wrong,blank,item_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(id, enr.institution_id, user.student_id, date, subjectId, source, solved, correct, wrong, blank, itemId).run();
  return json({ ok: true, id }, 201);
}

// ---------------------------------------------------------------- subject teachers
async function teacherTargets(request: Request, env: Env, user: AuthUser, url: URL) {
  const mine = await all<any>(env.DB.prepare(`SELECT DISTINCT ta.class_id,c.name class_name,ta.subject_id,s.name subject_name FROM teacher_assignments ta JOIN classes c ON c.id=ta.class_id LEFT JOIN subjects s ON s.id=ta.subject_id
    WHERE ta.user_id=? AND ta.active=1 AND ta.assignment_type='SUBJECT' AND ta.institution_id=? ORDER BY c.name`).bind(user.id, user.institution_id));
  if (request.method === 'GET') {
    const week = text(url.searchParams.get('week'), 10) || mondayOf(istanbulToday());
    const rows = await all<any>(env.DB.prepare(`SELECT t.*,c.name class_name,s.name subject_name FROM guidance_subject_targets t JOIN classes c ON c.id=t.class_id JOIN subjects s ON s.id=t.subject_id WHERE t.teacher_id=? AND t.week_start=? AND t.status='ACTIVE' ORDER BY c.name`).bind(user.id, week));
    const subjects = await all<any>(env.DB.prepare(`SELECT id,name FROM subjects ORDER BY name`));
    return json({ ok: true, week, targets: rows, assignments: mine, subjects });
  }
  const b = await request.json().catch(() => ({})) as any;
  const week = text(b?.week, 10); const classId = text(b?.classId, 80); const subjectId = text(b?.subjectId, 80);
  if (!validWeek(week)) return fail(400, 'VALIDATION_ERROR', 'Hafta pazartesi günüyle seçilmelidir.');
  if (!mine.some((m) => m.class_id === classId && (!m.subject_id || m.subject_id === subjectId))) return fail(403, 'FORBIDDEN', 'Yalnız derse girdiğiniz sınıf ve dersiniz için hedef verebilirsiniz.');
  const topic = text(b?.topic, 200); const count = int(b?.targetCount, 0, 500, 0);
  if (!topic || count < 1 || !subjectId) return fail(400, 'VALIDATION_ERROR', 'Ders, konu ve soru sayısı yazılmalıdır.');
  const source = isSource(b?.source) ? b.source : 'DIGER';
  const id = uuid('gst');
  const tUser = await one<any>(env.DB.prepare(`SELECT display_name FROM users WHERE id=?`).bind(user.id));
  await env.DB.prepare(`INSERT INTO guidance_subject_targets(id,institution_id,teacher_id,class_id,subject_id,week_start,topic,target_count,source,note) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(id, user.institution_id, user.id, classId, subjectId, week, topic, count, source, text(b?.note, 200) || null).run();
  // already prepared programmes of the class for that week get the row too
  const progs = await all<any>(env.DB.prepare(`SELECT p.id FROM guidance_programs p JOIN student_enrollments e ON e.student_id=p.student_id AND e.status='ACTIVE' WHERE e.class_id=? AND p.week_start=?`).bind(classId, week));
  for (const p of progs) await insertRows(env, p.id, [{ day: 1, subject_id: subjectId, outcome_id: null, topic, source, source_detail: text(b?.note, 200) || null, target_count: count, origin: 'TEACHER', kind: 'TEACHER', reason: `${tUser?.display_name || 'Branş'} öğretmenin bu haftaki ders hedefi.` }]);
  await audit(env.DB, user.id, user.institution_id, 'GUIDANCE_SUBJECT_TARGET_ADDED', 'guidance_subject_target', id, { classId, subjectId, week, count });
  return json({ ok: true, id, addedToPrograms: progs.length }, 201);
}

// ---------------------------------------------------------------- router
export async function handleGuidanceProgram(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/guidance-program')) return null;
  const { getAuthUser } = await import('./auth');
  const user = await getAuthUser(env, request);
  if (!user) return fail(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  if (user.must_change_password) return fail(403, 'PASSWORD_CHANGE_REQUIRED', 'Önce şifrenizi değiştirin.');
  if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) return fail(403, 'FORBIDDEN', 'İsteği ANUNEX üzerinden başlatın.');
  const p = url.pathname.replace(/\/+$/, '');
  const week = text(url.searchParams.get('week'), 10) || mondayOf(istanbulToday());
  if (p === '/api/guidance-program/mine' && request.method === 'GET') {
    if (user.role !== 'STUDENT' || !user.student_id) return fail(403, 'FORBIDDEN', 'Bu bölüm öğrenciler içindir.');
    if (!validWeek(week)) return fail(400, 'VALIDATION_ERROR', 'Hafta geçersiz.');
    const subjects = await all<any>(env.DB.prepare(`SELECT id,name FROM subjects ORDER BY name`));
    const res = await studentWeek(env, user, user.student_id, week);
    const data: any = await res.json();
    return json({ ...data, week, subjects });
  }
  if (p === '/api/guidance-program/child' && request.method === 'GET') {
    if (user.role !== 'PARENT') return fail(403, 'FORBIDDEN', 'Bu bölüm veliler içindir.');
    const children = await all<any>(env.DB.prepare(`SELECT s.id,s.first_name||' '||s.last_name name FROM parent_student_links l JOIN student_entities s ON s.id=l.student_id WHERE l.parent_user_id=? AND l.active=1 ORDER BY s.first_name`).bind(user.id));
    const sid = text(url.searchParams.get('studentId'), 80) || children[0]?.id;
    if (!sid || !children.some((c) => c.id === sid)) return json({ ok: true, children, program: null, items: [], logs: [], progress: null, week });
    const res = await studentWeek(env, user, sid, week);
    const data: any = await res.json();
    return json({ ...data, week, children, studentId: sid });
  }
  if (p === '/api/guidance-program/logs' && request.method === 'POST') return addLog(request, env, user);
  let m = p.match(/^\/api\/guidance-program\/logs\/([^/]+)$/);
  if (m && request.method === 'DELETE') {
    const r = await env.DB.prepare(`DELETE FROM guidance_study_logs WHERE id=? AND student_id=? AND log_date>=?`).bind(decodeURIComponent(m[1]), user.student_id, addDays(istanbulToday(), -7)).run();
    return r.meta.changes ? json({ ok: true }) : fail(404, 'NOT_FOUND', 'Kayıt bulunamadı.');
  }
  m = p.match(/^\/api\/guidance-program\/programs\/([^/]+)$/);
  if (m && request.method === 'GET') return programDetail(env, user, decodeURIComponent(m[1]));
  m = p.match(/^\/api\/guidance-program\/programs\/([^/]+)\/items$/);
  if (m && request.method === 'POST') return addItem(request, env, user, decodeURIComponent(m[1]));
  m = p.match(/^\/api\/guidance-program\/items\/([^/]+)$/);
  if (m && (request.method === 'PATCH' || request.method === 'DELETE')) return editItem(request, env, user, decodeURIComponent(m[1]));
  if (p === '/api/guidance-program/targets') {
    if (user.role !== 'TEACHER' && user.role !== 'GUIDANCE_TEACHER') return fail(403, 'FORBIDDEN', 'Ders hedefini branş öğretmeni verir.');
    return teacherTargets(request, env, user, url);
  }
  // the guidance teacher's own work
  if (user.role !== 'GUIDANCE_TEACHER' || !user.institution_id) return fail(403, 'FORBIDDEN', 'Haftalık programı rehber öğretmen hazırlar.');
  if (p === '/api/guidance-program/overview' && request.method === 'GET') return overview(env, user, url);
  if (p === '/api/guidance-program/generate' && request.method === 'POST') return generate(request, env, user);
  m = p.match(/^\/api\/guidance-program\/programs\/([^/]+)$/);
  if (m && request.method === 'PATCH') return editProgram(request, env, user, decodeURIComponent(m[1]));
  m = p.match(/^\/api\/guidance-program\/programs\/([^/]+)\/give$/);
  if (m && request.method === 'POST') return json({ ok: true, given: await give(env, user, [decodeURIComponent(m[1])]) });
  if (p === '/api/guidance-program/give-class' && request.method === 'POST') {
    const b = await request.json().catch(() => ({})) as any;
    const w = text(b?.week, 10); if (!validWeek(w)) return fail(400, 'VALIDATION_ERROR', 'Hafta geçersiz.');
    const ids = (await all<any>(env.DB.prepare(`SELECT p.id FROM guidance_programs p JOIN student_enrollments e ON e.student_id=p.student_id AND e.status='ACTIVE' WHERE e.class_id=? AND p.week_start=? AND p.status='DRAFT'`).bind(text(b?.classId, 80), w))).map((r) => r.id);
    return json({ ok: true, given: await give(env, user, ids) });
  }
  if (p === '/api/guidance-program/print' && request.method === 'GET') {
    // the class print: every given or draft programme of the class for the week, each with its rows
    const classId = text(url.searchParams.get('classId'), 80);
    const ids = (await all<any>(env.DB.prepare(`SELECT p.id FROM guidance_programs p JOIN student_enrollments e ON e.student_id=p.student_id AND e.status='ACTIVE' WHERE e.class_id=? AND p.week_start=? ORDER BY e.student_number`).bind(classId, week))).map((r) => r.id);
    const out = [];
    for (const id of ids) { const r: any = await (await programDetail(env, user, id)).json(); if (r.ok) out.push(r); }
    return json({ ok: true, programs: out });
  }
  if (p === '/api/guidance-program/templates') {
    if (request.method === 'GET') return json({ ok: true, templates: await all<any>(env.DB.prepare(`SELECT * FROM guidance_program_templates WHERE owner_id=? ORDER BY created_at DESC`).bind(user.id)) });
    const b = await request.json().catch(() => ({})) as any;
    const s = readSettings(b); if ('error' in s) return fail(400, 'VALIDATION_ERROR', s.error);
    const name = text(b?.name, 80); if (!name) return fail(400, 'VALIDATION_ERROR', 'Şablon adı yazılmalıdır.');
    const id = uuid('gpt');
    await env.DB.prepare(`INSERT INTO guidance_program_templates(id,institution_id,owner_id,name,weekly_target,weak_pct,worksheet_pct,review_pct,study_days,review_day,show_signature) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, user.institution_id, user.id, name, s.weeklyTarget, s.weakPct, s.worksheetPct, s.reviewPct, s.studyDays.join(','), s.reviewDay, s.showSignature ? 1 : 0).run();
    return json({ ok: true, id }, 201);
  }
  m = p.match(/^\/api\/guidance-program\/templates\/([^/]+)$/);
  if (m && request.method === 'DELETE') { await env.DB.prepare(`DELETE FROM guidance_program_templates WHERE id=? AND owner_id=?`).bind(decodeURIComponent(m[1]), user.id).run(); return json({ ok: true }); }
  return fail(404, 'NOT_FOUND', 'Yol bulunamadı.');
}

async function programItemVideo(env: Env, outcomeId: string, institutionId: string) {
  const v = await one<any>(env.DB.prepare(`SELECT vl.url,vl.title FROM video_links vl WHERE vl.link_type='TOPIC' AND vl.outcome_id=? AND ${SERVABLE_VIDEO_SQL} ORDER BY vl.rowid DESC LIMIT 1`).bind(outcomeId));
  if (v) return { url: v.url, title: v.title, source: 'SYSTEM', start: 0, end: null };
  const c = await outcomeClip(env, outcomeId, institutionId);
  return c ? { url: c.url, title: c.title, source: c.source, start: c.start, end: c.end } : null;
}
