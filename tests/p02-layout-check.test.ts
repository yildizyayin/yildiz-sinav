import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { DEFAULT_LAYOUT_SETTINGS, layoutModel, normalizeLayoutSettings } from '../worker/lib/print-layout';

/** P02: versioned layout settings, one layout model for preview and PDF, and a named print check. Synthetic data only. */
const PNG1 = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x1a, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c]);

async function world() {
  const t = await evaluatedExam('direct');
  const store = new Map<string, Uint8Array>();
  Object.assign(t.env, { FILES: {
    put: async (k: string, v: any) => { store.set(k, new Uint8Array(v)); },
    get: async (k: string) => store.has(k) ? { body: store.get(k), arrayBuffer: async () => store.get(k)!.slice().buffer } : null,
    delete: async (k: string) => { store.delete(k); },
  } });
  t.db.exec(`INSERT INTO institution_feature_overrides(institution_id,feature_key,enabled) VALUES('school','STUDIO',1);`);
  const ins = t.db.prepare(`INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,copyright_status,review_status,option_count)
    VALUES(?,'PLATFORM','2026-2027',8,'sub_tur','MULTIPLE_CHOICE',?,'["Bir","İki","Üç","Dört"]','A','OWNED','APPROVED',4)`);
  for (let i = 1; i <= 6; i++) ins.run(`q${i}`, `Sentetik soru kökü ${i}: aşağıdakilerden hangisi doğrudur?`);
  const create = async (ids: string[], deliveryMode = 'PDF') => (await t.request('/api/platform/studio', 'POST', { title: 'P02 deneme', documentType: 'PRACTICE_EXAM', institutionId: 'school', gradeLevel: 8, subjectId: 'sub_tur', academicYear: '2026-2027', deliveryMode, bookletCodes: ['A', 'B'], questionCount: ids.length, questionIds: ids })).data.id as string;
  const check = async (doc: string) => (await t.request(`/api/platform/studio/${doc}/check`)).data.check;
  const pdf = (doc: string, b = 'A') => t.request(`/api/platform/studio/${doc}/pdf?booklet=${b}`);
  return { t, store, create, check, pdf };
}

describe('P02 layout settings contract', () => {
  it('keeps the printed default and validates every field', () => {
    const m = layoutModel(DEFAULT_LAYOUT_SETTINGS);
    expect(m).toMatchObject({ pageW: 595, pageH: 842, margin: 36, columns: 2, colW: 252.5, top: 806, bottom: 58, body: 9.5, line: 12.6, questionGap: 12 });
    expect(normalizeLayoutSettings(undefined)).toEqual({ ok: true, value: DEFAULT_LAYOUT_SETTINGS });
    const bad = (raw: any, code: string, opts = {}) => { const r = normalizeLayoutSettings(raw, opts); expect(r.ok).toBe(false); if (!r.ok) expect(r.errors.map((e) => e.code)).toContain(code); };
    bad({ version: 2 }, 'LAYOUT_VERSION_UNSUPPORTED');
    bad({ pageSize: 'A3' }, 'PAGE_SIZE_UNSUPPORTED');
    bad({ orientation: 'DIAGONAL' }, 'ORIENTATION_INVALID');
    bad({ columns: 3 }, 'COLUMNS_INVALID');
    bad({ columns: 'AUTO' }, 'COLUMNS_INVALID');
    bad({ marginMm: 40 }, 'MARGIN_OUT_OF_RANGE');
    bad({ fontSizePt: 20 }, 'FONT_SIZE_OUT_OF_RANGE');
    bad({ questionSpacingPt: 0 }, 'SPACING_OUT_OF_RANGE');
    bad({ pageSize: 'A5', columns: 2 }, 'COLUMN_TOO_NARROW');
    expect(normalizeLayoutSettings({ pageSize: 'A5', columns: 1 }).ok).toBe(true);
    expect(normalizeLayoutSettings({ pageSize: 'A5', orientation: 'LANDSCAPE', columns: 2 }).ok).toBe(true);
    expect(normalizeLayoutSettings({ columns: 'AUTO' }, { allowAuto: true }).ok).toBe(true);
    const land = layoutModel({ ...DEFAULT_LAYOUT_SETTINGS, orientation: 'LANDSCAPE' });
    expect([land.pageW, land.pageH]).toEqual([842, 595]);
  });
});

