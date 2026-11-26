import { expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { byLevel } from '../worker/lib/learning-universe/personal';

/** Bireysel ilerleme (owner, 26 Nov 2026): adaptive level, own daily goal, "Ne öğrendim?". One student at a time; synthetic data only. */
it('puts the questions nearest the student’s level first and keeps the pool order for ties', () => {
  const pool = [{ id: 'a', d: 5 }, { id: 'b', d: 2 }, { id: 'c', d: null }, { id: 'd', d: 1 }, { id: 'e', d: 2 }];
  expect(byLevel(pool, 2, (x) => x.d).map((x) => x.id)).toEqual(['b', 'e', 'c', 'd', 'a']);
  expect(byLevel(pool, 5, (x) => x.d).map((x) => x.id)[0]).toBe('a');
});

async function setup() {
  const t = await evaluatedExam('direct', { outcomes: true });
  t.db.exec(`UPDATE platform_features SET enabled_default=1 WHERE feature_key='LEARNING_UNIVERSE'`);
  const o = t.db.prepare(`SELECT o.id,o.subject_id,cv.academic_year y FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE o.code='M.8.1.1'`).get() as any;
  t.db.prepare(`INSERT OR IGNORE INTO learning_nodes(id,academic_year,node_type,subject_id,grade_level,code,title) VALUES(?,?,'OUTCOME',?,8,'M.8.1.1','Sentetik')`).run(`ln_${o.id}`, o.y, o.subject_id);
  const ins = t.db.prepare(`INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,option_count,copyright_status,review_status,difficulty_level) VALUES(?,'PLATFORM',?,8,?,'MULTIPLE_CHOICE',?,'["-32","32","-16","16"]','A',4,'OWNED','APPROVED',?)`);
  [1, 1, 2, 4, 4, 5, 5, 4].forEach((lv, i) => { ins.run(`aq${i + 1}`, o.y, o.subject_id, `Sentetik soru ${i + 1}`, lv); t.db.prepare('INSERT INTO question_learning_links(question_id,node_id) VALUES(?,?)').run(`aq${i + 1}`, `ln_${o.id}`); });
  const play = async (rightOnes: number, itemCount = 3, mode = 'PRACTICE') => {
    const s = await t.request('/api/student-standard/universe/sessions', 'POST', { templateCode: 'LU_CHOICE', outcomeId: o.id, itemCount, mode }, 'stuuser');
    expect(s.response.status, s.text).toBe(201);
    const answers = s.data.items.map((it: any, k: number) => ({ seq: it.seq, response: { answer: k < rightOnes ? 'A' : 'B' } }));
    const done = (await t.request(`/api/student-standard/universe/sessions/${s.data.session.id}/submit`, 'POST', { answers }, 'stuuser')).data;
    return { start: s.data, done };
  };
  const levels = (start: any) => start.items.map((it: any) => Number(t.db.prepare(`SELECT q.difficulty_level l FROM lu_session_items i JOIN question_bank q ON q.id=i.ref_id WHERE i.session_id=? AND i.seq=?`).get(start.session.id, it.seq)!.l)).sort();
  return { t, o, play, levels };
}

it('starts a new student easy, moves up after strong answers, and listens to "Ne öğrendim?"', async () => {
  const { t, o, play, levels } = await setup();
  try {
    const first = await play(3);
    expect(levels(first.start)).toEqual([1, 1, 2]);                                  // no data yet: near level 2
    // "Kolaydı" on top of 3/3 lifts the next play to the hardest questions left
    expect((await t.request(`/api/student-standard/universe/sessions/${first.start.session.id}/reflection`, 'POST', { value: 'EASY' }, 'stuuser')).data).toMatchObject({ ok: true, reflection: 'EASY' });
    const second = await play(0);
    expect(levels(second.start)).toEqual([4, 5, 5]);
    expect(second.done.session.reflection).toBe(null);
    // a wrong value, a play that is not yours or not finished is refused
    expect((await t.request(`/api/student-standard/universe/sessions/${first.start.session.id}/reflection`, 'POST', { value: 'GREAT' }, 'stuuser')).response.status).toBe(400);
    expect((await t.request(`/api/student-standard/universe/sessions/${first.start.session.id}/reflection`, 'POST', { value: 'EASY' }, 'parent')).response.status).not.toBe(200);
    const open = await t.request('/api/student-standard/universe/sessions', 'POST', { templateCode: 'LU_CHOICE', outcomeId: o.id, itemCount: 3, mode: 'REVIEW' }, 'stuuser');
    expect((await t.request(`/api/student-standard/universe/sessions/${open.data.session.id}/reflection`, 'POST', { value: 'AGAIN' }, 'stuuser')).response.status).toBe(404);
    // "Tekrar etmeliyim" on the latest play brings the outcome back as today's review suggestion
    await t.request(`/api/student-standard/universe/sessions/${second.start.session.id}/reflection`, 'POST', { value: 'AGAIN' }, 'stuuser');
    const map = (await t.request('/api/student-standard/universe/map', 'GET', undefined, 'stuuser')).data;
    expect(map.missions[0]).toMatchObject({ type: 'REVIEW', outcomeId: o.id });
  } finally { t.db.close(); }
});

it('keeps the daily goal the student chose and counts today’s finished plays', async () => {
  const { t, play } = await setup();
  try {
    expect((await t.request('/api/student-standard/universe/map', 'GET', undefined, 'stuuser')).data.dailyGoal).toEqual({ plays: null, done: 0, reached: false });
    expect((await t.request('/api/student-standard/universe/goal', 'POST', { plays: 4 }, 'stuuser')).response.status).toBe(400);
    expect((await t.request('/api/student-standard/universe/goal', 'POST', { plays: 2 }, 'parent')).response.status).not.toBe(200);
    expect((await t.request('/api/student-standard/universe/goal', 'POST', { plays: 2 }, 'stuuser')).data).toMatchObject({ ok: true, plays: 2, done: 0, reached: false });
    const one = await play(2);
    expect(one.done.progress.goal).toEqual({ plays: 2, done: 1, reached: false });
    const two = await play(1);
    expect(two.done.progress.goal).toEqual({ plays: 2, done: 2, reached: true });
    expect((await t.request('/api/student-standard/universe/map', 'GET', undefined, 'stuuser')).data.dailyGoal).toEqual({ plays: 2, done: 2, reached: true });
  } finally { t.db.close(); }
});
