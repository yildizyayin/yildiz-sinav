import { describe, expect, it } from 'vitest';
import { setup } from './helpers/sonuc-setup';
import { generatedSheets } from './helpers/evaluation-snapshot';
import { purgeDeletedBatches } from '../worker/lib/batch-lifecycle';

process.env.TZ = 'UTC';

/** D-S039: delete an upload (restorable 7 days), restore it, move it to the right school. Synthetic data only. */
async function world() {
  const s = await setup();
  const { t, call, upload } = s;
  t.db.exec('PRAGMA foreign_keys=ON'); // D1 enforces foreign keys
  t.db.exec(`INSERT INTO national_institution_directory(meb_code,name,normalized_name,city,district,source_url) VALUES('740002','Kartal Deneme Lisesi','KARTAL DENEME LISESI','İstanbul','Kartal','https://www.meb.gov.tr/y')`);
  const evaluate = async (sheets: any[], who = 'dealerI') => { const up = await upload(who, sheets); expect(up.status, up.text).toBe(200); const ev = await call(who, `/api/admin/result-network/operations/scan-batches/${up.data.batchId}/evaluate`, { method: 'POST' }); expect(ev.status, ev.text).toBe(200); return up.data.batchId as string; };
  const adm = () => t.db.prepare(`SELECT * FROM exam_administrations WHERE exam_id='${t.examId}' AND channel='RESULT_NETWORK'`).get() as any;
  const n = (sql: string) => (t.db.prepare(sql).get() as any).n;
  const B = '/api/admin/result-network/operations/scan-batches';
  return { ...s, evaluate, adm, n, B };
}

describe('S039 upload lifecycle on sonuc', () => {
  it('deletes an evaluated upload with a reason, hides it from students, and restores it', async () => {
    const { t, call, evaluate, adm, n, B } = await world();
    const batch = await evaluate(generatedSheets(6, 3));
    expect((await call('admin', `/api/admin/result-network/administrations/${adm().id}/finalize`, { method: 'POST' })).status).toBe(200);
    expect((await call('dealerI', `${B}/${batch}`, { method: 'DELETE', body: {} })).data.error.code).toBe('DELETE_REASON_REQUIRED');
    const del = await call('dealerI', `${B}/${batch}`, { method: 'DELETE', body: { reason: 'Yanlış sınav yüklendi' } });
    expect(del.status, del.text).toBe(200);
    expect(del.data).toMatchObject({ removed: 6, ranks: 'EMPTIED' });
    expect(n(`SELECT count(*) n FROM exam_participants WHERE exam_id='${t.examId}' AND scan_record_id IN (SELECT id FROM scan_records WHERE batch_id='${batch}')`)).toBe(0);
    expect(n(`SELECT count(*) n FROM result_access_identities`)).toBe(0);
    expect(adm().status).toBe('UPLOADING');
    expect((await call('dealerI', `${B}/${batch}/evaluate`, { method: 'POST' })).data.error.code).toBe('BATCH_DELETED');
    const hist = (await call('dealerI', '/api/admin/result-network/operations/history?mode=DEALER')).data.batches.find((b: any) => b.id === batch);
    expect(hist.deleted_at).toBeTruthy();
    expect((await call('dealerI', `${B}/${batch}/restore`, { method: 'POST' })).status).toBe(200);
    const again = await call('dealerI', `${B}/${batch}/evaluate`, { method: 'POST' });
    expect(again.status, again.text).toBe(200);
    expect(n(`SELECT count(*) n FROM exam_results er JOIN exam_participants ep ON ep.id=er.participant_id WHERE ep.exam_id='${t.examId}' AND ep.scan_record_id IN (SELECT id FROM scan_records WHERE batch_id='${batch}')`)).toBe(6);
  });

  it('rewrites the live ranks without a deleted upload', async () => {
    const { call, evaluate, adm, B, t } = await world();
    const a = await evaluate(generatedSheets(5, 3));
    await evaluate(generatedSheets(4, 9).map((s, i) => ({ ...s, no: String(2000 + i), name: `IKINCI OGRENCI ${String.fromCharCode(65 + i)}` })));
    expect((await call('admin', `/api/admin/result-network/administrations/${adm().id}/finalize`, { method: 'POST' })).status).toBe(200);
    const del = await call('dealerI', `${B}/${a}`, { method: 'DELETE', body: { reason: 'Bu şube iki kez yüklendi' } });
    expect(del.data.ranks).toBe('REFRESHED');
    const v = adm().published_snapshot_version;
    expect((t.db.prepare(`SELECT count(*) n,max(national_count) c FROM exam_result_snapshots WHERE exam_id='${t.examId}' AND snapshot_version=${v}`).get() as any)).toMatchObject({ n: 4, c: 4 });
  });

  it('moves an upload to the right school (bayi or Super Admin only) and matches nobody from the old school', async () => {
    const { t, call, evaluate, n, B } = await world();
    const batch = await evaluate(generatedSheets(6, 3));
    t.db.exec(`INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('mgr','INSTITUTION_MANAGER','Müdür','u','u',1,(SELECT institution_id FROM scan_batches WHERE id='${batch}'))`);
    expect((await call('mgr', `${B}/${batch}/move`, { method: 'POST', body: { mebCode: '740002', reason: 'Yanlış okul seçildi' } })).status).toBe(403);
    const moved = await call('dealerI', `${B}/${batch}/move`, { method: 'POST', body: { mebCode: '740002', reason: 'Yanlış okul seçildi' } });
    expect(moved.status, moved.text).toBe(200);
    expect(moved.data.removed).toBe(6);
    expect(n(`SELECT count(*) n FROM student_entities WHERE status='GUEST' AND id IN (SELECT student_id FROM student_enrollments WHERE institution_id=(SELECT id FROM institutions WHERE code='740001'))`)).toBe(0);
    const ev = await call('dealerI', `${B}/${batch}/evaluate`, { method: 'POST' });
    expect(ev.status, ev.text).toBe(200);
    expect(n(`SELECT count(*) n FROM exam_participants ep JOIN institutions i ON i.id=ep.institution_id WHERE ep.exam_id='${t.examId}' AND i.code='740002'`)).toBe(6);
    expect(n(`SELECT count(*) n FROM exam_participants ep JOIN institutions i ON i.id=ep.institution_id WHERE ep.exam_id='${t.examId}' AND i.code='740001'`)).toBe(0);
  });

  it('purges a deleted upload after its 7 days', async () => {
    const { t, call, evaluate, n, B } = await world();
    const batch = await evaluate(generatedSheets(3, 3));
    await call('dealerI', `${B}/${batch}`, { method: 'DELETE', body: { reason: 'Deneme yüklemesi' } });
    expect(await purgeDeletedBatches(t.env)).toBe(0);
    t.db.exec(`UPDATE scan_batch_deletions SET purge_after=datetime('now','-1 minute')`);
    expect(await purgeDeletedBatches(t.env)).toBe(1);
    expect(n(`SELECT count(*) n FROM scan_batches WHERE id='${batch}'`)).toBe(0);
    expect(n(`SELECT count(*) n FROM scan_records WHERE batch_id='${batch}'`)).toBe(0);
    expect(n(`SELECT count(*) n FROM audit_logs WHERE action='SCAN_BATCH_DELETED' AND entity_id='${batch}'`)).toBe(1);
  });
});
