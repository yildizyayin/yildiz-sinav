import { expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { masteryStage } from '../worker/lib/learning-universe/map';

/** Öğrenme Evreni PR-3 (owner, 11 Nov 2026): the learning map — own grade and year only, never locked, only playable kinds offered. Synthetic data only. */
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
const map = (t: any, user = 'stuuser') => t.request('/api/student-standard/universe/map', 'GET', undefined, user);

it('masteryStage: six stages over the karne, recent progress not hidden by old mistakes', () => {
  const ev = (p: any) => ({ status: 'IN_PROGRESS', uniqueQuestions: 0, correct: 0, wrong: 0, blank: 0, recent: { uniqueQuestions: 0, rate: null }, ...p }) as any;
  expect(masteryStage(undefined)).toBe('NO_DATA');
  expect(masteryStage(ev({ status: 'NO_DATA' }))).toBe('NO_DATA');
  expect(masteryStage(ev({ uniqueQuestions: 2, correct: 1, wrong: 1, recent: { uniqueQuestions: 2, rate: 0.5 } }))).toBe('STARTED');
  expect(masteryStage(ev({ uniqueQuestions: 6, correct: 2, wrong: 4, recent: { uniqueQuestions: 6, rate: 0.33 } }))).toBe('DEVELOPING');
  expect(masteryStage(ev({ uniqueQuestions: 10, correct: 3, wrong: 7, recent: { uniqueQuestions: 5, rate: 0.8 } }))).toBe('CONSOLIDATING');
  expect(masteryStage(ev({ status: 'LEARNED', uniqueQuestions: 9, correct: 9 }))).toBe('LEARNED');
  expect(masteryStage(ev({ uniqueQuestions: 9, correct: 9, recent: { uniqueQuestions: 0, rate: null } }))).toBe('REVIEW_NEEDED');
});

it('shows the own grade and year, every topic open, only playable game kinds, and suggests missions', async () => {
  const { t, o } = await setup();
  try {
    // another grade and an unverified program stay out
    t.db.exec(`INSERT INTO curriculum_versions(id,academic_year,grade_level,program_version,verified,program_code,authority) VALUES('cv7',(SELECT academic_year FROM curriculum_versions WHERE id='cv8'),7,'X',1,'SCHOOL','MEB'),('cv8u',(SELECT academic_year FROM curriculum_versions WHERE id='cv8'),8,'Y',0,'SCHOOL','MEB');
      INSERT INTO outcomes(id,curriculum_version_id,subject_id,grade_level,code,topic,title,official,active) VALUES('o7','cv7','sub_mat',7,'M.7.1.1','Tam sayılar','Yedinci sınıf',1,1),('o8u','cv8u','sub_mat',8,'M.8.9.9','Doğrulanmamış','Taslak',1,1);`);
    const m = await map(t);
    expect(m.response.status, m.text).toBe(200);
    expect(m.data.student).toMatchObject({ gradeLevel: 8, designGroup: 'B' });
    const codes = m.data.subjects.flatMap((s: any) => s.planets.flatMap((p: any) => p.outcomes.map((x: any) => x.code)));
    expect(codes).toContain('M.8.1.1');
    expect(codes).toContain('T.8.1.1');
    expect(codes).not.toContain('M.7.1.1');
    expect(codes).not.toContain('M.8.9.9');
    const node = m.data.subjects.flatMap((s: any) => s.planets.flatMap((p: any) => p.outcomes)).find((x: any) => x.id === o.id);
    const games = node.games.map((g: any) => g.code);
    expect(games).toEqual(expect.arrayContaining(['LU_CHOICE', 'LU_MATCH', 'LU_ORDER', 'LU_FINAL']));
    expect(games).not.toContain('LU_FILL');                                   // one approved cloze, two are needed
    expect(node.stage).toBe('NO_DATA');
    const tur = m.data.subjects.flatMap((s: any) => s.planets.flatMap((p: any) => p.outcomes)).find((x: any) => x.code === 'T.8.1.1');
    expect(tur.games).toEqual([]);                                            // listed, not locked, honestly empty
    expect(m.data.missions).toEqual([expect.objectContaining({ type: 'DISCOVER', outcomeId: o.id })]);   // only playable ones are suggested
    expect(m.data.summary).toMatchObject({ playable: 1, learned: 0 });
    expect(JSON.stringify(m.data)).not.toMatch(/"correct"|answer_json|"locked"/);

    // after a play the outcome is in progress, XP and the week move, the mission becomes "strengthen"
    const s = await t.request('/api/student-standard/universe/sessions', 'POST', { templateCode: 'LU_CHOICE', outcomeId: o.id }, 'stuuser');
    const answers = s.data.items.map((it: any, k: number) => ({ seq: it.seq, response: { answer: k < 4 ? 'A' : 'B' } }));
    await t.request(`/api/student-standard/universe/sessions/${s.data.session.id}/submit`, 'POST', { answers }, 'stuuser');
    const after = await map(t);
    const n2 = after.data.subjects.flatMap((x: any) => x.planets.flatMap((p: any) => p.outcomes)).find((x: any) => x.id === o.id);
    expect(['DEVELOPING', 'CONSOLIDATING']).toContain(n2.stage);
    expect(after.data.week.done).toBe(1);
    expect(after.data.xp.total).toBeGreaterThan(0);
    expect(after.data.missions[0]).toMatchObject({ type: 'STRENGTHEN', outcomeId: o.id });
    expect(after.data.subjects.flatMap((x: any) => x.planets).find((p: any) => p.outcomes.some((x: any) => x.id === o.id)).discovered).toBe(true);

    // students only; switched off → closed
    expect((await map(t, 'teacher')).response.status).toBe(403);
    t.db.exec(`UPDATE platform_features SET enabled_default=0 WHERE feature_key='LEARNING_UNIVERSE'`);
    expect((await map(t)).response.status).toBe(403);
  } finally { t.db.close(); }
}, 90000);
