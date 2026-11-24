import { expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import app from '../worker/preview-policy-production-entry';
import { createSession } from '../worker/lib/auth';
import { dejavuGaps, seenQuestionIds } from '../worker/lib/dejavu';

/** Requests as a user the shared helper has no session for (the synthetic guidance and other-class teachers). */
async function asUser(t: any, userId: string, path: string, method = 'GET', body?: any) {
  const cookie = (await createSession(t.env, userId, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const res = await (app as any).fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookie, Origin: 'https://app.anunex.com', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) }), t.env, { waitUntil() {}, passThroughOnException() {} });
  return { response: res, data: await res.json().catch(() => null) as any };
}

/**
 * Öğrenme Evreni PR-4 (owner, 11 Nov 2026): the Nibiru loop's game step plays an Öğrenme Evreni game when the outcome has
 * approved activity content; the karne shows the six learning stages; Evren play feeds Dejavu. Synthetic data only.
 */
async function setup() {
  const t = await evaluatedExam('direct', { outcomes: true });
  expect((await t.request(`${t.base}/release`, 'POST', {})).response.status).toBe(200);
  const o = t.db.prepare(`SELECT id,subject_id FROM outcomes WHERE code='M.8.1.1'`).get() as any;
  t.db.prepare(`INSERT OR IGNORE INTO learning_nodes(id,academic_year,node_type,subject_id,grade_level,code,title) VALUES(?,'2026-2027','OUTCOME',?,8,'M.8.1.1','Sentetik')`).run(`ln_${o.id}`, o.subject_id);
  const q = t.db.prepare(`INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,copyright_status,review_status) VALUES(?,'PLATFORM','2026-2027',8,?,'MULTIPLE_CHOICE',?,'["A","B","C","D"]','A','OWNED','APPROVED')`);
  for (let i = 1; i <= 10; i++) { q.run(`qz${i}`, o.subject_id, `Sentetik soru ${i}`); t.db.prepare('INSERT INTO question_learning_links(question_id,node_id) VALUES(?,?)').run(`qz${i}`, `ln_${o.id}`); }
  t.db.exec(`INSERT INTO classes(id,institution_id,season_id,grade_level,section,name) VALUES('c8a','school','season',8,'A','8/A'),('c8b','school','season',8,'B','8/B');
    UPDATE student_enrollments SET class_id='c8a' WHERE student_id='s1';
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('rehber','GUIDANCE_TEACHER','Rehber','x','x',1,'school'),('other','TEACHER','Başka','x','x',1,'school');
    INSERT INTO teacher_assignments(id,user_id,institution_id,season_id,class_id,subject_id,assignment_type) VALUES
      ('ta1','teacher','school','season','c8a','${o.subject_id}','SUBJECT'),('ta2','rehber','school','season','c8a',NULL,'GUIDANCE'),
      ('ta3','other','school','season','c8b','${o.subject_id}','SUBJECT'),('ta4','other','school','season','c8a','sub_tur','SUBJECT');`);
  const blank = t.db.prepare(`SELECT sa.exam_question_id id FROM student_answers sa JOIN exam_participants ep ON ep.id=sa.participant_id JOIN question_outcomes qo ON qo.exam_question_id=sa.exam_question_id WHERE ep.student_id='s1' AND sa.status='BLANK' AND qo.outcome_id=?`).get(o.id) as any;
  const right = t.db.prepare(`SELECT sa.exam_question_id id FROM student_answers sa JOIN exam_participants ep ON ep.id=sa.participant_id WHERE ep.student_id='s1' AND sa.status='CORRECT'`).get() as any;
  return { t, o, blank: blank.id as string, right: right.id as string };
}

const YEAR = `(SELECT academic_year FROM curriculum_versions WHERE id='cv8')`;
function addActivities(t: any, o: any) {
  t.db.exec(`UPDATE platform_features SET enabled_default=1 WHERE feature_key='LEARNING_UNIVERSE';
    INSERT INTO lu_game_contents(id,content_kind,outcome_id,academic_year,grade_level,subject_id,public_json,answer_json,copyright_status,review_status) VALUES
     ('gp1','PAIRS','${o.id}',${YEAR},8,'${o.subject_id}','{"left":[{"id":"a","text":"2³"},{"id":"b","text":"3²"}],"right":[{"id":"1","text":"8"},{"id":"2","text":"9"}]}','{"pairs":[["a","1"],["b","2"]]}','OWNED','APPROVED'),
     ('gp2','PAIRS','${o.id}',${YEAR},8,'${o.subject_id}','{"left":[{"id":"a","text":"2⁴"},{"id":"b","text":"5²"}],"right":[{"id":"1","text":"16"},{"id":"2","text":"25"}]}','{"pairs":[["a","1"],["b","2"]]}','OWNED','APPROVED');`);
}
async function failedMiniTest(t: any, o: any, blank: string) {
  const as = (path: string, method = 'GET', body?: any) => t.request(`/api/nibiru/coach/loops${path}`, method, body, 'stuuser');
  const id = (await as('', 'POST', { examQuestionId: blank })).data.loop.id;
  const mt = await as(`/${id}/mini-test`, 'POST');
  const test = (await t.request(`/api/nibiru/coach/mini-tests/${mt.data.testId}`, 'GET', undefined, 'stuuser')).data;
  await t.request(`/api/nibiru/coach/mini-tests/${mt.data.testId}/submit`, 'POST', { answers: test.questions.map((x: any) => ({ questionId: x.id, answer: 'B' })) }, 'stuuser');
  return { id, as };
}
/** Right (or wrong) answers built from the stored keys, the way a student who knows (or does not) would answer. */
function responses(t: any, sessionId: string, right: boolean) {
  return (t.db.prepare(`SELECT seq,kind,answer_json FROM lu_session_items WHERE session_id=? ORDER BY seq`).all(sessionId) as any[]).map((r) => {
    const key = JSON.parse(r.answer_json);
    if (r.kind === 'PAIRS') return { seq: r.seq, response: { pairs: right ? key.pairs : key.pairs.map((p: any, k: number, all: any[]) => [p[0], all[(k + 1) % all.length][1]]) } };
    return { seq: r.seq, response: { answer: right ? key.correct : (key.correct === 'A' ? 'B' : 'A') } };
  });
}

