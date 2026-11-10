import type { AuthUser, Env } from '../types';
import { all, audit, one, uuid } from './db';
import { completeCoachFollowup, eligibleCoachMiniTestQuestions, evaluateMiniTest } from './coach-mastery-cycle';
import { startOutcomeMiniTest } from './mini-test-catalog';
import { hydrateQuestionMedia } from './question-content';
import { SERVABLE_VIDEO_SQL } from './video-links';
import { publishedForLearnersSql } from './exam-schedule';
import { LEARNED_RULE, outcomeQuestionTarget, unifiedOutcomeEvidence } from './unified-outcome-evidence';

/**
 * Nibiru kazanım iyileştirme döngüsü (owner, 9 Nov 2026): "öğrenci deneme sınavı yaptıktan sonra yanlışlarından ya da
 * eksik kazanımlarından video (YouTube) yönlendirme; mini test yetersiz kalırsa mini oyun; mini oyun yetersiz kalırsa
 * öğretmene bildirim".
 *
 *  1. the outcome comes from the deneme question's own outcome link, or from the student's verified outcome list;
 *  2. video: only an approved, published video for that outcome. Automatically found YouTube videos stay candidates
 *     for a teacher to approve (A067), so with none the step says so and the loop goes on to the mini test;
 *  3. mini test: the existing coach mini test (5 different approved questions, pass at 80%);
 *  4. failed → the outcome mini game: a timed round of 5 other approved questions of the same outcome, graded here;
 *  5. passed (test or game) → the loop is done; the badge is given only when the unified karne already counts the
 *     outcome as learned (enough different questions), otherwise it says how many more are needed;
 *  6. game failed, or no questions/curriculum match to measure with → one notification to the class's subject and
 *     guidance teachers (institution managers when the class has none). Never repeated for the same student and
 *     outcome within NOTIFY_QUIET_DAYS.
 * Nothing is made up: no video, no questions, no outcome match → the screen says so and a teacher is told.
 */
export const GAME_PASS = 0.8;
export const GAME_QUESTIONS = 5;
export const NOTIFY_QUIET_DAYS = 14;

type Loop = Record<string, any>;
const parse = <T,>(v: string | null, f: T): T => { try { return v ? JSON.parse(v) : f; } catch { return f; } };
const norm = (v: unknown) => String(v ?? '').trim().toLocaleUpperCase('tr-TR');

async function enrollment(env: Env, user: AuthUser) {
  if (user.role !== 'STUDENT' || !user.student_id || !user.institution_id) return null;
  return one<any>(env.DB.prepare(`SELECT e.id,e.institution_id,e.season_id,e.grade_level,e.class_id,s.academic_year FROM student_enrollments e
    JOIN institution_seasons s ON s.id=e.season_id AND s.institution_id=e.institution_id
    WHERE e.student_id=? AND e.institution_id=? AND e.status='ACTIVE' ORDER BY e.created_at DESC,e.id DESC LIMIT 1`).bind(user.student_id, user.institution_id));
}

async function verifiedOutcome(env: Env, outcomeId: string, enr: any) {
  return one<any>(env.DB.prepare(`SELECT o.id,o.code,o.title,o.subject_id,s.name subject_name FROM outcomes o
    JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id LEFT JOIN subjects s ON s.id=o.subject_id
    WHERE o.id=? AND o.active=1 AND cv.verified=1 AND cv.academic_year=? AND cv.grade_level=? AND o.grade_level=?`).bind(outcomeId, enr.academic_year, enr.grade_level, enr.grade_level));
}

/** The approved video for the outcome: a published topic video link first, then an approved learning video. */
async function approvedVideo(env: Env, outcomeId: string, examQuestionId: string | null) {
  const link = await one<any>(env.DB.prepare(`SELECT vl.id,vl.url,vl.title FROM video_links vl
    WHERE vl.link_type='TOPIC' AND (vl.outcome_id=? OR (? IS NOT NULL AND vl.exam_question_id=?)) AND ${SERVABLE_VIDEO_SQL}
    ORDER BY CASE WHEN vl.outcome_id=? THEN 0 ELSE 1 END,vl.id LIMIT 1`).bind(outcomeId, examQuestionId, examQuestionId, outcomeId));
  if (link) return { kind: 'VIDEO_LINK', id: link.id as string };
  const lv = await one<any>(env.DB.prepare(`SELECT id FROM learning_videos WHERE node_id=? AND approved=1 AND active=1
    ORDER BY CASE WHEN duration_seconds BETWEEN 180 AND 300 THEN 0 WHEN duration_seconds BETWEEN 60 AND 600 THEN 1 ELSE 2 END,created_at DESC,id LIMIT 1`).bind(`ln_${outcomeId}`));
  return lv ? { kind: 'LEARNING_VIDEO', id: lv.id as string } : null;
}

