import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/** Test Hazırla "+ Soru ekle (PDF / fotoğraf)": the test moves to Hızlı Test with its pool questions, cropped ones join them, every pool gate still holds. Synthetic data only. */
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
async function world() {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT INTO institution_feature_overrides(institution_id,feature_key,enabled) VALUES('school','STUDIO',1);
    INSERT INTO teacher_assignments(id,user_id,institution_id,season_id,subject_id,assignment_type,active) VALUES('ta1','teacher','school','season','sub_tur','SUBJECT',1);`);
  const ins = t.db.prepare(`INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,copyright_status,review_status,option_count)
    VALUES(?,'PLATFORM','2026-2027',8,'sub_tur','MULTIPLE_CHOICE',?,'["a","b","c","d"]','B','OWNED','APPROVED',4)`);
  for (let i = 1; i <= 4; i++) ins.run(`q${i}`, `Sentetik soru ${i}`);
  const store = new Map<string, Uint8Array>();
  Object.assign(t.env, { FILES: { put: async (k: string, v: Uint8Array) => { store.set(k, v); }, get: async (k: string) => store.has(k) ? { body: store.get(k), arrayBuffer: async () => store.get(k)!.slice().buffer } : null, delete: async (k: string) => { store.delete(k); } } });
  const doc = (await t.request('/api/platform/studio', 'POST', { title: 'Kuvvet · Ünite testi', documentType: 'WORKSHEET', gradeLevel: 8, subjectId: 'sub_tur', academicYear: '2026-2027', deliveryMode: 'PDF_OPTICAL', bookletCodes: ['A'], questionIds: ['q1', 'q2', 'q3'], questionCount: 3 }, 'teacher'));
  expect(doc.response.status, doc.text).toBe(201);
  const add = (id: string) => { const f = new FormData(); f.set('image', new File([PNG], 'q.png', { type: 'image/png' })); f.set('width', '600'); f.set('height', '300'); f.set('correctAnswer', 'C'); return t.request(`/api/quick-tests/${id}/questions`, 'POST', f, 'teacher'); };
  return { t, doc: doc.data.id as string, add };
}

describe('Test Hazırla → PDF / fotoğraftan soru ekle', () => {
  it('asks for the rights declaration, then moves the test with its pool questions and lets cropped ones join', async () => {
    const { t, doc, add } = await world();
    const move = (body: any) => t.request(`/api/quick-tests/from-studio/${doc}`, 'POST', body, 'teacher');
    expect((await move({ addCrops: true })).data.error.code).toBe('RIGHTS_REQUIRED');
    const r = await move({ addCrops: true, rightsDeclared: true });
    expect(r.response.status, r.text).toBe(201);
    expect(r.data.moved).toBe(true);
    const qt = t.db.prepare(`SELECT source_kind,rights_declared_by,title,subject_label FROM quick_tests WHERE id=?`).get(r.data.id) as any;
    expect(qt).toMatchObject({ source_kind: 'CROP', rights_declared_by: 'teacher', title: 'Kuvvet · Ünite testi' });
    expect(t.db.prepare(`SELECT status FROM studio_documents WHERE id=?`).get(doc)).toMatchObject({ status: 'ARCHIVED' });
    expect((await add(r.data.id)).response.status).toBe(201);
    const qs = t.db.prepare(`SELECT kind,question_bank_id,correct_answer FROM quick_test_questions WHERE test_id=? ORDER BY sort_order`).all(r.data.id) as any[];
    expect(qs.map((q) => `${q.kind}:${q.question_bank_id || '-'}:${q.correct_answer}`)).toEqual(['BANK:q1:B', 'BANK:q2:B', 'BANK:q3:B', 'IMAGE:-:C']);
    // the pool questions are still checked: one loses its approval → printing stops with the reason
    let check = (await t.request(`/api/quick-tests/${r.data.id}/check`, 'GET', undefined, 'teacher')).data.check;
    expect(check.blockers.map((b: any) => b.code)).not.toContain('NOT_APPROVED');
    expect(check.warnings.map((w: any) => w.code)).toContain('NOT_EDITORIALLY_REVIEWED');
    t.db.exec(`UPDATE question_bank SET review_status='REVIEW' WHERE id='q2'`);
    check = (await t.request(`/api/quick-tests/${r.data.id}/check`, 'GET', undefined, 'teacher')).data.check;
    expect(check.blockers.map((b: any) => b.code)).toContain('NOT_APPROVED');
    // Testlerim lists it; the Studio draft is gone from the list
    const list = (await t.request('/api/teacher-tests', 'GET', undefined, 'teacher')).data;
    expect(list.tests.map((x: any) => x.id)).not.toContain(doc);
    expect(list.quickTests).toEqual([expect.objectContaining({ id: r.data.id, title: 'Kuvvet · Ünite testi', questionCount: 4, unanswered: 0, mine: true })]);
  });

  it('never moves a test that reached students, and the plain online switch is unchanged', async () => {
    const { t, doc } = await world();
    t.db.exec(`INSERT INTO assignments(id,institution_id,created_by,assignment_type,title,status) VALUES('asg1','school','teacher','TEACHER','x','ASSIGNED');
      INSERT INTO studio_delivery_links(id,document_id,institution_id,publication_revision,delivery_kind,destination,external_id,idempotency_key) VALUES('sdl1','${doc}','school',1,'HOMEWORK','ASSIGNMENTS','asg1','k1');`);
    const r = await t.request(`/api/quick-tests/from-studio/${doc}`, 'POST', { addCrops: true, rightsDeclared: true }, 'teacher');
    expect(r.data.error.code).toBe('TEST_LOCKED');
    const plain = await t.request(`/api/quick-tests/from-studio/${doc}`, 'POST', {}, 'teacher');
    expect(plain.response.status, plain.text).toBe(201);
    expect(t.db.prepare(`SELECT source_kind FROM quick_tests WHERE id=?`).get(plain.data.id)).toMatchObject({ source_kind: 'POOL' });
    expect(t.db.prepare(`SELECT status FROM studio_documents WHERE id=?`).get(doc)).not.toMatchObject({ status: 'ARCHIVED' });
  });
});

describe('Havuza öner', () => {
  it('needs the declaration, keeps its own image copy, waits for the editorial team and shows the teacher the result', async () => {
    const { t, doc, add } = await world();
    const moved = (await t.request(`/api/quick-tests/from-studio/${doc}`, 'POST', { addCrops: true, rightsDeclared: true }, 'teacher')).data.id;
    const qid = (await add(moved)).data.question.id;
    const bankQ = (t.db.prepare(`SELECT id FROM quick_test_questions WHERE test_id=? AND kind='BANK' LIMIT 1`).get(moved) as any).id;
    const poolBefore = (t.db.prepare(`SELECT COUNT(*) n FROM question_bank`).get() as any).n;
    const suggest = (id: string, body: any) => t.request(`/api/quick-tests/${moved}/questions/${id}/suggest`, 'POST', body, 'teacher');
    expect((await suggest(qid, {})).data.error.code).toBe('DECLARATION_REQUIRED');
    expect((await suggest(bankQ, { declared: true })).data.error.code).toBe('ALREADY_POOL');
    const r = await suggest(qid, { declared: true, note: 'FB.5.2.1 için yazdım' });
    expect(r.response.status, r.text).toBe(201);
    expect((await suggest(qid, { declared: true })).data.duplicate).toBe(true);
    const row = t.db.prepare(`SELECT image_key,status,statement,suggested_by FROM pool_suggestions WHERE id=?`).get(r.data.suggestion.id) as any;
    expect(row).toMatchObject({ status: 'PENDING', suggested_by: 'teacher' });
    expect(row.image_key).toMatch(/^pool-suggestions\/school\//);
    expect(row.statement).toContain('ben yazdım');
    expect(t.db.prepare(`SELECT COUNT(*) n FROM question_bank`).get()).toMatchObject({ n: poolBefore });       // nothing entered the pool
    let detail = (await t.request(`/api/quick-tests/${moved}`, 'GET', undefined, 'teacher')).data.questions;
    expect(detail.find((q: any) => q.id === qid).suggestion).toEqual({ status: 'PENDING', note: null });
    // the editorial team only
    expect((await t.request('/api/admin/pool-suggestions', 'GET', undefined, 'teacher')).response.status).toBe(403);
    const queue = (await t.request('/api/admin/pool-suggestions', 'GET', undefined, 'admin')).data;
    expect(queue.counts).toEqual({ PENDING: 1 });
    expect(queue.suggestions[0]).toMatchObject({ teacher: 'Synthetic Teacher', institution: 'Synthetic School', correctAnswer: 'C', note: 'FB.5.2.1 için yazdım' });
    const img = await t.request(`/api/admin/pool-suggestions/${r.data.suggestion.id}/image`, 'GET', undefined, 'admin');
    expect(img.response.headers.get('Content-Type')).toBe('image/png');
    const decide = (body: any) => t.request(`/api/admin/pool-suggestions/${r.data.suggestion.id}/decide`, 'POST', body, 'admin');
    expect((await decide({ decision: 'REJECTED' })).data.error.code).toBe('NOTE_REQUIRED');
    expect((await decide({ decision: 'ACCEPTED' })).data.error.code).toBe('QUESTION_REQUIRED');
    expect((await decide({ decision: 'ACCEPTED', questionBankId: 'yok' })).data.error.code).toBe('QUESTION_NOT_FOUND');
    expect((await decide({ decision: 'ACCEPTED', questionBankId: 'q4', note: 'Teşekkürler' })).data.status).toBe('ACCEPTED');
    detail = (await t.request(`/api/quick-tests/${moved}`, 'GET', undefined, 'teacher')).data.questions;
    expect(detail.find((q: any) => q.id === qid).suggestion).toEqual({ status: 'ACCEPTED', note: 'Teşekkürler' });
  });
});
