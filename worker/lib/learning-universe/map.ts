import type { AuthUser, Env } from '../../types';
import { all, one } from '../db';
import { outcomeQuestionTarget, unifiedOutcomeEvidence, type OutcomeEvidence } from '../unified-outcome-evidence';
import { gradeProfile } from '../../../src/lib/gradeProfile';
import { studentContext } from './sessions';
import { studentUniverseTasks } from './tasks';

/**
 * Nibiru Öğrenme Evreni — the learning map (owner, 11 Nov 2026).
 * Subjects of the student's own grade and school year (verified curriculum only) → planets (the outcome's topic) →
 * outcomes, each with its learning stage and only the game kinds that have enough approved content right now.
 * Planets are never locked: a planet is "discovered" once the student has worked on it, so a lesson the class is on
 * is always reachable. Daily missions and the weekly goal are suggestions; missing a day removes nothing.
 */
export const REVIEW_AFTER_DAYS = 7;        // a configurable suggestion for delayed review, not a universal rule
export const WEEKLY_GOAL = 5;

export type Stage = 'NO_DATA' | 'STARTED' | 'DEVELOPING' | 'CONSOLIDATING' | 'LEARNED' | 'REVIEW_NEEDED';
export const STAGE_LABEL: Record<Stage, string> = { NO_DATA: 'Veri yetersiz', STARTED: 'Öğrenmeye başladı', DEVELOPING: 'Gelişiyor', CONSOLIDATING: 'Pekiştiriyor', LEARNED: 'Öğrenildi', REVIEW_NEEDED: 'Tekrar gerekli' };

/** Six learning stages over the unified karne: old mistakes stay counted, recent progress is not hidden by them. */
export function masteryStage(o: Pick<OutcomeEvidence, 'status' | 'uniqueQuestions' | 'correct' | 'wrong' | 'blank' | 'recent'> | undefined): Stage {
  if (!o || o.status === 'NO_DATA' || !o.uniqueQuestions) return 'NO_DATA';
  if (o.status === 'LEARNED') return 'LEARNED';
  const answered = o.correct + o.wrong + o.blank;
  const overall = answered ? o.correct / answered : 0;
  if (o.uniqueQuestions >= 8 && overall >= 0.8 && !o.recent.uniqueQuestions) return 'REVIEW_NEEDED';   // was strong, nothing recent
  if (o.uniqueQuestions <= 3) return 'STARTED';
  const rate = o.recent.uniqueQuestions ? (o.recent.rate ?? 0) : overall;
  return rate >= 0.6 ? 'CONSOLIDATING' : 'DEVELOPING';
}

export const daysSince = (at: string | null, now: number) => at ? Math.floor((now - Date.parse(at.replace(' ', 'T') + (at.includes('Z') ? '' : 'Z'))) / 86400000) : null;

/** Which game kinds an outcome (or every outcome of the grade) can be played with right now: enough approved,
 * rights-cleared content of the student's own grade and year; a final needs two different content kinds. */
/** Stage, label and the delayed-review hint for one karne record (map, karne and teachers read the same rule). */
export function stageOf(o: OutcomeEvidence | undefined, now = Date.now()) {
  const stage = masteryStage(o), lastDays = daysSince(o?.lastAt ?? null, now);
  return { stage, stageLabel: STAGE_LABEL[stage], lastDays, reviewDue: stage === 'REVIEW_NEEDED' || (stage === 'LEARNED' && lastDays != null && lastDays >= REVIEW_AFTER_DAYS) };
}

