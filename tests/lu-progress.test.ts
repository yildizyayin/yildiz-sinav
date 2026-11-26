import { expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { starsOf } from '../worker/lib/learning-universe/stars';

/** Bireysel ilerleme (owner, 26 Nov 2026): stars from the karne's own stages; a play compared only with the student's own earlier plays. Synthetic data only. */
it('turns the six learning stages into three stars, dimmed when a review is due', () => {
  expect(starsOf('NO_DATA')).toEqual({ stars: 0, starsLabel: 'Henüz başlamadın', dim: false });
  expect(starsOf('STARTED').stars).toBe(1);
  expect(starsOf('DEVELOPING').stars).toBe(1);
  expect(starsOf('CONSOLIDATING')).toEqual({ stars: 2, starsLabel: 'Pekiştirme', dim: false });
  expect(starsOf('LEARNED')).toEqual({ stars: 3, starsLabel: 'Ustalık', dim: false });
  expect(starsOf('LEARNED', true).dim).toBe(true);
  expect(starsOf('REVIEW_NEEDED')).toEqual({ stars: 3, starsLabel: 'Ustalık', dim: true });
});

it('compares a play only with the same student’s earlier plays of that outcome, and shows the stars on the map', async () => {
  const t = await evaluatedExam('direct', { outcomes: true });
  try {
    t.db.exec(`UPDATE platform_features SET enabled_default=1 WHERE feature_key='LEARNING_UNIVERSE'`);
    const o = t.db.prepare(`SELECT o.id,o.subject_id,cv.academic_year y FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE o.code='M.8.1.1'`).get() as any;
    t.db.prepare(`INSERT OR IGNORE INTO learning_nodes(id,academic_year,node_type,subject_id,grade_level,code,title) VALUES(?,?,'OUTCOME',?,8,'M.8.1.1','Sentetik')`).run(`ln_${o.id}`, o.y, o.subject_id);
    const ins = t.db.prepare(`INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,option_count,copyright_status,review_status) VALUES(?,'PLATFORM',?,8,?,'MULTIPLE_CHOICE',?,'["-32","32","-16","16"]','A',4,'OWNED','APPROVED')`);
    for (let i = 1; i <= 4; i++) { ins.run(`pg${i}`, o.y, o.subject_id, `Sentetik soru ${i}`); t.db.prepare('INSERT INTO question_learning_links(question_id,node_id) VALUES(?,?)').run(`pg${i}`, `ln_${o.id}`); }
    // another student's excellent play of the same outcome must never count as this student's record
    t.db.exec(`INSERT INTO student_entities(id,first_name,last_name,normalized_name,status) VALUES('s2','ECE','KAYA','ECE KAYA','ACTIVE');
      INSERT INTO lu_sessions(id,student_id,institution_id,season_id,academic_year,grade_level,template_code,outcome_id,mode,status,item_count,answered_count,correct_count,client_key,expires_at,submitted_at)
        VALUES('other','s2','school','season','${o.y}',8,'LU_CHOICE','${o.id}','PRACTICE','SUBMITTED',4,4,4,'x','2099-01-01 00:00:00','2026-11-01 10:00:00')`);
    const play = async (mode: string, rightOnes: number) => {
      const s = await t.request('/api/student-standard/universe/sessions', 'POST', { templateCode: 'LU_CHOICE', outcomeId: o.id, itemCount: 4, mode }, 'stuuser');
      expect(s.response.status, s.text).toBe(201);
      const answers = s.data.items.map((it: any, k: number) => ({ seq: it.seq, response: { answer: k < rightOnes ? 'A' : 'B' } }));
      return (await t.request(`/api/student-standard/universe/sessions/${s.data.session.id}/submit`, 'POST', { answers }, 'stuuser')).data;
    };
    const first = await play('PRACTICE', 2);
    expect(first.progress).toMatchObject({ first: true, rate: 50, previous: null, change: null, bestBefore: null, newBest: false, plays: 1 });
    expect(first.progress.stars).toBeGreaterThanOrEqual(1);
    const second = await play('REVIEW', 4);
    expect(second.progress).toMatchObject({ first: false, rate: 100, previous: { correct: 2, total: 4, rate: 50 }, change: 50, bestBefore: 50, newBest: true, plays: 2 });
    const third = await play('REVIEW', 1);
    expect(third.progress).toMatchObject({ rate: 25, previous: { rate: 100 }, change: -75, bestBefore: 100, newBest: false, plays: 3 });
    // reading a finished play again gives the same comparison; an open play has none
    expect((await t.request(`/api/student-standard/universe/sessions/${first.session.id}`, 'GET', undefined, 'stuuser')).data.progress).toMatchObject({ first: true, rate: 50 });

    const map = (await t.request('/api/student-standard/universe/map', 'GET', undefined, 'stuuser')).data;
    const node = map.subjects.flatMap((s: any) => s.planets.flatMap((p: any) => p.outcomes)).find((n: any) => n.code === 'M.8.1.1');
    expect(node).toMatchObject({ stars: expect.any(Number), starsLabel: expect.any(String), dim: false });
    expect(node.stars).toBeGreaterThanOrEqual(1);
    expect(map.starSummary.byStars.reduce((a: number, b: number) => a + b, 0)).toBe(map.summary.outcomes);
    expect(map.starSummary.max).toBe(map.summary.outcomes * 3);
    expect(JSON.stringify(map.starSummary)).not.toContain('s2');
  } finally { t.db.close(); }
});
