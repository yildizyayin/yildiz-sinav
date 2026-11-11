import type { AuthUser, Env } from '../../types';
import { all, one, uuid } from '../db';
import { hydrateQuestionMedia } from '../question-content';
import { seenQuestionIds } from '../dejavu';
import { gradeItem } from './grading';

/**
 * Nibiru Öğrenme Evreni sessions (owner, 11 Nov 2026). The selector takes only:
 *  - the student's own grade and school year, an outcome verified in that year's curriculum;
 *  - approved, rights-cleared content of the platform or the student's own institution, linked to that outcome;
 *  - in PRACTICE only questions/content the student has not met; REVIEW may repeat and marks each repeat;
 * and records what it could not fill (lu_content_gaps) instead of inventing, borrowing another grade or outcome.
 * The answer key never leaves the server; results are graded here, once (a resend returns the same result).
 */
export const RIGHTS_OK = ['OWNED', 'LICENSED', 'PUBLIC_DOMAIN'];
const RIGHTS_SQL = `('OWNED','LICENSED','PUBLIC_DOMAIN')`;
const SESSION_HOURS = 2;
export type Mode = 'PRACTICE' | 'REVIEW' | 'FINAL';
type Item = { kind: string; source: 'QUESTION_BANK' | 'GAME_CONTENT'; refId: string; repeat: boolean; pub: any; answer: any };
type Fail = { ok: false; reason: string; available?: number; needed?: number; repeatAvailable?: number };

const shuffle = <T,>(list: T[]) => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const parse = (v: unknown, f: any = null) => { try { return v ? JSON.parse(String(v)) : f; } catch { return f; } };

export async function studentContext(env: Env, user: AuthUser) {
  if (user.role !== 'STUDENT' || !user.student_id || !user.institution_id) return null;
  return one<any>(env.DB.prepare(`SELECT e.id enrollment_id,e.institution_id,e.season_id,e.grade_level,s.academic_year FROM student_enrollments e
    JOIN institution_seasons s ON s.id=e.season_id WHERE e.student_id=? AND e.institution_id=? AND e.status='ACTIVE' ORDER BY e.created_at DESC LIMIT 1`).bind(user.student_id, user.institution_id));
}

export async function verifiedOutcomeFor(env: Env, outcomeId: string, ctx: any) {
  return one<any>(env.DB.prepare(`SELECT o.id,o.code,o.title,o.subject_id,o.curriculum_version_id FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
    WHERE o.id=? AND o.active=1 AND cv.verified=1 AND cv.academic_year=? AND cv.grade_level=? AND o.grade_level=?`).bind(outcomeId, ctx.academic_year, ctx.grade_level, ctx.grade_level));
}

/** Content the platform / the student's institution may serve for this outcome, by kind. */
async function questionPool(env: Env, ctx: any, outcome: any) {
  return all<any>(env.DB.prepare(`SELECT q.id FROM question_bank q
    WHERE q.review_status='APPROVED' AND q.copyright_status IN ${RIGHTS_SQL} AND q.grade_level=? AND (q.subject_id=? OR ? IS NULL)
      AND COALESCE(q.question_type,'MULTIPLE_CHOICE')='MULTIPLE_CHOICE' AND q.correct_answer IS NOT NULL AND q.options_json IS NOT NULL
      AND (q.owner_type='PLATFORM' OR (q.owner_type='INSTITUTION' AND q.owner_id=?))
      AND EXISTS(SELECT 1 FROM question_learning_links l WHERE l.question_id=q.id AND l.node_id='ln_'||?)
    ORDER BY RANDOM() LIMIT 300`).bind(ctx.grade_level, outcome.subject_id, outcome.subject_id, ctx.institution_id, outcome.id));
}
async function contentPool(env: Env, ctx: any, outcome: any, kind: string) {
  return all<any>(env.DB.prepare(`SELECT id,public_json,answer_json FROM lu_game_contents
    WHERE outcome_id=? AND content_kind=? AND review_status='APPROVED' AND copyright_status IN ${RIGHTS_SQL} AND grade_level=? AND academic_year=?
      AND (owner_type='PLATFORM' OR (owner_type='INSTITUTION' AND owner_id=?)) ORDER BY RANDOM() LIMIT 100`).bind(outcome.id, kind, ctx.grade_level, ctx.academic_year, ctx.institution_id));
}
async function playedContentIds(env: Env, studentId: string) {
  const rows = await all<any>(env.DB.prepare(`SELECT DISTINCT i.ref_id FROM lu_session_items i JOIN lu_sessions s ON s.id=i.session_id WHERE s.student_id=? AND i.source='GAME_CONTENT' AND i.answered_at IS NOT NULL`).bind(studentId));
  return new Set(rows.map((r) => r.ref_id as string));
}

