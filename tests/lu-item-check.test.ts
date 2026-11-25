import { expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/** Öğrenme Evreni animasyonlu oyunlar (owner, 25 Nov 2026): one answer checked at once, locked, still paid once. Synthetic data only. */
async function setup() {
  const t = await evaluatedExam('direct', { outcomes: true });
  t.db.exec(`UPDATE platform_features SET enabled_default=1 WHERE feature_key='LEARNING_UNIVERSE'`);
  const o = t.db.prepare(`SELECT o.id,o.code,o.subject_id,cv.academic_year y FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE o.code='M.8.1.1'`).get() as any;
  t.db.prepare(`INSERT OR IGNORE INTO learning_nodes(id,academic_year,node_type,subject_id,grade_level,code,title) VALUES(?,?,'OUTCOME',?,8,'M.8.1.1','Sentetik')`).run(`ln_${o.id}`, o.y, o.subject_id);
  const q = t.db.prepare(`INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,solution_text,option_count,copyright_status,review_status) VALUES(?,'PLATFORM',?,8,?,'MULTIPLE_CHOICE',?,'["-32","32","-16","16"]','A',?,4,'OWNED','APPROVED')`);
  for (let i = 1; i <= 4; i++) { q.run(`ac${i}`, o.y, o.subject_id, `Sentetik soru ${i}`, i === 1 ? '(-2)⁵ = -32' : null); t.db.prepare('INSERT INTO question_learning_links(question_id,node_id) VALUES(?,?)').run(`ac${i}`, `ln_${o.id}`); }
  t.db.prepare(`INSERT INTO lu_game_contents(id,content_kind,outcome_id,academic_year,grade_level,subject_id,public_json,answer_json,copyright_status,review_status) VALUES(?,?,?,?,8,?,?,?,?,?)`)
    .run('ac_seq', 'SEQUENCE', o.id, o.y, o.subject_id, JSON.stringify({ items: [{ id: 'x', text: 'Üssü yaz' }, { id: 'y', text: 'Çarp' }, { id: 'z', text: 'Sonucu yaz' }] }), JSON.stringify({ order: ['x', 'y', 'z'], explanation: 'Önce üs, sonra çarpma.' }), 'OWNED', 'APPROVED');
  return { t, o };
}
const start = (t: any, body: any) => t.request('/api/student-standard/universe/sessions', 'POST', body, 'stuuser');
const check = (t: any, id: string, seq: number, response: any, who = 'stuuser') => t.request(`/api/student-standard/universe/sessions/${id}/items/${seq}/check`, 'POST', { response }, who);

it('checks one answer at once, tied to the outcome, locks it and keeps it at submit', async () => {
  const { t, o } = await setup();
  try {
    const s = await start(t, { templateCode: 'LU_CHOICE', outcomeId: o.id });
    expect(s.response.status, s.text).toBe(201);
    expect(s.data.session.outcome).toMatchObject({ id: o.id, code: 'M.8.1.1' });   // every play names its outcome
    expect(s.data.session.gradeLevel).toBe(8);
    const id = s.data.session.id, items = s.data.items;
    expect(JSON.stringify(items)).not.toContain('"correct"');                      // no key before an answer

    expect((await check(t, id, items[0].seq, null)).response.status).toBe(400);   // nothing chosen: nothing checked
    const first = await check(t, id, items[0].seq, { answer: 'B' });
    expect(first.data).toMatchObject({ ok: true, correct: false, key: { correct: 'A' }, locked: false });
    const again = await check(t, id, items[0].seq, { answer: 'A' });                 // trying again does not regrade
    expect(again.data).toMatchObject({ correct: false, locked: true });
    expect((await check(t, id, items[1].seq, { answer: 'A' })).data).toMatchObject({ correct: true });
    expect((await check(t, id, 99, { answer: 'A' })).response.status).toBe(404);

    // the submit keeps the locked answers, whatever the client sends now
    const answers = items.map((it: any) => ({ seq: it.seq, response: { answer: 'A' } }));
    const done = await t.request(`/api/student-standard/universe/sessions/${id}/submit`, 'POST', { answers }, 'stuuser');
    expect(done.data.session).toMatchObject({ status: 'SUBMITTED', answered: 4, correct: 3 });
    expect(done.data.items[0].response).toEqual({ answer: 'B' });
    expect(t.db.prepare(`SELECT count(*) n FROM lu_xp_ledger WHERE source_id=?`).get(id)).toMatchObject({ n: 1 });
    expect((await check(t, id, items[2].seq, { answer: 'B' })).data).toMatchObject({ correct: true, locked: true });

    // the answers count for this outcome in the karne
    const ev = (await t.request('/api/reporting/students/s1/outcome-evidence', 'GET', undefined, 'admin')).data.outcomes.find((x: any) => x.code === 'M.8.1.1');
    expect(ev.bySource.GAME).toEqual({ attempts: 4, correct: 3 });
  } finally { t.db.close(); }
});

it('gives the explanation after the answer and keeps other students out', async () => {
  const { t, o } = await setup();
  try {
    const s = await start(t, { templateCode: 'LU_ORDER', outcomeId: o.id, itemCount: 1 });
    expect(s.response.status, s.text).toBe(201);
    const id = s.data.session.id;
    const r = await check(t, id, 1, { order: ['x', 'z', 'y'] });
    expect(r.data).toMatchObject({ correct: false, key: { order: ['x', 'y', 'z'] }, explanation: 'Önce üs, sonra çarpma.' });
    expect(r.data.partial).toBeGreaterThan(0);
    const q = await start(t, { templateCode: 'LU_CHOICE', outcomeId: o.id });
    const withSolution = q.data.items.find((it: any) => it.content.stem === 'Sentetik soru 1');
    if (withSolution) expect((await check(t, q.data.session.id, withSolution.seq, { answer: 'A' })).data.explanation).toBe('(-2)⁵ = -32');
    expect((await check(t, id, 1, { order: ['x', 'y', 'z'] }, 'admin')).response.status).toBe(403);
  } finally { t.db.close(); }
});
