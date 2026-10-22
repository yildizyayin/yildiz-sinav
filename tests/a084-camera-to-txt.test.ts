import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { evaluatedExam } from './helpers/exam-flow';
import { parseFmtText } from '../worker/lib/fmt';
import { decodeUploadedBytes, parseWithTemplate } from '../worker/lib/parse';
import { fixedWidthDefinition, recordsToFixedWidthText } from '../worker/lib/fixed-width-export';

/**
 * A084: a camera reading written out as the optical reader's fixed-width TXT. The same file through the
 * normal TXT evaluation (A025) gives exactly the same results (round trip). The physical reading of a real
 * printed sheet by a phone stays a manual check (K002).
 */
const fixture = (name: string) => { const b = readFileSync(new URL(`./fixtures/a025/${name}`, import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const strip = (r: any) => ({ student_number: r.student_number, name: r.name, booklet: r.booklet, class_name: r.class_name, answers_by_subject: r.answers_by_subject });

describe('A084: camera reading → TXT', () => {
  it('real Sekonic 129: records written back in the FMT layout read back identically (signature in place)', () => {
    const fmt = parseFmtText(decodeUploadedBytes(fixture('OPT_K-129_SEKONIC.fmt')), 'OPT_K-129_SEKONIC.fmt');
    const template = { id: 'v129', name: '129', parser_definition: JSON.stringify(fmt.definition) };
    const original = parseWithTemplate(decodeUploadedBytes(fixture('cap_tyt0_anon.txt')), 'cap.txt', template);
    expect(original.records).toHaveLength(6);
    const def = fixedWidthDefinition(template.parser_definition)!;
    expect(def).toMatchObject({ recordLength: 222, signature: '129', signatureStart: 0 });
    const text = recordsToFixedWidthText(original.records.map((r) => ({ ...r, tckn: undefined })), def);
    const lines = text.split('\r\n').filter(Boolean);
    expect(lines.every((l) => l.length === 222 && l.startsWith('129'))).toBe(true);
    const again = parseWithTemplate(text, 'kamera.txt', template);
    expect(again.records.map(strip)).toEqual(original.records.map(strip));
  });

  it('camera batch → confirm marks → TXT → TXT evaluation gives exactly the camera results', async () => {
    const t = await evaluatedExam('direct');
    try {
      t.db.exec(`INSERT INTO exam_optical_bindings(id,exam_id,booklet_code,optical_template_version_id,active,created_by) VALUES('bind1','${t.examId}','A','optik-7108-sekonic-v1',1,'admin')`);
      const records = [
        { student_number: '101', booklet: 'A', answers_by_subject: { TUR: 'A_CC', MAT: 'DC_A' }, confidence: 0.9, issues: ['TUR: 2. soruda çift/kararsız işaret.'] },
        { student_number: '555', name: 'MISAFIR OGRENCI', booklet: 'A', answers_by_subject: { TUR: 'ABCD', MAT: 'DDDD' }, confidence: 0.92, issues: [] },
      ];
      const preview = await t.request(`/api/exams/${t.examId}/camera-preview`, 'POST', { institutionId: 'school', templateVersionId: 'optik-7108-sekonic-v1', records });
      expect(preview.response.status, preview.text).toBe(200);
      const batchId = preview.data.batchId; const batchPath = `/api/scan-batches/${batchId}`;
      const rows = (await t.request(batchPath)).data.records;
      const ali = rows.find((r: any) => r.canonical.student_number === '101');
      expect((await t.request(`/api/camera/scan-batches/${batchId}/txt`)).data.error.code).toBe('CAMERA_MARKS_UNCONFIRMED');
      expect((await t.request(`/api/camera/scan-batches/${batchId}/records/${ali.id}/answer`, 'POST', { subjectCode: 'TUR', questionNo: 2, answer: 'B' })).response.status).toBe(200);
      for (const r of (await t.request(batchPath)).data.records) if (r.match_status === 'NEW_GUEST' || r.match_status === 'GUEST_MATCH') await t.request(`${batchPath}/records/${r.id}/resolve`, 'POST', { action: 'MATCH', studentId: (t.db.prepare(`SELECT student_id FROM exam_participants WHERE exam_id=? AND name_snapshot LIKE 'MISAFIR%'`).get(t.examId) as any).student_id });
      const exported = await t.request(`/api/camera/scan-batches/${batchId}/txt`);
      expect(exported.response.status, exported.text).toBe(200);
      expect(exported.response.headers.get('Content-Disposition')).toContain('attachment');
      const txt = exported.text;
      expect(txt.split('\r\n').filter(Boolean).map((l) => [l.length, l.slice(0, 4)])).toEqual([[171, '7108'], [171, '7108']]);

      // evaluate the camera batch, keep the results
      const ev = await t.request(`${batchPath}/evaluate`, 'POST');
      expect(ev.response.status, ev.text).toBe(200);
      const results = () => t.db.prepare(`SELECT ep.student_id s,su.code c,sr.correct_count d,sr.wrong_count y,sr.blank_count b,sr.net FROM subject_results sr JOIN exam_participants ep ON ep.id=sr.participant_id JOIN subjects su ON su.id=sr.subject_id WHERE ep.exam_id=? ORDER BY s,c`).all(t.examId);
      const scores = () => t.db.prepare(`SELECT ep.student_id s,er.net,er.score FROM exam_results er JOIN exam_participants ep ON ep.id=er.participant_id WHERE ep.exam_id=? ORDER BY s`).all(t.examId);
      const camera = { subjects: results(), scores: scores() };
      expect(camera.subjects.find((r: any) => r.s === 's1' && r.c === 'TUR')).toMatchObject({ d: 3, y: 1, b: 0 });

      // the TXT through the normal upload and evaluation
      const form = new FormData(); form.set('institutionId', 'school'); form.set('templateVersionId', 'optik-7108-sekonic-v1'); form.set('file', new File([txt], 'kamera.txt', { type: 'text/plain' }));
      const up = await t.request(`/api/exams/${t.examId}/preview-file`, 'POST', form);
      expect(up.response.status, up.text).toBe(200);
      const txtBatch = `/api/scan-batches/${up.data.batchId}`;
      const txtRows = (await t.request(txtBatch)).data.records;
      expect(txtRows.map((r: any) => [r.canonical.student_number, r.canonical.booklet, r.canonical.answers_by_subject.TUR.slice(0, 4), r.canonical.answers_by_subject.MAT.slice(0, 4)])).toEqual( // the 7108 blocks are 20 wide, as on a real reader file
        [['101', 'A', 'ABCC', 'DC_A'], ['555', 'A', 'ABCD', 'DDDD']]);
      for (const r of txtRows) if (r.match_status !== 'ACTIVE_MATCH' && r.match_status !== 'GUEST_MATCH') await t.request(`${txtBatch}/records/${r.id}/resolve`, 'POST', { action: 'GUEST' });
      const ev2 = await t.request(`${txtBatch}/evaluate`, 'POST');
      expect(ev2.response.status, ev2.text).toBe(200);
      expect({ subjects: results(), scores: scores() }).toEqual(camera);
    } finally { t.db.close(); }
  }, 60000);
});