function publicQuestion(q: any) {
  const options = parse(q.options_json, []);
  return { stem: q.stem_text, options: (Array.isArray(options) ? options : []).map((o: any, i: number) => ({ key: 'ABCDE'[i], text: typeof o === 'string' ? o : String(o?.text ?? o?.label ?? '') })),
    assets: (q.assets || []).filter((a: any) => a.placement !== 'SOLUTION').map((a: any) => ({ url: a.url, alt: a.alt_text || null, placement: a.placement })),
    blocks: (q.contentBlocks || []).filter((b: any) => b.placement !== 'SOLUTION') };
}
function publicContent(kind: string, pub: any) {
  if (kind === 'PAIRS') return { ...pub, left: shuffle(pub.left || []), right: shuffle(pub.right || []) };
  if (kind === 'SEQUENCE') return { ...pub, items: shuffle(pub.items || []) };
  return pub;
}

async function pickQuestions(env: Env, ctx: any, outcome: any, studentId: string, need: number, allowRepeat: boolean) {
  const [pool, seen] = await Promise.all([questionPool(env, ctx, outcome), seenQuestionIds(env, studentId)]);
  const fresh = pool.filter((q) => !seen.has(q.id)), met = pool.filter((q) => seen.has(q.id));
  const chosen = [...fresh.slice(0, need).map((q) => ({ id: q.id, repeat: false })), ...(allowRepeat ? met.slice(0, Math.max(0, need - fresh.length)).map((q) => ({ id: q.id, repeat: true })) : [])];
  if (!chosen.length) return { items: [] as Item[], fresh: fresh.length, met: met.length };
  const rows = await all<any>(env.DB.prepare(`SELECT id,stem_text,options_json,correct_answer,content_mode FROM question_bank WHERE id IN (${chosen.map(() => '?').join(',')})`).bind(...chosen.map((c) => c.id)));
  const hydrated = await hydrateQuestionMedia(env, rows);
  const items: Item[] = chosen.map((c) => { const q = hydrated.find((r: any) => r.id === c.id); return { kind: 'QUESTION', source: 'QUESTION_BANK' as const, refId: c.id, repeat: c.repeat, pub: publicQuestion(q), answer: { correct: String(q.correct_answer || '').trim().toUpperCase() } }; });
  return { items, fresh: fresh.length, met: met.length };
}
async function pickContents(env: Env, ctx: any, outcome: any, studentId: string, kind: string, need: number, allowRepeat: boolean) {
  const [pool, played] = await Promise.all([contentPool(env, ctx, outcome, kind), playedContentIds(env, studentId)]);
  const fresh = pool.filter((c) => !played.has(c.id)), met = pool.filter((c) => played.has(c.id));
  const chosen = [...fresh.slice(0, need).map((c) => ({ c, repeat: false })), ...(allowRepeat ? met.slice(0, Math.max(0, need - fresh.length)).map((c) => ({ c, repeat: true })) : [])];
  const items: Item[] = chosen.map(({ c, repeat }) => ({ kind, source: 'GAME_CONTENT' as const, refId: c.id, repeat, pub: publicContent(kind, parse(c.public_json, {})), answer: parse(c.answer_json, {}) }));
  return { items, fresh: fresh.length, met: met.length };
}

async function recordGap(env: Env, ctx: any, outcome: any, kind: string, needed: number, available: number) {
  await env.DB.prepare(`INSERT INTO lu_content_gaps(academic_year,grade_level,subject_id,outcome_id,template_kind,needed,available) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(academic_year,outcome_id,template_kind) DO UPDATE SET hits=hits+1,needed=excluded.needed,available=excluded.available,last_seen_at=CURRENT_TIMESTAMP`)
    .bind(ctx.academic_year, ctx.grade_level, outcome.subject_id ?? null, outcome.id, kind, needed, available).run();
}

