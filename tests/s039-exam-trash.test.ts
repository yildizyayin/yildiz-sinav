import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { purgeTrashedExams } from '../worker/lib/exam-purge';

/** D-S039 → owner 3 Nov: "Sil" deletes an exam for good at once (no trash), after its title and a reason. Synthetic data only. */
describe('S039 exam delete', () => {
  it('deletes an exam with results for good after its title and a reason; only the audit row stays', async () => {
    const t = await evaluatedExam('direct');
    t.db.exec('PRAGMA foreign_keys=ON'); // D1 enforces foreign keys
    expect(t.db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    t.db.exec(`INSERT OR IGNORE INTO exam_channel_publications(id,exam_id,channel,status) VALUES('demo1','${t.examId}','DEMO','ACTIVE')`);
    const title = (t.db.prepare(`SELECT title FROM exams WHERE id='${t.examId}'`).get() as any).title;
    expect((await t.request(`/api/admin/exams/${t.examId}/trash`, 'POST', { scope: 'ALL', reason: 'Yanlış sınav' })).data.error.code).toBe('CONFIRM_TITLE_MISMATCH');
    expect((await t.request(`/api/admin/exams/${t.examId}/trash`, 'POST', { scope: 'ALL', confirmTitle: title })).data.error.code).toBe('DELETE_REASON_REQUIRED');
    const gone = await t.request(`/api/admin/exams/${t.examId}/trash`, 'POST', { scope: 'ALL', confirmTitle: ` ${title.toLocaleUpperCase('tr-TR')} `, reason: 'Yanlış sınav tanımlandı' });
    expect(gone.response.status, gone.text).toBe(200);
    expect(gone.data.students).toBeGreaterThan(0);
    expect((t.db.prepare(`SELECT count(*) n FROM exams WHERE id='${t.examId}'`).get() as any).n).toBe(0);
    expect((t.db.prepare(`SELECT count(*) n FROM exam_participants WHERE exam_id='${t.examId}'`).get() as any).n).toBe(0);
    expect((t.db.prepare(`SELECT count(*) n FROM scan_batches WHERE exam_id='${t.examId}'`).get() as any).n).toBe(0);
    expect((t.db.prepare(`SELECT count(*) n FROM audit_logs WHERE action='EXAM_PERMANENTLY_DELETED' AND entity_id='${t.examId}'`).get() as any).n).toBe(1);
    expect((await t.request('/api/admin/exam-trash')).data.exams.map((e: any) => e.id)).not.toContain(t.examId);
  });

  it('empties the old trash on the next scheduled run', async () => {
    const t = await evaluatedExam('direct');
    expect(await purgeTrashedExams(t.env)).toBe(0);
    // an exam put in the 30-day trash before 3 Nov
    t.db.exec(`UPDATE exam_revision_state SET app_trashed_at=datetime('now','-1 day') WHERE exam_id='${t.examId}'`);
    expect(await purgeTrashedExams(t.env)).toBe(1);
    expect((t.db.prepare(`SELECT count(*) n FROM exams WHERE id='${t.examId}'`).get() as any).n).toBe(0);
  });

  it('the purge route deletes at once too, without a trash step', async () => {
    const t = await evaluatedExam('direct');
    expect((await t.request(`/api/admin/exams/${t.examId}/purge`, 'POST', { confirmTitle: 'x' })).data.error.code).toBe('CONFIRM_TITLE_MISMATCH');
  });
});
