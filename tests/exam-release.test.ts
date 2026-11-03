import { describe, expect, it } from 'vitest';
import { setup } from './helpers/sonuc-setup';
import { generatedSheets } from './helpers/evaluation-snapshot';
import { freezeDueAppResults } from '../worker/lib/platform-expansion';
import { publishScheduledExamResults } from '../worker/lib/exam-schedule';

process.env.TZ = 'UTC';

/** Owner (3 Nov): one "Sonuçları aç" opens the app and sonuc together; a planned time does the same. Synthetic data only. */
describe('one Sonuçları aç', () => {
  it('opens the app result and the sonuc publication in one step', async () => {
    const { t, call, upload } = await setup();
    const up = await upload('dealerI', generatedSheets(6, 3)); expect(up.status, up.text).toBe(200);
    expect((await call('dealerI', `/api/admin/result-network/operations/scan-batches/${up.data.batchId}/evaluate`, { method: 'POST' })).status).toBe(200);
    const url = `/api/exam-definitions/${t.examId}/release`;
    const before = await t.request(url);
    expect(before.response.status, before.text).toBe(200);
    expect(before.data).toMatchObject({ open: false, correctionOpen: false });
    expect(before.data.students).toBeGreaterThan(0);
    expect((await t.request(url, 'POST', {}, 'teacher')).response.status).toBe(403);
    const opened = await t.request(url, 'POST', {});
    expect(opened.response.status, opened.text).toBe(200);
    expect(opened.data.steps).toEqual(expect.arrayContaining(['APP_PUBLISHED', 'NETWORK_PUBLISHED']));
    const q = (s: string) => t.db.prepare(s).get() as any;
    expect(q(`SELECT result_freeze_status s FROM exam_delivery_profiles WHERE exam_id='${t.examId}'`).s).toBe('PUBLISHED');
    expect(q(`SELECT status FROM exam_administrations WHERE exam_id='${t.examId}' AND channel='RESULT_NETWORK'`).status).toBe('PUBLISHED');
    expect((await t.request(url)).data.open).toBe(true);
    // pressing again changes nothing
    const again = await t.request(url, 'POST', {});
    expect(again.response.status).toBe(200);
    expect(again.data.steps).toEqual([]);
  });

  it('sonuc "Sonuçları aç" opens the app result of the same exam too', async () => {
    const { t, call, upload } = await setup();
    const up = await upload('dealerI', generatedSheets(4, 5));
    await call('dealerI', `/api/admin/result-network/operations/scan-batches/${up.data.batchId}/evaluate`, { method: 'POST' });
    const adm = (t.db.prepare(`SELECT id FROM exam_administrations WHERE exam_id='${t.examId}' AND channel='RESULT_NETWORK'`).get() as any).id;
    const r = await call('admin', `/api/admin/result-network/administrations/${adm}/finalize`, { method: 'POST' });
    expect(r.status, r.text).toBe(200);
    expect((t.db.prepare(`SELECT result_freeze_status s FROM exam_delivery_profiles WHERE exam_id='${t.examId}'`).get() as any).s).toBe('PUBLISHED');
  });

  it('a planned result time freezes and publishes the app result by itself', async () => {
    const { t, call, upload } = await setup();
    const up = await upload('dealerI', generatedSheets(4, 7));
    await call('dealerI', `/api/admin/result-network/operations/scan-batches/${up.data.batchId}/evaluate`, { method: 'POST' });
    t.db.exec(`INSERT INTO exam_delivery_profiles(exam_id,result_publish_at) VALUES('${t.examId}',strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 minute')) ON CONFLICT(exam_id) DO UPDATE SET result_publish_at=excluded.result_publish_at,result_freeze_status='OPEN'`);
    expect(await freezeDueAppResults(t.env)).toBe(1);
    expect(await publishScheduledExamResults(t.env)).toBe(1);
    expect((t.db.prepare(`SELECT result_freeze_status s FROM exam_delivery_profiles WHERE exam_id='${t.examId}'`).get() as any).s).toBe('PUBLISHED');
  });
});
