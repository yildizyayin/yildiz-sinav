import type { AuthUser, Env } from '../../types';
import { all, one } from '../db';
import { outcomeQuestionTarget, unifiedOutcomeEvidence } from '../unified-outcome-evidence';
import { stageOf } from './map';
import { studentContext } from './sessions';
import { starsOf } from './stars';

/**
 * Bireysel ilerleme (owner, 26 Nov 2026: "daha bireysel ilerlemeler daha bireysel oyunlar"; öğrenciler birbiriyle
 * kıyaslanmaz).
 *  - Ustalık Yıldızları: see ./stars (the karne's own six stages as three stars).
 *  - Kendi Rekorun: a finished play is compared only with the student's own earlier plays of the same outcome.
 *    No other student's result is read or shown.
 */
const pct = (c: number, t: number) => (t ? Math.round((c / t) * 100) : 0);

/** For one finished play: how it compares with this student's own earlier plays of the outcome, and the stars now. */
export async function personalProgress(env: Env, user: AuthUser, sessionId: string) {
  const s = await one<any>(env.DB.prepare(`SELECT id,outcome_id,item_count,correct_count,submitted_at,status FROM lu_sessions WHERE id=? AND student_id=?`).bind(sessionId, user.student_id));
  if (!s || s.status !== 'SUBMITTED') return null;
  const earlier = await all<any>(env.DB.prepare(`SELECT item_count,correct_count,submitted_at FROM lu_sessions
      WHERE student_id=? AND outcome_id=? AND status='SUBMITTED' AND id<>? AND (submitted_at<? OR (submitted_at=? AND rowid<(SELECT rowid FROM lu_sessions WHERE id=?))) ORDER BY submitted_at DESC, rowid DESC LIMIT 50`)
    .bind(user.student_id, s.outcome_id, s.id, s.submitted_at, s.submitted_at, s.id));
  const now = pct(Number(s.correct_count || 0), Number(s.item_count || 0));
  const prev = earlier[0] ? { correct: Number(earlier[0].correct_count || 0), total: Number(earlier[0].item_count || 0), rate: pct(Number(earlier[0].correct_count || 0), Number(earlier[0].item_count || 0)) } : null;
  const bestBefore = earlier.length ? Math.max(...earlier.map((e) => pct(Number(e.correct_count || 0), Number(e.item_count || 0)))) : null;
  const ctx = await studentContext(env, user);
  const ev = (await unifiedOutcomeEvidence(env, user.student_id!, { learnerView: true, target: ctx ? await outcomeQuestionTarget(env, ctx.institution_id) : undefined })).find((e) => e.outcomeId === s.outcome_id);
  const st = stageOf(ev);
  return {
    rate: now, correct: Number(s.correct_count || 0), total: Number(s.item_count || 0),
    first: !earlier.length, previous: prev, change: prev ? now - prev.rate : null,
    bestBefore, newBest: bestBefore != null && now > bestBefore, plays: earlier.length + 1,
    ...starsOf(st.stage, st.reviewDue), stage: st.stage, stageLabel: st.stageLabel,
  };
}
