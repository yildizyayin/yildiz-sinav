import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/** Föy online optik (owner, 2 Nov): the student marks the föy in the app; same key, same FOY evidence, first submission counts. Synthetic data only. */
async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT INTO worksheets(id,academic_year,grade_level,track,sequence_no,title,status,program_code) VALUES('ws1','2026-2027',8,'NUMERIC',1,'8. Sınıf Sayısal Föy 1','PUBLISHED','SCHOOL');
    INSERT INTO worksheet_subjects(id,worksheet_id,subject_id,question_count) VALUES('wss1','ws1','sub_tur',4),('wss2','ws1','sub_mat',4);
    INSERT INTO worksheet_question_links(id,worksheet_id,subject_id,question_no,outcome_id,solution_url) VALUES('wql1','ws1','sub_tur',1,'o_tur1','https://example.invalid/cozum');`);
  return t;
}
const keyAll = (t: any) => t.request('/api/worksheet-admin/ws1/answer-key', 'PUT', { subjects: [{ subjectId: 'sub_tur', answers: 'ABCD' }, { subjectId: 'sub_mat', answers: 'DCBA' }] });

describe('föy online optic in the app', () => {
  it('opens only with a complete key, never shows the key before submission, scores once', async () => {
    const t = await setup();
    try {
      let form = await t.request('/api/worksheets/ws1/online-optic', 'GET', undefined, 'stuuser');
      expect(form.response.status, form.text).toBe(200);
      expect(form.data).toMatchObject({ ready: false, optionCount: 4, result: null });
      expect(form.data.subjects.map((s: any) => `${s.code}:${s.questionCount}`).sort()).toEqual(['MAT:4', 'TUR:4']);
      expect(form.text).not.toMatch(/"answers"|ABCD|DCBA/);
      const early = await t.request('/api/worksheets/ws1/online-optic', 'POST', { answers: { TUR: 'ABCD' } }, 'stuuser');
      expect(early.response.status).toBe(409);
      expect(early.data.error.code).toBe('FOY_KEY_INCOMPLETE');

      const k = await keyAll(t);
      expect(k.response.status, k.text).toBe(200);
      form = await t.request('/api/worksheets/ws1/online-optic', 'GET', undefined, 'stuuser');
      expect(form.data.ready).toBe(true);
      expect(form.text).not.toMatch(/DCBA/);

      expect((await t.request('/api/worksheets/ws1/online-optic', 'POST', { answers: { TUR: 'ABCE' } }, 'stuuser')).data.error.code).toBe('FOY_ANSWER_INVALID'); // grade 8: A–D
      const sent = await t.request('/api/worksheets/ws1/online-optic', 'POST', { answers: { TUR: 'AB D', MAT: 'DCAA' } }, 'stuuser');
      expect(sent.response.status, sent.text).toBe(200);
      expect(sent.data.result).toMatchObject({ channel: 'ONLINE', correct: 6, wrong: 1, blank: 1, total: 8 });
      const tur = sent.data.result.subjects.find((s: any) => s.code === 'TUR');
      expect(tur.questions[0]).toMatchObject({ no: 1, selected: 'A', correct: 'A', status: 'CORRECT', solutionUrl: 'https://example.invalid/cozum' });
      expect(tur.questions[2]).toMatchObject({ status: 'BLANK', correct: 'C' });

      const again = await t.request('/api/worksheets/ws1/online-optic', 'POST', { answers: { TUR: 'DDDD', MAT: 'DDDD' } }, 'stuuser');
      expect(again.response.status).toBe(409);
      expect(again.data.error.code).toBe('FOY_ALREADY_SUBMITTED');
      expect(again.data.result.correct).toBe(6);
      const run = t.db.prepare(`SELECT delivery_mode m,source_type s FROM assessment_runs WHERE source_id='ws1'`).all() as any[];
      expect(run).toEqual([{ m: 'DIGITAL', s: 'FOY' }]);
    } finally { t.db.close(); }
  }, 60000);

  it('is for students only', async () => {
    const t = await setup();
    try {
      for (const who of ['teacher', 'parent', 'admin']) expect((await t.request('/api/worksheets/ws1/online-optic', 'GET', undefined, who)).response.status, who).toBe(403);
    } finally { t.db.close(); }
  }, 60000);
});
