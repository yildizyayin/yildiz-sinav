import { describe, expect, it } from 'vitest';
import { writtenSetup } from './helpers/written-item';
import { photographPage } from './helpers/written-sheet-render';
import { readWrittenPage } from '../src/lib/writtenCameraReader';

/**
 * A085: camera reading and evaluation of written answers, end to end on the real schema through the
 * production entry: printed layout → (synthetic) phone photo → browser reader → crops linked to the student →
 * exact digit-grid suggestion and AI handwriting suggestion with confidence/flags → teacher scores → agreement.
 * The AI model is mocked; real handwriting quality can only be measured with real sheets (K002).
 */
const SRC = 'https://www.meb.gov.tr/ortak-yazili-dagilim/haber/00000/tr';
function memoryBucket() {
  const files = new Map<string, { bytes: Uint8Array; type?: string }>();
  return { files, async put(key: string, body: any, opts?: any) { files.set(key, { bytes: new Uint8Array(await new Response(body).arrayBuffer()), type: opts?.httpMetadata?.contentType }); return {}; },
    async get(key: string) { const f = files.get(key); return f ? { body: new Blob([f.bytes]).stream(), writeHttpMetadata(h: Headers) { if (f.type) h.set('Content-Type', f.type); } } : null; } };
}
const fakeJpeg = (seed: Uint8ClampedArray) => 'data:image/jpeg;base64,' + Buffer.from(seed.slice(0, 3000)).toString('base64');

async function cameraPaper() {
  const t = await writtenSetup();
  (t.env as any).FILES = memoryBucket();
  const [qid] = t.questionIds; await t.approve(qid);
  expect((await t.as('teacher', `/api/question-rubrics/${qid}/versions`, 'POST', { totalPoints: 40, alternatives: [], criteria: [
    { criterion: 'Okuma adımları', points: 20, levels: [{ points: 0, descriptor: 'Yok' }, { points: 10, descriptor: 'Kısmen' }, { points: 20, descriptor: 'Tam' }] },
    { criterion: 'Ana fikir', points: 20, levels: [{ points: 0, descriptor: 'Yok' }, { points: 10, descriptor: 'Kısmen' }, { points: 20, descriptor: 'Tam' }] }] })).response.status).toBe(201);
  await t.as('teacher', `/api/question-rubrics/${qid}/versions/2/approve`, 'POST', { confirm: true });
  const tb = await t.as('admin', '/api/written-scenarios', 'POST', { academicYear: '2026-2027', term: 1, examNo: 1, gradeLevel: 8, subjectId: 'sub_tur', authority: 'ODSGM', sourceTitle: 'Dağılım tablosu', sourceUrl: SRC, sourceAcademicYear: '2026-2027',
    scenarios: [{ label: 'A', rows: [{ unit: 'Okuma', outcomeCode: 'T.8.1.1', questionCount: 1 }, { unit: 'Yazma', topic: 'Metin', questionCount: 2 }] }] });
  await t.as('admin', `/api/written-scenarios/${tb.data.id}/verify`, 'POST', {});
  const sc = (await t.as('mgr', `/api/written-scenarios/${tb.data.id}`)).data.table.scenarios[0];
  await t.as('mgr', `/api/written-scenarios/${tb.data.id}/choice`, 'POST', { scenarioId: sc.id });
  const id = (await t.as('teacher', '/api/written-papers', 'POST', { tableId: tb.data.id, title: '8-A Türkçe 1. yazılı' })).data.id;
  const zr = (total: number) => ({ totalPoints: total, alternatives: [{ answerText: '40' }], criteria: [{ criterion: 'Cevabın doğruluğu', points: total, levels: [{ points: 0, descriptor: 'Yanlış' }, { points: total / 2, descriptor: 'Kısmen' }, { points: total, descriptor: 'Doğru' }] }] });
  const set = await t.as('teacher', `/api/written-papers/${id}/items`, 'PUT', { items: [
    { scenarioRowId: sc.rows[0].id, questionId: qid },
    { scenarioRowId: sc.rows[1].id, source: 'ZUMRE', stemText: 'Metinde kaç yıl sonra döndüğü anlatılıyor? Sayıyla yazınız.', modelAnswer: '42', rubric: zr(20) },
    { scenarioRowId: sc.rows[1].id, source: 'ZUMRE', stemText: 'Metnin türünü yazıp bir gerekçe veriniz.', modelAnswer: 'Hikâye; olay örgüsü var.', rubric: zr(40) }] });
  expect(set.response.status, set.text).toBe(200);
  expect((await t.as('teacher', `/api/written-papers/${id}/finalize`, 'POST', { confirm: true })).response.status).toBe(200);
  const items = t.db.prepare('SELECT id,sort_order FROM written_paper_items WHERE paper_id=? ORDER BY sort_order').all(id) as any[];
  const c = (path: string, method = 'GET', body?: any, who = 'teacher') => t.as(who, `/api/written-papers/${id}/camera/${path}`, method, body);
  return { ...t, id, items, c };
}

