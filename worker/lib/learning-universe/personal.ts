import type { AuthUser, Env } from '../../types';
import { all, one } from '../db';

/**
 * Bireysel ilerleme, ikinci adım (owner, 26 Nov 2026: "harika devam edelim"). Everything here is about one student
 * alone; nothing is compared with anyone else.
 *  - Uyarlanır zorluk: the next play of an outcome starts near the level that fits the student now, worked out from
 *    their own last 10 graded answers on it, nudged by their own "Ne öğrendim?" answer.
 *  - Kendi hedefin: a daily goal the student picks (1, 2 or 3 plays, about 5, 10 or 15 minutes).
 *  - Ne öğrendim?: one tap after a play; "Tekrar etmeliyim" brings the outcome back as a review suggestion.
 */
export const REFLECTIONS = ['EASY', 'HARD', 'AGAIN'] as const;
export type Reflection = typeof REFLECTIONS[number];

/** The level (1 easy … 5 hard) the next play of this outcome should start near. */
export async function targetLevel(env: Env, studentId: string, outcomeId: string) {
  const rows = await all<any>(env.DB.prepare(`SELECT i.correct FROM lu_session_items i JOIN lu_sessions s ON s.id=i.session_id
      WHERE s.student_id=? AND s.outcome_id=? AND s.status='SUBMITTED' AND i.correct IS NOT NULL ORDER BY i.answered_at DESC LIMIT 10`).bind(studentId, outcomeId));
  const rate = rows.length ? rows.filter((r) => r.correct).length / rows.length : null;
  let level = rate == null ? 2 : rate >= 0.85 ? 4 : rate >= 0.65 ? 3 : 2;
  const last = await one<any>(env.DB.prepare(`SELECT reflection FROM lu_sessions WHERE student_id=? AND outcome_id=? AND status='SUBMITTED' AND reflection IS NOT NULL
      AND submitted_at>=datetime('now','-14 days') ORDER BY submitted_at DESC LIMIT 1`).bind(studentId, outcomeId));
  if (last?.reflection === 'EASY') level += 1;
  if (last?.reflection === 'HARD' || last?.reflection === 'AGAIN') level -= 1;
  return Math.max(1, Math.min(5, level));
}

/** Nearest level first; the pool's own (random) order breaks ties, so plays still differ. A missing level counts as 3. */
export function byLevel<T>(pool: T[], target: number, levelOf: (x: T) => number | null | undefined): T[] {
  const lv = (x: T) => { const n = Number(levelOf(x)); return Number.isFinite(n) && n > 0 ? Math.min(5, n) : 3; };
  return pool.map((x, k) => ({ x, k, d: Math.abs(lv(x) - target) })).sort((a, b) => a.d - b.d || a.k - b.k).map((e) => e.x);
}

export async function setReflection(env: Env, user: AuthUser, sessionId: string, value: unknown) {
  if (user.role !== 'STUDENT' || !user.student_id) return { ok: false as const, reason: 'STUDENT_ONLY' };
  if (!REFLECTIONS.includes(value as Reflection)) return { ok: false as const, reason: 'INVALID_REFLECTION' };
  const r = await env.DB.prepare(`UPDATE lu_sessions SET reflection=? WHERE id=? AND student_id=? AND status='SUBMITTED'`).bind(value, sessionId, user.student_id).run();
  return Number(r.meta?.changes || 0) ? { ok: true as const, reflection: value as Reflection } : { ok: false as const, reason: 'SESSION_NOT_FOUND' };
}

export async function dailyGoal(env: Env, studentId: string) {
  const [g, d] = await Promise.all([
    one<any>(env.DB.prepare(`SELECT plays FROM lu_daily_goals WHERE student_id=?`).bind(studentId)),
    one<any>(env.DB.prepare(`SELECT count(*) n FROM lu_sessions WHERE student_id=? AND status='SUBMITTED' AND date(submitted_at,'+3 hours')=date('now','+3 hours')`).bind(studentId)),
  ]);
  const plays = g ? Number(g.plays) : null, done = Number(d?.n || 0);
  return { plays, done, reached: plays != null && done >= plays };
}

export async function setDailyGoal(env: Env, user: AuthUser, value: unknown) {
  if (user.role !== 'STUDENT' || !user.student_id) return { ok: false as const, reason: 'STUDENT_ONLY' };
  const plays = Number(value);
  if (![1, 2, 3].includes(plays)) return { ok: false as const, reason: 'INVALID_GOAL' };
  await env.DB.prepare(`INSERT INTO lu_daily_goals(student_id,plays) VALUES(?,?) ON CONFLICT(student_id) DO UPDATE SET plays=excluded.plays,updated_at=CURRENT_TIMESTAMP`).bind(user.student_id, plays).run();
  return { ok: true as const, ...(await dailyGoal(env, user.student_id)) };
}

/** Outcomes the student said they should repeat in the last 7 days, newest first. */
export async function againOutcomes(env: Env, studentId: string) {
  // only where the latest play of the outcome ended with "Tekrar etmeliyim": a later play answers it
  const rows = await all<any>(env.DB.prepare(`SELECT outcome_id FROM (SELECT outcome_id, reflection, submitted_at, ROW_NUMBER() OVER (PARTITION BY outcome_id ORDER BY submitted_at DESC, rowid DESC) rn
      FROM lu_sessions WHERE student_id=? AND status='SUBMITTED' AND submitted_at>=datetime('now','-7 days')) WHERE rn=1 AND reflection='AGAIN' ORDER BY submitted_at DESC`).bind(studentId));
  return rows.map((r) => r.outcome_id as string);
}
