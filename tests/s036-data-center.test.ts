import { describe, expect, it } from 'vitest';
import { setup } from './helpers/sonuc-setup';
import { academicYearEnd, purgeExpiredOriginals } from '../worker/lib/result-data-center';
import { resultApiPathAllowed } from '../worker/result-worker-entry';

/** S036 Veri Merkezi / Belge Merkezi (owner decisions 27 Oct). Synthetic data only. */
function r2() {
  const store = new Map<string, { body: Uint8Array; type: string }>();
  return { store, put: async (k: string, v: any, o?: any) => { const body = v instanceof ArrayBuffer ? new Uint8Array(v) : typeof v === 'string' ? new TextEncoder().encode(v) : new Uint8Array(await new Response(v).arrayBuffer()); store.set(k, { body, type: o?.httpMetadata?.contentType || '' }); },
    get: async (k: string) => { const o = store.get(k); return o ? { body: new Response(o.body).body, text: async () => new TextDecoder().decode(o.body) } : null; }, delete: async (k: string) => { store.delete(k); } };
}
const SHEETS = [{ no: '7', name: 'AYSE KAYA', TUR: 'ABCD', MAT: 'DCB_' }, { no: '8', name: 'CAN DEMIR', TUR: 'A_CC', MAT: 'DDDD' }];

describe('S036 Veri Merkezi', () => {
  it('keeps the original upload one academic year and lets the school/dealer download it, the data as read and log it', async () => {
    const { t, call, upload } = await setup();
    const files = r2(); t.env.FILES = files;
    t.db.exec(`INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('dealerA','INSTITUTION_MANAGER','Bayi A','u','u',1,NULL);
      INSERT INTO result_network_dealers(id,user_id,status) VALUES('dA','dealerA','APPROVED');
      INSERT INTO result_network_dealer_scopes(id,dealer_id,scope_type,city) VALUES('sA','dA','CITY','Ankara');`);
    const up = await upload('dealerI', SHEETS);
    expect(up.status, up.text).toBe(200);
    const kept = t.db.prepare('SELECT object_key,file_name,retain_until,size_bytes FROM scan_batch_files WHERE batch_id=?').get(up.data.batchId) as any;
    expect(kept).toMatchObject({ file_name: 'deneme.txt', retain_until: '2027-08-31T23:59:59Z' });
    expect(files.store.has(kept.object_key)).toBe(true);
    await call('dealerI', `/api/admin/result-network/operations/scan-batches/${up.data.batchId}/evaluate`, { method: 'POST' });

    const list = await call('dealerI', '/api/admin/result-network/operations/data/batches?mode=DEALER');
    expect(list.status, list.text).toBe(200);
    expect(list.data.batches[0]).toMatchObject({ id: up.data.batchId, status: 'COMMITTED', has_original: true, total: 2, institution_name: 'Pendik Deneme Lisesi' });
    const read = await call('dealerI', `/api/admin/result-network/operations/data/batches/${up.data.batchId}/read`);
    expect(read.data.headers.slice(0, 5)).toEqual(['Satır', 'Öğrenci no', 'Ad soyad', 'Sınıf/şube', 'Kitapçık']);
    expect(read.data.rows.map((r: any[]) => r[2])).toEqual(['AYSE KAYA', 'CAN DEMIR']);
    const original = await call('dealerI', `/api/admin/result-network/operations/data/batches/${up.data.batchId}/original`);
    expect(original.status).toBe(200);
    expect(original.text).toContain('AYSE KAYA');
    expect((await call('dealerI', `/api/admin/result-network/operations/data/batches/${up.data.batchId}/results-downloaded`, { method: 'POST' })).status).toBe(200);
    const logged = t.db.prepare(`SELECT json_extract(details_json,'$.kind') k FROM audit_logs WHERE action='RESULT_DATA_DOWNLOADED' ORDER BY rowid`).all() as any[];
    expect(logged.map((x) => x.k)).toEqual(['READ_DATA', 'ORIGINAL', 'RESULTS']);
    // another region's dealer sees nothing and cannot download
    const other = await call('dealerA', '/api/admin/result-network/operations/data/batches?mode=DEALER');
    expect(other.data.batches).toEqual([]);
    expect((await call('dealerA', `/api/admin/result-network/operations/data/batches/${up.data.batchId}/original`)).status).toBeGreaterThanOrEqual(403);
    // after the academic year the file and its row are removed
    t.db.prepare(`UPDATE scan_batch_files SET retain_until='2000-01-01T00:00:00Z'`).run();
    expect(await purgeExpiredOriginals(t.env)).toBe(1);
    expect(files.store.has(kept.object_key)).toBe(false);
    expect((await call('dealerI', `/api/admin/result-network/operations/data/batches/${up.data.batchId}/original`)).data.error.code).toBe('ORIGINAL_NOT_KEPT');
  }, 60000);

  it('lists only documents the publisher opened to schools, for exams the school evaluated', async () => {
    const { t, call, upload } = await setup();
    const files = r2(); t.env.FILES = files;
    const up = await upload('dealerI', SHEETS);
    await call('dealerI', `/api/admin/result-network/operations/scan-batches/${up.data.batchId}/evaluate`, { method: 'POST' });
    for (const [id, type, vis] of [['d1', 'PLAIN_ANSWER_KEY_PDF', 'INSTITUTION_TEACHER'], ['d2', 'EXAM_PDF', 'SUPER_ADMIN'], ['d3', 'QUALIFIED_ANSWER_KEY', 'INSTITUTION_TEACHER']]) {
      t.db.prepare(`INSERT INTO exam_document_assets(id,exam_id,asset_type,booklet_code,r2_key,file_name,mime_type,byte_size,visibility,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(id, t.examId, type, 'A', `docs/${id}.pdf`, `${id}.pdf`, 'application/pdf', 3, vis, 'admin');
      await files.put(`docs/${id}.pdf`, 'PDF');
    }
    const docs = await call('dealerI', '/api/admin/result-network/operations/documents?mode=DEALER');
    expect(docs.status, docs.text).toBe(200);
    const ids = docs.data.exams.flatMap((e: any) => e.documents.map((d: any) => d.id));
    expect(ids).toEqual(expect.arrayContaining(['d1', 'd3']));
    expect(ids).not.toContain('d2'); // booklet without publisher permission stays with the Super Admin
    expect((await call('dealerI', '/api/admin/result-network/operations/documents/EXAM/d1?mode=DEALER')).status).toBe(200);
    expect((await call('dealerI', '/api/admin/result-network/operations/documents/EXAM/d2?mode=DEALER')).status).toBe(404);
    expect((await call('admin', '/api/admin/result-network/operations/documents/EXAM/d2')).status).toBe(200);
  }, 60000);

  it('helpers: academic year end and the password route on sonuc', () => {
    expect(academicYearEnd('2026-2027')).toBe('2027-08-31T23:59:59Z');
    expect(resultApiPathAllowed('/api/auth/change-password')).toBe(true);
    expect(resultApiPathAllowed('/api/students')).toBe(false);
  });
});
