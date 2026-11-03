import { describe, expect, it } from 'vitest';
import { setup } from './helpers/sonuc-setup';
import { generatedSheets } from './helpers/evaluation-snapshot';
import { refreshLivePublications, releaseDueAdministrations, runDeferredEvaluations } from '../worker/result-network-entry';
import { validateResultSchedule } from '../worker/lib/result-schedule';

process.env.TZ = 'UTC';

/** Türkiye geneli takvim (owner, 3 Nov): release at the set time, uploads wait on the release evening, then join. Synthetic data only. */
describe('national exam schedule', () => {
  it('validates the order of the dates', () => {
    const now = Date.parse('2026-11-01T00:00:00Z');
    const ok = validateResultSchedule({ applicationStartAt: '2026-11-06T06:00:00Z', applicationEndAt: '2026-11-09T15:00:00Z', releaseAt: '2026-11-13T14:00:00Z', resumeAt: '2026-11-13T18:00:00Z' }, now);
    expect(ok.ok).toBe(true);
    expect(validateResultSchedule({ releaseAt: '2026-11-13T14:00:00Z', resumeAt: '2026-11-13T13:00:00Z' }, now).ok).toBe(false);
    expect(validateResultSchedule({ applicationEndAt: '2026-11-14T00:00:00Z', releaseAt: '2026-11-13T14:00:00Z' }, now).ok).toBe(false);
    expect(validateResultSchedule({ resumeAt: '2026-11-13T18:00:00Z' }, now).ok).toBe(false);
    expect(validateResultSchedule({ releaseAt: '2026-10-30T14:00:00Z' }, now).ok).toBe(false);
    // an unchanged past release time can be saved again (e.g. moving only the resume time)
    expect(validateResultSchedule({ releaseAt: '2026-10-30T14:00:00Z', resumeAt: '2026-10-30T18:00:00Z' }, now, { releaseAt: '2026-10-30T14:00:00.000Z' }).ok).toBe(true);
    expect(validateResultSchedule({ releaseAt: 'yarın' }, now).ok).toBe(false);
  });

  it('releases at the set time, holds uploads during the evening and evaluates them afterwards', async () => {
    const { t, call, upload } = await setup();
    const sql = (q: string) => t.db.prepare(q).get() as any;
    const up1 = await upload('dealerI', generatedSheets(6, 3)); expect(up1.status, up1.text).toBe(200);
    const ev1 = await call('dealerI', `/api/admin/result-network/operations/scan-batches/${up1.data.batchId}/evaluate`, { method: 'POST' });
    expect(ev1.status, ev1.text).toBe(200);
    const adm = sql(`SELECT id FROM exam_administrations WHERE exam_id='${t.examId}' AND channel='RESULT_NETWORK'`).id;

    // only the Super Admin sets the schedule, and the release must be ahead
    const later = (h: number) => new Date(Date.now() + h * 3600000).toISOString();
    const body = { applicationStartAt: later(-48), applicationEndAt: later(-24), releaseAt: later(1), resumeAt: later(5) };
    expect((await call('dealerI', `/api/admin/result-network/administrations/${adm}/schedule`, { method: 'PUT', body: body })).status).toBe(403);
    const past = await call('admin', `/api/admin/result-network/administrations/${adm}/schedule`, { method: 'PUT', body: { ...body, releaseAt: later(-1) } }); expect(past.status, past.text).toBe(400);
    const saved = await call('admin', `/api/admin/result-network/administrations/${adm}/schedule`, { method: 'PUT', body: body });
    expect(saved.status, saved.text).toBe(200);
    expect(await releaseDueAdministrations(t.env)).toBe(0); // not yet

    // an upload made before the release but never evaluated does not hold the release back
    const waiting = await upload('dealerI', generatedSheets(2, 21).map((s, i) => ({ ...s, no: String(3000 + i) })));
    expect(waiting.status, waiting.text).toBe(200);

    // the release time comes
    t.db.exec(`UPDATE exam_administrations SET result_release_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 minute'),upload_resume_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','+3 hours') WHERE id='${adm}'`);
    expect(await releaseDueAdministrations(t.env)).toBe(1);
    const v1 = sql(`SELECT status,published_snapshot_version v,scheduled_release_done_at d FROM exam_administrations WHERE id='${adm}'`);
    expect(v1.status).toBe('PUBLISHED'); expect(v1.d).toBeTruthy();
    expect(sql(`SELECT count(*) n FROM exam_result_snapshots WHERE exam_id='${t.examId}' AND snapshot_version=${v1.v}`).n).toBe(6);
    expect(await releaseDueAdministrations(t.env)).toBe(0); // once only
    // the release time can no longer move; the resume time can
    expect((await call('admin', `/api/admin/result-network/administrations/${adm}/schedule`, { method: 'PUT', body: { ...body, releaseAt: later(2), resumeAt: later(6) } })).status).toBe(400);

    // during the evening a new upload is accepted and waits
    const up2 = await upload('dealerI', generatedSheets(4, 9).map((s, i) => ({ ...s, no: String(2000 + i) })));
    expect(up2.status, up2.text).toBe(200);
    const ev2 = await call('dealerI', `/api/admin/result-network/operations/scan-batches/${up2.data.batchId}/evaluate`, { method: 'POST' });
    expect(ev2.status, ev2.text).toBe(202);
    expect(ev2.data).toMatchObject({ deferred: true, done: true });
    expect(ev2.data.message).toContain('otomatik değerlendirilecek');
    expect(sql(`SELECT status FROM scan_batches WHERE id='${up2.data.batchId}'`).status).not.toBe('COMMITTED');
    expect(sql(`SELECT count(*) n FROM result_deferred_evaluations WHERE batch_id='${up2.data.batchId}' AND done_at IS NULL`).n).toBe(1);
    // pressing again does not queue twice; nothing runs and no rank is rewritten while paused
    expect((await call('dealerI', `/api/admin/result-network/operations/scan-batches/${up2.data.batchId}/evaluate`, { method: 'POST' })).status).toBe(202);
    expect(await runDeferredEvaluations(t.env)).toBe(0);
    expect(await refreshLivePublications(t.env)).toBe(0);
    expect(sql(`SELECT published_snapshot_version v FROM exam_administrations WHERE id='${adm}'`).v).toBe(v1.v);

    // the evening ends: the waiting upload is evaluated and joins the live ranks
    t.db.exec(`UPDATE exam_administrations SET upload_resume_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 minute') WHERE id='${adm}'`);
    expect(await runDeferredEvaluations(t.env)).toBe(1);
    expect(sql(`SELECT status FROM scan_batches WHERE id='${up2.data.batchId}'`).status).toBe('COMMITTED');
    expect(sql(`SELECT outcome FROM result_deferred_evaluations WHERE batch_id='${up2.data.batchId}'`).outcome).toBe('EVALUATED');
    const v2 = sql(`SELECT published_snapshot_version v FROM exam_administrations WHERE id='${adm}'`);
    expect(v2.v).toBeGreaterThan(v1.v);
    expect(sql(`SELECT count(*) n,max(national_count) c FROM exam_result_snapshots WHERE exam_id='${t.examId}' AND snapshot_version=${v2.v}`)).toEqual({ n: 10, c: 10 });
    // and evaluation is normal again
    const ev3 = await call('dealerI', `/api/admin/result-network/operations/scan-batches/${waiting.data.batchId}/evaluate`, { method: 'POST' });
    expect(ev3.status, ev3.text).toBe(200);
    expect(ev3.data.deferred).toBeUndefined();
  });
});
