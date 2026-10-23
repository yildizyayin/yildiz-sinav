import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/** A071: live session reservation — the server sets the credit cost, takes it atomically, and only the student or parent spends it. Synthetic data only. */
describe('A071 live reservation', () => {
  it('charges by duration regardless of the client, refuses overspending and staff spending', async () => {
    const t = await evaluatedExam('direct');
    t.db.exec(`UPDATE platform_features SET enabled_default=1 WHERE feature_key='LIVE'; INSERT INTO live_credit_wallets(student_id,balance) VALUES('s1',3);`);
    const at = new Date(Date.now() + 2 * 86400000).toISOString();
    const reserve = (as: string, body: any) => t.request('/api/platform/live?studentId=s1', 'POST', { sessionType: 'GUIDANCE', scheduledAt: at, ...body }, as);
    const r1 = await reserve('stuuser', { durationMinutes: 40, creditCost: 0.01 });
    expect(r1.response.status, r1.text).toBe(201);
    expect(t.db.prepare(`SELECT balance FROM live_credit_wallets WHERE student_id='s1'`).get()).toMatchObject({ balance: 1 });
    expect(t.db.prepare(`SELECT credit_cost FROM live_sessions WHERE id=?`).get(r1.data.id)).toMatchObject({ credit_cost: 2 });
    const r2 = await reserve('parent', { durationMinutes: 40 });
    expect(r2.response.status).toBe(400); expect(r2.data.error.code).toBe('INSUFFICIENT_CREDIT');
    expect(t.db.prepare(`SELECT balance FROM live_credit_wallets WHERE student_id='s1'`).get()).toMatchObject({ balance: 1 });
    expect((await reserve('teacher', {})).response.status).toBe(403);
    expect((await reserve('admin', {})).response.status).toBe(403);
    expect((await reserve('stuuser', { scheduledAt: '2020-01-01T10:00:00Z' })).response.status).toBe(400);
    expect((await reserve('stuuser', { durationMinutes: 600 })).response.status).toBe(400);
    expect((await reserve('parent', {})).response.status).toBe(201);
    expect(t.db.prepare(`SELECT balance FROM live_credit_wallets WHERE student_id='s1'`).get()).toMatchObject({ balance: 0 });
    expect((t.db.prepare(`SELECT sum(amount) s FROM live_credit_ledger WHERE student_id='s1'`).get() as any).s).toBe(-3);
    const list = await t.request('/api/platform/live', 'GET', undefined, 'stuuser');
    expect(list.data.meetingProviderConfigured).toBe(false);
  });
});