describe('P02 Studio check, plan and PDF', () => {
  it('reports every problem with the question and what to fix, and blocks the PDF on the server', async () => {
    const { t, store, create, check, pdf } = await world();
    const doc = await create(['q1', 'q2', 'q3', 'q4']);
    let c = await check(doc);
    expect(c.status).toBe('READY');
    expect(c.blockers).toEqual([]);
    expect(c.booklets.A).toMatchObject({ questionCount: 4, pdf: { generated: false, stale: false } });
    expect(c.settings).toEqual(DEFAULT_LAYOUT_SETTINGS);

    store.set('img/q3.webp', WEBP); store.set('img/q4.png', PNG1);
    // Approved content is immutable (DB trigger): an editor takes it back to review first.
    t.db.exec(`UPDATE question_bank SET review_status='REVIEW' WHERE id='q1'; UPDATE question_bank SET correct_answer=NULL WHERE id='q1'; UPDATE question_bank SET review_status='APPROVED' WHERE id='q1';
      UPDATE question_bank SET copyright_status='RESTRICTED', review_status='REVIEW' WHERE id='q2';
      INSERT INTO question_assets(id,question_id,asset_type,r2_key,approved,placement,sort_order) VALUES('as3','q3','IMAGE','img/q3.webp',1,'STEM',1);`);
    c = await check(doc);
    expect(c.status).toBe('BLOCKED');
    const by = (code: string) => c.blockers.filter((b: any) => b.code === code);
    expect(by('MISSING_ANSWER_KEY')[0]).toMatchObject({ questionId: 'q1', target: 'ANSWER_KEY' });
    expect(by('NOT_APPROVED')[0]).toMatchObject({ questionId: 'q2', target: 'APPROVAL' });
    expect(by('RIGHTS_NOT_CLEARED')[0]).toMatchObject({ questionId: 'q2', target: 'RIGHTS' });
    expect(by('PRINT_IMAGE_FORMAT_UNSUPPORTED')[0]).toMatchObject({ questionId: 'q3', target: 'MEDIA' });
    const blocked = await pdf(doc);
    expect(blocked.response.status).toBe(409);
    expect(blocked.data.error.code).toBe('MISSING_ANSWER_KEY');
    expect(blocked.data.check.blockers.length).toBe(c.blockers.length);
    expect([...store.keys()].some((k) => k.endsWith('.pdf'))).toBe(false);

    // Fixed content: a 1×1 picture prints, but the check warns that it will be blurry.
    t.db.exec(`UPDATE question_bank SET review_status='REVIEW' WHERE id='q1'; UPDATE question_bank SET correct_answer='A' WHERE id='q1'; UPDATE question_bank SET review_status='APPROVED' WHERE id='q1';
      UPDATE question_bank SET copyright_status='OWNED', review_status='APPROVED' WHERE id='q2';
      UPDATE question_assets SET r2_key='img/q4.png' WHERE id='as3';`);
    c = await check(doc);
    expect(c.blockers).toEqual([]);
    expect(c.warnings[0]).toMatchObject({ code: 'LOW_IMAGE_RESOLUTION', questionId: 'q3', target: 'MEDIA' });
    expect(c.status).toBe('WARNINGS');
  });

  it('draws the preview plan and the PDF from the same layout, and a content change makes the PDF stale', async () => {
    const { t, create, check, pdf } = await world();
    const doc = await create(['q1', 'q2', 'q3', 'q4', 'q5', 'q6']);
    const plan = (await t.request(`/api/platform/studio/${doc}/layout?booklet=A`)).data;
    expect(plan.plan.placements.map((p: any) => p.questionId)).toEqual(['q1', 'q2', 'q3', 'q4', 'q5', 'q6']);
    expect(plan.plan.model.columns).toBe(2);
    const printed = await pdf(doc);
    expect(printed.response.status, printed.text).toBe(200);
    const meta = JSON.parse((t.db.prepare(`SELECT metadata_json FROM studio_document_assets WHERE document_id=? AND booklet_code='A'`).get(doc) as any).metadata_json);
    expect(meta.questionPages).toBe(plan.plan.pages);
    expect(meta.revision).toBe(plan.revision);
    expect((await check(doc)).booklets.A.pdf).toEqual({ generated: true, stale: false });
    t.db.exec(`UPDATE question_bank SET review_status='REVIEW' WHERE id='q2'; UPDATE question_bank SET stem_text='Değiştirilmiş kök', updated_at='2099-01-01 00:00:00' WHERE id='q2'; UPDATE question_bank SET review_status='APPROVED' WHERE id='q2';`);
    const after = await check(doc);
    expect(after.revision).not.toBe(plan.revision);
    expect(after.booklets.A.pdf).toEqual({ generated: true, stale: true });
  });

  it('saves validated settings, drops old PDFs, and the plan follows them', async () => {
    const { t, create, pdf } = await world();
    const doc = await create(['q1', 'q2', 'q3']);
    await pdf(doc);
    const bad = await t.request(`/api/platform/studio/${doc}/layout`, 'PUT', { settings: { pageSize: 'A5', columns: 2 } });
    expect(bad.response.status).toBe(400);
    expect(bad.data.error.code).toBe('COLUMN_TOO_NARROW');
    const ok = await t.request(`/api/platform/studio/${doc}/layout`, 'PUT', { settings: { version: 1, pageSize: 'A4', orientation: 'LANDSCAPE', columns: 1, marginMm: 15, fontSizePt: 11, questionSpacingPt: 16 } });
    expect(ok.response.status, ok.text).toBe(200);
    expect(ok.data.invalidatedPdfs).toBe(1);
    const plan = (await t.request(`/api/platform/studio/${doc}/layout?booklet=B`)).data.plan;
    expect(plan.model).toMatchObject({ pageW: 842, pageH: 595, columns: 1, body: 11, questionGap: 16 });
    expect(plan.placements.every((p: any) => p.column === 0)).toBe(true);
    expect(plan.placements.map((p: any) => p.questionId)).toEqual(['q3', 'q2', 'q1']);
    const again = await pdf(doc, 'B');
    expect(again.response.status, again.text).toBe(200);
  });

  it('names an over-long question and the optical limit instead of printing', async () => {
    const { t, create, check } = await world();
    const doc = await create(['q1', 'q2'], 'PDF');
    t.db.exec(`UPDATE question_bank SET review_status='REVIEW' WHERE id='q2'`);
    t.db.prepare(`UPDATE question_bank SET stem_text=? WHERE id='q2'`).run(Array.from({ length: 140 }, (_, i) => `Uzun satır ${i} için sentetik açıklama metni.`).join('\n'));
    t.db.exec(`UPDATE question_bank SET review_status='APPROVED' WHERE id='q2'`);
    const c = await check(doc);
    expect(c.blockers.find((b: any) => b.code === 'PRINT_QUESTION_TOO_LONG')).toMatchObject({ questionId: 'q2', target: 'LAYOUT' });
    const ins = t.db.prepare(`INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,copyright_status,review_status,option_count) VALUES(?,'PLATFORM','2026-2027',8,'sub_tur','MULTIPLE_CHOICE','Kısa kök','["a","b","c","d"]','A','OWNED','APPROVED',4)`);
    const ids = Array.from({ length: 45 }, (_, i) => `m${i}`); ids.forEach((id) => ins.run(id));
    t.db.prepare(`UPDATE studio_documents SET config_json=json_set(config_json,'$.deliveryMode','PDF_OPTICAL') WHERE id=?`).run(doc);
    t.db.exec(`DELETE FROM studio_document_items WHERE document_id='${doc}'`);
    ids.forEach((id, i) => { t.db.prepare(`INSERT INTO studio_document_items(document_id,question_id,booklet_code,sort_order) VALUES(?,?,'A',?)`).run(doc, id, i + 1); t.db.prepare(`INSERT INTO studio_document_items(document_id,question_id,booklet_code,sort_order) VALUES(?,?,'B',?)`).run(doc, id, 45 - i); });
    const c2 = await check(doc);
    expect(c2.blockers.map((b: any) => b.code)).toContain('OPTICAL_CAPACITY');
    expect(c2.opticalCapacity).toBe(44);
  });
});