export async function gameAvailability(env: Env, ctx: any, outcomeId?: string) {
  const one_ = outcomeId ? ' AND l.node_id=?' : '', oneC = outcomeId ? ' AND outcome_id=?' : '';
  const qArgs: any[] = [ctx.grade_level, ctx.institution_id], cArgs: any[] = [ctx.grade_level, ctx.academic_year, ctx.institution_id];
  if (outcomeId) { qArgs.push(`ln_${outcomeId}`); cArgs.push(outcomeId); }
  const [qCounts, cCounts, templates] = await Promise.all([
    all<any>(env.DB.prepare(`SELECT substr(l.node_id,4) outcome_id,count(DISTINCT q.id) n FROM question_learning_links l JOIN question_bank q ON q.id=l.question_id
      WHERE l.node_id LIKE 'ln_%' AND q.review_status='APPROVED' AND q.copyright_status IN ('OWNED','LICENSED','PUBLIC_DOMAIN') AND q.grade_level=?
        AND COALESCE(q.question_type,'MULTIPLE_CHOICE')='MULTIPLE_CHOICE' AND (q.owner_type='PLATFORM' OR (q.owner_type='INSTITUTION' AND q.owner_id=?))${one_} GROUP BY l.node_id`).bind(...qArgs)),
    all<any>(env.DB.prepare(`SELECT outcome_id,content_kind,count(*) n FROM lu_game_contents WHERE review_status='APPROVED' AND copyright_status IN ('OWNED','LICENSED','PUBLIC_DOMAIN') AND grade_level=? AND academic_year=?
      AND (owner_type='PLATFORM' OR (owner_type='INSTITUTION' AND owner_id=?))${oneC} GROUP BY outcome_id,content_kind`).bind(...cArgs)),
    all<any>(env.DB.prepare(`SELECT code,kind,title,content_kind,min_items FROM lu_game_templates WHERE active=1 AND ?>=min_grade AND ?<=max_grade ORDER BY sort_order`).bind(ctx.grade_level, ctx.grade_level)),
  ]);
  const qBy = new Map(qCounts.map((r) => [r.outcome_id, Number(r.n)]));
  const cBy = new Map<string, Record<string, number>>();
  for (const r of cCounts) { const m = cBy.get(r.outcome_id) || {}; m[r.content_kind] = Number(r.n); cBy.set(r.outcome_id, m); }
  return (id: string) => {
    const q = qBy.get(id) || 0, c = cBy.get(id) || {};
    const open = templates.filter((t) => t.kind !== 'FINAL' && (t.content_kind === 'QUESTION' ? q >= t.min_items : (c[t.content_kind] || 0) >= t.min_items));
    const distinct = new Set(open.map((t) => t.content_kind));
    const fin = templates.find((t) => t.kind === 'FINAL');
    if (fin && distinct.size >= 2) open.push(fin);
    return open.map((t) => ({ code: t.code as string, kind: t.kind as string, title: t.title as string, contentKind: t.content_kind as string }));
  };
}

