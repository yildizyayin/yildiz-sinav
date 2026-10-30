import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import resultWorker from '../worker/result-worker-entry';
import { createSession } from '../worker/lib/auth';
import { countdownForGrade } from '../worker/lib/national-exam-dates';
import { partsUntil, targetOf } from '../src/components/ResultExamCountdown';

/** LGS/YKS sayacı (30 Oct): 8 → LGS, 12 → YKS, nobody else; only sourced dates; only the Super Admin edits. */
describe('national exam countdown', () => {
  it('serves the countdown by grade and keeps an unannounced date pending', async () => {
    const t = await evaluatedExam('direct');
    expect(await countdownForGrade(t.env, 7)).toBeNull();
    expect(await countdownForGrade(t.env, 11)).toBeNull();
    expect(await countdownForGrade(t.env, 12)).toMatchObject({ code: 'YKS', date: '2027-06-19', time: null, status: 'OFFICIAL' });
    expect(await countdownForGrade(t.env, 8)).toMatchObject({ code: 'LGS', date: null, status: 'PENDING' });

    const cookie = async (id: string) => (await createSession(t.env, id, new Request('https://sonuc.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
    const call = async (as: string, method: string, body?: any) => { const r = await (resultWorker as any).fetch(new Request('https://sonuc.anunex.com/api/admin/result-network/exam-dates', { method, headers: { Cookie: await cookie(as), Origin: 'https://sonuc.anunex.com', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), t.env, { waitUntil() {}, passThroughOnException() {} }); return { status: r.status, data: await r.json() as any }; };
    expect((await call('teacher', 'PUT', { code: 'LGS', date: '2027-06-12', sourceLabel: 'x' })).status).toBe(403);
    expect((await call('admin', 'PUT', { code: 'LGS', date: '2027-06-12' })).data.error.code).toBe('SOURCE_REQUIRED');
    expect((await call('admin', 'PUT', { code: 'LGS', date: '2027-13-40', sourceLabel: 'MEB' })).data.error.code).toBe('DATE_INVALID');
    const ok = await call('admin', 'PUT', { code: 'LGS', date: '2027-06-12', time: '09:30', sourceLabel: 'MEB 2027 LGS duyurusu', sourceUrl: 'https://www.meb.gov.tr/' });
    expect(ok.status).toBe(200);
    expect(await countdownForGrade(t.env, 8)).toMatchObject({ code: 'LGS', date: '2027-06-12', time: '09:30', status: 'OFFICIAL', sourceLabel: 'MEB 2027 LGS duyurusu' });
    expect((t.db.prepare(`SELECT count(*) c FROM audit_logs WHERE action='NATIONAL_EXAM_DATE_SAVED'`).get() as any).c).toBe(1);
    // clearing the date makes it pending again
    await call('admin', 'PUT', { code: 'LGS', date: null });
    expect(await countdownForGrade(t.env, 8)).toMatchObject({ date: null, status: 'PENDING' });
  });

  it('counts to the exam moment in Turkey time', () => {
    const target = targetOf({ date: '2027-06-19', time: '10:15' })!;
    expect(new Date(target).toISOString()).toBe('2027-06-19T07:15:00.000Z');
    expect(partsUntil(target, Date.parse('2027-06-18T06:14:59Z'))).toMatchObject({ days: 1, hours: 1, minutes: 0, seconds: 1, done: false });
    expect(partsUntil(target, target + 5).done).toBe(true);
    expect(new Date(targetOf({ date: '2027-06-19', time: null })!).toISOString()).toBe('2027-06-18T21:00:00.000Z');
  });
});
