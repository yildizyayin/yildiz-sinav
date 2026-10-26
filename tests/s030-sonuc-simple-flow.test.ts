import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluatedExam, SHEETS } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';

/** S030: on sonuc every readable sheet is a participant, unscorable sheets are set aside with a reason, a missing optic is added from its FMT, and report cards are available. Synthetic and permitted fixture data only. */
async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT OR IGNORE INTO exam_channel_publications(id,exam_id,channel,status) VALUES('pub','${t.examId}','RESULT_NETWORK','ACTIVE');
    DELETE FROM exam_institutions WHERE exam_id='${t.examId}';
    INSERT INTO national_institution_directory(meb_code,name,normalized_name,city,district,source_url) VALUES('740001','Pendik Deneme Lisesi','PENDIK DENEME LISESI','İstanbul','Pendik','https://www.meb.gov.tr/x');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('dealerI','INSTITUTION_MANAGER','Bayi','u','u',1,NULL);
    INSERT INTO result_network_dealers(id,user_id,status) VALUES('dI','dealerI','APPROVED');
    INSERT INTO result_network_dealer_scopes(id,dealer_id,scope_type,city) VALUES('sI','dI','CITY','İstanbul');`);
  const cookies: Record<string, string> = {};
  for (const id of ['admin', 'dealerI']) cookies[id] = (await createSession(t.env, id, new Request('https://sonuc.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const result = (await import('../worker/result-worker-entry')).default as any;
  Object.assign(t.env, { FILES: { put: async () => undefined, delete: async () => undefined, get: async () => null }, RESULT_LOOKUP_SECRET: 'synthetic-lookup-secret' });
  const call = async (who: string, path: string, init: { method?: string; body?: any } = {}) => {
    const form = init.body instanceof FormData;
    const r = await result.fetch(new Request(`https://sonuc.anunex.com${path}`, { method: init.method || 'GET', headers: { Cookie: cookies[who], Origin: 'https://sonuc.anunex.com', ...(init.body && !form ? { 'Content-Type': 'application/json' } : {}) }, ...(init.body ? { body: form ? init.body : JSON.stringify(init.body) } : {}) }), t.env, { waitUntil() {} });
    const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ }
    return { status: r.status, data, text };
  };
  const line = (s: { no: string; name: string; TUR: string; MAT: string }) => '7108'.padEnd(10) + s.no.padStart(5) + s.name.padEnd(20) + '8A' + ' '.repeat(13) + 'A' + s.TUR.replace(/_/g, ' ').padEnd(20) + ' '.repeat(60) + s.MAT.replace(/_/g, ' ').padEnd(20) + ' '.repeat(20);
  const upload = (who: string, sheets: Array<{ no: string; name: string; TUR: string; MAT: string }>) => { const f = new FormData(); f.set('mebCode', '740001'); f.set('templateVersionId', 'optik-7108-sekonic-v1'); f.set('file', new File([sheets.map(line).join('\r\n')], 'deneme.txt', { type: 'text/plain' })); return call(who, `/api/admin/result-network/operations/exams/${t.examId}/preview-file`, { method: 'POST', body: f }); };
  return { t, call, upload };
}

