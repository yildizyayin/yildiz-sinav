import type { AuthUser, Env } from '../../types';
import { one } from '../db';
import { gradeItem } from './grading';

/**
 * Öğrenme Evreni, animasyonlu oyunlar (owner, 25 Nov 2026: "Aşama 0"). One answer is checked on the server the moment
 * the student gives it, so the game can react at once (Meteor Avı, Takımyıldız, Roket Montajı) while the key still
 * never travels before the answer. The first check locks the item: a second check returns the same result and the
 * final submit keeps the locked answer, so trying again cannot raise the grade. XP is still paid once, at submit.
 */
type Fail = { ok: false; reason: string };
const parse = (v: unknown, f: any = null) => { try { return v ? JSON.parse(String(v)) : f; } catch { return f; } };
const blank = (r: any) => r == null || (typeof r === 'object' && !Object.values(r).some((v) => v != null && v !== '' && !(Array.isArray(v) && !v.length)));

async function explanationFor(env: Env, row: any, answer: any): Promise<string | null> {
  if (typeof answer?.explanation === 'string' && answer.explanation.trim()) return answer.explanation.trim().slice(0, 400);
  if (row.source !== 'QUESTION_BANK') return null;
  const q = await one<any>(env.DB.prepare(`SELECT solution_text FROM question_bank WHERE id=?`).bind(row.ref_id));
  const text = String(q?.solution_text || '').trim();
  return text ? text.slice(0, 400) : null;
}

export async function checkUniverseItem(env: Env, user: AuthUser, sessionId: string, seqRaw: string, body: any)
  : Promise<{ ok: true; seq: number; correct: boolean; partial: number; key: any; explanation: string | null; locked: boolean } | Fail> {
  if (user.role !== 'STUDENT' || !user.student_id) return { ok: false, reason: 'STUDENT_ONLY' };
  const s = await one<any>(env.DB.prepare(`SELECT id,status,expires_at FROM lu_sessions WHERE id=? AND student_id=?`).bind(sessionId, user.student_id));
  if (!s) return { ok: false, reason: 'SESSION_NOT_FOUND' };
  const seq = Number(seqRaw);
  const row = Number.isInteger(seq) ? await one<any>(env.DB.prepare(`SELECT seq,kind,source,ref_id,answer_json,response_json,correct,partial,answered_at FROM lu_session_items WHERE session_id=? AND seq=?`).bind(sessionId, seq)) : null;
  if (!row) return { ok: false, reason: 'ITEM_NOT_FOUND' };
  const answer = parse(row.answer_json, {});
  // already checked (or the play is over): the stored result, never a regrade
  if (row.answered_at || s.status === 'SUBMITTED') {
    if (row.correct == null) return { ok: false, reason: 'ITEM_LOCKED' };
    return { ok: true, seq, correct: !!row.correct, partial: Number(row.partial || 0), key: answer, explanation: await explanationFor(env, row, answer), locked: true };
  }
  if (s.status !== 'OPEN' || String(s.expires_at) < new Date().toISOString().replace('T', ' ').slice(0, 19)) return { ok: false, reason: 'SESSION_EXPIRED' };
  const response = body?.response ?? null;
  if (blank(response) || JSON.stringify(response).length > 4000) return { ok: false, reason: 'ANSWER_REQUIRED' };
  const g = gradeItem(row.kind, answer, response);
  const partial = Math.round(g.partial * 1000) / 1000;
  // the answered_at guard makes two simultaneous checks of one item land once
  const r = await env.DB.prepare(`UPDATE lu_session_items SET response_json=?,correct=?,partial=?,answered_at=CURRENT_TIMESTAMP WHERE session_id=? AND seq=? AND answered_at IS NULL`)
    .bind(JSON.stringify(response), g.correct ? 1 : 0, partial, sessionId, seq).run();
  if (!Number(r.meta?.changes || 0)) return checkUniverseItem(env, user, sessionId, seqRaw, body);
  return { ok: true, seq, correct: g.correct, partial, key: answer, explanation: await explanationFor(env, row, answer), locked: false };
}
