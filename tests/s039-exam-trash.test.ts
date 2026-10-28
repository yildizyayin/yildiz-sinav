import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { purgeTrashedExams } from '../worker/lib/exam-purge';

/** D-S039: app exam removal — all channels at once, 30-day trash, permanent delete. Synthetic data only. */
describe('S039 exam trash', () => {
  it('removes from every channel with a reason, lists it in the trash and deletes it for good after typing its title', async () => {
    const t = await evaluatedExam('direct');
    t.db.exec('PRAGMA foreign_keys=ON'); // D1 enforces foreign keys
    expect(t.db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    t.db.exec(`INSERT OR IGNORE INTO exam_channel_publications(id,exam_id,channel,status) VALUES('demo1','${t.examId}','DEMO','ACTIVE')`);
    const title = (t.db.prepare(`SELECT title FROM exams WHERE id='${t.examId}'`).get() as any).title;
    const noReason = await t.request(`/api/admin/exams/${t.examId}/trash`, 'POST', { scope: 'ALL' });
    expect(noReason.data.error.code).toBe('TRASH_REASON_REQUIRED');
    const trashed = await t.request(`/api/admin/exams/${t.examId}/trash`, 'POST', { scope: 'ALL', reason: 'Yanlış sınav tanımlandı' });
    expect(trashed.response.status, trashed.text).toBe(200);
    expect((t.db.prepare(`SELECT count(*) n FROM exam_channel_publications WHERE exam_id='${t.examId}' AND status='ACTIVE'`).get() as any).n).toBe(0);
    const list = await t.request('/api/admin/exam-trash');
    expect(list.data.exams.map((e: any) => e.id)).toContain(t.examId);
    expect((await t.request(`/api/admin/exams/${t.examId}/purge`, 'POST', { confirmTitle: 'yanlış ad' })).data.error.code).toBe('CONFIRM_TITLE_MISMATCH');
    const gone = await t.request(`/api/admin/exams/${t.examId}/purge`, 'POST', { confirmTitle: ` ${title.toLocaleUpperCase('tr-TR')} ` });
    expect(gone.response.status, gone.text).toBe(200);
    expect(gone.data.students).toBeGreaterThan(0);
    expect((t.db.prepare(`SELECT count(*) n FROM exams WHERE id='${t.examId}'`).get() as any).n).toBe(0);
    expect((t.db.prepare(`SELECT count(*) n FROM exam_participants WHERE exam_id='${t.examId}'`).get() as any).n).toBe(0);
    expect((t.db.prepare(`SELECT count(*) n FROM audit_logs WHERE action='EXAM_PERMANENTLY_DELETED' AND entity_id='${t.examId}'`).get() as any).n).toBe(1);
  });

  it('deletes by schedule after 30 days, and never an exam still out of the trash', async () => {
    const t = await evaluatedExam('direct');
    expect(await purgeTrashedExams(t.env)).toBe(0);
    await t.request(`/api/admin/exams/${t.examId}/trash`, 'POST', { scope: 'ALL', reason: 'Deneme sınavı bitti' });
    expect(await purgeTrashedExams(t.env)).toBe(0);
    t.db.exec(`UPDATE exam_revision_state SET app_trashed_at=datetime('now','-31 days') WHERE exam_id='${t.examId}'`);
    expect(await purgeTrashedExams(t.env)).toBe(1);
    expect((t.db.prepare(`SELECT count(*) n FROM exams WHERE id='${t.examId}'`).get() as any).n).toBe(0);
  });

  it('refuses permanent delete of an exam that is not in the trash', async () => {
    const t = await evaluatedExam('direct');
    expect((await t.request(`/api/admin/exams/${t.examId}/purge`, 'POST', { confirmTitle: 'x' })).data.error.code).toBe('NOT_IN_TRASH');
  });
});
