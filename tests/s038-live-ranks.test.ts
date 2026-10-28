import { describe, expect, it } from 'vitest';
import { setup } from './helpers/sonuc-setup';
import { generatedSheets } from './helpers/evaluation-snapshot';
import { refreshLivePublications } from '../worker/result-network-entry';

process.env.TZ = 'UTC';

/** D-S037/D-S038: evaluated students get result access without a code, and a published exam's ranks stay live. Synthetic data only. */
describe('S038 live ranks after publication', () => {
  it('adds a later upload to the published ranks as a new snapshot version', async () => {
    const { t, call, upload } = await setup();
    const evaluate = async (sheets: any[]) => { const up = await upload('dealerI', sheets); expect(up.status, up.text).toBe(200); const ev = await call('dealerI', `/api/admin/result-network/operations/scan-batches/${up.data.batchId}/evaluate`, { method: 'POST' }); expect(ev.status, ev.text).toBe(200); return ev.data; };
    const first = await evaluate(generatedSheets(6, 3));
    expect(first.studentAccess.issued).toBe(6);
    const adm = (t.db.prepare(`SELECT id FROM exam_administrations WHERE exam_id='${t.examId}' AND channel='RESULT_NETWORK'`).get() as any).id;
    const pub = await call('admin', `/api/admin/result-network/administrations/${adm}/finalize`, { method: 'POST' });
    expect(pub.status, pub.text).toBe(200);
    const v1 = (t.db.prepare(`SELECT published_snapshot_version v,published_at a FROM exam_administrations WHERE id='${adm}'`).get() as any);
    const count = (v: number) => (t.db.prepare(`SELECT count(*) n FROM exam_result_snapshots WHERE exam_id='${t.examId}' AND snapshot_version=${v}`).get() as any).n;
    expect(count(v1.v)).toBe(6);
    // another school's (here: the same school's second) upload after publication
    const later = generatedSheets(4, 9).map((s, i) => ({ ...s, no: String(2000 + i) }));
    // an upload that is waiting (not evaluated yet) does not hold the live ranks back
    await upload("dealerI", generatedSheets(2, 21).map((s, i) => ({ ...s, no: String(3000 + i) })));
    const second = await evaluate(later);
    expect(second.studentAccess.issued).toBe(4);
    const v2 = (t.db.prepare(`SELECT published_snapshot_version v,published_at a,status FROM exam_administrations WHERE id='${adm}'`).get() as any);
    expect(v2.status).toBe('PUBLISHED');
    expect(v2.v).toBeGreaterThan(v1.v);
    expect(v2.a).toBe(v1.a);
    expect(count(v2.v)).toBe(10);
    expect((t.db.prepare(`SELECT max(national_count) c FROM exam_result_snapshots WHERE exam_id='${t.examId}' AND snapshot_version=${v2.v}`).get() as any).c).toBe(10);
    // nothing stale left for the schedule
    expect(await refreshLivePublications(t.env)).toBe(0);
  });
});