describe('S030 simple sonuc evaluation', () => {
  it('takes every readable sheet as a participant and evaluates without a guest step', async () => {
    const { t, call, upload } = await setup();
    const up = await upload('dealerI', SHEETS);
    expect(up.status, up.text).toBe(200);
    expect(up.data.acceptedParticipants).toBe(SHEETS.length);
    const batch = `/api/admin/result-network/operations/scan-batches/${up.data.batchId}`;
    expect((await call('dealerI', batch)).data.batch.status).toBe('READY');
    const ev = await call('dealerI', `${batch}/evaluate`, { method: 'POST' });
    expect(ev.status, ev.text).toBe(200);
    expect(ev.data.setAside).toEqual([]);
    const k = await call('dealerI', `${batch}/karnes`);
    expect(k.status, k.text).toBe(200);
    expect(k.data.karnes).toHaveLength(SHEETS.length);
    expect(k.data.karnes[0].subjects.map((s: any) => s.subject).length).toBeGreaterThan(0);
    expect(k.data).toMatchObject({ institution: { name: 'Pendik Deneme Lisesi' }, summary: { participants: SHEETS.length } });
    // S031: the result administration opened by itself, so access cards work without "Taslak sonuç ağı oluştur"
    expect(t.db.prepare(`SELECT status FROM exam_administrations WHERE exam_id=? AND channel='RESULT_NETWORK'`).all(t.examId)).toEqual([{ status: 'UPLOADING' }]);
    const codes = await call('dealerI', `${batch}/access-codes`, { method: 'POST' });
    expect(codes.status, codes.text).toBe(200);
    const report = await call('dealerI', `${batch}/report`);
    expect(report.data).toMatchObject({ exam: { title: expect.any(String) }, institution: { name: 'Pendik Deneme Lisesi' } });
    // S032: the publisher-style pack — list, averages, ranks at every level, answer grid and topics
    const pack = await call('dealerI', `${batch}/report-pack`);
    expect(pack.status, pack.text).toBe(200);
    expect(pack.data.participation).toMatchObject({ school: SHEETS.length, overall: SHEETS.length + 2 });
    expect(pack.data.subjects.map((s: any) => s.id)).toEqual(['sub_tur', 'sub_mat']);
    const first = pack.data.students[0];
    expect(first.ranks).toMatchObject({ school: 1, class: 1 });
    expect(first.grid.sub_tur).toHaveLength(4);
    expect(first.grid.sub_tur[0]).toMatchObject({ no: 1, key: 'A' });
    expect(Object.keys(first.topics)).toEqual(expect.arrayContaining(['sub_tur', 'sub_mat']));
    expect(pack.data.averages.general.count).toBe(SHEETS.length + 2);
    expect(report.data.rows.map((r: any) => r.institution_rank)).toEqual([...report.data.rows.map((r: any) => r.institution_rank)].sort((a: number, b: number) => a - b));
    void t;
  });

  it('evaluates a batch uploaded before S030 whose readable sheets are still waiting as guests', async () => {
    const { t, call, upload } = await setup();
    const up = await upload('admin', SHEETS);
    t.db.prepare(`UPDATE scan_records SET match_status='NEW_GUEST',resolution_status='PENDING',issues_json='["Kayıtlı öğrenciyle eşleşmedi; misafir katılımcı olarak oluşturulabilir."]' WHERE batch_id=?`).run(up.data.batchId);
    t.db.prepare(`UPDATE scan_batches SET status='NEEDS_REVIEW' WHERE id=?`).run(up.data.batchId);
    const ev = await call('admin', `/api/admin/result-network/operations/scan-batches/${up.data.batchId}/evaluate`, { method: 'POST' });
    expect(ev.status, ev.text).toBe(200);
    expect(ev.data.setAside).toEqual([]);
    expect(ev.data.processed).toBe(SHEETS.length);
  });

  it('sets aside a sheet without a name with its reason and evaluates the rest', async () => {
    const { call, upload } = await setup();
    const up = await upload('admin', [...SHEETS, { no: '777', name: '', TUR: 'ABCD', MAT: 'DCBA' }]);
    expect(up.status, up.text).toBe(200);
    expect(up.data.acceptedParticipants).toBe(SHEETS.length);
    const batch = `/api/admin/result-network/operations/scan-batches/${up.data.batchId}`;
    const ev = await call('admin', `${batch}/evaluate`, { method: 'POST' });
    expect(ev.status, ev.text).toBe(200);
    expect(ev.data.setAside).toHaveLength(1);
    expect(ev.data.setAside[0]).toMatchObject({ row: 3 });
    expect(ev.data.setAside[0].reason.length).toBeGreaterThan(3);
    expect((await call('admin', `${batch}/report`)).data.rows).toHaveLength(SHEETS.length);
  });

  it('adds a missing optic from its FMT, tested on the TXT to evaluate, and only the Super Admin may', async () => {
    const { call } = await setup();
    const dir = new URL('./fixtures/a025/', import.meta.url);
    const form = () => { const f = new FormData(); f.set('name', 'Deneme Yayınları TYT'); f.set('fmt', new File([readFileSync(new URL('OPT_K-129_SEKONIC.fmt', dir))], 'OPT_K-129_SEKONIC.fmt')); f.set('sample', new File([readFileSync(new URL('cap_tyt0_anon.txt', dir))], 'veri.txt')); return f; };
    expect((await call('dealerI', '/api/admin/result-network/operations/opticals', { method: 'POST', body: form() })).status).toBe(403);
    const added = await call('admin', '/api/admin/result-network/operations/opticals', { method: 'POST', body: form() });
    expect(added.status, added.text).toBe(201);
    expect(added.data.recordCount).toBeGreaterThan(0);
    const catalog = await call('admin', '/api/admin/result-network/operations/catalog');
    expect(catalog.data.opticals.map((o: any) => o.id)).toContain(added.data.optical.id);
    const bad = new FormData(); bad.set('name', 'Bozuk'); bad.set('fmt', new File(['bu bir fmt değil'], 'x.fmt')); bad.set('sample', new File(['abc'], 'x.txt'));
    const failed = await call('admin', '/api/admin/result-network/operations/opticals', { method: 'POST', body: bad });
    expect(failed.status).toBe(422);
    expect(failed.data.error.message).toContain('FMT');
  });
});
