import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
import { bookletOrder, bookletUsable, checkGroupIntegrity, unitsOf, USABLE_BOOKLETS } from '../worker/lib/studio-booklets';

/** P01: question order, id-based booklets, stem groups, frozen online tests, and a re-checked Studio → Quick Test switch. Synthetic data only. */
async function world() {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT INTO institution_feature_overrides(institution_id,feature_key,enabled) VALUES('school','STUDIO',1);
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('teacher2','TEACHER','Öğretmen İki','u','u',1,'school');`);
  const ins = t.db.prepare(`INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,copyright_status,review_status,option_count,stem_group_id,stem_group_order)
    VALUES(?,'PLATFORM','2026-2027',8,'sub_tur','MULTIPLE_CHOICE',?,'["a","b","c","d"]','A','OWNED','APPROVED',4,?,?)`);
  for (let i = 1; i <= 8; i++) ins.run(`q${i}`, `Sentetik soru ${i}`, null, null);
  t.db.exec(`INSERT INTO question_stem_groups(id,title,review_status) VALUES('g1','Tablo grubu','APPROVED'),('g2','Metin grubu','APPROVED');
    UPDATE question_stem_groups SET shared_stem_text='Sentetik ortak metin.' WHERE id='g2';`);
  ins.run('g1a', 'Grup 1 soru 1', 'g1', 1); ins.run('g1b', 'Grup 1 soru 2', 'g1', 2);
  ins.run('g2a', 'Grup 2 soru 1', 'g2', 1); ins.run('g2b', 'Grup 2 soru 2', 'g2', 2);
  const create = (body: any, as = 'admin') => t.request('/api/platform/studio', 'POST', { title: 'P01 deneme', documentType: 'PRACTICE_EXAM', institutionId: 'school', gradeLevel: 8, subjectId: 'sub_tur', academicYear: '2026-2027', deliveryMode: 'PDF', bookletCodes: ['A', 'B'], ...body }, as);
  const items = (doc: string, b: string) => (t.db.prepare(`SELECT question_id FROM studio_document_items WHERE document_id=? AND booklet_code=? ORDER BY sort_order`).all(doc, b) as any[]).map((r) => r.question_id);
  return { t, create, items };
}

describe('P01 booklet support and order rules', () => {
  it('opens only booklets every stage supports', () => {
    expect(USABLE_BOOKLETS).toEqual(['A', 'B']);
    expect(bookletUsable('C')).toBe(false);
    expect(bookletUsable('D')).toBe(false);
    expect(bookletUsable('a')).toBe(true);
  });

  it('builds B only from persistent ids: A reversed unit by unit, groups kept together in their order', async () => {
    const qs = [{ id: 'x1' }, { id: 'x2' }, { id: 'g-1', groupId: 'G' }, { id: 'g-2', groupId: 'G' }, { id: 'x3' }, { id: 'x4' }];
    expect(await bookletOrder('doc1', 'A', qs)).toEqual(['x1', 'x2', 'g-1', 'g-2', 'x3', 'x4']);
    expect(await bookletOrder('doc1', 'B', qs)).toEqual(['x4', 'x3', 'g-1', 'g-2', 'x2', 'x1']);
    expect(await bookletOrder('doc1', 'B', [{ id: 'a' }, { id: 'b' }, { id: 'c' }])).toEqual(['c', 'b', 'a']);
    await expect(bookletOrder('doc1', 'C', qs)).rejects.toThrow(/UNSUPPORTED/);
    expect(unitsOf(qs)).toHaveLength(5);
  });

  it('rejects split, partial or reordered groups', () => {
    const expected = new Map([['G', ['g-1', 'g-2']]]);
    expect(checkGroupIntegrity([{ id: 'g-1', groupId: 'G' }, { id: 'g-2', groupId: 'G' }], expected)).toBeNull();
    expect(checkGroupIntegrity([{ id: 'g-1', groupId: 'G' }], expected)).toMatch(/birlikte/);
    expect(checkGroupIntegrity([{ id: 'g-2', groupId: 'G' }, { id: 'g-1', groupId: 'G' }], expected)).toMatch(/sırası/);
    expect(checkGroupIntegrity([{ id: 'g-1', groupId: 'G' }, { id: 'x' }, { id: 'g-2', groupId: 'G' }], expected)).toMatch(/ayrılmış/);
  });
});

describe('P01 Studio', () => {
  it('keeps an explicit order exactly, never shuffles it, and the booklets come from the ids', async () => {
    const { create, items } = await world();
    const order = ['q5', 'q2', 'q8', 'q1', 'q7'];
    for (let k = 0; k < 3; k++) {
      const r = await create({ questionCount: 5, questionIds: order });
      expect(r.response.status, r.text).toBe(201);
      expect(items(r.data.id, 'A')).toEqual(order);
      expect(items(r.data.id, 'B')).toEqual(await bookletOrder(r.data.id, 'B', order.map((id) => ({ id }))));
    }
  });

  it('refuses booklets that are not supported end to end', async () => {
    const { t, create } = await world();
    const r = await create({ questionCount: 2, questionIds: ['q1', 'q2'], bookletCodes: ['A', 'C'] });
    expect(r.response.status).toBe(400);
    expect(r.data.error.code).toBe('BOOKLET_UNSUPPORTED');
    const ok = await create({ questionCount: 2, questionIds: ['q1', 'q2'] });
    expect((await t.request(`/api/platform/studio/${ok.data.id}/items?booklet=C`)).response.status).toBe(400);
  });

  it('takes stem groups only whole, in their order and next to each other; never draws or swaps them', async () => {
    const { t, create, items } = await world();
    expect((await create({ questionCount: 2, questionIds: ['q1', 'g1a'] })).data.error.code).toBe('STEM_GROUP_INTEGRITY');
    expect((await create({ questionCount: 3, questionIds: ['g1a', 'q1', 'g1b'] })).data.error.code).toBe('STEM_GROUP_INTEGRITY');
    expect((await create({ questionCount: 2, questionIds: ['g1b', 'g1a'] })).data.error.code).toBe('STEM_GROUP_INTEGRITY');
    expect((await create({ questionCount: 2, questionIds: ['g2a', 'g2b'] })).data.error.code).toBe('STEM_GROUP_SHARED_TEXT_UNSUPPORTED');
    const ok = await create({ questionCount: 4, questionIds: ['q3', 'g1a', 'g1b', 'q4'] });
    expect(ok.response.status, ok.text).toBe(201);
    const b = items(ok.data.id, 'B');
    expect(b[b.indexOf('g1a') + 1]).toBe('g1b');
    const swap = await t.request(`/api/platform/studio/${ok.data.id}/swap`, 'POST', { questionId: 'g1a' });
    expect(swap.data.error.code).toBe('STEM_GROUP_SWAP');
    // A random draw of all 8 singles never pulls in grouped questions.
    for (let k = 0; k < 3; k++) {
      const r = await create({ questionCount: 8 });
      expect(r.response.status, r.text).toBe(201);
      expect(items(r.data.id, 'A').every((id: string) => id.startsWith('q'))).toBe(true);
    }
    expect((await create({ questionCount: 9 })).data.error.code).toBe('INSUFFICIENT_QUESTION_POOL');
  });

  it('reorders booklet A, rebuilds B, drops old PDFs, and locks once results exist', async () => {
    const { t, create, items } = await world();
    const doc = (await create({ questionCount: 4, questionIds: ['q1', 'q2', 'q3', 'q4'] })).data.id;
    t.db.prepare(`INSERT INTO studio_document_assets(id,document_id,institution_id,booklet_code,asset_type,r2_key,file_name,mime_type,byte_size,metadata_json) VALUES('a1',?,'school','A','QUESTION_PDF','k','f','application/pdf',1,'{}')`).run(doc);
    expect((await t.request(`/api/platform/studio/${doc}/order`, 'PUT', { questionIds: ['q1', 'q2'] })).data.error.code).toBe('ORDER_MISMATCH');
    const r = await t.request(`/api/platform/studio/${doc}/order`, 'PUT', { questionIds: ['q4', 'q3', 'q2', 'q1'] });
    expect(r.response.status, r.text).toBe(200);
    expect(items(doc, 'A')).toEqual(['q4', 'q3', 'q2', 'q1']);
    expect(items(doc, 'B')).toEqual(await bookletOrder(doc, 'B', ['q4', 'q3', 'q2', 'q1'].map((id) => ({ id }))));
    expect((t.db.prepare(`SELECT count(*) n FROM studio_document_assets WHERE document_id=?`).get(doc) as any).n).toBe(0);
    t.db.prepare(`INSERT INTO assessment_runs(id,institution_id,student_id,source_type,source_id,delivery_mode) VALUES('run1','school','s1','QUESTION_BANK',?,'OPTICAL')`).run(doc);
    expect((await t.request(`/api/platform/studio/${doc}/order`, 'PUT', { questionIds: ['q1', 'q2', 'q3', 'q4'] })).data.error.code).toBe('STUDIO_LOCKED');
  });
});

describe('P01 Quick Test versions and the Studio switch', () => {
  async function quick() {
    const w = await world();
    const store = new Map<string, Uint8Array>();
    Object.assign(w.t.env, { FILES: {
      put: async (k: string, v: Uint8Array) => { store.set(k, v); },
      get: async (k: string) => store.has(k) ? { body: store.get(k), arrayBuffer: async () => store.get(k)!.slice().buffer } : null,
      delete: async (k: string) => { store.delete(k); },
    } });
    const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
    const add = (id: string, answer: string) => { const f = new FormData(); f.set('image', new File([PNG], 'q.png', { type: 'image/png' })); f.set('width', '600'); f.set('height', '300'); f.set('correctAnswer', answer); return w.t.request(`/api/quick-tests/${id}/questions`, 'POST', f, 'teacher'); };
    return { ...w, store, add };
  }

  it('freezes questions, key, order and scoring once a student starts, and copies to a new version', async () => {
    const { t, add, store } = await quick();
    const id = (await t.request('/api/quick-tests', 'POST', { title: 'Sürüm deneme', optionCount: 4, rightsDeclared: true }, 'teacher')).data.id;
    const a = (await add(id, 'A')).data.question.id, b = (await add(id, 'B')).data.question.id;
    const ses = (await t.request(`/api/quick-tests/${id}/sessions`, 'POST', { durationMinutes: 10 }, 'teacher')).data.session;
    // An open session alone already freezes content.
    expect((await t.request(`/api/quick-tests/${id}/questions/${a}`, 'PATCH', { correctAnswer: 'C' }, 'teacher')).data.error.code).toBe('TEST_LOCKED');
    const app = (await import('../worker/preview-policy-production-entry')).default as any;
    const pub = async (path: string, body: any) => { const r = await app.fetch(new Request(`https://app.anunex.com${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://app.anunex.com' }, body: JSON.stringify(body) }), t.env, { waitUntil() {}, passThroughOnException() {} }); return r.json() as any; };
    const st = await pub(`/api/public/quick-tests/${ses.code}/start`, { name: 'Deniz Ak', number: '9' });
    await pub(`/api/public/quick-tests/attempts/${st.attemptId}/submit?t=${st.token}`, { answers: { [a]: 'A', [b]: 'A' } });
    await t.request(`/api/quick-tests/${id}/sessions/${ses.id}/close`, 'POST', {}, 'teacher');
    for (const [path, method, body] of [
      [`/api/quick-tests/${id}/questions/${a}`, 'PATCH', { correctAnswer: 'C' }],
      [`/api/quick-tests/${id}/order`, 'PUT', { ids: [b, a] }],
      [`/api/quick-tests/${id}`, 'PATCH', { optionCount: 5 }],
      [`/api/quick-tests/${id}`, 'PATCH', { wrongDivisor: 4 }],
    ] as const) expect((await t.request(path, method, body, 'teacher')).data.error.code, path).toBe('TEST_LOCKED');
    expect((await add(id, 'C')).data.error.code).toBe('TEST_LOCKED');
    expect((await t.request(`/api/quick-tests/${id}`, 'PATCH', { title: 'Sürüm deneme (A sınıfı)' }, 'teacher')).response.status).toBe(200);
    const before = (await t.request(`/api/quick-tests/${id}/results`, 'GET', undefined, 'teacher')).data.attempts[0];
    expect(before).toMatchObject({ correct_count: 1, wrong_count: 1 });

    const copy = await t.request(`/api/quick-tests/${id}/copy`, 'POST', {}, 'teacher');
    expect(copy.response.status, copy.text).toBe(201);
    const v2 = copy.data.id;
    expect((t.db.prepare(`SELECT version_of FROM quick_tests WHERE id=?`).get(v2) as any).version_of).toBe(id);
    const v2q = (await t.request(`/api/quick-tests/${v2}`, 'GET', undefined, 'teacher')).data.questions;
    expect(v2q.map((q: any) => q.correctAnswer)).toEqual(['A', 'B']);
    expect((await t.request(`/api/quick-tests/${v2}/questions/${v2q[0].id}`, 'PATCH', { correctAnswer: 'C' }, 'teacher')).response.status).toBe(200);
    expect((await t.request(`/api/quick-tests/${v2}/questions/${v2q[1].id}`, 'DELETE', undefined, 'teacher')).response.status).toBe(200);
    expect(store.size).toBe(3); // the old version keeps both pictures
    const after = (await t.request(`/api/quick-tests/${id}/results`, 'GET', undefined, 'teacher')).data.attempts[0];
    expect(after).toMatchObject({ correct_count: 1, wrong_count: 1 });
  });

  it('re-checks owner, rights, media and subject when a Studio test becomes an online exam', async () => {
    const { t, create } = await quick();
    t.db.exec(`INSERT INTO teacher_assignments(id,user_id,institution_id,season_id,subject_id,assignment_type,active) VALUES('ta1','teacher','school','season','sub_tur','SUBJECT',1)`);
    const doc = (await create({ questionCount: 3, questionIds: ['q1', 'q2', 'q3'] }, 'teacher')).data.id;
    const sw = (who: string) => t.request(`/api/quick-tests/from-studio/${doc}`, 'POST', {}, who);
    // another teacher's document
    const cookie = (await createSession(t.env, 'teacher2', new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
    const app = (await import('../worker/preview-policy-production-entry')).default as any;
    const other = await app.fetch(new Request(`https://app.anunex.com/api/quick-tests/from-studio/${doc}`, { method: 'POST', headers: { Cookie: cookie, Origin: 'https://app.anunex.com' } }), t.env, { waitUntil() {}, passThroughOnException() {} });
    expect(((await other.json()) as any).error.code).toBe('FORBIDDEN');
    t.db.exec(`UPDATE question_bank SET copyright_status='RESTRICTED' WHERE id='q2'`);
    expect((await sw('teacher')).data.error.code).toBe('RIGHTS_NOT_CLEARED');
    t.db.exec(`UPDATE question_bank SET copyright_status='OWNED' WHERE id='q2';
      INSERT INTO question_content_blocks(id,question_id,block_type,placement,payload_json,sort_order) VALUES('blk1','q3','TABLE','STEM','{}',1);`);
    expect((await sw('teacher')).data.error.code).toBe('VISUAL_QUESTION');
    t.db.exec(`DELETE FROM question_content_blocks; DELETE FROM teacher_assignments WHERE id='ta1';`);
    expect((await sw('teacher')).data.error.code).toBe('SUBJECT_FORBIDDEN');
    t.db.exec(`INSERT INTO teacher_assignments(id,user_id,institution_id,season_id,subject_id,assignment_type,active) VALUES('ta1','teacher','school','season','sub_tur','SUBJECT',1)`);
    // A failing media lookup stops the switch instead of assuming "no media".
    t.db.exec(`ALTER TABLE question_content_blocks RENAME TO question_content_blocks_off`);
    expect((await sw('teacher')).data.error.code).toBe('MEDIA_CHECK_FAILED');
    t.db.exec(`ALTER TABLE question_content_blocks_off RENAME TO question_content_blocks`);
    const ok = await sw('teacher');
    expect(ok.response.status, ok.text).toBe(201);
    const qs = (t.db.prepare(`SELECT question_bank_id FROM quick_test_questions WHERE test_id=? ORDER BY sort_order`).all(ok.data.id) as any[]).map((r) => r.question_bank_id);
    expect(qs).toEqual(['q1', 'q2', 'q3']);
  });
});