async function videoDetail(env: Env, loop: Loop) {
  if (!loop.video_ref) return null;
  if (loop.video_kind === 'VIDEO_LINK') {
    const v = await one<any>(env.DB.prepare(`SELECT vl.url,vl.title FROM video_links vl WHERE vl.id=? AND ${SERVABLE_VIDEO_SQL}`).bind(loop.video_ref));
    return v ? { url: v.url, title: v.title || 'Konu anlatımı', durationSeconds: null } : null;
  }
  const v = await one<any>(env.DB.prepare(`SELECT url,title,duration_seconds FROM learning_videos WHERE id=? AND approved=1 AND active=1`).bind(loop.video_ref));
  return v ? { url: v.url, title: v.title, durationSeconds: v.duration_seconds ?? null } : null;
}

async function ownLoop(env: Env, user: AuthUser, loopId: string) {
  if (user.role !== 'STUDENT' || !user.student_id) return null;
  return one<Loop>(env.DB.prepare(`SELECT * FROM nibiru_outcome_loops WHERE id=? AND student_id=? AND institution_id=?`).bind(loopId, user.student_id, user.institution_id));
}

export async function startOutcomeLoop(env: Env, user: AuthUser, body: { outcomeId?: unknown; examQuestionId?: unknown }) {
  const enr = await enrollment(env, user);
  if (!enr) return { ok: false, reason: 'STUDENT_ONLY' } as const;
  let outcomeId = typeof body.outcomeId === 'string' ? body.outcomeId : '';
  const examQuestionId = typeof body.examQuestionId === 'string' && body.examQuestionId ? body.examQuestionId : null;
  if (examQuestionId) {
    // only a question the student got wrong or left blank in a deneme whose results were published to them
    const links = await all<any>(env.DB.prepare(`SELECT qo.outcome_id FROM student_answers sa JOIN exam_participants ep ON ep.id=sa.participant_id
      JOIN question_outcomes qo ON qo.exam_question_id=sa.exam_question_id
      WHERE ep.student_id=? AND sa.exam_question_id=? AND sa.status IN ('WRONG','BLANK') AND ${publishedForLearnersSql('ep.exam_id')}`).bind(user.student_id, examQuestionId));
    if (!links.length) return { ok: false, reason: 'QUESTION_NOT_FOUND' } as const;
    if (!outcomeId) outcomeId = links[0].outcome_id;
    else if (!links.some((l) => l.outcome_id === outcomeId)) return { ok: false, reason: 'QUESTION_NOT_FOUND' } as const;
  }
  if (!outcomeId) return { ok: false, reason: 'OUTCOME_REQUIRED' } as const;
  const outcome = await verifiedOutcome(env, outcomeId, enr);
  if (!outcome) return { ok: false, reason: 'OUTCOME_NOT_VERIFIED' } as const;
  const running = await one<Loop>(env.DB.prepare(`SELECT id FROM nibiru_outcome_loops WHERE student_id=? AND outcome_id=? AND status='ACTIVE'`).bind(user.student_id, outcomeId));
  if (running) return { ok: true, reused: true, loopId: running.id as string } as const;
  const video = await approvedVideo(env, outcomeId, examQuestionId);
  const id = uuid('nol');
  await env.DB.prepare(`INSERT OR IGNORE INTO nibiru_outcome_loops(id,student_id,institution_id,season_id,outcome_id,source_type,source_ref,video_kind,video_ref)
    VALUES(?,?,?,?,?,?,?,?,?)`).bind(id, user.student_id, enr.institution_id, enr.season_id, outcomeId, examQuestionId ? 'EXAM_QUESTION' : 'WEAK_OUTCOME', examQuestionId, video?.kind ?? null, video?.id ?? null).run();
  const created = await one<Loop>(env.DB.prepare(`SELECT id FROM nibiru_outcome_loops WHERE student_id=? AND outcome_id=? AND status='ACTIVE'`).bind(user.student_id, outcomeId));
  if (!created) return { ok: false, reason: 'LOOP_NOT_CREATED' } as const;
  if (created.id === id) await audit(env.DB, user.id, enr.institution_id, 'NIBIRU_LOOP_STARTED', 'nibiru_outcome_loop', id, { outcomeId, source: examQuestionId ? 'EXAM_QUESTION' : 'WEAK_OUTCOME', video: !!video });
  return { ok: true, reused: created.id !== id, loopId: created.id as string } as const;
}

