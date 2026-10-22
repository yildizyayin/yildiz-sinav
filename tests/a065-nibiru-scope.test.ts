import { describe, expect, it, vi } from 'vitest';
import { evaluatedExam, TITLE } from './helpers/exam-flow';
import { runNibiru, shouldUseAiAnswer } from '../worker/lib/nibiru';

/** A065: Nibiru answers a student or parent only from published results and never asks the model when there is no data. Synthetic data only. */
const student = { id: 'stuuser', role: 'STUDENT', student_id: 's1', institution_id: 'school' } as any;
const parent = { id: 'parent', role: 'PARENT', student_id: null, institution_id: 'school' } as any;

describe('A065 Nibiru role scope', () => {
  it('does not reveal unpublished results to the student or parent and does not call the model without data', async () => {
    const t = await evaluatedExam('direct', { outcomes: true });
    const run = vi.fn(async () => ({ response: 'Nibiru: uydurma 99 net' }));
    Object.assign(t.env, { AI: { run } });
    for (const u of [student, parent]) {
      const r = await runNibiru(t.env as any, u, 'Son sınavımda kaç net yaptım?', 'WEB', `${u.id}-1`, { studentId: 's1' });
      expect(r.intent).toBe('LATEST_EXAM');
      expect(r.answer).not.toContain(TITLE);
      expect(r.answer).toContain('henüz sonuçlanmış bir sınav verisi görünmüyor');
      const w = await runNibiru(t.env as any, u, 'Hangi kazanımlarda eksiğim var?', 'WEB', `${u.id}-2`, { studentId: 's1' });
      expect(w.answer).not.toMatch(/T\.8\.1\.1|M\.8\.1\.1|Metnin ana fikrini|Üslü/);
    }
    expect(run).not.toHaveBeenCalled();
    // the teacher's school-internal view still sees the evaluated exam
    expect((t.db.prepare(`SELECT count(*) c FROM exam_results`).get() as any).c).toBeGreaterThan(0);

    expect((await t.request(`/api/platform/exam-center/${t.examId}/freeze`, 'POST')).response.status).toBe(200);
    expect((await t.request(`/api/platform/exam-center/${t.examId}/publish`, 'POST')).response.status).toBe(200);
    Object.assign(t.env, { AI: undefined });
    const after = await runNibiru(t.env as any, student, 'Son sınavımda kaç net yaptım?', 'WEB', 'stuuser-3', { studentId: 's1' });
    expect(after.answer).toContain(TITLE);
  });

  it('routes to the model only when the needed data exists', () => {
    expect(shouldUseAiAnswer('LATEST_EXAM', { student: { first_name: 'A' }, latestExam: null })).toBe(false);
    expect(shouldUseAiAnswer('LATEST_EXAM', { student: { first_name: 'A' }, latestExam: { id: 'e' } })).toBe(true);
    expect(shouldUseAiAnswer('WEAK_OUTCOMES', { student: { first_name: 'A' }, weakOutcomes: [] })).toBe(false);
    expect(shouldUseAiAnswer('CLASS_SUMMARY', { classes: [{ id: 'c' }], recent: [], weakOutcomes: [] })).toBe(false);
    expect(shouldUseAiAnswer('CLASS_SUMMARY', { classes: [{ id: 'c' }], recent: [{ id: 'e' }], weakOutcomes: [] })).toBe(true);
  });
});
