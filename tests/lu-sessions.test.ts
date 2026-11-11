import { expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/** Öğrenme Evreni PR-1 (owner, 11 Nov 2026): selection, server grading, once-only XP, evidence, content gaps. Synthetic data only. */
async function setup() {
  const t = await evaluatedExam('direct', { outcomes: true });
  t.db.exec(`UPDATE platform_features SET enabled_default=1 WHERE feature_key='LEARNING_UNIVERSE'`);
  const o = t.db.prepare(`SELECT o.id,o.subject_id,cv.academic_year y FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE o.code='M.8.1.1'`).get() as any;
  t.db.prepare(`INSERT OR IGNORE INTO learning_nodes(id,academic_year,node_type,subject_id,grade_level,code,title) VALUES(?,?,'OUTCOME',?,8,'M.8.1.1','Sentetik')`).run(`ln_${o.id}`, o.y, o.subject_id);
  const q = t.db.prepare(`INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,option_count,copyright_status,review_status) VALUES(?,'PLATFORM',?,8,?,'MULTIPLE_CHOICE',?,'["-32","32","-16","16"]','A',4,'OWNED','APPROVED')`);
  for (let i = 1; i <= 6; i++) { q.run(`lq${i}`, o.y, o.subject_id, `Sentetik soru ${i}`); t.db.prepare('INSERT INTO question_learning_links(question_id,node_id) VALUES(?,?)').run(`lq${i}`, `ln_${o.id}`); }
  const c = t.db.prepare(`INSERT INTO lu_game_contents(id,content_kind,outcome_id,academic_year,grade_level,subject_id,public_json,answer_json,copyright_status,review_status) VALUES(?,?,?,?,8,?,?,?,?,?)`);
  const pairs = JSON.stringify({ left: [{ id: 'a', text: '2³' }, { id: 'b', text: '3²' }], right: [{ id: '1', text: '8' }, { id: '2', text: '9' }] });
  c.run('gc_pairs1', 'PAIRS', o.id, o.y, o.subject_id, pairs, JSON.stringify({ pairs: [['a', '1'], ['b', '2']] }), 'OWNED', 'APPROVED');
  c.run('gc_pairs_draft', 'PAIRS', o.id, o.y, o.subject_id, pairs, JSON.stringify({ pairs: [['a', '1'], ['b', '2']] }), 'OWNED', 'DRAFT');
  c.run('gc_pairs_rights', 'PAIRS', o.id, o.y, o.subject_id, pairs, JSON.stringify({ pairs: [['a', '1'], ['b', '2']] }), 'RESTRICTED', 'APPROVED');
  c.run('gc_seq1', 'SEQUENCE', o.id, o.y, o.subject_id, JSON.stringify({ items: [{ id: 'x', text: 'Üssü yaz' }, { id: 'y', text: 'Çarp' }, { id: 'z', text: 'Sonucu yaz' }] }), JSON.stringify({ order: ['x', 'y', 'z'] }), 'OWNED', 'APPROVED');
  c.run('gc_cloze1', 'CLOZE', o.id, o.y, o.subject_id, JSON.stringify({ text: '2³ = [b1]', blanks: [{ id: 'b1' }] }), JSON.stringify({ blanks: { b1: { numeric: { value: 8 } } } }), 'OWNED', 'APPROVED');
  return { t, o };
}
const start = (t: any, body: any) => t.request('/api/student-standard/universe/sessions', 'POST', body, 'stuuser');

it('serves only new approved items, hides the key, grades on the server and pays XP once', async () => {
  const { t, o } = await setup();
  try {
    t.db.exec(`UPDATE platform_features SET enabled_default=0 WHERE feature_key='LEARNING_UNIVERSE'`);
    expect((await start(t, { templateCode: 'LU_CHOICE', outcomeId: o.id })).response.status).toBe(403);
    t.db.exec(`UPDATE platform_features SET enabled_default=1 WHERE feature_key='LEARNING_UNIVERSE'`);

    const s = await start(t, { templateCode: 'LU_CHOICE', outcomeId: o.id, clientKey: 'play-0001-abc' });
    expect(s.response.status, s.text).toBe(201);
    expect(s.data.items).toHaveLength(6);
    expect(JSON.stringify(s.data.items)).not.toContain('"correct"');
    expect(s.data.items.every((x: any) => !('key' in x) && !('response' in x))).toBe(true);
    expect(s.data.items[0].content.options.map((x: any) => x.key)).toEqual(['A', 'B', 'C', 'D']);
    const again = await start(t, { templateCode: 'LU_CHOICE', outcomeId: o.id, clientKey: 'play-0001-abc' });
    expect(again.data.session.id).toBe(s.data.session.id);   // same play, not a second one

    const id = s.data.session.id;
    const answers = s.data.items.map((it: any, k: number) => ({ seq: it.seq, response: { answer: k < 4 ? 'A' : 'B' } }));
    const done = await t.request(`/api/student-standard/universe/sessions/${id}/submit`, 'POST', { answers, score: 100 }, 'stuuser');
    expect(done.data.session).toMatchObject({ status: 'SUBMITTED', answered: 6, correct: 4, xp: 23 });
    expect(done.data.items[0].key).toEqual({ correct: 'A' });
    const resend = await t.request(`/api/student-standard/universe/sessions/${id}/submit`, 'POST', { answers: answers.map((a: any) => ({ ...a, response: { answer: 'A' } })) }, 'stuuser');
    expect(resend.data.session).toMatchObject({ correct: 4, xp: 23 });
    expect(t.db.prepare(`SELECT count(*) n,sum(xp) xp FROM lu_xp_ledger WHERE student_id='s1'`).get()).toMatchObject({ n: 1, xp: 23 });
    expect(t.db.prepare(`SELECT xp FROM gamification_profiles WHERE student_id='s1'`).get()).toMatchObject({ xp: 23 });

    // the karne counts the six answers as GAME evidence; XP is not accuracy
    const ev = (await t.request('/api/reporting/students/s1/outcome-evidence', 'GET', undefined, 'admin')).data.outcomes.find((x: any) => x.code === 'M.8.1.1');
    expect(ev.bySource.GAME).toEqual({ attempts: 6, correct: 4 });

    // practice never repeats: nothing new left → a recorded gap, with the repeat option offered; REVIEW marks repeats
    const gap = await start(t, { templateCode: 'LU_CHOICE', outcomeId: o.id });
    expect(gap.response.status).toBe(409);
    expect(gap.data).toMatchObject({ error: { code: 'CONTENT_GAP' }, available: 0, repeatAvailable: 6 });
    expect(t.db.prepare(`SELECT template_kind,needed,available,hits FROM lu_content_gaps WHERE outcome_id=?`).get(o.id)).toMatchObject({ template_kind: 'CHOICE', needed: 3, available: 0, hits: 1 });
    const review = await start(t, { templateCode: 'LU_CHOICE', outcomeId: o.id, mode: 'REVIEW' });
    expect(review.data.session.mode).toBe('REVIEW');
    expect(review.data.items.every((x: any) => x.repeat)).toBe(true);
    expect((await t.request(`/api/student-standard/universe/sessions/${review.data.session.id}`, 'GET', undefined, 'teacher')).response.status).toBe(403);
  } finally { t.db.close(); }
}, 90000);

it('uses only approved, rights-cleared content; a final mixes kinds; refuses unverified outcomes, wrong grades and expired plays', async () => {
  const { t, o } = await setup();
  try {
    const match = await start(t, { templateCode: 'LU_MATCH', outcomeId: o.id });
    expect(match.response.status, match.text).toBe(201);
    expect(match.data.items.map((x: any) => x.kind)).toEqual(['PAIRS']);             // the draft and the restricted copies stay out
    const r = await t.request(`/api/student-standard/universe/sessions/${match.data.session.id}/submit`, 'POST', { answers: [{ seq: 1, response: { pairs: [['a', '1'], ['b', '1']] } }] }, 'stuuser');
    expect(r.data.items[0]).toMatchObject({ correct: false, partial: 0.5 });

    const fin = await start(t, { templateCode: 'LU_FINAL', outcomeId: o.id });
    expect(fin.response.status, fin.text).toBe(201);
    expect(new Set(fin.data.items.map((x: any) => x.kind)).size).toBeGreaterThanOrEqual(2);
    expect(fin.data.items.some((x: any) => x.kind === 'PAIRS')).toBe(false);          // already played → not in a final

    const cloze = await start(t, { templateCode: 'LU_FILL', outcomeId: o.id });
    expect(cloze.data).toMatchObject({ error: { code: 'CONTENT_GAP' }, needed: 2 });

    t.db.exec(`UPDATE lu_game_templates SET min_grade=9 WHERE code='LU_ORDER'`);
    expect((await start(t, { templateCode: 'LU_ORDER', outcomeId: o.id })).data.error.code).toBe('TEMPLATE_NOT_FOR_GRADE');
    const tur = t.db.prepare(`SELECT id FROM outcomes WHERE code='T.8.1.1'`).get() as any;
    t.db.exec(`UPDATE curriculum_versions SET verified=0 WHERE id=(SELECT curriculum_version_id FROM outcomes WHERE code='T.8.1.1')`);
    expect((await start(t, { templateCode: 'LU_CHOICE', outcomeId: tur.id })).data.error.code).toBe('OUTCOME_NOT_VERIFIED');

    t.db.prepare(`UPDATE lu_sessions SET expires_at=datetime('now','-1 minute') WHERE id=?`).run(fin.data.session.id);
    expect((await t.request(`/api/student-standard/universe/sessions/${fin.data.session.id}/submit`, 'POST', { answers: [] }, 'stuuser')).data.error.code).toBe('SESSION_EXPIRED');
  } finally { t.db.close(); }
}, 90000);