/** Recipients allowed to see the student: the class's subject teacher for the outcome's subject and its guidance teacher. */
async function recipients(env: Env, loop: Loop, subjectId: string | null) {
  const enr = await one<any>(env.DB.prepare(`SELECT class_id FROM student_enrollments WHERE student_id=? AND institution_id=? AND season_id=? AND status='ACTIVE' LIMIT 1`).bind(loop.student_id, loop.institution_id, loop.season_id));
  let rows: any[] = [];
  if (enr?.class_id) rows = await all<any>(env.DB.prepare(`SELECT DISTINCT u.id FROM teacher_assignments ta JOIN users u ON u.id=ta.user_id
    WHERE ta.institution_id=? AND ta.season_id=? AND ta.class_id=? AND ta.active=1 AND u.active=1 AND u.institution_id=ta.institution_id
      AND ((ta.assignment_type='SUBJECT' AND ta.subject_id=?) OR ta.assignment_type='GUIDANCE')`).bind(loop.institution_id, loop.season_id, enr.class_id, subjectId));
  if (!rows.length) rows = await all<any>(env.DB.prepare(`SELECT id FROM users WHERE institution_id=? AND role='INSTITUTION_MANAGER' AND active=1`).bind(loop.institution_id));
  return rows.map((r) => r.id as string);
}

const REASON_TEXT: Record<string, string> = {
  GAME_NOT_ENOUGH: 'video, mini test ve mini oyundan sonra kazanım henüz oluşmadı',
  NOT_ENOUGH_QUESTIONS: 'mini test için yeterli onaylı soru yok; ölçme yapılamadı',
  NO_GAME_QUESTIONS: 'mini test geçilemedi ve mini oyun için yeterli onaylı soru yok',
};

/** Moves the loop to teacher review and tells the teachers once. Returns how many were told (0 when quiet). */
async function toTeacher(env: Env, loop: Loop, reason: string, detail: Record<string, unknown> = {}) {
  await env.DB.prepare(`UPDATE nibiru_outcome_loops SET status='TEACHER_REVIEW',teacher_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'`).bind(reason, loop.id).run();
  const recent = await one<any>(env.DB.prepare(`SELECT id FROM nibiru_outcome_loops WHERE student_id=? AND outcome_id=? AND id<>? AND notified_at IS NOT NULL AND datetime(notified_at)>=datetime('now',?)`).bind(loop.student_id, loop.outcome_id, loop.id, `-${NOTIFY_QUIET_DAYS} days`));
  if (recent) return 0;
  // claim the notification; a second request finds it claimed and sends nothing
  const claim = await env.DB.prepare(`UPDATE nibiru_outcome_loops SET notified_at=CURRENT_TIMESTAMP WHERE id=? AND notified_at IS NULL`).bind(loop.id).run();
  if (!Number(claim.meta?.changes || 0)) return 0;
  const info = await one<any>(env.DB.prepare(`SELECT st.first_name,st.last_name,o.code,o.title,o.subject_id,s.name subject_name FROM student_entities st
    JOIN outcomes o ON o.id=? LEFT JOIN subjects s ON s.id=o.subject_id WHERE st.id=?`).bind(loop.outcome_id, loop.student_id));
  const to = await recipients(env, loop, info?.subject_id ?? null);
  const name = [info?.first_name, info?.last_name].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR').replace(/(^|\s)\S/g, (c: string) => c.toLocaleUpperCase('tr-TR'));
  const body = `${name} · ${info?.subject_name || 'Ders'} · ${[info?.code, info?.title].filter(Boolean).join(' ')}: ${REASON_TEXT[reason] || 'öğretmen desteği gerekiyor'}.`;
  const statements = to.map((uid) => env.DB.prepare(`INSERT INTO notifications(id,recipient_user_id,institution_id,type,title,body,action_url,entity_type,entity_id)
    SELECT ?,?,?,'NIBIRU_OUTCOME_SUPPORT',?,?,?,'nibiru_outcome_loop',? WHERE NOT EXISTS(SELECT 1 FROM notifications WHERE recipient_user_id=? AND entity_type='nibiru_outcome_loop' AND entity_id=?)`)
    .bind(uuid('not'), uid, loop.institution_id, 'Kazanım desteği gerekiyor', body, '/kazanim-destek', loop.id, uid, loop.id));
  statements.push(env.DB.prepare(`UPDATE nibiru_outcome_loops SET notified_count=? WHERE id=?`).bind(to.length, loop.id));
  await env.DB.batch(statements);
  await audit(env.DB, null, loop.institution_id, 'NIBIRU_LOOP_TEACHER_NOTIFIED', 'nibiru_outcome_loop', loop.id, { outcomeId: loop.outcome_id, reason, recipients: to.length, ...detail });
  return to.length;
}

