import type { AuthUser, Env } from '../../types';
import { all, audit, one, uuid } from '../db';
import { seenQuestionIds } from '../dejavu';
import { hydrateQuestionMedia } from '../question-content';
import { outcomeQuestionTarget, unifiedOutcomeEvidence } from '../unified-outcome-evidence';
import { stageOf, type Stage } from './map';
import { studentContext } from './sessions';

/**
 * Nibiru denemesi (owner, 11 Nov 2026: "Nibiru 10/20 soruluk sınavlar"). A 10 or 20 question practice exam from the
 * student's own grade and school year, verified MEB outcomes only, approved and rights-cleared multiple-choice bank
 * questions only, never a question the student has met before. Outcomes that need work come first (review due,
 * developing, started, consolidating, then new ones), spread across outcomes. Graded here; every answer goes into the
 * karne as question practice. Too few questions → it says how many exist; nothing is filled in.
 */
export const EXAM_SIZES = [10, 20] as const;
const RIGHTS = `('OWNED','LICENSED','PUBLIC_DOMAIN')`;
const PRIORITY: Stage[] = ['REVIEW_NEEDED', 'DEVELOPING', 'STARTED', 'CONSOLIDATING', 'NO_DATA', 'LEARNED'];
const parse = <T,>(v: string | null, f: T): T => { try { return v ? JSON.parse(v) : f; } catch { return f; } };
const letter = (v: unknown) => String(v ?? '').trim().toLocaleUpperCase('tr-TR');
type Fail = { ok: false; reason: string; available?: number; needed?: number };