describe('A085: camera reading of written answers', () => {
  it('reads the photographed sheet, stores crops for the student, suggests exactly for digits and with AI for text; the teacher decides; agreement is measured', async () => {
    const t = await cameraPaper();
    try {
      const [bank, digit, text] = t.items;
      const lay = await t.c('layout');
      expect(lay.response.status, lay.text).toBe(200);
      const layout = lay.data.layout;
      expect(layout.studentDigits).toBe(3);
      expect(layout.pages).toHaveLength(1);
      expect(layout.pages[0].regions.filter((r: any) => r.purpose === 'digit-grid').map((r: any) => [r.itemId, r.positions])).toEqual([[digit.id, 4]]);
      // fixed once: what was printed is what is read
      expect((await t.c('layout')).text).toBe(lay.text);
      expect(() => t.db.prepare(`UPDATE written_paper_layouts SET layout_json='{}'`).run()).toThrow(/LAYOUT_IMMUTABLE/);
      const sheet = await t.c('sheet');
      expect(sheet.response.headers.get('Content-Type')).toContain('text/html');
      expect(sheet.text).toContain('<svg'); expect(sheet.text).toContain('Öğrenci No');
      expect(sheet.text).not.toContain('Hikâye; olay örgüsü var.');

      // the phone: a slanted photo of the filled sheet, read in the browser
      const read = readWrittenPage(photographPage(layout, 1, { student: '101', digits: { [digit.id]: '__42' }, ink: [bank.id, text.id] }), layout);
      expect(read).toMatchObject({ ok: true, pageNo: 1, studentNumber: '101' });
      expect(read.digits[digit.id].read).toBe('__42');

      const calls: string[] = [];
      Object.assign(t.env, { QUESTION_GENERATION_ENABLED: 'true', AI: { run: async (model: string, input: any) => {
        calls.push(model);
        expect(input.messages[0].content[1]).toMatchObject({ type: 'image_url' });
        const crit = String(input.messages[0].content[0].text);
        return crit.includes('Okuma adımları')
          ? { response: JSON.stringify({ transcription: 'Metni okurum, paragrafların konusunu bulurum, ana fikri yazarım.', criterionPoints: [20, 10], rationale: 'Ana fikir eksik ifade edilmiş.', confidence: 0.86, illegible: false }) }
          : { response: JSON.stringify({ transcription: '[okunamadı]', criterionPoints: [0], rationale: 'Yazı okunamıyor.', confidence: 0.2, illegible: true }) };
      } } });
      const up = await t.c('scans', 'POST', { pageNo: read.pageNo, studentNumber: read.studentNumber, readConfidence: read.confidence, items: read.crops.map((cr) => ({ itemId: cr.itemId, image: fakeJpeg(cr.data), digits: read.digits[cr.itemId]?.read, issues: read.digits[cr.itemId]?.issues || [] })) });
      expect(up.response.status, up.text).toBe(200);
      expect(up.data.studentId).toBe('s1');
      const by = Object.fromEntries(up.data.items.map((r: any) => [r.itemId, r]));
      expect(by[digit.id].suggestion).toMatchObject({ source: 'DIGIT_GRID', itemPoints: 20, final: false });
      expect(by[bank.id].suggestion).toMatchObject({ source: 'VISION_AI', itemPoints: 30, confidence: 0.86, flags: [] });
      expect(by[text.id].suggestion).toMatchObject({ source: 'VISION_AI', itemPoints: 0, flags: ['ILLEGIBLE', 'LOW_CONFIDENCE'] });
      // the digit grid used no AI: two vision calls, for the two text answers only
      expect(calls).toEqual(['@cf/meta/llama-4-scout-17b-16e-instruct', '@cf/meta/llama-4-scout-17b-16e-instruct']);
      expect((t.env as any).FILES.files.size).toBe(3);

      // suggestions are not scores
      let ov = await t.as('teacher', `/api/written-papers/${t.id}/grading`);
      expect(ov.data.students.find((s: any) => s.id === 's1')).toMatchObject({ scored: 0, runningTotal: 0 });
      const det = await t.as('teacher', `/api/written-papers/${t.id}/grading/s1`);
      const textItem = det.data.items.find((i: any) => i.id === text.id);
      expect(textItem.scans).toHaveLength(1);
      expect(textItem.suggestions[0]).toMatchObject({ source: 'VISION_AI', flags: ['ILLEGIBLE', 'LOW_CONFIDENCE'] });
      const img = await t.c(`scans/${textItem.scans[0].id}/image`);
      expect(img.response.status).toBe(200);
      expect(img.response.headers.get('Content-Type')).toBe('image/jpeg');
      expect((await t.c(`scans/${textItem.scans[0].id}/image`, 'GET', undefined, 'tch_other')).response.status).toBe(404);

      // the teacher scores: agrees with the digit grid and the bank item, overrides the illegible one after reading the photo
      const sugg = (itemId: string) => det.data.items.find((i: any) => i.id === itemId).suggestions[0].id;
      await t.as('teacher', `/api/written-papers/${t.id}/grading/s1/items/${digit.id}`, 'POST', { criterionPoints: [20], aiSuggestionId: sugg(digit.id) });
      await t.as('teacher', `/api/written-papers/${t.id}/grading/s1/items/${bank.id}`, 'POST', { criterionPoints: [20, 10], aiSuggestionId: sugg(bank.id) });
      await t.as('teacher', `/api/written-papers/${t.id}/grading/s1/items/${text.id}`, 'POST', { criterionPoints: [20], aiSuggestionId: sugg(text.id) });
      ov = await t.as('teacher', `/api/written-papers/${t.id}/grading`);
      expect(ov.data.aiAgreement).toMatchObject({ pairs: 3, exact: 2, exactRate: 0.667, meanAbsDiff: 6.67, bySource: { DIGIT_GRID: { pairs: 1, exact: 1 }, VISION_AI: { pairs: 2, exact: 1, meanAbsDiff: 10 } } });
      expect(t.db.prepare(`SELECT action FROM audit_logs WHERE action='WRITTEN_SCANS_UPLOADED'`).all()).toHaveLength(1);
    } finally { t.db.close(); }
  }, 180000);

  it('wrong or unclear digits, unknown students and switched-off AI are handled without guessing', async () => {
    const t = await cameraPaper();
    try {
      const [bank, digit] = t.items;
      const layout = (await t.c('layout')).data.layout;
      const img = 'data:image/jpeg;base64,' + Buffer.alloc(500, 7).toString('base64');
      const send = (body: any) => t.c('scans', 'POST', { pageNo: 1, readConfidence: 0.9, ...body });
      // the number read is nobody at this school's grade: no guess, the teacher picks the student
      expect((await send({ studentNumber: '999', items: [{ itemId: digit.id, image: img, digits: '__42' }] })).data.error.code).toBe('STUDENT_NOT_FOUND');
      // AI off: digits are still exact (no AI needed); text gets no suggestion
      t.env.QUESTION_GENERATION_ENABLED = 'false';
      const r = await send({ studentId: 's1', items: [{ itemId: digit.id, image: img, digits: '__41' }, { itemId: bank.id, image: img }] });
      expect(r.response.status, r.text).toBe(200);
      expect(r.data.items[0].suggestion).toMatchObject({ source: 'DIGIT_GRID', itemPoints: 0 });
      expect(r.data.items[1]).toMatchObject({ suggestion: null, flags: ['AI_DISABLED'] });
      // an accepted alternative (40) counts as correct; a double mark or a gap is never read as a number
      expect((await send({ studentId: 's1', items: [{ itemId: digit.id, image: img, digits: '__40' }] })).data.items[0].suggestion.itemPoints).toBe(20);
      for (const d of ['__4?', '_4_2', '____']) expect((await send({ studentId: 's1', items: [{ itemId: digit.id, image: img, digits: d }] })).data.items[0]).toMatchObject({ suggestion: null, flags: ['UNREADABLE_DIGITS'] });
      // an AI reading outside the rubric levels is discarded, never stored as a suggestion
      Object.assign(t.env, { QUESTION_GENERATION_ENABLED: 'true', AI: { run: async () => ({ response: JSON.stringify({ transcription: 'metin', criterionPoints: [15, 20], confidence: 0.99, illegible: false }) }) } });
      expect((await send({ studentId: 's1', items: [{ itemId: bank.id, image: img }] })).data.items[0]).toMatchObject({ suggestion: null, flags: ['AI_OUTPUT_INVALID'] });
      t.env.AI = { run: async () => { throw new Error('down'); } };
      expect((await send({ studentId: 's1', items: [{ itemId: bank.id, image: img }] })).data.items[0]).toMatchObject({ suggestion: null, flags: ['AI_UNAVAILABLE'] });
      expect(t.db.prepare(`SELECT count(*) c FROM written_score_suggestions WHERE item_id=?`).get(bank.id)).toEqual({ c: 0 });
      // a box from another page, a non-image or an oversized image is refused
      expect((await send({ studentId: 's1', pageNo: 2, items: [{ itemId: digit.id, image: img }] })).response.status).toBe(400);
      expect((await send({ studentId: 's1', items: [{ itemId: digit.id, image: 'data:text/html;base64,PGgxPg==' }] })).response.status).toBe(400);
      expect((await send({ studentId: 's1', items: [{ itemId: digit.id, image: 'data:image/jpeg;base64,' + Buffer.alloc(700_000, 1).toString('base64') }] })).response.status).toBe(400);
      // only the subject teacher; only a final paper
      for (const who of ['tch_mat', 'tch_other']) expect((await t.c('layout', 'GET', undefined, who)).response.status, who).toBe(404);
      for (const who of ['mgr', 'stuuser', 'parent']) expect((await t.c('layout', 'GET', undefined, who)).response.status, who).toBe(403);
      expect(layout.pages).toHaveLength(1);
    } finally { t.db.close(); }
  }, 180000);
});
