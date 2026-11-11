import { expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/**
 * Öğrenme Evreni acceptance (owner, 11 Nov 2026): one synthetic student moved through grades 4–12. At every grade the
 * map shows only that grade's verified program, the right age-group look, a playable game graded on the server, and an
 * honest shortage for the Nibiru exam. Synthetic data only.
 */
const GROUP: Record<number, string> = { 4: 'A', 5: 'A', 6: 'A', 7: 'B', 8: 'B', 9: 'C', 10: 'C', 11: 'C', 12: 'C' };

it('works the same way for every grade from 4 to 12', async () => {
  const t = await evaluatedExam('direct', { outcomes: true });
  try {
    const year = (t.db.prepare(`SELECT academic_year y FROM curriculum_versions WHERE id='cv8'`).get() as any).y;
    t.db.exec(`UPDATE platform_features SET enabled_default=1 WHERE feature_key='LEARNING_UNIVERSE'`);
    const q = t.db.prepare(`INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,option_count,copyright_status,review_status) VALUES(?,'PLATFORM',?,?,'sub_mat','MULTIPLE_CHOICE',?,'["Bir","İki","Üç","Dört"]','A',4,'OWNED','APPROVED')`);
    for (let g = 4; g <= 12; g++) {
      if (g !== 8) t.db.exec(`INSERT INTO curriculum_versions(id,academic_year,grade_level,program_version,verified,program_code,authority) VALUES('acc${g}','${year}',${g},'ACC',1,'SCHOOL','MEB')`);
      const cv = g === 8 ? 'cv8' : `acc${g}`;
      t.db.exec(`INSERT INTO outcomes(id,curriculum_version_id,subject_id,grade_level,code,topic,title,official,active) VALUES('acc_o${g}','${cv}','sub_mat',${g},'M.${g}.9.1','Kabul konusu','${g}. sınıf kabul kazanımı',1,1);
        INSERT OR IGNORE INTO learning_nodes(id,academic_year,node_type,subject_id,grade_level,code,title) VALUES('ln_acc_o${g}','${year}','OUTCOME','sub_mat',${g},'ACC-${g}','Kabul');`);
      for (let i = 1; i <= 4; i++) { q.run(`acc_q${g}_${i}`, year, g, `${g}. sınıf soru ${i}`); t.db.prepare(`INSERT INTO question_learning_links(question_id,node_id) VALUES(?,?)`).run(`acc_q${g}_${i}`, `ln_acc_o${g}`); }
    }
    for (let g = 4; g <= 12; g++) {
      t.db.exec(`UPDATE student_enrollments SET grade_level=${g} WHERE student_id='s1'`);
      const map = await t.request('/api/student-standard/universe/map', 'GET', undefined, 'stuuser');
      expect(map.response.status, `${g}: ${map.text}`).toBe(200);
      expect(map.data.student).toMatchObject({ gradeLevel: g, designGroup: GROUP[g] });
      const all = map.data.subjects.flatMap((s: any) => s.planets.flatMap((p: any) => p.outcomes));
      expect(all.length, `${g}`).toBeGreaterThan(0);
      expect(all.every((o: any) => !o.code || o.code.split('.')[1] === String(g)), `${g}: only own grade`).toBe(true);
      const mine = all.find((o: any) => o.id === `acc_o${g}`);
      expect(mine.games.map((x: any) => x.code), `${g}`).toContain('LU_CHOICE');

      const s = await t.request('/api/student-standard/universe/sessions', 'POST', { templateCode: 'LU_CHOICE', outcomeId: `acc_o${g}` }, 'stuuser');
      expect(s.response.status, `${g}: ${s.text}`).toBe(201);
      expect(JSON.stringify(s.data)).not.toMatch(/"correct":"A"/);
      const sub = await t.request(`/api/student-standard/universe/sessions/${s.data.session.id}/submit`, 'POST', { answers: s.data.items.map((it: any) => ({ seq: it.seq, response: { answer: 'A' } })) }, 'stuuser');
      expect(sub.data.session.correct, `${g}`).toBe(s.data.items.length);
      // another grade's outcome is refused
      const other = g === 12 ? 4 : g + 1;
      expect((await t.request('/api/student-standard/universe/sessions', 'POST', { templateCode: 'LU_CHOICE', outcomeId: `acc_o${other}` }, 'stuuser')).data.error.code).toBe('OUTCOME_NOT_VERIFIED');
      // the exam says how many new questions exist instead of filling in
      const exam = await t.request('/api/student-standard/universe/exams', 'POST', { questionCount: 10 }, 'stuuser');
      expect(exam.data.error?.code, `${g}`).toBe('NOT_ENOUGH_QUESTIONS');
    }
    // cost guard: how many database statements one map, one play and one exam start take (the $5 plan bills by reads)
    const prepare = t.env.DB.prepare.bind(t.env.DB); let n = 0;
    t.env.DB.prepare = (sql: string) => { n++; return prepare(sql); };
    const count = async (fn: () => Promise<any>) => { n = 0; await fn(); return n; };
    const mapCost = await count(() => t.request('/api/student-standard/universe/map', 'GET', undefined, 'stuuser'));
    const playCost = await count(() => t.request('/api/student-standard/universe/sessions', 'POST', { templateCode: 'LU_CHOICE', outcomeId: 'acc_o12', mode: 'REVIEW' }, 'stuuser'));
    const examCost = await count(() => t.request('/api/student-standard/universe/exams', 'POST', { questionCount: 10 }, 'stuuser'));
    console.log(JSON.stringify({ event: 'lu_cost', mapCost, playCost, examCost }));
    expect(mapCost).toBeLessThanOrEqual(40);
    expect(playCost).toBeLessThanOrEqual(40);
    expect(examCost).toBeLessThanOrEqual(40);
  } finally { t.db.close(); }
}, 120000);
