import { expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { validateContent } from '../worker/lib/learning-universe/grading';
import { buildContent } from '../src/pages/UniverseCenter';

/** Evren merkezi (owner, 11 Nov 2026): gaps, templates, usage for the Super Admin; the authoring form builds valid content. Synthetic data only. */
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

it('the authoring form turns plain fields into content the server accepts', () => {
  const ok = (kind: string, f: any) => { const b: any = buildContent(kind, f); expect(b.error, kind).toBeUndefined(); expect(validateContent(kind, b.public, b.answer), kind).toEqual([]); return b; };
  const pairs = ok('PAIRS', { pairs: '2³ = 8\n3² = 9\n10² = 100' });
  expect(pairs.answer.pairs).toEqual([['l1', 'r1'], ['l2', 'r2'], ['l3', 'r3']]);
  ok('SEQUENCE', { prompt: 'Sırala', items: 'Bir\nİki\nÜç' });
  const cloze = ok('CLOZE', { text: '2³ = [8] ve kare [kare|ikinci kuvvet]' });
  expect(cloze.public.text).toBe('2³ = [b1] ve kare [b2]');
  expect(cloze.answer.blanks.b1).toMatchObject({ numeric: { value: 8 } });
  const steps = ok('STEPS', { prompt: '3 kalem 12 TL ise 5 kalem?', steps: '1 kalem = 4\n5 kalem = 20' });
  expect(steps.public.problem).toBe('3 kalem 12 TL ise 5 kalem?');
  ok('AUDIO_QUESTION', { transcript: 'Metin', question: 'Soru', options: 'Bir\nİki\nÜç', correct: 'b' });
  expect(buildContent('PAIRS', { pairs: 'eşi yok' })).toHaveProperty('error');
  expect(buildContent('CLOZE', { text: 'boşluk yok' })).toHaveProperty('error');
});

it('Super Admin sees gaps, switches templates and reads usage; others cannot', async () => {
  const { t, o } = await setup();
  try {
    for (const p of ['/api/reporting/universe/gaps', '/api/reporting/universe/templates', '/api/reporting/universe/usage']) expect((await t.request(p, 'GET', undefined, 'teacher')).response.status, p).toBe(403);
    // a student asks for a kind with too little content → it is recorded as a gap
    expect((await t.request('/api/student-standard/universe/sessions', 'POST', { templateCode: 'LU_FILL', outcomeId: o.id }, 'stuuser')).data.error.code).toBe('CONTENT_GAP');
    const gaps = (await t.request('/api/reporting/universe/gaps?gradeLevel=8', 'GET', undefined, 'admin')).data.gaps;
    expect(gaps).toEqual([expect.objectContaining({ gradeLevel: 8, templateKind: 'FILL', needed: 2, available: 1, hits: 1, outcome: expect.objectContaining({ code: 'M.8.1.1' }) })]);

    const tpl = (await t.request('/api/reporting/universe/templates', 'GET', undefined, 'admin')).data;
    expect(tpl.templates.map((x: any) => x.code)).toContain('LU_MEMORY');
    expect(tpl.rules).toMatchObject({ perLevel: 200, weeklyGoal: 5, reviewAfterDays: 7 });
    let map = (await t.request('/api/student-standard/universe/map', 'GET', undefined, 'stuuser')).data;
    const games = () => map.subjects.flatMap((s: any) => s.planets.flatMap((p: any) => p.outcomes)).find((x: any) => x.id === o.id).games.map((g: any) => g.code);
    expect(games()).toContain('LU_MEMORY');
    expect((await t.request('/api/reporting/universe/templates/LU_MEMORY', 'POST', { active: false }, 'admin')).response.status).toBe(200);
    map = (await t.request('/api/student-standard/universe/map', 'GET', undefined, 'stuuser')).data;
    expect(games()).not.toContain('LU_MEMORY');
    expect((await t.request('/api/reporting/universe/templates/LU_CHOICE', 'POST', { minGrade: 9 }, 'admin')).response.status).toBe(200);
    map = (await t.request('/api/student-standard/universe/map', 'GET', undefined, 'stuuser')).data;
    expect(games()).not.toContain('LU_CHOICE');                                // grade 8 is now outside
    expect((await t.request('/api/reporting/universe/templates/LU_CHOICE', 'POST', { minGrade: 10, maxGrade: 9 }, 'admin')).data.error.code).toBe('INVALID_GRADES');
    expect((await t.request('/api/reporting/universe/templates/LU_CHOICE', 'POST', { secondsPerItem: 30 }, 'admin')).data.error.code).toBe('NOT_TIMED');
    expect((await t.request('/api/reporting/universe/templates/LU_TIMED', 'POST', { secondsPerItem: 5 }, 'admin')).data.error.code).toBe('INVALID_SECONDS');
    expect((await t.request('/api/reporting/universe/templates/LU_TIMED', 'POST', { secondsPerItem: 60 }, 'admin')).response.status).toBe(200);
    expect((await t.request('/api/reporting/universe/templates/LU_MEMORY', 'POST', { active: true }, 'teacher')).response.status).toBe(403);

    const s = await t.request('/api/student-standard/universe/sessions', 'POST', { templateCode: 'LU_MATCH', outcomeId: o.id }, 'stuuser');
    await t.request(`/api/student-standard/universe/sessions/${s.data.session.id}/submit`, 'POST', { answers: s.data.items.map((it: any) => ({ seq: it.seq, response: { pairs: [] } })) }, 'stuuser');
    const usage = (await t.request('/api/reporting/universe/usage', 'GET', undefined, 'admin')).data;
    expect(usage).toMatchObject({ days: 30, plays: 1, students: 1, gaps: { outcomes: 1, hits: 1 } });
    expect(usage.byTemplate).toEqual([expect.objectContaining({ code: 'LU_MATCH', plays: 1, students: 1 })]);
    expect(JSON.stringify(usage)).not.toMatch(/s1|Ali|Yılmaz/);

    // outcomes to write for: any staff, verified only
    const outs = await t.request('/api/reporting/universe/outcomes?gradeLevel=8&q=M.8', 'GET', undefined, 'teacher');
    expect(outs.data.outcomes.map((x: any) => x.code)).toContain('M.8.1.1');
    expect((await t.request('/api/reporting/universe/outcomes?gradeLevel=3', 'GET', undefined, 'teacher')).response.status).toBe(400);
    expect((await t.request('/api/reporting/universe/outcomes?gradeLevel=8', 'GET', undefined, 'stuuser')).response.status).toBe(403);
  } finally { t.db.close(); }
}, 90000);
