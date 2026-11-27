import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/** Test sayfası: results per round (who solved, class average, question and outcome rates), the teacher's one-time
 *  "sorular uygun" confirmation per set of questions, and sending the same test to another class as a new round. Synthetic data only. */
async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT OR IGNORE INTO platform_features(feature_key,label,stage,enabled_default) VALUES('STUDIO','Studio','STANDARD',1);
    UPDATE platform_features SET enabled_default=1 WHERE feature_key='STUDIO';
    INSERT INTO curriculum_versions(id,academic_year,grade_level,program_version,verified,program_code,authority) VALUES('cv5','2026-2027',8,'M',1,'SCHOOL','MEB');
    INSERT INTO outcomes(id,curriculum_version_id,subject_id,grade_level,code,topic,title,official,active) VALUES('o1','cv5','sub_tur',8,'T.8.1','K','Okuduğunu anlama',1,1),('o2','cv5','sub_tur',8,'T.8.2','K','Sözcükte anlam',1,1);
    INSERT INTO question_bank(id,academic_year,grade_level,subject_id,stem_text,options_json,correct_answer,review_status,copyright_status) VALUES
      ('q1','2026-2027',8,'sub_tur','Bir?','["a","b"]','A','APPROVED','OWNED'),('q2','2026-2027',8,'sub_tur','İki?','["a","b"]','B','APPROVED','OWNED');
    INSERT INTO question_learning_links(question_id,node_id) VALUES('q1','ln_o1'),('q2','ln_o2');
    INSERT INTO studio_documents(id,institution_id,created_by,document_type,title,grade_level,subject_id,status,config_json) VALUES('d1','school','teacher','WORKSHEET','Paragraf testi',8,'sub_tur','READY','{}');
    INSERT INTO studio_document_items(document_id,question_id,booklet_code,sort_order) VALUES('d1','q1','A',1),('d1','q2','A',2);`);
  return t;
}

describe('test sayfası', () => {
  it('asks once for the "sorular uygun" confirmation and again after the questions change', async () => {
    const t = await setup();
    let r = await t.request('/api/teacher-tests/d1', 'GET', undefined, 'teacher');
    expect(r.response.status, r.text).toBe(200);
    expect(r.data).toMatchObject({ checked: null, test: { title: 'Paragraf testi', questionCount: 2, canAssign: true, locked: false }, deliveries: [] });
    expect((await t.request('/api/teacher-tests/d1/check', 'POST', {}, 'teacher')).response.status).toBe(400);
    r = await t.request('/api/teacher-tests/d1/check', 'POST', { confirm: true }, 'teacher');
    expect(r.data.checked.by).toBeTruthy();
    expect(t.db.prepare(`SELECT statement FROM teacher_test_checks WHERE document_id='d1'`).get()).toMatchObject({ statement: 'Soruları kontrol ettim, testi sınıfım için uygun buluyorum.' });
    expect((await t.request('/api/teacher-tests', 'GET', undefined, 'teacher')).data.tests[0].checked).toBe(true);
    expect((await t.request('/api/board/d1', 'GET', undefined, 'teacher')).data.checked).toBe(true);
    t.db.exec(`UPDATE studio_document_items SET sort_order=3 WHERE document_id='d1' AND question_id='q1'`);   // the set changed
    expect((await t.request('/api/teacher-tests/d1', 'GET', undefined, 'teacher')).data.checked).toBeNull();
    expect((await t.request('/api/teacher-tests', 'GET', undefined, 'teacher')).data.tests[0].checked).toBe(false);
  });

  it('shows each round: who solved it, the class average and how each question and outcome went', async () => {
    const t = await setup();
    let p = await t.request('/api/platform/studio/d1/publish-homework', 'POST', { studentIds: ['s1'], dueAt: '2026-12-04' }, 'admin');
    expect(p.response.status, p.text).toBe(201);
    const asg = p.data.assignmentId;
    // a plain retry reuses round 1; "Başka sınıfa ödev ver" makes round 2 of the same test
    expect((await t.request('/api/platform/studio/d1/publish-homework', 'POST', { studentIds: ['s1'] }, 'admin')).data).toMatchObject({ reused: true, assignmentId: asg });
    p = await t.request('/api/platform/studio/d1/publish-homework', 'POST', { studentIds: ['s1'], round: 'NEXT' }, 'admin');
    expect(p.response.status, p.text).toBe(201);
    expect(p.data.assignmentId).not.toBe(asg);
    expect(t.db.prepare(`SELECT publication_revision r FROM studio_delivery_links WHERE document_id='d1' ORDER BY r`).all()).toEqual([{ r: 1 }, { r: 2 }]);
    // the student solved round 1: first right, second wrong
    const items = t.db.prepare(`SELECT id,reference_id FROM assignment_items WHERE assignment_id=? ORDER BY sort_order`).all(asg) as any[];
    t.db.prepare(`INSERT INTO assignment_attempts(id,assignment_id,student_id,item_id,answer_json,score) VALUES('a1',?, 's1', ?, '{}', 1),('a2',?, 's1', ?, '{}', 0)`).run(asg, items[0].id, asg, items[1].id);
    t.db.prepare(`UPDATE assignment_recipients SET status='COMPLETED' WHERE assignment_id=?`).run(asg);
    const r = await t.request('/api/teacher-tests/d1', 'GET', undefined, 'admin');
    expect(r.data.test).toMatchObject({ locked: true, canAssign: true });
    expect(r.data.deliveries.map((d: any) => [d.round, d.total, d.done, d.average])).toEqual([[1, 1, 1, 50], [2, 1, 0, null]]);
    expect(r.data.deliveries[0].students).toEqual([{ name: 'ALI YILMAZ', className: null, done: true, percent: 50 }]);
    expect(r.data.deliveries[0].dueAt).toBe('2026-12-04');
    expect(r.data.questions.map((q: any) => [q.no, q.outcome, q.correctRate])).toEqual([[1, 'Okuduğunu anlama', 100], [2, 'Sözcükte anlam', 0]]);
    expect(r.data.outcomes).toEqual([{ title: 'Sözcükte anlam', correctRate: 0 }, { title: 'Okuduğunu anlama', correctRate: 100 }]);
  });
});