describe('P02 Quick Test check', () => {
  it('warns that 120 questions are not 120 optical answers, and that a rights declaration is not an approval', async () => {
    const { t, store } = await world();
    const id = (await t.request('/api/quick-tests', 'POST', { title: 'Uzun hızlı test', optionCount: 4, rightsDeclared: true }, 'teacher')).data.id;
    const add = () => { const f = new FormData(); f.set('image', new File([PNG1], 'q.png', { type: 'image/png' })); f.set('width', '600'); f.set('height', '300'); f.set('correctAnswer', 'A'); return t.request(`/api/quick-tests/${id}/questions`, 'POST', f, 'teacher'); };
    for (let i = 0; i < 45; i++) await add();
    let c = (await t.request(`/api/quick-tests/${id}/check`, 'GET', undefined, 'teacher')).data.check;
    expect(c.opticalIncluded).toBe(false);
    expect(c.warnings.map((w: any) => w.code)).toEqual(expect.arrayContaining(['OPTICAL_NOT_INCLUDED', 'NOT_EDITORIALLY_REVIEWED', 'LOW_IMAGE_RESOLUTION']));
    expect(c.blockers).toEqual([]);
    expect(c.settings.columns).toBe('AUTO');
    // A missing picture blocks the paper and is named.
    const first = (t.db.prepare(`SELECT id,image_key FROM quick_test_questions WHERE test_id=? ORDER BY sort_order LIMIT 1`).get(id) as any);
    store.delete(first.image_key);
    c = (await t.request(`/api/quick-tests/${id}/check`, 'GET', undefined, 'teacher')).data.check;
    expect(c.blockers[0]).toMatchObject({ code: 'PRINT_IMAGE_MISSING', questionId: first.id, target: 'MEDIA' });
    const blocked = await t.request(`/api/quick-tests/${id}/pdf`, 'GET', undefined, 'teacher');
    expect(blocked.response.status).toBe(409);
    expect(blocked.data.error.code).toBe('PRINT_IMAGE_MISSING');
    // Settings are validated and versioned like Studio's.
    expect((await t.request(`/api/quick-tests/${id}/layout`, 'PUT', { settings: { columns: 7 } }, 'teacher')).response.status).toBe(400);
    expect((await t.request(`/api/quick-tests/${id}/layout`, 'PUT', { settings: { version: 1, columns: 1, fontSizePt: 10 } }, 'teacher')).data.settings).toMatchObject({ version: 1, columns: 1, fontSizePt: 10 });
  });
});