async function finishPassed(env: Env, loop: Loop) {
  const changed = await env.DB.prepare(`UPDATE nibiru_outcome_loops SET status='PASSED',updated_at=CURRENT_TIMESTAMP,closed_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'`).bind(loop.id).run();
  if (!Number(changed.meta?.changes || 0)) return;
  const target = await outcomeQuestionTarget(env, loop.institution_id);
  const evidence = (await unifiedOutcomeEvidence(env, loop.student_id, { learnerView: true, target })).find((o) => o.outcomeId === loop.outcome_id);
  if (evidence?.status === 'LEARNED') await env.DB.prepare(`UPDATE nibiru_outcome_loops SET badge_at=CURRENT_TIMESTAMP WHERE id=? AND badge_at IS NULL`).bind(loop.id).run();
}

/** Reads the loop and settles any step whose result is already recorded (a submitted mini test or game). */
export async function outcomeLoopState(env: Env, user: AuthUser, loopId: string) {
  let loop = await ownLoop(env, user, loopId);
  if (!loop) return { ok: false, reason: 'LOOP_NOT_FOUND' } as const;
  if (loop.status === 'ACTIVE') {
    const test = loop.mini_test_id ? await one<any>(env.DB.prepare(`SELECT status FROM coach_mini_tests WHERE id=? AND student_id=?`).bind(loop.mini_test_id, loop.student_id)) : null;
    const round = loop.game_round_id ? await one<any>(env.DB.prepare(`SELECT status FROM nibiru_game_rounds WHERE id=? AND loop_id=?`).bind(loop.game_round_id, loop.id)) : null;
    if (test?.status === 'PASSED' || round?.status === 'PASSED') await finishPassed(env, loop);
    else if (round?.status === 'FAILED') await toTeacher(env, loop, 'GAME_NOT_ENOUGH');
    loop = (await ownLoop(env, user, loopId))!;
  }
  const [outcome, test, round, video] = await Promise.all([
    one<any>(env.DB.prepare(`SELECT o.id,o.code,o.title,s.name subject_name FROM outcomes o LEFT JOIN subjects s ON s.id=o.subject_id WHERE o.id=?`).bind(loop.outcome_id)),
    loop.mini_test_id ? one<any>(env.DB.prepare(`SELECT id,status,question_count,correct_count,score_percent FROM coach_mini_tests WHERE id=?`).bind(loop.mini_test_id)) : null,
    loop.game_round_id ? one<any>(env.DB.prepare(`SELECT id,status,question_count,correct_count,score_percent,xp_earned FROM nibiru_game_rounds WHERE id=?`).bind(loop.game_round_id)) : null,
    videoDetail(env, loop),
  ]);
  let step: 'VIDEO' | 'MINI_TEST' | 'GAME' | 'PASSED' | 'TEACHER_REVIEW' | 'CLOSED';
  if (loop.status === 'PASSED') step = 'PASSED';
  else if (loop.status === 'TEACHER_REVIEW') step = 'TEACHER_REVIEW';
  else if (loop.status === 'CLOSED') step = 'CLOSED';
  else if (video && !loop.video_done_at) step = 'VIDEO';
  else if (!test || test.status === 'READY') step = 'MINI_TEST';
  else step = 'GAME';
  let badgeNeed: number | null = null;
  if (loop.status === 'PASSED' && !loop.badge_at) {
    const target = await outcomeQuestionTarget(env, loop.institution_id);
    const ev = (await unifiedOutcomeEvidence(env, loop.student_id, { learnerView: true, target })).find((o) => o.outcomeId === loop!.outcome_id);
    if (ev?.status === 'LEARNED') {
      await env.DB.prepare(`UPDATE nibiru_outcome_loops SET badge_at=CURRENT_TIMESTAMP WHERE id=? AND badge_at IS NULL`).bind(loop.id).run();
      loop = (await ownLoop(env, user, loopId))!;
    } else badgeNeed = questionsToLearned(Number(ev?.recent.uniqueQuestions || 0), Number(ev?.recent.correct || 0));
  }
  return {
    ok: true, step,
    loop: { id: loop.id, status: loop.status, source: loop.source_type, createdAt: loop.created_at, videoDoneAt: loop.video_done_at, teacherReason: loop.teacher_reason, teacherNotified: Number(loop.notified_count || 0), notifiedAt: loop.notified_at, badgeAt: loop.badge_at, badgeNeed },
    outcome: outcome ? { id: outcome.id, code: outcome.code, title: outcome.title, subjectName: outcome.subject_name } : null,
    video: video ? { ...video, provider: /youtu\.?be/i.test(video.url) ? 'YOUTUBE' : 'OTHER' } : null,
    videoMissing: !loop.video_ref,
    miniTest: test ? { id: test.id, status: test.status, questionCount: test.question_count, correct: test.correct_count, scorePercent: test.score_percent } : null,
    game: round ? { id: round.id, status: round.status, questionCount: round.question_count, correct: round.correct_count, scorePercent: round.score_percent, xp: round.xp_earned } : null,
  } as const;
}

