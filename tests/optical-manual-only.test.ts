import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
import app from '../worker/preview-policy-production-entry';
import { buildManualParserDefinition, defaultManualAnswerBlocks, defaultManualFields, manualFromDefinition, manualLayoutProblems, manualSamplePreview, type ManualAnswerBlock, type ManualOpticalField } from '../src/lib/opticalManual';

/**
 * Owner (5 Nov): an optic is defined only by the numbers typed on one screen. Positions are counted from 1 (the 20th
 * character is 20), nothing is guessed from a sample file, overlapping areas are refused, and a published optic is
 * corrected in one step (new version, exams follow). Synthetic data only.
 */
const field = (key: string, start: number, length: number): ManualOpticalField => ({ ...defaultManualFields().find((f) => f.key === key)!, enabled: true, start, length });
const test = (code: string, start: number, length: number, options: 4 | 5 = 4): ManualAnswerBlock => ({ code, label: code, enabled: true, start, length, questionCount: length, options });
const fieldsOf = (...list: ManualOpticalField[]) => defaultManualFields().map((f) => list.find((x) => x.key === f.key) || { ...f, enabled: false });

describe('manual optic helpers', () => {
  it('counts positions from 1: 20th character, 5 characters → stored 19..24 and shown back as 20', () => {
    const fields = fieldsOf(field('name', 1, 18), field('student_number', 20, 5));
    const def = buildManualParserDefinition(60, fields, [test('TEST-1', 31, 20)], 1);
    expect(def.fields.student_number).toMatchObject({ start: 19, end: 24, length: 5 });
    expect(def.fields.name).toMatchObject({ start: 0, end: 18 });
    expect(def.answers['TEST-1']).toMatchObject({ start: 30, end: 50, questionCount: 20, options: 4 });
    const shown = manualFromDefinition(def);
    expect(shown.fields.find((f) => f.key === 'student_number')).toMatchObject({ enabled: true, start: 20, length: 5 });
    expect(shown.answers[0]).toMatchObject({ code: 'TEST-1', start: 31, length: 20, options: 4 });
    const line = 'AHMET YILMAZ      .12345' + ' '.repeat(6) + 'ABCDABCDABCDABCDABCD' + ' '.repeat(10);
    const preview = manualSamplePreview(line, fields, [test('TEST-1', 31, 20)]);
    expect(preview.rows[0]).toEqual(['12345', 'AHMET YILMAZ      ', 'ABCDABCDABCDABCDABCD']);
  });
  it('refuses the 1858 mistake: Ad Soyad on the answers, areas past the line, missing parts', () => {
    const broken = manualLayoutProblems(180, fieldsOf(field('name', 140, 40), field('student_number', 18, 14), field('tckn', 21, 11)), [test('TEST-5', 140, 20), test('TEST-6', 160, 20), test('TEST-7', 175, 10)]);
    expect(broken.join(' | ')).toMatch(/Ad, Soyad \(140–179\) ile TEST-5 \(140–159\) aynı hanelere düşüyor/);
    expect(broken.join(' | ')).toMatch(/Öğrenci No \(18–31\) ile T\.C\. Kimlik No \(21–31\)/);
    expect(broken.join(' | ')).toMatch(/TEST-7: 175–184\. haneler satır uzunluğunu \(180\) aşıyor/);
    expect(manualLayoutProblems(0, defaultManualFields().map((f) => ({ ...f, enabled: false })), defaultManualAnswerBlocks())).toEqual(expect.arrayContaining([expect.stringMatching(/Satır uzunluğu/), expect.stringMatching(/Ad Soyad/), expect.stringMatching(/test/)]));
    expect(manualLayoutProblems(180, fieldsOf(field('name', 1, 20), field('student_number', 40, 5)), [test('TEST-1', 61, 20)])).toEqual([]);
  });
});

describe('manual optic save', () => {
  it('saves and publishes in one step, corrects a published optic with a new version, and moves exam bindings', async () => {
    const t = await evaluatedExam('direct');
    try {
      const cookie = (await createSession(t.env, 'admin', new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
      const as = async (path: string, method = 'GET', body?: any) => {
        const res = await (app as any).fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookie, Origin: 'https://app.anunex.com', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), t.env, { waitUntil() {} });
        const text = await res.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ }
        return { status: res.status, text, data };
      };
      const created = await as('/api/optical-definitions', 'POST', { name: 'Sentetik 1858', vendor: 'Sentetik', opticalCode: 'S1858', formType: 'MANUAL', educationLevel: 'ORTAOKUL' });
      expect(created.status, created.text).toBe(201);
      const id = created.data.templateId;
      const overlap = await as(`/api/optical-definitions/${id}/manual`, 'PUT', { recordLength: 180, fields: fieldsOf(field('name', 140, 40)), answers: [test('TEST-5', 140, 20)] });
      expect(overlap.status).toBe(400);
      expect(overlap.data.error.code).toBe('MANUAL_LAYOUT_INVALID');
      expect(JSON.stringify(overlap.data.error.details)).toMatch(/aynı hanelere/);

      const good = { recordLength: 180, fields: fieldsOf(field('name', 1, 20), field('student_number', 40, 5), field('booklet', 60, 1)), answers: [test('TEST-1', 61, 20), test('TEST-2', 81, 10)] };
      const first = await as(`/api/optical-definitions/${id}/manual`, 'PUT', good);
      expect(first.status, first.text).toBe(200);
      expect(first.data).toMatchObject({ status: 'READY', version: 'v1' });
      const row = t.db.prepare(`SELECT t.status,t.form_type,v.version,v.active,v.parser_definition p FROM optical_templates t JOIN optical_template_versions v ON v.template_id=t.id WHERE t.id=? AND v.active=1`).get(id) as any;
      expect(row).toMatchObject({ status: 'READY', form_type: 'MANUAL', version: 'v1', active: 1 });
      expect(JSON.parse(row.p).fields.student_number).toMatchObject({ start: 39, end: 44 });

      // an exam uses v1; the correction makes v2 and the exam follows, nothing else is guessed
      t.db.prepare(`INSERT INTO exam_optical_bindings(id,exam_id,booklet_code,optical_template_version_id,created_by) VALUES('bind1',?,'A',?,'admin')`).run(t.examId, first.data.versionId);
      const fixed = await as(`/api/optical-definitions/${id}/manual`, 'PUT', { ...good, fields: fieldsOf(field('name', 1, 18), field('student_number', 20, 5), field('booklet', 60, 1)) });
      expect(fixed.status, fixed.text).toBe(200);
      expect(fixed.data).toMatchObject({ version: 'v2', rebound: 1 });
      expect((t.db.prepare(`SELECT optical_template_version_id v FROM exam_optical_bindings WHERE id='bind1'`).get() as any).v).toBe(fixed.data.versionId);
      expect((t.db.prepare(`SELECT count(*) n FROM optical_template_versions WHERE template_id=? AND active=1`).get(id) as any).n).toBe(1);
      expect((t.db.prepare(`SELECT count(*) n FROM audit_logs WHERE action='OPTICAL_MANUAL_SAVED' AND entity_id=?`).get(id) as any).n).toBe(2);
    } finally { t.db.close(); }
  }, 60000);
});
