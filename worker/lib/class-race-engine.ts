/**
 * Sınıf Uzay Yarışı, the rules (owner, 25–26 Nov 2026: "yap", "En iyi şekilde yap izin veriyorum"). Pure functions on
 * one race's state, so the live room (a Durable Object) and the tests run the very same rules:
 *  - only students on the class roster can join; the teacher's board drives the questions;
 *  - one answer per student per question, only while the question is open; the key never leaves the room before the
 *    question closes;
 *  - a point for a correct answer and nothing for speed (owner: hız başarı sayılmaz);
 *  - the board sees everyone, a phone sees only its own answer, score and rank.
 */
export type RaceQuestion = { id: string; stem: string; options: Array<{ key: string; text: string }>; assets: Array<{ url: string; alt: string | null }>; correct: string };
export type RacePhase = 'LOBBY' | 'QUESTION' | 'REVEAL' | 'FINISHED';
export type RaceState = {
  id: string; code: string; className: string; outcome: { id: string; code: string | null; title: string };
  seconds: number; questions: RaceQuestion[];
  roster: Record<string, string>;                       // studentId → shown name ("Ece K.")
  phase: RacePhase; qi: number; deadline: number | null;
  players: Record<string, { name: string; joinedAt: number }>;
  answers: Record<number, Record<string, { key: string; at: number }>>;
  scores: Record<string, number>;
  startedAt: number | null; finishedAt: number | null;
};
export type Fail = { ok: false; reason: string };
export const RACE_GRACE_MS = 1500;                       // a tap sent in the last moment still counts

export function newRace(init: Omit<RaceState, 'phase' | 'qi' | 'deadline' | 'players' | 'answers' | 'scores' | 'startedAt' | 'finishedAt'>): RaceState {
  return { ...init, phase: 'LOBBY', qi: -1, deadline: null, players: {}, answers: {}, scores: {}, startedAt: null, finishedAt: null };
}

export function join(s: RaceState, studentId: string, now: number): { ok: true } | Fail {
  const name = s.roster[studentId];
  if (!name) return { ok: false, reason: 'NOT_IN_CLASS' };
  if (s.phase === 'FINISHED' && !s.players[studentId]) return { ok: false, reason: 'RACE_FINISHED' };
  if (!s.players[studentId]) { s.players[studentId] = { name, joinedAt: now }; s.scores[studentId] = s.scores[studentId] || 0; }
  return { ok: true };
}

/** The board's one button: start, next question, or the podium after the last one. */
export function next(s: RaceState, now: number): { ok: true; phase: RacePhase } | Fail {
  if (s.phase === 'QUESTION') return { ok: false, reason: 'QUESTION_OPEN' };
  if (s.phase === 'FINISHED') return { ok: false, reason: 'RACE_FINISHED' };
  if (s.phase === 'LOBBY' && !Object.keys(s.players).length) return { ok: false, reason: 'NO_PLAYERS' };
  if (s.qi + 1 >= s.questions.length) { s.phase = 'FINISHED'; s.deadline = null; s.finishedAt = now; return { ok: true, phase: s.phase }; }
  s.qi += 1; s.phase = 'QUESTION'; s.deadline = now + s.seconds * 1000; s.answers[s.qi] = {};
  if (s.startedAt == null) s.startedAt = now;
  return { ok: true, phase: s.phase };
}

export function answer(s: RaceState, studentId: string, qi: number, key: string, now: number): { ok: true; allIn: boolean } | Fail {
  if (s.phase !== 'QUESTION' || qi !== s.qi) return { ok: false, reason: 'QUESTION_CLOSED' };
  if (!s.players[studentId]) return { ok: false, reason: 'NOT_JOINED' };
  if (s.deadline != null && now > s.deadline + RACE_GRACE_MS) return { ok: false, reason: 'TIME_UP' };
  const q = s.questions[qi];
  if (!q.options.some((o) => o.key === key)) return { ok: false, reason: 'INVALID_OPTION' };
  const given = s.answers[qi] || (s.answers[qi] = {});
  if (given[studentId]) return { ok: false, reason: 'ALREADY_ANSWERED' };
  given[studentId] = { key, at: now };
  return { ok: true, allIn: Object.keys(given).length >= Object.keys(s.players).length };
}