export async function listOutcomeLoops(env: Env, user: AuthUser) {
  if (user.role !== 'STUDENT' || !user.student_id) return [];
  return all<any>(env.DB.prepare(`SELECT l.id,l.status,l.outcome_id,l.badge_at,l.created_at,l.updated_at,o.code,o.title,s.name subject_name
    FROM nibiru_outcome_loops l JOIN outcomes o ON o.id=l.outcome_id LEFT JOIN subjects s ON s.id=o.subject_id
    WHERE l.student_id=? AND l.institution_id=? ORDER BY CASE l.status WHEN 'ACTIVE' THEN 0 ELSE 1 END,l.updated_at DESC LIMIT 30`).bind(user.student_id, user.institution_id));
}

export async function markLoopVideoWatched(env: Env, user: AuthUser, loopId: string) {
  const loop = await ownLoop(env, user, loopId);
  if (!loop) return { ok: false, reason: 'LOOP_NOT_FOUND' } as const;
  await env.DB.prepare(`UPDATE nibiru_outcome_loops SET video_done_at=COALESCE(video_done_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'`).bind(loop.id).run();
  return { ok: true } as const;
}

export async function startLoopMiniTest(env: Env, user: AuthUser, loopId: string) {
  const loop = await ownLoop(env, user, loopId);
  if (!loop) return { ok: false, reason: 'LOOP_NOT_FOUND' } as const;
  if (loop.status !== 'ACTIVE') return { ok: false, reason: 'LOOP_CLOSED' } as const;
  if (loop.video_ref && !loop.video_done_at) return { ok: false, reason: 'VIDEO_FIRST' } as const;
  if (loop.mini_test_id) {
    const t = await one<any>(env.DB.prepare(`SELECT id,status FROM coach_mini_tests WHERE id=?`).bind(loop.mini_test_id));
    if (t) return { ok: true, testId: t.id as string, status: t.status as string } as const;
  }
  let result: any = await startOutcomeMiniTest(env, user, loop.outcome_id, 'NEW');
  if (!result.ok && result.reason === 'SUPPORT_REQUIRED') {
    // an earlier failed test asks for a support step first; this loop's video/review step is that step
    const pending = (result.followups || []).find((f: any) => f.status !== 'DONE' && f.action_type !== 'PRACTICE') || (result.followups || []).find((f: any) => f.status !== 'DONE');
    if (pending) { await completeCoachFollowup(env, user, pending.id); result = await startOutcomeMiniTest(env, user, loop.outcome_id, 'NEW'); }
  }
  if (!result.ok) {
    if (['NEW_QUESTIONS_REQUIRED', 'INSUFFICIENT_VERIFIED_QUESTIONS'].includes(result.reason)) {
      const told = await toTeacher(env, loop, 'NOT_ENOUGH_QUESTIONS', { available: result.availableQuestionCount ?? 0 });
      return { ok: false, reason: 'NOT_ENOUGH_QUESTIONS', available: Number(result.availableQuestionCount || 0), teacherNotified: told } as const;
    }
    return { ok: false, reason: String(result.reason || 'MINI_TEST_FAILED') } as const;
  }
  await env.DB.prepare(`UPDATE nibiru_outcome_loops SET mini_test_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND mini_test_id IS NULL`).bind(result.testId, loop.id).run();
  return { ok: true, testId: result.testId as string, status: 'READY' } as const;
}

