import { expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { questionsToLearned } from '../worker/lib/nibiru-outcome-loop';
import app from '../worker/preview-policy-production-entry';
import { createSession } from '../worker/lib/auth';

/** Requests as a user the shared helper has no session for (the synthetic guidance and other-class teachers). */
async function asUser(t: any, userId: string, path: string, method = 'GET', body?: any) {
  const cookie = (await createSession(t.env, userId, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const res = await (app as any).fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookie, Origin: 'https://app.anunex.com', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) }), t.env, { waitUntil() {}, passThroughOnException() {} });
  return { response: res, data: await res.json().catch(() => null) as any };
}

/**
 * Nibiru kazanım iyileştirme döngüsü (owner, 9 Nov 2026): a wrong/blank deneme question → approved video →
 * mini test → mini game → teacher notification, told once and only to the class's own teachers. Synthetic data only.
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

it('walks a blank deneme question through video, mini test and game, then tells the class teachers once', async () => {
  const { t, o, blank, right } = await setup();
  try {
    const as = (path: string, method = 'GET', body?: any) => t.request(`/api/nibiru/coach/loops${path}`, method, body, 'stuuser');
    t.db.prepare(`INSERT INTO video_links(id,outcome_id,link_type,url,approved,title) VALUES('vl1',?,'TOPIC','https://www.youtube.com/watch?v=synthetic',1,'Üslü ifadeler')`).run(o.id);
    t.db.prepare(`INSERT INTO video_links(id,outcome_id,link_type,url,approved,title) VALUES('vl0',?,'TOPIC','https://www.youtube.com/watch?v=unapproved',0,'Onaysız')`).run(o.id);

    // only the student's own wrong/blank question opens a loop; staff and correct answers do not
    expect((await as('', 'POST', { examQuestionId: right })).response.status).toBe(404);
    expect((await t.request('/api/nibiru/coach/loops', 'POST', { examQuestionId: blank }, 'teacher')).response.status).toBe(403);
    const started = await as('', 'POST', { examQuestionId: blank });
    expect(started.response.status, started.text).toBe(201);
    expect(started.data).toMatchObject({ step: 'VIDEO', outcome: { code: 'M.8.1.1' }, video: { url: 'https://www.youtube.com/watch?v=synthetic', provider: 'YOUTUBE' } });
    const id = started.data.loop.id;
    expect((await as('', 'POST', { examQuestionId: blank })).data.loop.id).toBe(id); // one running loop per outcome

    expect((await as(`/${id}/mini-test`, 'POST')).data.error.code).toBe('VIDEO_FIRST');
    expect((await as(`/${id}/video-done`, 'POST')).data.step).toBe('MINI_TEST');
    const mt = await as(`/${id}/mini-test`, 'POST');
    expect(mt.response.status, mt.text).toBe(200);
    const test = (await t.request(`/api/nibiru/coach/mini-tests/${mt.data.testId}`, 'GET', undefined, 'stuuser')).data;
    const testIds = test.questions.map((x: any) => x.id);
    expect(testIds).toHaveLength(5);
    const sub = await t.request(`/api/nibiru/coach/mini-tests/${mt.data.testId}/submit`, 'POST', { answers: testIds.map((questionId: string) => ({ questionId, answer: 'B' })) }, 'stuuser');
    expect(sub.response.status, sub.text).toBe(200);
    expect((await as(`/${id}`)).data).toMatchObject({ step: 'GAME', miniTest: { status: 'FAILED', correct: 0 } });

    // the game: five other approved questions of the outcome, answers hidden until it is played
    const game = await as(`/${id}/game`, 'POST');
    expect(game.response.status, game.text).toBe(200);
    const gameIds = game.data.questions.map((x: any) => x.id);
    expect(gameIds).toHaveLength(5);
    expect(gameIds.some((x: string) => testIds.includes(x))).toBe(false);
    expect(game.data.questions[0].correct_answer).toBeUndefined();
    expect((await as(`/${id}/game/submit`, 'POST', { answers: gameIds.slice(1).map((questionId: string) => ({ questionId, answer: 'A' })) })).data.error.code).toBe('ALL_QUESTIONS_REQUIRED');
    // 3 of 5 right is under 80%: the teachers of the class are told
    const played = await as(`/${id}/game/submit`, 'POST', { answers: gameIds.map((questionId: string, i: number) => ({ questionId, answer: i < 3 ? 'A' : i === 3 ? 'C' : '' })) });
    expect(played.data).toMatchObject({ step: 'TEACHER_REVIEW', loop: { teacherReason: 'GAME_NOT_ENOUGH', teacherNotified: 2 }, game: { status: 'FAILED', correct: 3 } });
    const told = () => (t.db.prepare(`SELECT recipient_user_id r FROM notifications WHERE type='NIBIRU_OUTCOME_SUPPORT' ORDER BY r`).all() as any[]).map((x) => x.r);
    expect(told()).toEqual(['rehber', 'teacher']);
    const body = String((t.db.prepare(`SELECT body FROM notifications WHERE recipient_user_id='teacher'`).get() as any).body);
    expect(body).toContain('Yılmaz'); expect(body).toContain('M.8.1.1'); expect(body).toContain('mini oyun');
    await as(`/${id}`); await as(`/${id}/game/submit`, 'POST', { answers: [] });
    expect(told()).toHaveLength(2);

    // the game answers are evidence in the unified karne (XP is not)
    const ev = (await t.request('/api/reporting/students/s1/outcome-evidence', 'GET', undefined, 'admin')).data.outcomes.find((x: any) => x.code === 'M.8.1.1');
    expect(ev.bySource.GAME).toEqual({ attempts: 5, correct: 3 });

    // the teachers who were told see the student in their list; a teacher of another class or subject does not
    const queue = async (who: string, q = '') => (['rehber', 'other'].includes(who) ? await asUser(t, who, `/api/reporting/outcome-loops${q}`) : await t.request(`/api/reporting/outcome-loops${q}`, 'GET', undefined, who)).data;
    expect((await queue('teacher')).loops.map((r: any) => [r.id, r.outcome_code, r.game_correct, r.class_name])).toEqual([[id, 'M.8.1.1', 3, '8/A']]);
    expect((await queue('rehber')).loops).toHaveLength(1);
    expect((await queue('other')).loops).toHaveLength(0);
    expect((await queue('admin')).loops).toHaveLength(1);
    expect((await t.request('/api/reporting/outcome-loops', 'GET', undefined, 'stuuser')).response.status).toBe(403);
    expect((await t.request('/api/dashboard', 'GET', undefined, 'teacher')).data.today?.outcomeSupport).toBe(1);
    expect((await asUser(t, 'other', `/api/reporting/outcome-loops/${id}/close`, 'POST', { kind: 'ONE_TO_ONE' })).response.status).toBe(404);
    expect((await t.request(`/api/reporting/outcome-loops/${id}/close`, 'POST', { kind: 'NOPE' }, 'teacher')).response.status).toBe(400);
    const closed = await t.request(`/api/reporting/outcome-loops/${id}/close`, 'POST', { kind: 'ONE_TO_ONE', note: 'Birebir tekrar yapıldı' }, 'teacher');
    expect(closed.response.status, closed.text).toBe(200);
    expect((await asUser(t, 'rehber', `/api/reporting/outcome-loops/${id}/close`, 'POST', { kind: 'ONE_TO_ONE' })).response.status).toBe(409);
    expect(t.db.prepare(`SELECT kind,note,created_by FROM learning_interventions WHERE student_id='s1'`).all()).toEqual([{ kind: 'ONE_TO_ONE', note: 'Birebir tekrar yapıldı', created_by: 'teacher' }]);
    expect((await queue('teacher')).loops).toHaveLength(0);
    expect((await queue('teacher', '?status=CLOSED')).loops).toHaveLength(1);
    expect(t.db.prepare(`SELECT read_at FROM notifications WHERE recipient_user_id='teacher'`).get()).toMatchObject({ read_at: expect.any(String) });

    // a new loop for the same outcome may start, but it cannot repeat the notification within the quiet period:
    // no new approved questions are left, so the teacher review is noted without telling anyone again
    const again = await as('', 'POST', { outcomeId: o.id });
    expect(again.response.status, again.text).toBe(201);
    expect(again.data.loop.id).not.toBe(id);
    await as(`/${again.data.loop.id}/video-done`, 'POST');
    const none = await as(`/${again.data.loop.id}/mini-test`, 'POST');
    expect(none.data).toMatchObject({ error: { code: 'NOT_ENOUGH_QUESTIONS' }, teacherNotified: 0 });
    expect((await as(`/${again.data.loop.id}`)).data.step).toBe('TEACHER_REVIEW');
    expect(told()).toHaveLength(2);
    expect((await as('')).data.loops).toHaveLength(2);
  } finally { t.db.close(); }
}, 60000);

it('passes on the mini test without a video, says when the badge still needs more questions, and refuses unverified outcomes', async () => {
  const { t, o } = await setup();
  try {
    const as = (path: string, method = 'GET', body?: any) => t.request(`/api/nibiru/coach/loops${path}`, method, body, 'stuuser');
    const started = await as('', 'POST', { outcomeId: o.id });
    expect(started.data).toMatchObject({ step: 'MINI_TEST', video: null, videoMissing: true });
    const id = started.data.loop.id;
    const mt = await as(`/${id}/mini-test`, 'POST');
    const ids = (await t.request(`/api/nibiru/coach/mini-tests/${mt.data.testId}`, 'GET', undefined, 'stuuser')).data.questions.map((x: any) => x.id);
    await t.request(`/api/nibiru/coach/mini-tests/${mt.data.testId}/submit`, 'POST', { answers: ids.map((questionId: string) => ({ questionId, answer: 'A' })) }, 'stuuser');
    const done = (await as(`/${id}`)).data;
    // 5 right in the mini test + the deneme's 2 right / 2 blank: 9 different questions, 7 right (78%) — one short
    expect(done).toMatchObject({ step: 'PASSED', loop: { badgeAt: null, badgeNeed: 1, teacherNotified: 0 } });
    expect((await as(`/${id}/game`, 'POST')).data.error.code).toBe('LOOP_CLOSED');
    expect(t.db.prepare(`SELECT count(*) n FROM notifications WHERE type='NIBIRU_OUTCOME_SUPPORT'`).get()).toMatchObject({ n: 0 });

    // one more different question answered right in question practice: 8 of 10 (80%) → the badge
    const fresh = t.db.prepare(`SELECT id FROM question_bank WHERE id LIKE 'qz%' AND id NOT IN (SELECT question_id FROM coach_mini_test_questions) LIMIT 1`).get() as any;
    t.db.prepare(`INSERT INTO question_practice_attempts(id,student_id,question_id,selected_answer,is_correct) VALUES('pa1','s1',?,'A',1)`).run(fresh.id);
    expect((await as(`/${id}`)).data.loop.badgeAt).toBeTruthy();

    t.db.exec(`UPDATE curriculum_versions SET verified=0 WHERE id='cv8'`);
    const tur = t.db.prepare(`SELECT id FROM outcomes WHERE code='T.8.1.1'`).get() as any;
    expect((await as('', 'POST', { outcomeId: tur.id })).data.error.code).toBe('OUTCOME_NOT_VERIFIED');
  } finally { t.db.close(); }
}, 60000);

it('counts the different right answers the badge still needs', () => {
  expect(questionsToLearned(0, 0)).toBe(8);
  expect(questionsToLearned(9, 7)).toBe(1);
  expect(questionsToLearned(5, 1)).toBe(15);
  expect(questionsToLearned(10, 9)).toBe(1); // already enough: never shows 0 before the badge is given
});