it('the loop game is an Öğrenme Evreni game when activities exist; passing closes the loop', async () => {
  const { t, o, blank } = await setup();
  try {
    addActivities(t, o);
    const { id, as } = await failedMiniTest(t, o, blank);
    expect((await as(`/${id}`)).data).toMatchObject({ step: 'GAME', gameKind: 'UNIVERSE', game: null });
    const game = await as(`/${id}/game`, 'POST');
    expect(game.response.status, game.text).toBe(200);
    const sessionId = game.data.universe.sessionId;
    expect(game.data.round).toMatchObject({ status: 'READY', universe: { sessionId } });
    expect((await as(`/${id}/game`, 'POST')).data.universe.sessionId).toBe(sessionId);   // the same game, not a new one
    const view = await t.request(`/api/student-standard/universe/sessions/${sessionId}`, 'GET', undefined, 'stuuser');
    expect(view.data.session.template.code).toBe('LU_FINAL');                           // two kinds → the outcome final
    expect(new Set(view.data.items.map((i: any) => i.kind)).size).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(view.data)).not.toMatch(/"pairs":\[\["a","1"\]|"correct":"A"/);   // no key before playing
    const sub = await t.request(`/api/student-standard/universe/sessions/${sessionId}/submit`, 'POST', { answers: responses(t, sessionId, true) }, 'stuuser');
    expect(sub.response.status, sub.text).toBe(200);
    const after = (await as(`/${id}`)).data;
    expect(after).toMatchObject({ step: 'PASSED', gameKind: 'UNIVERSE', game: { status: 'PASSED', universe: { sessionId } } });
    expect(after.game.correct).toBe(after.game.questionCount);
    expect(t.db.prepare(`SELECT game_round_id FROM nibiru_outcome_loops WHERE id=?`).get(id)).toEqual({ game_round_id: null });

    // the karne shows the learning stage of the same record
    const ev = (await t.request('/api/reporting/students/s1/outcome-evidence', 'GET', undefined, 'stuuser')).data.outcomes.find((x: any) => x.outcomeId === o.id);
    expect(ev).toMatchObject({ stage: expect.stringMatching(/STARTED|DEVELOPING|CONSOLIDATING|LEARNED/), stageLabel: expect.any(String), reviewDue: false });
    expect(ev.bySource.GAME.attempts).toBeGreaterThan(0);
  } finally { t.db.close(); }
}, 90000);

it('a failed Evren game sends the loop to the teacher; with the universe off the question round stays', async () => {
  const { t, o, blank } = await setup();
  try {
    addActivities(t, o);
    const { id, as } = await failedMiniTest(t, o, blank);
    const sessionId = (await as(`/${id}/game`, 'POST')).data.universe.sessionId;
    await t.request(`/api/student-standard/universe/sessions/${sessionId}/submit`, 'POST', { answers: responses(t, sessionId, false) }, 'stuuser');
    const after = (await as(`/${id}`)).data;
    expect(after).toMatchObject({ step: 'TEACHER_REVIEW', game: { status: 'FAILED' }, loop: { teacherReason: 'GAME_NOT_ENOUGH' } });

    // Evren play feeds Dejavu: the outcome becomes a gap and the played questions are never printed again
    expect((await dejavuGaps(t.env, 's1', 'school', 10)).map((g) => g.outcomeId)).toContain(o.id);
    const played = (t.db.prepare(`SELECT ref_id FROM lu_session_items WHERE session_id=? AND source='QUESTION_BANK'`).all(sessionId) as any[]).map((r) => r.ref_id);
    const seen = await seenQuestionIds(t.env, 's1');
    expect(played.length).toBeGreaterThan(0);
    for (const q of played) expect(seen.has(q)).toBe(true);

    // another outcome loop with the universe switched off: the earlier quick question round
    t.db.exec(`UPDATE platform_features SET enabled_default=0 WHERE feature_key='LEARNING_UNIVERSE'; UPDATE nibiru_outcome_loops SET status='CLOSED' WHERE id='${id}'`);
    const second = await failedMiniTest(t, o, blank);
    expect((await second.as(`/${second.id}`)).data).toMatchObject({ step: 'GAME', gameKind: 'QUICK' });
    const round = await second.as(`/${second.id}/game`, 'POST');
    expect(round.data.universe).toBeUndefined();
    expect(round.data.questions.length).toBe(5);
  } finally { t.db.close(); }
}, 90000);