/** Closes the open question (time up, everyone answered, or the board): points are counted once, here. */
export function close(s: RaceState): boolean {
  if (s.phase !== 'QUESTION') return false;
  const q = s.questions[s.qi];
  for (const [id, a] of Object.entries(s.answers[s.qi] || {})) if (a.key === q.correct) s.scores[id] = (s.scores[id] || 0) + 1;
  s.phase = 'REVEAL'; s.deadline = null;
  return true;
}

export function ranking(s: RaceState) {
  const rows = Object.entries(s.players).map(([id, p]) => ({ id, name: p.name, score: s.scores[id] || 0 }));
  // equal scores share a place (1, 2, 2, 4); speed never decides
  return rows.map((r) => ({ ...r, rank: 1 + rows.filter((x) => x.score > r.score).length }))
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'tr'));
}

/** What the class did, question by question: for the teacher's report and the outcome evidence. */
export function report(s: RaceState) {
  const players = Object.keys(s.players).length;
  const per = s.questions.slice(0, Math.max(0, s.phase === 'QUESTION' ? s.qi : s.qi + 1)).map((q, k) => {
    const given = Object.values(s.answers[k] || {});
    return { index: k + 1, stem: q.stem, answered: given.length, correct: given.filter((a) => a.key === q.correct).length };
  });
  const asked = per.length;
  const correct = per.reduce((n, p) => n + p.correct, 0);
  const hardest = per.length ? per.reduce((a, b) => (b.correct / Math.max(1, players) < a.correct / Math.max(1, players) ? b : a)) : null;
  return { players, asked, rate: players && asked ? Math.round((correct / (players * asked)) * 100) : 0, hardest: hardest && players ? hardest : null, questions: per };
}

const publicQ = (q: RaceQuestion) => ({ stem: q.stem, options: q.options, assets: q.assets });
const counts = (s: RaceState, k: number) => { const q = s.questions[k]; const c: Record<string, number> = Object.fromEntries(q.options.map((o) => [o.key, 0])); for (const a of Object.values(s.answers[k] || {})) c[a.key] = (c[a.key] || 0) + 1; return c; };

export function boardView(s: RaceState, now: number) {
  const q = s.qi >= 0 ? s.questions[s.qi] : null;
  const given = s.answers[s.qi] || {};
  return {
    role: 'board', phase: s.phase, code: s.code, className: s.className, outcome: s.outcome, total: s.questions.length, qi: s.qi, seconds: s.seconds,
    left: s.deadline ? Math.max(0, Math.ceil((s.deadline - now) / 1000)) : null,
    players: ranking(s).map((r) => ({ ...r, answered: !!given[r.id] })),
    question: q && s.phase !== 'LOBBY' && s.phase !== 'FINISHED' ? publicQ(q) : null,
    reveal: q && s.phase === 'REVEAL' ? { correct: q.correct, counts: counts(s, s.qi) } : null,
    report: s.phase === 'FINISHED' ? report(s) : null,
  };
}

export function playerView(s: RaceState, studentId: string, now: number) {
  const q = s.qi >= 0 ? s.questions[s.qi] : null;
  const mine = s.answers[s.qi]?.[studentId] || null;
  const rank = ranking(s).find((r) => r.id === studentId) || null;
  return {
    role: 'player', phase: s.phase, className: s.className, outcome: s.outcome, total: s.questions.length, qi: s.qi, seconds: s.seconds,
    left: s.deadline ? Math.max(0, Math.ceil((s.deadline - now) / 1000)) : null,
    name: s.players[studentId]?.name || s.roster[studentId] || null, players: Object.keys(s.players).length,
    question: q && s.phase === 'QUESTION' ? publicQ(q) : null,
    myAnswer: mine?.key || null,
    reveal: q && s.phase === 'REVEAL' ? { correct: q.correct, correctText: q.options.find((o) => o.key === q.correct)?.text || '', right: mine ? mine.key === q.correct : false, answered: !!mine } : null,
    score: s.scores[studentId] || 0, rank: rank?.rank || null,
  };
}
