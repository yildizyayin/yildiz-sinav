import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
import { dueMillis, revealed } from '../worker/lib/homework';

/** A060: online homework — solve, draft, submit once, answers hidden until the reveal moment, mistakes, class results. Synthetic data only. */
const opts = `json('[{"label":"A","text":"bir"},{"label":"B","text":"iki"},{"label":"C","text":"üç"},{"label":"D","text":"dört"}]')`;
const SOLUTION = 'Sentetik çözüm metni: ana fikir ikinci paragraftadır.';
async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec(`UPDATE platform_features SET enabled_default=1 WHERE feature_key='ASSIGNMENTS';
    INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,option_count,copyright_status,review_status,solution_text) VALUES
      ('h1','PLATFORM','2026-2027',8,'sub_tur','MULTIPLE_CHOICE','Ödev sorusu 1',${opts},'B',4,'OWNED','APPROVED','${SOLUTION}'),
      ('h2','PLATFORM','2026-2027',8,'sub_tur','MULTIPLE_CHOICE','Ödev sorusu 2',${opts},'C',4,'OWNED','APPROVED',NULL),
      ('h3','PLATFORM','2026-2027',8,'sub_tur','MULTIPLE_CHOICE','Ödev sorusu 3',${opts},'D',4,'OWNED','APPROVED',NULL);
    INSERT INTO question_learning_links(question_id,node_id) VALUES('h1','ln_o_tur1'),('h2','ln_o_tur1');
    INSERT INTO question_assets(id,question_id,asset_type,external_url,title,approved) VALUES('v1','h1','SOLUTION_VIDEO','https://video.example/h1','Video çözüm',1),('v2','h2','SOLUTION_VIDEO','https://video.example/unapproved','Onaysız',0);
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('tch2','TEACHER','Diğer öğretmen','unused','unused',1,'school');`);
  const cookie = (await createSession(t.env, 'tch2', new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const app = (await import('../worker/preview-policy-production-entry')).default as any;
  const asOther = async (path: string) => { const r = await app.fetch(new Request(`https://app.anunex.com${path}`, { headers: { Cookie: cookie } }), t.env, { waitUntil() {} }); return r.status; };
  const create = async (body: any) => { const r = await t.request('/api/platform/assignments', 'POST', { institutionId: 'school', title: 'Türkçe ödev', publish: true, studentIds: ['s1'], items: ['h1', 'h2', 'h3'].map((q) => ({ itemType: 'QUESTION', referenceId: q })), ...body }); expect(r.response.status, r.text).toBe(201); return r.data.id as string; };
  return { ...t, create, asOther };
}

describe('A060 online homework', () => {
  it('keeps the key hidden before submission, saves a draft, accepts one submission and reveals after the due date', async () => {
    const t = await setup();
    const future = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const id = await t.create({ dueAt: future });
    const view = await t.request(`/api/homework/${id}`, 'GET', undefined, 'stuuser');
    expect(view.response.status, view.text).toBe(200);
    expect(view.data.questions).toHaveLength(3);
    for (const q of view.data.questions) for (const k of ['correctAnswer', 'solution', 'solutionVideos', 'result', 'yourAnswer']) expect(q[k], k).toBeUndefined();
    expect(view.text).not.toContain(SOLUTION); expect(view.text).not.toContain('video.example');

    expect((await t.request(`/api/homework/${id}/draft`, 'PUT', { answers: { h1: 'b', h2: 'Z' } }, 'stuuser')).response.status).toBe(200);
    expect((await t.request(`/api/homework/${id}`, 'GET', undefined, 'stuuser')).data.draft.answers).toEqual({ h1: 'B' });
    expect(t.db.prepare(`SELECT status FROM assignment_recipients WHERE assignment_id=?`).get(id)).toMatchObject({ status: 'STARTED' });

    const sub = await t.request(`/api/homework/${id}/submit`, 'POST', { answers: { h1: 'B', h2: 'A' } }, 'stuuser');
    expect(sub.response.status, sub.text).toBe(200); expect(sub.data).toMatchObject({ correct: 1, total: 3 });
    expect((await t.request(`/api/homework/${id}/submit`, 'POST', { answers: { h1: 'B', h2: 'C', h3: 'D' } }, 'stuuser')).response.status).toBe(409);
    expect((await t.request(`/api/homework/${id}/draft`, 'PUT', { answers: {} }, 'stuuser')).response.status).toBe(409);

    const waiting = await t.request(`/api/homework/${id}`, 'GET', undefined, 'stuuser');
    expect(waiting.data.assignment).toMatchObject({ submitted: true, revealed: false });
    expect(waiting.data.questions[0].yourAnswer).toBe('B'); expect(waiting.data.questions[0].correctAnswer).toBeUndefined();
    expect(waiting.text).not.toContain(SOLUTION);
    expect((await t.request('/api/homework/mistakes', 'GET', undefined, 'stuuser')).data.mistakes).toEqual([]);

    t.db.prepare(`UPDATE assignments SET due_at='2020-01-01' WHERE id=?`).run(id);
    const open = await t.request(`/api/homework/${id}`, 'GET', undefined, 'stuuser');
    expect(open.data.assignment.revealed).toBe(true);
    expect(open.data.questions.map((q: any) => [q.yourAnswer, q.correctAnswer, q.result])).toEqual([['B', 'B', 'CORRECT'], ['A', 'C', 'WRONG'], [null, 'D', 'BLANK']]);
    expect(open.data.questions[0]).toMatchObject({ solution: SOLUTION, solutionVideos: [{ url: 'https://video.example/h1', title: 'Video çözüm' }] });
    expect(open.data.questions[1].solutionVideos).toEqual([]);
    expect(open.data.questions[0].outcomes[0].code).toBe('T.8.1.1');
    const mistakes = (await t.request('/api/homework/mistakes', 'GET', undefined, 'stuuser')).data.mistakes;
    expect(mistakes.map((m: any) => [m.questionId, m.result])).toEqual(expect.arrayContaining([['h2', 'WRONG'], ['h3', 'BLANK']]));
    expect(mistakes).toHaveLength(2);
  });

  it('reveals right after submission when the teacher chose so, and shows the class result only to the owner side', async () => {
    const t = await setup();
    const id = await t.create({ dueAt: new Date(Date.now() + 86400000).toISOString().slice(0, 10), answerReveal: 'AFTER_SUBMIT' });
    await t.request(`/api/homework/${id}/submit`, 'POST', { answers: { h1: 'B', h2: 'C', h3: 'A' } }, 'stuuser');
    expect((await t.request(`/api/homework/${id}`, 'GET', undefined, 'stuuser')).data.assignment.revealed).toBe(true);
    const res = await t.request(`/api/homework/${id}/results`);
    expect(res.response.status, res.text).toBe(200);
    expect(res.data).toMatchObject({ submitted: 1, pending: 0 });
    expect(res.data.questions.map((q: any) => [q.correct, q.wrong, q.blank])).toEqual([[1, 0, 0], [1, 0, 0], [0, 1, 0]]);
    expect(res.data.outcomes).toEqual([expect.objectContaining({ code: 'T.8.1.1', correct: 2, total: 2, percent: 100 })]);
    expect(await t.asOther(`/api/homework/${id}/results`)).toBe(403);
    expect((await t.request(`/api/homework/${id}/results`, 'GET', undefined, 'stuuser')).response.status).toBe(403);
    expect((await t.request(`/api/homework/${id}`, 'GET', undefined, 'parent')).response.status).toBe(403);
    expect((await t.request(`/api/homework/${id}/reveal`, 'PATCH', { answerReveal: 'AFTER_DUE' })).response.status).toBe(200);
    expect((await t.request(`/api/homework/${id}`, 'GET', undefined, 'stuuser')).data.assignment.revealed).toBe(false);
  });

  it('hides draft homework and homework of others from the student', async () => {
    const t = await setup();
    const draft = await t.create({ publish: false });
    expect((await t.request('/api/platform/assignments', 'GET', undefined, 'stuuser')).data.assignments.map((a: any) => a.id)).not.toContain(draft);
    expect((await t.request(`/api/homework/${draft}`, 'GET', undefined, 'stuuser')).response.status).toBe(404);
    expect((await t.request(`/api/homework/${draft}/submit`, 'POST', { answers: {} }, 'stuuser')).response.status).toBe(403);
  });

  it('treats a date-only due date as the end of that day in Türkiye', () => {
    expect(dueMillis('2026-10-25')).toBe(Date.parse('2026-10-25T23:59:59+03:00'));
    expect(dueMillis('2026-10-25T17:00')).toBe(Date.parse('2026-10-25T17:00:00+03:00'));
    expect(revealed({ answer_reveal: 'AFTER_DUE', due_at: null }, true)).toBe(true);
    expect(revealed({ answer_reveal: 'AFTER_SUBMIT', due_at: '2999-01-01' }, false)).toBe(false);
  });
});