export async function startNibiruExam(env: Env, user: AuthUser, body: any): Promise<{ ok: true; examId: string; reused: boolean } | Fail> {
  const ctx = await studentContext(env, user);
  if (!ctx) return { ok: false, reason: 'STUDENT_ONLY' };
  const count = Number(body?.questionCount);
  if (!(EXAM_SIZES as readonly number[]).includes(count)) return { ok: false, reason: 'INVALID_SIZE' };
  const subjectId = body?.subjectId ? String(body.subjectId) : null;
  const clientKey = typeof body?.clientKey === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(body.clientKey) ? body.clientKey : null;
  if (clientKey) {
    const prior = await one<any>(env.DB.prepare(`SELECT id FROM nibiru_practice_exams WHERE student_id=? AND client_key=?`).bind(user.student_id, clientKey));
    if (prior) return { ok: true, examId: prior.id, reused: true };
  }
  const [pool, seen, evidence] = await Promise.all([
    all<any>(env.DB.prepare(`SELECT q.id,o.id outcome_id FROM question_bank q JOIN question_learning_links l ON l.question_id=q.id
      JOIN outcomes o ON l.node_id='ln_'||o.id JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
      WHERE o.active=1 AND cv.verified=1 AND cv.academic_year=? AND cv.grade_level=? AND o.grade_level=? AND (? IS NULL OR o.subject_id=?)
        AND q.review_status='APPROVED' AND q.copyright_status IN ${RIGHTS} AND q.grade_level=?
        AND COALESCE(q.question_type,'MULTIPLE_CHOICE')='MULTIPLE_CHOICE' AND q.correct_answer IS NOT NULL AND q.options_json IS NOT NULL
        AND (q.owner_type='PLATFORM' OR (q.owner_type='INSTITUTION' AND q.owner_id=?))
      ORDER BY RANDOM() LIMIT 3000`).bind(ctx.academic_year, ctx.grade_level, ctx.grade_level, subjectId, subjectId, ctx.grade_level, ctx.institution_id)),
    seenQuestionIds(env, user.student_id!),
    (async () => unifiedOutcomeEvidence(env, user.student_id!, { learnerView: true, target: await outcomeQuestionTarget(env, ctx.institution_id) }))(),
  ]);
  const byOutcome = new Map<string, string[]>(), taken = new Set<string>();
  for (const r of pool) {
    if (seen.has(r.id) || taken.has(r.id)) continue;                       // a question linked to two outcomes is used once
    taken.add(r.id);
    const list = byOutcome.get(r.outcome_id) || []; list.push(r.id); byOutcome.set(r.outcome_id, list);
  }
  const available = taken.size;
  if (available < count) return { ok: false, reason: 'NOT_ENOUGH_QUESTIONS', available, needed: count };
  const now = Date.now(), evBy = new Map(evidence.map((e) => [e.outcomeId, e]));
  const rank = (id: string) => { const st = stageOf(evBy.get(id), now); return PRIORITY.indexOf(st.stage) - (st.reviewDue ? 0.5 : 0); };
  const order = [...byOutcome.keys()].sort((a, b) => rank(a) - rank(b));
  // round-robin over the outcomes in priority order: weaker outcomes first, no outcome takes the whole exam
  const chosen: Array<{ id: string; outcomeId: string }> = [];
  for (let round = 0; chosen.length < count; round++) {
    let added = false;
    for (const oid of order) { const q = byOutcome.get(oid)![round]; if (q && chosen.length < count) { chosen.push({ id: q, outcomeId: oid }); added = true; } }
    if (!added) break;
  }
  const rows = await all<any>(env.DB.prepare(`SELECT id,stem_text,options_json,correct_answer,solution_text,content_mode,option_count FROM question_bank WHERE id IN (${chosen.map(() => '?').join(',')})`).bind(...chosen.map((c) => c.id)));
  const hydrated = await hydrateQuestionMedia(env, rows);
  const id = uuid('nex');
  const st: D1PreparedStatement[] = [env.DB.prepare(`INSERT INTO nibiru_practice_exams(id,student_id,institution_id,season_id,academic_year,grade_level,subject_id,question_count,client_key) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(id, user.student_id, ctx.institution_id, ctx.season_id, ctx.academic_year, ctx.grade_level, subjectId, count, clientKey)];
  chosen.forEach((c, k) => { const q = hydrated.find((r: any) => r.id === c.id); st.push(env.DB.prepare(`INSERT INTO nibiru_practice_exam_items(exam_id,seq,question_id,outcome_id,snapshot_json) VALUES(?,?,?,?,?)`).bind(id, k + 1, c.id, c.outcomeId, JSON.stringify(q))); });
  // shown questions count as met, so a later book or game measures with new ones
  chosen.forEach((c) => st.push(env.DB.prepare(`INSERT OR IGNORE INTO coach_question_exposures(student_id,question_id) VALUES(?,?)`).bind(user.student_id, c.id)));
  try { await env.DB.batch(st); }
  catch (e) {
    if (clientKey && /UNIQUE/.test(String(e))) { const prior = await one<any>(env.DB.prepare(`SELECT id FROM nibiru_practice_exams WHERE student_id=? AND client_key=?`).bind(user.student_id, clientKey)); if (prior) return { ok: true, examId: prior.id, reused: true }; }
    throw e;
  }
  return { ok: true, examId: id, reused: false };
}

function optionsOf(q: any) {
  const o = parse<any[]>(q.options_json, []);
  return (Array.isArray(o) ? o : []).map((x: any, i: number) => ({ key: 'ABCDE'[i], text: typeof x === 'string' ? x : String(x?.text ?? x?.label ?? '') }));
}

export async function nibiruExamView(env: Env, user: AuthUser, examId: string) {
  const e = await one<any>(env.DB.prepare(`SELECT x.*,s.name subject_name FROM nibiru_practice_exams x LEFT JOIN subjects s ON s.id=x.subject_id WHERE x.id=? AND x.student_id=?`).bind(examId, user.student_id));
  if (!e) return null;
  const rows = await all<any>(env.DB.prepare(`SELECT i.seq,i.question_id,i.outcome_id,i.snapshot_json,i.student_answer,i.correct,o.code,o.title,COALESCE(sb.name,'Ders') subject_name FROM nibiru_practice_exam_items i
    JOIN outcomes o ON o.id=i.outcome_id LEFT JOIN subjects sb ON sb.id=o.subject_id WHERE i.exam_id=? ORDER BY i.seq`).bind(examId));
  const done = e.status === 'SUBMITTED';
  const items = rows.map((r) => {
    const q = parse<any>(r.snapshot_json, {});
    return { seq: r.seq, outcome: { id: r.outcome_id, code: r.code, title: r.title, subjectName: r.subject_name }, stem: q.stem_text, options: optionsOf(q),
      assets: (q.assets || []).filter((a: any) => a.placement !== 'SOLUTION').map((a: any) => ({ url: a.url, alt: a.alt_text || null, placement: a.placement })),
      blocks: (q.contentBlocks || []).filter((b: any) => b.placement !== 'SOLUTION'),
      ...(done ? { answer: r.student_answer, correct: !!r.correct, key: letter(q.correct_answer), solution: q.solution_text || null } : {}) };
  });
  const outcomes = done ? [...rows.reduce((m, r) => { const k = m.get(r.outcome_id) || { id: r.outcome_id, code: r.code, title: r.title, subjectName: r.subject_name, total: 0, correct: 0 }; k.total++; if (r.correct) k.correct++; m.set(r.outcome_id, k); return m; }, new Map<string, any>()).values()] : undefined;
  return { ok: true, exam: { id: e.id, status: e.status, questionCount: e.question_count, subjectName: e.subject_name, correct: e.correct_count, blank: e.blank_count, scorePercent: e.score_percent, createdAt: e.created_at, submittedAt: e.submitted_at }, items, outcomes };
}

export async function submitNibiruExam(env: Env, user: AuthUser, examId: string, body: any): Promise<{ ok: true } | Fail> {
  const e = await one<any>(env.DB.prepare(`SELECT * FROM nibiru_practice_exams WHERE id=? AND student_id=?`).bind(examId, user.student_id));
  if (!e) return { ok: false, reason: 'EXAM_NOT_FOUND' };
  if (e.status === 'SUBMITTED') return { ok: true };                                  // a resend changes nothing
  const rows = await all<any>(env.DB.prepare(`SELECT seq,question_id,snapshot_json FROM nibiru_practice_exam_items WHERE exam_id=? ORDER BY seq`).bind(examId));
  const given = new Map<number, string>((Array.isArray(body?.answers) ? body.answers : []).map((a: any) => [Number(a?.seq), letter(a?.answer)]));
  if (rows.some((r) => !given.has(r.seq))) return { ok: false, reason: 'ALL_QUESTIONS_REQUIRED' };   // a blank is sent as ''
  const graded = rows.map((r) => { const q = parse<any>(r.snapshot_json, {}); const a = given.get(r.seq) || ''; const valid = /^[A-E]$/.test(a) ? a : ''; return { ...r, a: valid, ok: !!valid && valid === letter(q.correct_answer) }; });
  const correct = graded.filter((g) => g.ok).length, blank = graded.filter((g) => !g.a).length;
  const score = Math.round((correct / Math.max(1, graded.length)) * 1000) / 10;
  const st: D1PreparedStatement[] = graded.map((g) => env.DB.prepare(`UPDATE nibiru_practice_exam_items SET student_answer=?,correct=? WHERE exam_id=? AND seq=? AND EXISTS(SELECT 1 FROM nibiru_practice_exams WHERE id=? AND status='READY')`).bind(g.a || null, g.ok ? 1 : 0, examId, g.seq, examId));
  // the karne reads these as question practice (one evidence per answered question; a blank is not an answer)
  for (const g of graded) if (g.a) st.push(env.DB.prepare(`INSERT INTO question_practice_attempts(id,student_id,question_id,selected_answer,is_correct) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM nibiru_practice_exams WHERE id=? AND status='READY')`).bind(uuid('qpa'), user.student_id, g.question_id, g.a, g.ok ? 1 : 0, examId));
  st.push(env.DB.prepare(`UPDATE nibiru_practice_exams SET status='SUBMITTED',correct_count=?,blank_count=?,score_percent=?,submitted_at=CURRENT_TIMESTAMP WHERE id=? AND status='READY'`).bind(correct, blank, score, examId));
  await env.DB.batch(st);
  await audit(env.DB, user.id, e.institution_id, 'NIBIRU_EXAM_SUBMITTED', 'nibiru_practice_exam', examId, { questions: graded.length, correct });
  return { ok: true };
}

export async function listNibiruExams(env: Env, user: AuthUser) {
  return all<any>(env.DB.prepare(`SELECT x.id,x.status,x.question_count,x.correct_count,x.score_percent,x.created_at,x.submitted_at,s.name subject_name FROM nibiru_practice_exams x LEFT JOIN subjects s ON s.id=x.subject_id
    WHERE x.student_id=? ORDER BY x.created_at DESC LIMIT 20`).bind(user.student_id));
}
