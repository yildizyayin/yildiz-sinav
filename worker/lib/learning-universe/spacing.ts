import type { Env } from '../../types';
import { all } from '../db';

/**
 * Tazelik motoru, aralıklı tekrar (oyun yol haritası, Aşama 1; owner 25 Nov 2026). PRACTICE never repeats what the
 * student met; when a play may repeat (REVIEW, or a pool that has run dry with repeats allowed), this decides WHICH
 * repeat comes first:
 *  1. a mistake whose turn has come: 1 day after the first wrong answer, 3 after the second, 7 after the third and on;
 *  2. something met elsewhere (an exam, a book) but never played here;
 *  3. a mistake whose turn has not come yet;
 *  4. what was answered right, the longest ago first.
 * Nothing is stored for it: the order is worked out from the student's own graded answers.
 */
export const SPACING_DAYS = [1, 3, 7];
type Hist = { lastCorrect: boolean; lastAt: number; wrongRun: number };

export async function playHistory(env: Env, studentId: string, source: 'QUESTION_BANK' | 'GAME_CONTENT') {
  const rows = await all<any>(env.DB.prepare(`SELECT i.ref_id, i.correct, i.answered_at FROM lu_session_items i JOIN lu_sessions s ON s.id=i.session_id
      WHERE s.student_id=? AND i.source=? AND i.answered_at IS NOT NULL AND i.correct IS NOT NULL ORDER BY i.answered_at`).bind(studentId, source));
  const h = new Map<string, Hist>();
  for (const r of rows) {
    const at = Date.parse(`${String(r.answered_at).replace(' ', 'T')}Z`);
    const prev = h.get(r.ref_id);
    const ok = !!r.correct;
    h.set(r.ref_id, { lastCorrect: ok, lastAt: Number.isFinite(at) ? at : 0, wrongRun: ok ? 0 : (prev && !prev.lastCorrect ? prev.wrongRun : 0) + 1 });
  }
  return h;
}

export function dueAfterDays(wrongRun: number) { return SPACING_DAYS[Math.min(SPACING_DAYS.length, Math.max(1, wrongRun)) - 1]; }

/** Orders repeat candidates (anything with an `id`) for one student; the input order breaks ties. */
export function reviewOrder<T extends { id: string }>(met: T[], hist: Map<string, Hist>, now = Date.now()): T[] {
  const rank = (x: T): [number, number] => {
    const h = hist.get(x.id);
    if (!h) return [1, 0];
    if (!h.lastCorrect) { const due = h.lastAt + dueAfterDays(h.wrongRun) * 864e5; return due <= now ? [0, due] : [2, due]; }
    return [3, h.lastAt];
  };
  return met.map((x, k) => ({ x, k, r: rank(x) })).sort((a, b) => a.r[0] - b.r[0] || a.r[1] - b.r[1] || a.k - b.k).map((e) => e.x);
}
