import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/**
 * A071 → D-S046/S048: the paid, credit-based live booking is retired. Nobody can book or spend credits through it;
 * live lessons are the institution's own (/api/live-lessons). Synthetic data only.
 */
describe('A071 live reservation (retired)', () => {
  it('refuses every booking and spends no credit', async () => {
    const t = await evaluatedExam('direct');
    t.db.exec(`UPDATE platform_features SET enabled_default=1 WHERE feature_key='LIVE'; INSERT INTO live_credit_wallets(student_id,balance) VALUES('s1',3);`);
    const at = new Date(Date.now() + 2 * 86400000).toISOString();
    for (const who of ['stuuser', 'parent']) {
      const r = await t.request('/api/platform/live?studentId=s1', 'POST', { sessionType: 'LESSON', scheduledAt: at, durationMinutes: 40 }, who);
      expect(r.response.status).toBe(410);
      expect(r.data.error.code).toBe('LIVE_BOOKING_RETIRED');
    }
    expect(t.db.prepare(`SELECT balance FROM live_credit_wallets WHERE student_id='s1'`).get()).toMatchObject({ balance: 3 });
    expect((t.db.prepare(`SELECT count(*) n FROM live_sessions`).get() as any).n).toBe(0);
  });
});
