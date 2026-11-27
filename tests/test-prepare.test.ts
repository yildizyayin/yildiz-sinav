import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/** Test Hazırla (owner, 27 Nov 2026): remove a question, choose what the paper shows, the institution's print identity. Synthetic data only. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT OR IGNORE INTO platform_features(feature_key,label,stage,enabled_default) VALUES('STUDIO','Studio','STANDARD',1);
    UPDATE platform_features SET enabled_default=1 WHERE feature_key='STUDIO';
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('teacher2','TEACHER','Öteki Öğretmen','unused','unused',1,'school');
    INSERT INTO question_bank(id,grade_level,subject_id,stem_text,options_json,correct_answer) VALUES('q1',5,'sub_tur','Bir?','[]','A'),('q2',5,'sub_tur','İki?','[]','A'),('q3',5,'sub_tur','Üç?','[]','A');
    INSERT INTO studio_documents(id,institution_id,created_by,document_type,title,grade_level,subject_id,status,config_json) VALUES
      ('d1','school','teacher','WORKSHEET','Kuvvet testi',5,'sub_tur','READY','{"bookletCodes":["A","B"]}'),
      ('d_sent','school','teacher','WORKSHEET','Ay’ın evreleri',5,'sub_tur','PUBLISHED','{}'),
      ('d_other','school','teacher2','WORKSHEET','Başkasının testi',5,'sub_tur','DRAFT','{}');
    INSERT INTO studio_document_items(document_id,question_id,booklet_code,sort_order) VALUES
      ('d1','q1','A',1),('d1','q2','A',2),('d1','q3','A',3),('d1','q3','B',1),('d1','q2','B',2),('d1','q1','B',3),
      ('d_sent','q1','A',1),('d_sent','q2','A',2),('d_other','q1','A',1),('d_other','q2','A',2);
    INSERT INTO studio_document_assets(id,document_id,institution_id,booklet_code,asset_type,r2_key,file_name,mime_type,byte_size,metadata_json) VALUES('sda1','d1','school','A','QUESTION_PDF','k','f.pdf','application/pdf',1,'{}');
    INSERT INTO assignments(id,institution_id,created_by,assignment_type,title,status,due_at) VALUES('asg1','school','teacher','TEACHER','Ay’ın evreleri','ASSIGNED','2026-11-30');
    INSERT INTO studio_delivery_links(id,document_id,institution_id,publication_revision,delivery_kind,destination,external_id,idempotency_key) VALUES('sdl1','d_sent','school',1,'HOMEWORK','ASSIGNMENTS','asg1','k1');`);
  return t;
}
const items = (t: any, id: string) => t.db.prepare(`SELECT question_id,booklet_code,sort_order FROM studio_document_items WHERE document_id=? ORDER BY booklet_code,sort_order`).all(id).map((r: any) => `${r.booklet_code}${r.sort_order}:${r.question_id}`);

describe('Test Hazırla', () => {
  it('takes a question out of every booklet, closes the ranks and asks for the check again', async () => {
    const t = await setup();
    expect((await t.request('/api/teacher-tests/d1/check', 'POST', { confirm: true }, 'teacher')).response.status).toBe(200);
    expect((await t.request('/api/teacher-tests/d1', 'GET', undefined, 'teacher')).data.checked).not.toBeNull();
    expect((await t.request('/api/teacher-tests/d_other/remove-question', 'POST', { questionId: 'q1' }, 'teacher')).response.status).toBe(403);
    expect((await t.request('/api/teacher-tests/d1/remove-question', 'POST', { questionId: 'nope' }, 'teacher')).response.status).toBe(404);
    const r = await t.request('/api/teacher-tests/d1/remove-question', 'POST', { questionId: 'q2' }, 'teacher');
    expect(r.response.status, r.text).toBe(200);
    expect(r.data.questionCount).toBe(2);
    expect(items(t, 'd1')).toEqual(['A1:q1', 'A2:q3', 'B1:q3', 'B2:q1']);
    expect(t.db.prepare(`SELECT status,pdf_r2_key FROM studio_documents WHERE id='d1'`).get()).toMatchObject({ status: 'DRAFT', pdf_r2_key: null });
    expect(t.db.prepare(`SELECT count(*) n FROM studio_document_assets WHERE document_id='d1'`).get()).toMatchObject({ n: 0 });
    expect((await t.request('/api/teacher-tests/d1', 'GET', undefined, 'teacher')).data.checked).toBeNull();
    await t.request('/api/teacher-tests/d1/remove-question', 'POST', { questionId: 'q1' }, 'teacher');
    const last = await t.request('/api/teacher-tests/d1/remove-question', 'POST', { questionId: 'q3' }, 'teacher');
    expect(last.data.error.code).toBe('LAST_QUESTION');
    const sent = await t.request('/api/teacher-tests/d_sent/remove-question', 'POST', { questionId: 'q1' }, 'teacher');
    expect(sent.response.status).toBe(409);
    expect(items(t, 'd_sent')).toEqual(['A1:q1', 'A2:q2']);
  });

  it('keeps the print choices on the test', async () => {
    const t = await setup();
    const r = await t.request('/api/teacher-tests/d1/print', 'PUT', { useInstitution: false }, 'teacher');
    expect(r.data.branding).toEqual({ showAnunex: true, showNibiru: true, useInstitution: false });
    const config = JSON.parse((t.db.prepare(`SELECT config_json FROM studio_documents WHERE id='d1'`).get() as any).config_json);
    expect(config).toMatchObject({ bookletCodes: ['A', 'B'], branding: { useInstitution: false, showAnunex: true } });
    expect((await t.request('/api/teacher-tests/d_other/print', 'PUT', { useInstitution: false }, 'teacher')).response.status).toBe(403);
  });

  it('tells who may upload the institution’s print logo and serves it only to that institution', async () => {
    const t = await setup();
    let r = await t.request('/api/teacher-tests/branding', 'GET', undefined, 'teacher');
    expect(r.data).toMatchObject({ institutionId: 'school', institutionName: 'Synthetic School', hasLogo: false, canUpload: false });
    expect((await t.request('/api/teacher-tests/branding/logo', 'GET', undefined, 'teacher')).response.status).toBe(404);
    t.db.exec(`INSERT INTO campus_branding(institution_id,logo_r2_key,enabled) VALUES('school','branding/school/print-logo.png',0)`);
    t.env.FILES = { get: async (key: string) => (key === 'branding/school/print-logo.png' ? { arrayBuffer: async () => PNG.slice().buffer } : null) };
    r = await t.request('/api/teacher-tests/branding', 'GET', undefined, 'teacher');
    expect(r.data.hasLogo).toBe(true);
    const logo = await t.request('/api/teacher-tests/branding/logo', 'GET', undefined, 'teacher');
    expect(logo.response.headers.get('Content-Type')).toBe('image/png');
    expect((await t.request('/api/teacher-tests/branding?institutionId=school', 'GET', undefined, 'admin')).data).toMatchObject({ institutionName: 'Synthetic School', canUpload: true });
    expect((await t.request('/api/teacher-tests/branding/logo', 'GET', undefined, 'stuuser')).response.status).toBe(403);
  });
});
