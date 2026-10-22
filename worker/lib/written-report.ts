/**
 * A042: written exam outcome report (student / section / class).
 * Built only from teacher-finalised grades (A041) — the final version's own item points, not later
 * unfinalised corrections. Points are mapped to outcomes through the question's verified outcome link or,
 * for committee questions, the scenario row's outcome code. Everything is points and percentages: a written
 * score is never turned into a multiple-choice net and never written into deneme results.
 */
import type { AuthUser, Env } from '../types';
import { all, json, one } from './db';

export const STRONG_AT = 70, IMPROVE_BELOW = 50; // ANUNEX thresholds (percent of possible points), not official MEB levels
const fail = (status: number, code: string, message: string) => json({ ok: false, error: { code, message } }, status);
const pct = (earned: number, possible: number) => (possible ? Math.round(earned / possible * 1000) / 10 : null);

async function access(env: Env, user: AuthUser, paperId: string) {
  const p = await one<any>(env.DB.prepare(`SELECT p.*,t.grade_level,t.subject_id,t.academic_year,t.term,t.exam_no,s.name subject_name FROM written_papers p JOIN written_exam_tables t ON t.id=p.table_id JOIN subjects s ON s.id=t.subject_id WHERE p.id=?`).bind(paperId));
  if (!p) return null;
  if (user.role === 'SUPER_ADMIN') return p;
  if (user.institution_id !== p.institution_id) return null;
  if (user.role === 'INSTITUTION_MANAGER') return p;
  if (user.role === 'TEACHER' && (await one(env.DB.prepare(`SELECT 1 FROM teacher_assignments WHERE user_id=? AND institution_id=? AND active=1 AND assignment_type='SUBJECT' AND subject_id=?`).bind(user.id, p.institution_id, p.subject_id)))) return p;
  return null;
}

/** Outcome keys of every item: verified outcome links (bank) or the scenario row's code; otherwise the row's unit/topic. */
async function itemOutcomes(env: Env, p: any) {
  const items = await all<any>(env.DB.prepare(`SELECT i.id,i.sort_order,i.source,i.question_id,i.points,r.outcome_code,r.unit,r.topic FROM written_paper_items i JOIN written_exam_scenario_rows r ON r.id=i.scenario_row_id WHERE i.paper_id=? ORDER BY i.sort_order`).bind(p.id));
  const out = new Map<string, { key: string; code: string | null; title: string }[]>();
  for (const i of items) {
    let list: { key: string; code: string | null; title: string }[] = [];
    if (i.question_id) list = (await all<any>(env.DB.prepare(`SELECT o.id,o.code,o.title FROM question_learning_links l JOIN outcomes o ON l.node_id='ln_'||o.id JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE l.question_id=? AND cv.verified=1 ORDER BY o.code`).bind(i.question_id))).map((o) => ({ key: o.id, code: o.code, title: o.title }));
    if (!list.length && i.outcome_code) {
      const o = await one<any>(env.DB.prepare(`SELECT o.id,o.code,o.title FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE o.code=? AND cv.verified=1 AND cv.academic_year=? AND o.grade_level=? AND o.subject_id=? LIMIT 1`).bind(i.outcome_code, p.academic_year, p.grade_level, p.subject_id));
      list = [o ? { key: o.id, code: o.code, title: o.title } : { key: `code:${i.outcome_code}`, code: i.outcome_code, title: i.outcome_code }];
    }
    if (!list.length) list = [{ key: `row:${i.unit || ''}|${i.topic || ''}`, code: null, title: [i.unit, i.topic].filter(Boolean).join(' · ') || 'Kazanım belirtilmemiş' }];
    out.set(i.id, list);
  }
  return { items, map: out };
}

