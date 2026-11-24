import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/**
 * Owner (5 Nov, Fenomen 8): changing an exam's structure keeps the answer key it already has. Questions that still
 * exist keep their answers; only answers that no longer fit are dropped, and a preview says how many before saving.
 * Synthetic data only.
 */
const keyOf = (t: any, examId: string) => Object.fromEntries((t.db.prepare(`SELECT q.subject_id||'#'||q.question_no||'#'||ak.booklet_code k, ak.correct_answer a, ak.option_count o FROM answer_keys ak JOIN exam_questions q ON q.id=ak.exam_question_id WHERE q.exam_id=?`).all(examId) as any[]).map((r) => [r.k, `${r.a}/${r.o}`]));
describe('a structure change keeps the answer key', () => {
  it('keeps matching answers, drops only what no longer fits, and previews without writing', async () => {
    const t = await evaluatedExam('direct');
    try {
      const created = await t.request('/api/exam-definitions', 'POST', { ownerType: 'CENTRAL', academicYear: '2026-2027', title: 'Sentetik Yapı', examType: 'LGS', gradeLevel: 8, publisherName: 'Sentetik', sessionLabel: 'Tek', scoringRuleVersionId: 'srv_meb_lgs_2627', outcomeMode: 'OPTIONAL' });
      expect(created.response.status, created.text).toBe(201);
      const id = created.data.id, base = `/api/exam-definitions/${id}`;
      const subj = (tur: number, opt: 4 | 5) => ({ booklets: ['A', 'B'], subjects: [
        { subjectId: 'sub_tur', questionCount: tur, questionStart: 1, questionEnd: tur, optionCount: opt, wrongDivisor: 3, sortOrder: 1 },
        { subjectId: 'sub_mat', questionCount: 4, questionStart: 1, questionEnd: 4, optionCount: opt, wrongDivisor: 3, sortOrder: 2 }] });
      expect((await t.request(`${base}/structure`, 'PUT', subj(4, 5))).response.status).toBe(200);
      const entries = [
        { subjectId: 'sub_tur', bookletCode: 'A', answers: 'ABCE', optionCount: 5 }, { subjectId: 'sub_mat', bookletCode: 'A', answers: 'DCBA', optionCount: 5 },
        { subjectId: 'sub_tur', bookletCode: 'B', answers: 'BADC', optionCount: 5 }, { subjectId: 'sub_mat', bookletCode: 'B', answers: 'ABCD', optionCount: 5 }];
      const k = await t.request(`${base}/answer-key`, 'PUT', { entries });
      expect(k.response.status, k.text).toBe(200);
      const before = keyOf(t, id);
      expect(Object.keys(before)).toHaveLength(16);

      // Türkçe 4 → 5 questions and every test 5 → 4 options (what Fenomen 8 needed): one "E" answer cannot stay
      const preview = await t.request(`${base}/structure?preview=1`, 'PUT', subj(5, 4));
      expect(preview.response.status, preview.text).toBe(200);
      expect(preview.data).toMatchObject({ preview: true, keptAnswers: 15, droppedAnswers: { removedQuestions: 0, removedBooklets: 0, optionE: 1 } });
      expect(keyOf(t, id)).toEqual(before); // nothing written

      const saved = await t.request(`${base}/structure`, 'PUT', subj(5, 4));
      expect(saved.response.status, saved.text).toBe(200);
      expect(saved.data).toMatchObject({ keptAnswers: 15, droppedAnswers: { optionE: 1 } });
      const after = keyOf(t, id);
      expect(Object.keys(after)).toHaveLength(15);
      expect(after['sub_tur#1#A']).toBe('A/4');
      expect(after['sub_tur#4#A']).toBeUndefined(); // was E
      expect(after['sub_mat#4#B']).toBe('D/4');
      expect((t.db.prepare('SELECT count(*) n FROM exam_questions WHERE exam_id=?').get(id) as any).n).toBe(9);

      // removing booklet B and the last Türkçe question drops exactly those answers
      const smaller = { booklets: ['A'], subjects: [{ ...subj(4, 4).subjects[0], questionCount: 3, questionEnd: 3 }, subj(4, 4).subjects[1]] };
      const p2 = await t.request(`${base}/structure?preview=1`, 'PUT', smaller);
      expect(p2.data.droppedAnswers).toEqual({ removedQuestions: 0, removedBooklets: 8, optionE: 0 });
      expect((await t.request(`${base}/structure`, 'PUT', smaller)).response.status).toBe(200);
      expect(keyOf(t, id)).toEqual({ 'sub_tur#1#A': 'A/4', 'sub_tur#2#A': 'B/4', 'sub_tur#3#A': 'C/4', 'sub_mat#1#A': 'D/4', 'sub_mat#2#A': 'C/4', 'sub_mat#3#A': 'B/4', 'sub_mat#4#A': 'A/4' });
    } finally { t.db.close(); }
  }, 60000);
});