function publicQuestion(q: any) {
  return { id: q.id, stem_text: q.stem_text, options: parse(q.options_json, []), content_mode: q.content_mode, option_count: q.option_count, assets: (q.assets || []).filter((a: any) => a.placement !== 'SOLUTION'), contentBlocks: (q.contentBlocks || []).filter((b: any) => b.placement !== 'SOLUTION') };
}

export async function startLoopGame(env: Env, user: AuthUser, loopId: string) {
  const loop = await ownLoop(env, user, loopId);
  if (!loop) return { ok: false, reason: 'LOOP_NOT_FOUND' } as const;
  if (loop.game_round_id) return loopGame(env, user, loopId);
  if (loop.status !== 'ACTIVE') return { ok: false, reason: 'LOOP_CLOSED' } as const;
  const test = loop.mini_test_id ? await one<any>(env.DB.prepare(`SELECT id,status FROM coach_mini_tests WHERE id=?`).bind(loop.mini_test_id)) : null;
  if (test?.status !== 'FAILED') return { ok: false, reason: 'MINI_TEST_FIRST' } as const;
  const used = new Set((await all<any>(env.DB.prepare(`SELECT question_id FROM coach_mini_test_questions WHERE test_id=?`).bind(test.id))).map((r) => r.question_id));
  const pool: any[] = [];
  for (const mode of ['NEW', 'REPEAT'] as const) for (const q of await eligibleCoachMiniTestQuestions(env, user, loop.outcome_id, mode)) if (!used.has(q.id) && !pool.some((p) => p.id === q.id)) pool.push(q);
  if (pool.length < GAME_QUESTIONS) {
    const told = await toTeacher(env, loop, 'NO_GAME_QUESTIONS', { available: pool.length });
    return { ok: false, reason: 'NO_GAME_QUESTIONS', available: pool.length, teacherNotified: told } as const;
  }
  const chosen = await hydrateQuestionMedia(env, pool.slice(0, GAME_QUESTIONS));
  const id = uuid('ngr');
  const st: D1PreparedStatement[] = [env.DB.prepare(`INSERT INTO nibiru_game_rounds(id,loop_id,student_id,outcome_id,question_count) VALUES(?,?,?,?,?)`).bind(id, loop.id, loop.student_id, loop.outcome_id, chosen.length)];
  chosen.forEach((q: any, i: number) => st.push(env.DB.prepare(`INSERT INTO nibiru_game_questions(round_id,question_id,sort_order,snapshot_json) VALUES(?,?,?,?)`).bind(id, q.id, i + 1, JSON.stringify(q))));
  // the game's questions count as seen, so a later mini test still measures with new questions
  chosen.forEach((q: any) => st.push(env.DB.prepare(`INSERT OR IGNORE INTO coach_question_exposures(student_id,question_id) VALUES(?,?)`).bind(loop.student_id, q.id)));
  st.push(env.DB.prepare(`UPDATE nibiru_outcome_loops SET game_round_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND game_round_id IS NULL`).bind(id, loop.id));
  try { await env.DB.batch(st); } catch (e) { if (!/UNIQUE/.test(String(e))) throw e; }
  return loopGame(env, user, loopId);
}

