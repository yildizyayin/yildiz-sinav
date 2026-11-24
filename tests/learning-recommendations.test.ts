import { expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/**
 * Birleşik Karne: study suggestions for developing outcomes offer only content that exists and may be shown —
 * approved, rights-cleared, unsolved questions; published worksheets — otherwise they say so. Synthetic data only.
 */
it('suggests existing approved content only, and says so when there is none', async () => {
  const t = await evaluatedExam('direct', { outcomes: true });
  try {
    const path = '/api/reporting/students/s1/outcome-evidence';
    const rec = async () => (await t.request(path, 'GET', undefined, 'admin')).data.recommendations;
    const o = t.db.prepare(`SELECT id,subject_id FROM outcomes WHERE code='M.8.1.1'`).get() as any;
    let r = (await rec()).find((x: any) => x.code === 'M.8.1.1');
    expect(r).toMatchObject({ needForLearned: 4, practice: { available: 0, nodeId: `ln_${o.id}` }, worksheets: [], video: null, askTeacher: true });

    // an approved, rights-cleared question for the outcome; a draft and an unlicensed one do not count
    t.db.prepare(`INSERT OR IGNORE INTO learning_nodes(id,academic_year,node_type,subject_id,grade_level,code,title) VALUES(?,'2026-2027','OUTCOME',?,8,'M.8.1.1','Sentetik')`).run(`ln_${o.id}`, o.subject_id);
    const q = t.db.prepare(`INSERT INTO question_bank(id,owner_type,subject_id,grade_level,stem_text,options_json,correct_answer,copyright_status,review_status) VALUES(?, 'PLATFORM', ?, 8, 'Sentetik', '["A","B","C","D"]', 'A', ?, ?)`);
    q.run('qok', o.subject_id, 'OWNED', 'APPROVED'); q.run('qdraft', o.subject_id, 'OWNED', 'DRAFT'); q.run('qrights', o.subject_id, 'RESTRICTED', 'APPROVED');
    for (const id of ['qok', 'qdraft', 'qrights']) t.db.prepare('INSERT INTO question_learning_links(question_id,node_id) VALUES(?,?)').run(id, `ln_${o.id}`);
    r = (await rec()).find((x: any) => x.code === 'M.8.1.1');
    expect(r).toMatchObject({ practice: { available: 1 }, askTeacher: false });
    // once solved, it is no longer offered
    t.db.exec(`INSERT INTO question_practice_attempts(id,student_id,question_id,selected_answer,is_correct) VALUES('pa1','s1','qok','B',0)`);
    expect((await rec()).find((x: any) => x.code === 'M.8.1.1').practice.available).toBe(0);
  } finally { t.db.close(); }
}, 60000);
