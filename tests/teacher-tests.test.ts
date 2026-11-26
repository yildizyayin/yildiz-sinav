import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/** Testlerim: a teacher lists, deletes and copies only their own tests; a test that reached students is archived, never deleted, and copied for edits. Synthetic data only. */
async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT OR IGNORE INTO platform_features(feature_key,label,stage,enabled_default) VALUES('STUDIO','Studio','STANDARD',1);
    UPDATE platform_features SET enabled_default=1 WHERE feature_key='STUDIO';
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('teacher2','TEACHER','Öteki Öğretmen','unused','unused',1,'school');
    INSERT INTO question_bank(id,grade_level,subject_id,stem_text,options_json,correct_answer) VALUES('q1',5,'sub_tur','Bir?','[]','A'),('q2',5,'sub_tur','İki?','[]','A'),('q3',5,'sub_tur','Üç?','[]','A');
    INSERT INTO studio_documents(id,institution_id,created_by,document_type,title,grade_level,subject_id,status,config_json) VALUES
      ('d_draft','school','teacher','WORKSHEET','Kuvvet taslağı',5,'sub_tur','DRAFT','{}'),
      ('d_sent','school','teacher','WORKSHEET','Ay’ın evreleri',5,'sub_tur','PUBLISHED','{"bookletCodes":["A"]}'),
      ('d_other','school','teacher2','WORKSHEET','Başkasının testi',5,'sub_tur','DRAFT','{}');
    INSERT INTO studio_document_items(document_id,question_id,booklet_code,sort_order) VALUES('d_draft','q1','A',1),('d_draft','q2','A',2),('d_sent','q1','A',1),('d_sent','q3','A',2),('d_sent','q3','B',1),('d_sent','q1','B',2);
    INSERT INTO assignments(id,institution_id,created_by,assignment_type,title,status,due_at) VALUES('asg1','school','teacher','TEACHER','Ay’ın evreleri','ASSIGNED','2026-11-30');
    INSERT INTO assignment_recipients(assignment_id,student_id,status) VALUES('asg1','s1','COMPLETED');
    INSERT INTO studio_delivery_links(id,document_id,institution_id,publication_revision,delivery_kind,destination,external_id,idempotency_key) VALUES('sdl1','d_sent','school',1,'HOMEWORK','ASSIGNMENTS','asg1','k1');`);
  return t;
}

describe('Testlerim', () => {
  it('lists only the teacher’s own tests with what happened to each', async () => {
    const t = await setup();
    expect((await t.request('/api/teacher-tests', 'GET', undefined, 'stuuser')).response.status).toBe(403);
    const r = await t.request('/api/teacher-tests', 'GET', undefined, 'teacher');
    expect(r.response.status, r.text).toBe(200);
    const by = Object.fromEntries(r.data.tests.map((x: any) => [x.id, x]));
    expect(Object.keys(by).sort()).toEqual(['d_draft', 'd_sent']);
    expect(by.d_draft).toMatchObject({ kind: 'DRAFT', locked: false, questionCount: 2 });
    expect(by.d_sent).toMatchObject({ kind: 'HOMEWORK', locked: true, homework: { total: 1, done: 1, dueAt: '2026-11-30' }, booklets: ['A', 'B'] });
    expect(by.d_sent.doc).toMatchObject({ id: 'd_sent', document_type: 'WORKSHEET' });
  });

  it('deletes a draft for good, but only takes a test that reached students off the list', async () => {
    const t = await setup();
    expect((await t.request('/api/teacher-tests/d_other', 'DELETE', undefined, 'teacher')).response.status).toBe(403);
    let r = await t.request('/api/teacher-tests/d_draft', 'DELETE', undefined, 'teacher');
    expect(r.data).toMatchObject({ ok: true, removed: 'DELETED' });
    expect(t.db.prepare(`SELECT count(*) n FROM studio_documents WHERE id='d_draft'`).get()).toMatchObject({ n: 0 });
    expect(t.db.prepare(`SELECT count(*) n FROM studio_document_items WHERE document_id='d_draft'`).get()).toMatchObject({ n: 0 });
    r = await t.request('/api/teacher-tests/d_sent', 'DELETE', undefined, 'teacher');
    expect(r.data).toMatchObject({ ok: true, removed: 'ARCHIVED' });
    expect(t.db.prepare(`SELECT status FROM studio_documents WHERE id='d_sent'`).get()).toMatchObject({ status: 'ARCHIVED' });
    expect(t.db.prepare(`SELECT count(*) n FROM assignment_recipients WHERE assignment_id='asg1'`).get()).toMatchObject({ n: 1 });
    expect((await t.request('/api/teacher-tests', 'GET', undefined, 'teacher')).data.tests).toEqual([]);
    expect((await t.request('/api/teacher-tests/d_sent', 'DELETE', undefined, 'teacher')).response.status).toBe(404);
  });

  it('copies a sent test into a new draft of the copier; the first test keeps its homework', async () => {
    const t = await setup();
    expect((await t.request('/api/teacher-tests/d_other/copy', 'POST', {}, 'teacher')).response.status).toBe(403);
    const r = await t.request('/api/teacher-tests/d_sent/copy', 'POST', {}, 'teacher');
    expect(r.response.status, r.text).toBe(201);
    expect(r.data.title).toBe('Ay’ın evreleri (kopya)');
    const copy = t.db.prepare(`SELECT created_by,status,document_type FROM studio_documents WHERE id=?`).get(r.data.id) as any;
    expect(copy).toMatchObject({ created_by: 'teacher', status: 'DRAFT', document_type: 'WORKSHEET' });
    const items = (id: string) => t.db.prepare(`SELECT question_id,booklet_code,sort_order FROM studio_document_items WHERE document_id=? ORDER BY booklet_code,sort_order`).all(id);
    expect(items(r.data.id)).toEqual(items('d_sent'));
    const list = (await t.request('/api/teacher-tests', 'GET', undefined, 'teacher')).data.tests;
    expect(list.find((x: any) => x.id === r.data.id)).toMatchObject({ kind: 'DRAFT', locked: false });
    expect(list.find((x: any) => x.id === 'd_sent')).toMatchObject({ kind: 'HOMEWORK', locked: true });
    const again = await t.request(`/api/teacher-tests/${r.data.id}/copy`, 'POST', {}, 'teacher');
    expect(again.data.title).toBe('Ay’ın evreleri (kopya)');
  });
});