export async function writtenReport(env: Env, p: any) {
  const { items, map } = await itemOutcomes(env, p);
  const students = await all<any>(env.DB.prepare(`SELECT DISTINCT s.id,s.first_name,s.last_name,e.student_number,e.section FROM student_enrollments e JOIN student_entities s ON s.id=e.student_id WHERE e.institution_id=? AND e.status='ACTIVE' AND e.grade_level=? ORDER BY e.section,e.student_number`).bind(p.institution_id, p.grade_level));
  const finals = await all<any>(env.DB.prepare(`SELECT f.* FROM written_grade_finalizations f WHERE f.paper_id=? AND f.version=(SELECT max(x.version) FROM written_grade_finalizations x WHERE x.paper_id=f.paper_id AND x.student_id=f.student_id)`).bind(p.id));
  type Acc = { key: string; code: string | null; title: string; earned: number; possible: number };
  const outcomeTitle = new Map<string, { code: string | null; title: string }>();
  for (const list of map.values()) for (const o of list) outcomeTitle.set(o.key, { code: o.code, title: o.title });
  const perStudent: any[] = []; const pending: any[] = [];
  for (const s of students) {
    const f = finals.find((x) => x.student_id === s.id);
    if (!f) { pending.push({ id: s.id, studentNumber: s.student_number, name: `${s.first_name} ${s.last_name}`, section: s.section }); continue; }
    const scores: { itemId: string; points: number }[] = JSON.parse(f.scores_json);
    const acc = new Map<string, Acc>();
    for (const it of items) {
      const earned = scores.find((x) => x.itemId === it.id)?.points ?? 0;
      // an item measuring several outcomes counts fully for each of them
      for (const o of map.get(it.id)!) { const a = acc.get(o.key) ?? { key: o.key, code: o.code, title: o.title, earned: 0, possible: 0 }; a.earned += earned; a.possible += it.points; acc.set(o.key, a); }
    }
    const outcomes = [...acc.values()].map((a) => ({ ...a, percent: pct(a.earned, a.possible) }));
    perStudent.push({ id: s.id, studentNumber: s.student_number, name: `${s.first_name} ${s.last_name}`, section: s.section, total: f.total_points, finalVersion: f.version, outcomes,
      strengths: outcomes.filter((o) => (o.percent ?? 0) >= STRONG_AT).map((o) => o.code || o.title), improvements: outcomes.filter((o) => (o.percent ?? 0) < IMPROVE_BELOW).map((o) => o.code || o.title) });
  }
  const aggregate = (group: any[]) => {
    const acc = new Map<string, Acc>();
    for (const st of group) for (const o of st.outcomes) { const a = acc.get(o.key) ?? { key: o.key, code: o.code, title: o.title, earned: 0, possible: 0 }; a.earned += o.earned; a.possible += o.possible; acc.set(o.key, a); }
    return { students: group.length, averageTotal: group.length ? Math.round(group.reduce((t, s) => t + s.total, 0) / group.length * 10) / 10 : null, outcomes: [...acc.values()].map((a) => ({ ...a, percent: pct(a.earned, a.possible) })) };
  };
  const sections = [...new Set(perStudent.map((s) => s.section || '—'))].sort().map((sec) => ({ section: sec, ...aggregate(perStudent.filter((s) => (s.section || '—') === sec)) }));
  return { paper: { id: p.id, title: p.title, academicYear: p.academic_year, term: p.term, examNo: p.exam_no, gradeLevel: p.grade_level, subject: p.subject_name, maxPoints: 100 },
    scale: { kind: 'POINTS_PERCENT', strongAtPercent: STRONG_AT, improveBelowPercent: IMPROVE_BELOW, note: 'Yazılı puanı 100 üzerinden puandır; deneme neti değildir. Eşikler ANUNEX önerisidir, resmî MEB düzeyi değildir.' },
    outcomes: [...outcomeTitle.entries()].map(([key, o]) => ({ key, ...o })), class: aggregate(perStudent), sections, students: perStudent, pending };
}

export async function handleWrittenReport(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/api\/written-papers\/([^/]+)\/report$/);
  if (!m) return null;
  const { getAuthUser } = await import('./auth');
  const user = await getAuthUser(env, request);
  if (!user) return fail(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  if (!['SUPER_ADMIN', 'INSTITUTION_MANAGER', 'TEACHER'].includes(user.role) || user.must_change_password) return fail(403, 'FORBIDDEN', 'Yazılı raporlarını öğretmen ve okul yöneticisi görür.');
  if (request.method !== 'GET') return fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
  const p = await access(env, user, m[1]);
  if (!p) return fail(404, 'NOT_FOUND', 'Kâğıt bulunamadı veya yetkiniz dışında.');
  if (p.status !== 'FINAL') return fail(409, 'PAPER_NOT_FINAL', 'Rapor kesinleşmiş kâğıttan oluşur.');
  return json({ ok: true, ...(await writtenReport(env, p)) });
}
