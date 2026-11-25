import { expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/** Benim Gezegenim (owner, 25 Nov 2026): grows from graded answers, names the outcome, keeps seeds for reviews. Synthetic data only. */
it('grows one piece per correct answer in the subject region and keeps a seed for each open mistake', async () => {
  const t = await evaluatedExam('direct', { outcomes: true });
  try {
    t.db.exec(`UPDATE platform_features SET enabled_default=1 WHERE feature_key='LEARNING_UNIVERSE'`);
    const o = t.db.prepare(`SELECT o.id,o.subject_id,cv.academic_year y FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE o.code='M.8.1.1'`).get() as any;
    t.db.prepare(`INSERT OR IGNORE INTO learning_nodes(id,academic_year,node_type,subject_id,grade_level,code,title) VALUES(?,?,'OUTCOME',?,8,'M.8.1.1','Sentetik')`).run(`ln_${o.id}`, o.y, o.subject_id);
    const q = t.db.prepare(`INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,option_count,copyright_status,review_status) VALUES(?,'PLATFORM',?,8,?,'MULTIPLE_CHOICE',?,'["-32","32","-16","16"]','A',4,'OWNED','APPROVED')`);
    for (let i = 1; i <= 4; i++) { q.run(`pq${i}`, o.y, o.subject_id, `Sentetik soru ${i}`); t.db.prepare('INSERT INTO question_learning_links(question_id,node_id) VALUES(?,?)').run(`pq${i}`, `ln_${o.id}`); }

    const empty = await t.request('/api/student-standard/universe/map', 'GET', undefined, 'stuuser');
    expect(empty.data.planet).toEqual({ regions: [], total: 0, seeds: 0 });

    const s = await t.request('/api/student-standard/universe/sessions', 'POST', { templateCode: 'LU_CHOICE', outcomeId: o.id }, 'stuuser');
    const answers = s.data.items.map((it: any, k: number) => ({ seq: it.seq, response: { answer: k === 0 ? 'B' : 'A' } }));
    // an unfinished play grows nothing yet
    expect((await t.request('/api/student-standard/universe/map', 'GET', undefined, 'stuuser')).data.planet.total).toBe(0);
    await t.request(`/api/student-standard/universe/sessions/${s.data.session.id}/submit`, 'POST', { answers }, 'stuuser');

    const planet = (await t.request('/api/student-standard/universe/map', 'GET', undefined, 'stuuser')).data.planet;
    expect(planet).toMatchObject({ total: 3, seeds: 1 });
    expect(planet.regions).toHaveLength(1);
    expect(planet.regions[0]).toMatchObject({ total: 3, seeds: 1, outcomes: 1 });
    expect(planet.regions[0].pieces).toHaveLength(3);
    expect(planet.regions[0].pieces.every((p: any) => p.outcomeCode === 'M.8.1.1')).toBe(true);   // every piece names its outcome
    expect(planet.regions[0].pieces[2].kind).not.toBe(planet.regions[0].pieces[0].kind);           // every third piece is a different kind
  } finally { t.db.close(); }
});