export async function startUniverseSession(env: Env, user: AuthUser, body: any): Promise<{ ok: true; sessionId: string; reused: boolean } | Fail> {
  const ctx = await studentContext(env, user);
  if (!ctx) return { ok: false, reason: 'STUDENT_ONLY' };
  const clientKey = typeof body?.clientKey === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(body.clientKey) ? body.clientKey : null;
  if (clientKey) {
    const prior = await one<any>(env.DB.prepare(`SELECT id FROM lu_sessions WHERE student_id=? AND client_key=?`).bind(user.student_id, clientKey));
    if (prior) return { ok: true, sessionId: prior.id, reused: true };
  }
  const template = await one<any>(env.DB.prepare(`SELECT * FROM lu_game_templates WHERE code=? AND active=1`).bind(String(body?.templateCode || '')));
  if (!template) return { ok: false, reason: 'TEMPLATE_NOT_FOUND' };
  if (ctx.grade_level < template.min_grade || ctx.grade_level > template.max_grade) return { ok: false, reason: 'TEMPLATE_NOT_FOR_GRADE' };
  const outcome = await verifiedOutcomeFor(env, String(body?.outcomeId || ''), ctx);
  if (!outcome) return { ok: false, reason: 'OUTCOME_NOT_VERIFIED' };
  const mode: Mode = template.kind === 'FINAL' ? 'FINAL' : body?.mode === 'REVIEW' ? 'REVIEW' : 'PRACTICE';
  const allowRepeat = mode === 'REVIEW';
  const need = Math.max(template.min_items, Math.min(template.max_items, Number(body?.itemCount) || template.max_items));
  let items: Item[] = [];
  if (template.kind === 'FINAL') {
    // a final uses at least two different activity kinds of the same outcome, all new to the student
    const per = 2, kinds = ['QUESTION', 'PAIRS', 'SEQUENCE', 'CLOZE', 'STEPS'];
    const parts = await Promise.all(kinds.map((k) => k === 'QUESTION' ? pickQuestions(env, ctx, outcome, user.student_id!, per + 2, false) : pickContents(env, ctx, outcome, user.student_id!, k, per, false)));
    const usedKinds = parts.filter((p) => p.items.length > 0);
    items = parts.flatMap((p) => p.items).slice(0, template.max_items);
    if (usedKinds.length < 2 || items.length < template.min_items) { await recordGap(env, ctx, outcome, 'FINAL', template.min_items, items.length); return { ok: false, reason: 'CONTENT_GAP', available: items.length, needed: template.min_items }; }
  } else {
    const picked = template.content_kind === 'QUESTION' ? await pickQuestions(env, ctx, outcome, user.student_id!, need, allowRepeat)
      : template.content_kind === 'AUDIO_QUESTION' || ['PAIRS', 'SEQUENCE', 'CLOZE', 'HOTSPOT', 'STEPS'].includes(template.content_kind) ? await pickContents(env, ctx, outcome, user.student_id!, template.content_kind, need, allowRepeat)
      : { items: [], fresh: 0, met: 0 };
    items = picked.items;
    if (items.length < template.min_items) {
      await recordGap(env, ctx, outcome, template.kind, template.min_items, picked.fresh);
      return { ok: false, reason: 'CONTENT_GAP', available: picked.fresh, needed: template.min_items, repeatAvailable: allowRepeat ? undefined : picked.met };
    }
  }
  const id = uuid('lus');
  const timed = template.seconds_per_item != null && body?.timed !== false ? 1 : 0;
  const st: D1PreparedStatement[] = [env.DB.prepare(`INSERT INTO lu_sessions(id,student_id,institution_id,season_id,academic_year,grade_level,template_code,outcome_id,curriculum_version_id,mode,timed,item_count,client_key,expires_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now',?))`).bind(id, user.student_id, ctx.institution_id, ctx.season_id, ctx.academic_year, ctx.grade_level, template.code, outcome.id, outcome.curriculum_version_id, mode, timed, items.length, clientKey, `+${SESSION_HOURS} hours`)];
  items.forEach((it, k) => st.push(env.DB.prepare(`INSERT INTO lu_session_items(session_id,seq,kind,source,ref_id,repeat,public_json,answer_json) VALUES(?,?,?,?,?,?,?,?)`).bind(id, k + 1, it.kind, it.source, it.refId, it.repeat ? 1 : 0, JSON.stringify(it.pub), JSON.stringify(it.answer))));
  try { await env.DB.batch(st); }
  catch (e) {
    if (clientKey && /UNIQUE/.test(String(e))) { const prior = await one<any>(env.DB.prepare(`SELECT id FROM lu_sessions WHERE student_id=? AND client_key=?`).bind(user.student_id, clientKey)); if (prior) return { ok: true, sessionId: prior.id, reused: true }; }
    throw e;
  }
  return { ok: true, sessionId: id, reused: false };
}

