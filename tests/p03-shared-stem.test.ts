import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { evaluatedExam } from './helpers/exam-flow';

/** P03 (owner, 2 Nov): a stem group's approved shared text prints once before its questions and shows online above each. Synthetic data only. */
async function world() {
  const t = await evaluatedExam('direct');
  const store = new Map<string, Uint8Array>();
  Object.assign(t.env, { FILES: { put: async (k: string, v: any) => { store.set(k, new Uint8Array(v)); }, get: async (k: string) => store.has(k) ? { body: store.get(k), arrayBuffer: async () => store.get(k)!.slice().buffer } : null, delete: async (k: string) => { store.delete(k); } } });
  t.db.exec(`INSERT INTO institution_feature_overrides(institution_id,feature_key,enabled) VALUES('school','STUDIO',1);
    INSERT INTO teacher_assignments(id,user_id,institution_id,season_id,subject_id,assignment_type,active) VALUES('ta1','teacher','school','season','sub_tur','SUBJECT',1);
    INSERT INTO question_stem_groups(id,title,shared_stem_text,review_status) VALUES('gp','Kuraklık','Sentetik paragraf: Bir bölgede yağış azaldığında toprak nemi düşer ve bitkiler suyu daha zor bulur.','APPROVED'),
      ('gx','Taslak metin','Henüz incelenmemiş sentetik metin.','REVIEW');`);
  const ins = t.db.prepare(`INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,copyright_status,review_status,option_count,stem_group_id,stem_group_order)
    VALUES(?,'PLATFORM','2026-2027',8,'sub_tur','MULTIPLE_CHOICE',?,'["a","b","c","d"]','A','OWNED','APPROVED',4,?,?)`);
  for (let i = 1; i <= 3; i++) ins.run(`q${i}`, `Sentetik soru ${i}`, null, null);
  ins.run('p1', 'Paragrafa göre hangisi doğrudur?', 'gp', 1); ins.run('p2', 'Paragrafın ana fikri nedir?', 'gp', 2);
  ins.run('x1', 'Taslak grup soru 1', 'gx', 1);
  const create = (ids: string[], as = 'admin') => t.request('/api/platform/studio', 'POST', { title: 'P03 deneme', documentType: 'PRACTICE_EXAM', institutionId: 'school', gradeLevel: 8, subjectId: 'sub_tur', academicYear: '2026-2027', deliveryMode: 'PDF', bookletCodes: ['A', 'B'], questionCount: ids.length, questionIds: ids }, as);
  return { t, store, create };
}

describe('P03 shared stem text', () => {
  it('prints the approved text once, before its first question, and the check names an unapproved one', async () => {
    const { t, create } = await world();
    const doc = (await create(['q1', 'p1', 'p2', 'q2'])).data.id;
    const check = (await t.request(`/api/platform/studio/${doc}/check`)).data.check;
    expect(check.blockers).toEqual([]);
    const pdf = await t.request(`/api/platform/studio/${doc}/pdf?booklet=A`);
    expect(pdf.response.status, pdf.text).toBe(200);
    // B reverses unit by unit: the group stays together and gets its own numbers there.
    const b = await t.request(`/api/platform/studio/${doc}/layout?booklet=B`);
    expect(b.response.status, b.text).toBe(200);
    expect(b.data.plan.placements.map((p: any) => p.questionId)).toEqual(['q2', 'p1', 'p2', 'q1']);

    // An unapproved text is refused when the document is made …
    expect((await create(['x1'])).data.error.code).toBe('STEM_GROUP_NOT_APPROVED');
    // … and if it loses approval later, the check names it and the PDF stops.
    t.db.exec(`UPDATE question_stem_groups SET review_status='REVIEW' WHERE id='gp'`);
    const after = (await t.request(`/api/platform/studio/${doc}/check`)).data.check;
    expect(after.blockers.filter((x: any) => x.code === 'STEM_GROUP_NOT_APPROVED').map((x: any) => x.questionId)).toEqual(['p1', 'p2']);
    expect(after.revision).not.toBe(check.revision);
    expect((await t.request(`/api/platform/studio/${doc}/pdf?booklet=A`)).response.status).toBe(409);
  }, 60000);

  it('the printed booklet has the passage line and text', async () => {
    const { create, t } = await world();
    const doc = (await create(['p1', 'p2'])).data.id;
    const { renderStudioPdf } = await import('../worker/lib/studio-pdf');
    const out = await renderStudioPdf(t.env, doc, 'A');
    const loaded = await PDFDocument.load(out.bytes);
    expect(loaded.getPageCount()).toBeGreaterThan(0);
    expect(out.plan.placements.map((p: any) => p.questionId)).toEqual(['p1', 'p2']);
    // the first question's block is taller than the second's: it carries the passage box
    const [a, b] = out.plan.placements;
    expect(a.height).toBeGreaterThan(b.height);
  }, 60000);

  it('goes online with the text above each question; shuffling keeps the group together', async () => {
    const { t, create } = await world();
    const doc = (await create(['q1', 'p1', 'p2', 'q2', 'q3'], 'teacher')).data.id;
    const sw = await t.request(`/api/quick-tests/from-studio/${doc}`, 'POST', {}, 'teacher');
    expect(sw.response.status, sw.text).toBe(201);
    const ses = (await t.request(`/api/quick-tests/${sw.data.id}/sessions`, 'POST', { durationMinutes: 10, shuffle: true }, 'teacher')).data.session;
    const app = (await import('../worker/preview-policy-production-entry')).default as any;
    const pub = async (path: string, body?: any) => { const r = await app.fetch(new Request(`https://app.anunex.com${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Origin: 'https://app.anunex.com' }, ...(body ? { body: JSON.stringify(body) } : {}) }), t.env, { waitUntil() {}, passThroughOnException() {} }); return r.json() as any; };
    for (let n = 0; n < 6; n++) {
      const st = await pub(`/api/public/quick-tests/${ses.code}/start`, { name: `Öğrenci ${n}`, number: String(100 + n) });
      const qs: any[] = st.questions || (await pub(`/api/public/quick-tests/attempts/${st.attemptId}?t=${st.token}`)).questions;
      const withText = qs.filter((q) => q.passage);
      expect(withText.map((q) => q.stem)).toEqual(['Paragrafa göre hangisi doğrudur?', 'Paragrafın ana fikri nedir?']);
      expect(withText[1].no - withText[0].no).toBe(1);
      expect(withText[0].passage).toMatchObject({ title: 'Kuraklık', first: withText[0].no, last: withText[1].no });
      expect(withText[0].passage.text).toContain('Sentetik paragraf');
    }
  }, 60000);
});
