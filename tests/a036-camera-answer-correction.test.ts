import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/**
 * A036: phone reading. Ambiguous or faint bubbles reach the review with their question; the person sets
 * the answer seen on paper, which is what gets scored, and the decision is audited. (The physical part —
 * a real printed sheet read by a real phone — is checked by hand, K002; a synthetic test is no proof.)
 */
describe('A036: correcting ambiguous camera marks', () => {
  it('flags, corrects per question, scores the corrected answer and keeps an audit trail', async () => {
    const t = await evaluatedExam('direct');
    try {
      t.db.exec(`INSERT INTO exam_optical_bindings(id,exam_id,booklet_code,optical_template_version_id,active,created_by) VALUES('bind1','${t.examId}','A','optik-7108-sekonic-v1',1,'admin')`);
      // the key is TUR ABCD, MAT DCBA; question 2 of TUR was double-marked, question 3 faint and left blank
      const records = [{ student_number: '101', booklet: 'A', answers_by_subject: { TUR: 'A__D', MAT: 'DCBA' }, confidence: 0.82, issues: ['TUR: 2. soruda çift/kararsız işaret.', 'TUR: 3. soruda belirsiz soluk işaret; boş sayıldı, kontrol edin.'] }];
      const preview = await t.request(`/api/exams/${t.examId}/camera-preview`, 'POST', { institutionId: 'school', templateVersionId: 'optik-7108-sekonic-v1', records });
      expect(preview.response.status, preview.text).toBe(200);
      expect(preview.data.status).toBe('NEEDS_REVIEW');
      const batchPath = `/api/scan-batches/${preview.data.batchId}`;
      const row = (await t.request(batchPath)).data.records[0];
      const fix = (body: any) => t.request(`/api/camera/scan-batches/${preview.data.batchId}/records/${row.id}/answer`, 'POST', body);
      expect((await fix({ subjectCode: 'TUR', questionNo: 2, answer: 'E' })).data.error.code).toBe('OPTION_OUT_OF_RANGE');
      expect((await fix({ subjectCode: 'TUR', questionNo: 9, answer: 'A' })).response.status).toBe(400);
      expect((await fix({ subjectCode: 'TUR', questionNo: 2, answer: 'B' })).data.remainingIssues).toHaveLength(1);
      const last = await fix({ subjectCode: 'TUR', questionNo: 3, answer: '' });
      expect(last.data.remainingIssues).toEqual([]);
      const after = (await t.request(batchPath)).data;
      expect(after.batch.status).toBe('READY');
      expect(after.records[0].canonical.answers_by_subject.TUR).toBe('AB_D');
      const ev = await t.request(`${batchPath}/evaluate`, 'POST');
      expect(ev.response.status, ev.text).toBe(200);
      const tur = t.db.prepare(`SELECT sr.correct_count d,sr.wrong_count y,sr.blank_count b FROM subject_results sr JOIN exam_participants ep ON ep.id=sr.participant_id JOIN subjects s ON s.id=sr.subject_id WHERE ep.exam_id=? AND ep.student_id='s1' AND s.code='TUR'`).get(t.examId);
      expect(tur).toEqual({ d: 3, y: 0, b: 1 });
      const audits = t.db.prepare(`SELECT details_json FROM audit_logs WHERE action='CAMERA_ANSWER_CORRECTED' ORDER BY rowid`).all().map((r: any) => JSON.parse(r.details_json));
      expect(audits.map((a) => [a.subjectCode, a.questionNo, a.before, a.after])).toEqual([['TUR', 2, null, 'B'], ['TUR', 3, null, null]]);
      // a committed reading cannot be changed any more
      expect((await fix({ subjectCode: 'TUR', questionNo: 1, answer: 'C' })).data.error.code).toBe('BATCH_COMMITTED');
      // nor by a teacher of another role
      expect((await t.request(`/api/camera/scan-batches/${preview.data.batchId}/records/${row.id}/answer`, 'POST', { subjectCode: 'TUR', questionNo: 1, answer: 'C' }, 'stuuser')).response.status).toBe(403);
    } finally { t.db.close(); }
  }, 60000);
});