export async function loopGame(env: Env, user: AuthUser, loopId: string) {
  const loop = await ownLoop(env, user, loopId);
  if (!loop?.game_round_id) return { ok: false, reason: 'GAME_NOT_FOUND' } as const;
  const round = await one<any>(env.DB.prepare(`SELECT * FROM nibiru_game_rounds WHERE id=? AND loop_id=?`).bind(loop.game_round_id, loop.id));
  if (!round) return { ok: false, reason: 'GAME_NOT_FOUND' } as const;
  const rows = await all<any>(env.DB.prepare(`SELECT question_id,sort_order,snapshot_json,student_answer,correct FROM nibiru_game_questions WHERE round_id=? ORDER BY sort_order`).bind(round.id));
  const done = round.status !== 'READY';
  return { ok: true, round: { id: round.id, status: round.status, questionCount: round.question_count, correct: round.correct_count, scorePercent: round.score_percent, xp: round.xp_earned },
    questions: rows.map((r) => { const q = parse<any>(r.snapshot_json, {}); return { ...publicQuestion(q), ...(done ? { student_answer: r.student_answer, correct: r.correct, correct_answer: q.correct_answer, solution_text: q.solution_text } : {}) }; }) } as const;
}

/** How many more different questions, all answered right, the karne needs before it counts the outcome as learned. */
export function questionsToLearned(recentUnique: number, recentCorrect: number) {
  const { minQuestions, minRate } = LEARNED_RULE;
  let n = Math.max(0, minQuestions - recentUnique);
  while ((recentCorrect + n) < minRate * (recentUnique + n) - 1e-9) n++;
  return Math.max(1, n);
}

/** XP for the game: a reward for playing, kept apart from accuracy (never read by the karne). */
export function gameXp(correct: number, total: number) { return 10 + Math.round((total ? correct / total : 0) * 20); }

export async function submitLoopGame(env: Env, user: AuthUser, loopId: string, body: { answers?: unknown; durationSeconds?: unknown }) {
  const loop = await ownLoop(env, user, loopId);
  if (!loop?.game_round_id) return { ok: false, reason: 'GAME_NOT_FOUND' } as const;
  const round = await one<any>(env.DB.prepare(`SELECT * FROM nibiru_game_rounds WHERE id=? AND loop_id=?`).bind(loop.game_round_id, loop.id));
  if (!round) return { ok: false, reason: 'GAME_NOT_FOUND' } as const;
  if (round.status === 'READY') {
    const rows = await all<any>(env.DB.prepare(`SELECT question_id,snapshot_json FROM nibiru_game_questions WHERE round_id=? ORDER BY sort_order`).bind(round.id));
    const answers = new Map((Array.isArray(body.answers) ? body.answers : []).map((a: any) => [String(a?.questionId), norm(a?.answer)]));
    // a question the timer ran out on is sent with an empty answer and counts as blank
    if (rows.some((r) => !answers.has(r.question_id))) return { ok: false, reason: 'ALL_QUESTIONS_REQUIRED' } as const;
    const graded = rows.map((r) => { const q = parse<any>(r.snapshot_json, {}); const a = answers.get(r.question_id) || ''; return { id: r.question_id, a, ok: !!a && a === norm(q.correct_answer) }; });
    const result = evaluateMiniTest(graded.filter((g) => g.ok).length, graded.length, GAME_PASS);
    const duration = Math.max(1, Math.min(3600, Math.round(Number(body.durationSeconds) || 1)));
    const st: D1PreparedStatement[] = graded.map((g) => env.DB.prepare(`UPDATE nibiru_game_questions SET student_answer=?,correct=?,answered_at=CURRENT_TIMESTAMP WHERE round_id=? AND question_id=? AND EXISTS(SELECT 1 FROM nibiru_game_rounds WHERE id=? AND status='READY')`).bind(g.a || null, g.a ? (g.ok ? 1 : 0) : null, round.id, g.id, round.id));
    st.push(env.DB.prepare(`UPDATE nibiru_game_rounds SET status=?,correct_count=?,score_percent=?,xp_earned=?,duration_seconds=?,submitted_at=CURRENT_TIMESTAMP WHERE id=? AND status='READY'`).bind(result.passed ? 'PASSED' : 'FAILED', result.correct, result.scorePercent, gameXp(result.correct, result.total), duration, round.id));
    await env.DB.batch(st);
    await audit(env.DB, user.id, loop.institution_id, 'NIBIRU_LOOP_GAME_SUBMITTED', 'nibiru_game_round', round.id, { outcomeId: loop.outcome_id, correct: result.correct, total: result.total, passed: result.passed });
  }
  return outcomeLoopState(env, user, loopId);
}