export async function universeSessionView(env: Env, user: AuthUser, id: string) {
  const s = await one<any>(env.DB.prepare(`SELECT s.*,t.kind template_kind,t.title template_title,t.seconds_per_item,o.code outcome_code,o.title outcome_title FROM lu_sessions s
    JOIN lu_game_templates t ON t.code=s.template_code JOIN outcomes o ON o.id=s.outcome_id WHERE s.id=? AND s.student_id=?`).bind(id, user.student_id));
  if (!s) return null;
  const rows = await all<any>(env.DB.prepare(`SELECT seq,kind,repeat,public_json,answer_json,response_json,correct,partial FROM lu_session_items WHERE session_id=? ORDER BY seq`).bind(id));
  const done = s.status === 'SUBMITTED';
  return {
    ok: true,
    session: { id: s.id, status: s.status, mode: s.mode, template: { code: s.template_code, kind: s.template_kind, title: s.template_title }, outcome: { id: s.outcome_id, code: s.outcome_code, title: s.outcome_title },
      timed: !!s.timed, secondsPerItem: s.timed ? s.seconds_per_item : null, itemCount: s.item_count, answered: s.answered_count, correct: s.correct_count, xp: s.xp_awarded, expiresAt: s.expires_at },
    items: rows.map((r) => ({ seq: r.seq, kind: r.kind, repeat: !!r.repeat, content: parse(r.public_json, {}), ...(done ? { response: parse(r.response_json), correct: r.correct == null ? null : !!r.correct, partial: r.partial, key: parse(r.answer_json, {}) } : {}) })),
  };
}

/** XP for a finished play: a reward for doing it, never read as accuracy. Paid once per session. */
export function universeXp(correct: number, total: number) { return total ? 10 + Math.round((correct / total) * 20) : 0; }

export async function submitUniverseSession(env: Env, user: AuthUser, id: string, body: any): Promise<{ ok: true } | Fail> {
  const s = await one<any>(env.DB.prepare(`SELECT * FROM lu_sessions WHERE id=? AND student_id=?`).bind(id, user.student_id));
  if (!s) return { ok: false, reason: 'SESSION_NOT_FOUND' };
  if (s.status === 'SUBMITTED') return { ok: true };                       // a resend changes nothing
  if (s.status !== 'OPEN' || String(s.expires_at) < new Date().toISOString().replace('T', ' ').slice(0, 19)) return { ok: false, reason: 'SESSION_EXPIRED' };
  const given = new Map<number, any>();
  for (const a of Array.isArray(body?.answers) ? body.answers : []) { const seq = Number(a?.seq); if (Number.isInteger(seq) && !given.has(seq) && JSON.stringify(a?.response ?? null).length <= 4000) given.set(seq, a?.response ?? null); }
  const rows = await all<any>(env.DB.prepare(`SELECT seq,kind,answer_json FROM lu_session_items WHERE session_id=? ORDER BY seq`).bind(id));
  const st: D1PreparedStatement[] = [];
  let answered = 0, correct = 0;
  for (const r of rows) {
    const response = given.get(r.seq);
    const blank = response == null || (typeof response === 'object' && !Object.values(response).some((v) => v != null && v !== '' && !(Array.isArray(v) && !v.length)));
    if (blank) { st.push(env.DB.prepare(`UPDATE lu_session_items SET response_json=NULL,correct=NULL,partial=NULL,answered_at=NULL WHERE session_id=? AND seq=?`).bind(id, r.seq)); continue; }
    const g = gradeItem(r.kind, parse(r.answer_json, {}), response);
    answered++; if (g.correct) correct++;
    st.push(env.DB.prepare(`UPDATE lu_session_items SET response_json=?,correct=?,partial=?,answered_at=CURRENT_TIMESTAMP WHERE session_id=? AND seq=?`).bind(JSON.stringify(response), g.correct ? 1 : 0, Math.round(g.partial * 1000) / 1000, id, r.seq));
  }
  const xp = universeXp(correct, rows.length);
  // the status guard makes a second, simultaneous submit a no-op; the ledger key makes XP once-only
  const claim = await env.DB.prepare(`UPDATE lu_sessions SET status='SUBMITTED',answered_count=?,correct_count=?,xp_awarded=?,submitted_at=CURRENT_TIMESTAMP WHERE id=? AND status='OPEN'`).bind(answered, correct, xp, id).run();
  if (!Number(claim.meta?.changes || 0)) return { ok: true };
  st.push(env.DB.prepare(`INSERT OR IGNORE INTO lu_xp_ledger(student_id,source_type,source_id,xp,reason) VALUES(?,?,?,?,?)`).bind(user.student_id, 'LU_SESSION', id, xp, 'Öğrenme Evreni etkinliği'));
  st.push(env.DB.prepare(`INSERT INTO gamification_profiles(student_id,xp,level,last_activity_date) VALUES(?,?,1,date('now','+3 hours'))
    ON CONFLICT(student_id) DO UPDATE SET xp=xp+excluded.xp,last_activity_date=excluded.last_activity_date,updated_at=CURRENT_TIMESTAMP`).bind(user.student_id, xp));
  await env.DB.batch(st);
  return { ok: true };
}