export async function universeMap(env: Env, user: AuthUser, now = Date.now()) {
  const ctx = await studentContext(env, user);
  if (!ctx) return null;
  const profile = gradeProfile(ctx.grade_level);
  const [outcomes, kindsFor, evidence, week, xp, tasks] = await Promise.all([
    all<any>(env.DB.prepare(`SELECT o.id,o.code,o.title,o.topic,o.subtopic,o.subject_id,COALESCE(s.name,'Ders') subject_name FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id LEFT JOIN subjects s ON s.id=o.subject_id
      WHERE o.active=1 AND cv.verified=1 AND cv.academic_year=? AND cv.grade_level=? AND o.grade_level=? ORDER BY s.name,o.code`).bind(ctx.academic_year, ctx.grade_level, ctx.grade_level)),
    gameAvailability(env, ctx),
    (async () => unifiedOutcomeEvidence(env, user.student_id!, { learnerView: true, target: await outcomeQuestionTarget(env, ctx.institution_id) }))(),
    one<any>(env.DB.prepare(`SELECT count(*) n FROM lu_sessions WHERE student_id=? AND status='SUBMITTED' AND date(submitted_at,'+3 hours')>=date('now','+3 hours','weekday 1','-7 days')`).bind(user.student_id)),
    one<any>(env.DB.prepare(`SELECT xp FROM gamification_profiles WHERE student_id=?`).bind(user.student_id)),
    studentUniverseTasks(env, user),
  ]);
  const evBy = new Map(evidence.map((e) => [e.outcomeId, e]));

  type Node = { id: string; code: string | null; title: string; stage: Stage; stageLabel: string; games: Array<{ code: string; kind: string; title: string }>; lastDays: number | null; reviewDue: boolean; uniqueQuestions: number };
  const subjects = new Map<string, { id: string; name: string; planets: Map<string, Node[]> }>();
  const all_: Node[] = [];
  for (const o of outcomes) {
    const ev = evBy.get(o.id), st = stageOf(ev, now);
    const node: Node = { id: o.id, code: o.code, title: o.title, ...st, games: kindsFor(o.id).map(({ code, kind, title }) => ({ code, kind, title })), uniqueQuestions: ev?.uniqueQuestions ?? 0 };
    all_.push(node);
    const sid = o.subject_id || 'other';
    if (!subjects.has(sid)) subjects.set(sid, { id: sid, name: o.subject_name, planets: new Map() });
    const topic = String(o.topic || 'Genel').trim() || 'Genel';
    const list = subjects.get(sid)!.planets.get(topic) || [];
    list.push(node); subjects.get(sid)!.planets.set(topic, list);
  }
  const playable = (n: Node) => n.games.length > 0;
  // up to three suggestions for today: a due review, the weakest one in progress, something new — only if playable
  const missions: Array<{ type: 'REVIEW' | 'STRENGTHEN' | 'DISCOVER'; outcomeId: string; title: string; code: string | null; game: string }> = [];
  const review = all_.filter((n) => n.reviewDue && playable(n)).sort((a, b) => (b.lastDays ?? 0) - (a.lastDays ?? 0))[0];
  if (review) missions.push({ type: 'REVIEW', outcomeId: review.id, title: review.title, code: review.code, game: review.games[0].code });
  const order: Stage[] = ['DEVELOPING', 'STARTED', 'CONSOLIDATING'];
  const weak = all_.filter((n) => order.includes(n.stage) && playable(n) && n.id !== review?.id).sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage))[0];
  if (weak) missions.push({ type: 'STRENGTHEN', outcomeId: weak.id, title: weak.title, code: weak.code, game: weak.games[0].code });
  const fresh = all_.find((n) => n.stage === 'NO_DATA' && playable(n));
  if (fresh) missions.push({ type: 'DISCOVER', outcomeId: fresh.id, title: fresh.title, code: fresh.code, game: fresh.games[0].code });

  const totalXp = Number(xp?.xp || 0);
  return {
    ok: true,
    student: { gradeLevel: ctx.grade_level, academicYear: ctx.academic_year, designGroup: profile.designGroup },
    xp: { total: totalXp, level: Math.floor(totalXp / 200) + 1, toNext: 200 - (totalXp % 200) },
    week: { done: Number(week?.n || 0), goal: WEEKLY_GOAL },
    reviewAfterDays: REVIEW_AFTER_DAYS,
    missions,
    tasks,
    summary: { outcomes: all_.length, playable: all_.filter(playable).length, learned: all_.filter((n) => n.stage === 'LEARNED').length },
    // subjects with something to play first, then by name
    subjects: [...subjects.values()].map((s) => ({ s, playable: [...s.planets.values()].flat().filter(playable).length })).sort((a, b) => b.playable - a.playable || a.s.name.localeCompare(b.s.name, 'tr')).map(({ s }) => ({ id: s.id, name: s.name, planets: [...s.planets.entries()].map(([name, nodes]) => ({
      name, outcomes: nodes, discovered: nodes.some((n) => n.stage !== 'NO_DATA'), learned: nodes.filter((n) => n.stage === 'LEARNED').length, playable: nodes.filter(playable).length,
    })) })),
  };
}
