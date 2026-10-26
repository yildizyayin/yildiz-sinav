import { describe, expect, it } from 'vitest';
import { evaluatedExam, SHEETS } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';

/** S026: on sonuc.anunex.com an operator picks any MEB school it may act for, evaluates a TXT, and finds the evaluation again later. Synthetic data only. */
async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT OR IGNORE INTO exam_channel_publications(id,exam_id,channel,status) VALUES('pub','${t.examId}','RESULT_NETWORK','ACTIVE');
    INSERT INTO national_institution_directory(meb_code,name,normalized_name,city,district,source_url) VALUES
      ('730001','Kuzey Ortaokulu','KUZEY ORTAOKULU','Ankara','Çankaya','https://www.meb.gov.tr/x'),
      ('730002','Güney Ortaokulu','GUNEY ORTAOKULU','İzmir','Konak','https://www.meb.gov.tr/x');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('dealerA','INSTITUTION_MANAGER','Bayi','u','u',1,NULL);
    INSERT INTO result_network_dealers(id,user_id,status) VALUES('dA','dealerA','APPROVED');
    INSERT INTO result_network_dealer_scopes(id,dealer_id,scope_type,city) VALUES('sA','dA','CITY','Ankara');`);
  const cookies: Record<string, string> = {};
  for (const id of ['admin', 'dealerA', 'teacher']) cookies[id] = (await createSession(t.env, id, new Request('https://sonuc.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const result = (await import('../worker/result-worker-entry')).default as any;
  const call = async (who: string, path: string, init: { method?: string; body?: any } = {}) => {
    const form = init.body instanceof FormData;
    const r = await result.fetch(new Request(`https://sonuc.anunex.com${path}`, { method: init.method || 'GET', headers: { Cookie: cookies[who], Origin: 'https://sonuc.anunex.com', ...(init.body && !form ? { 'Content-Type': 'application/json' } : {}) }, ...(init.body ? { body: form ? init.body : JSON.stringify(init.body) } : {}) }), t.env, { waitUntil() {} });
    const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ }
    return { status: r.status, data, text };
  };
  const line = (s: typeof SHEETS[number]) => '7108'.padEnd(10) + s.no.padStart(5) + s.name.padEnd(20) + '8A' + ' '.repeat(13) + 'A' + s.TUR.replace(/_/g, ' ').padEnd(20) + ' '.repeat(60) + s.MAT.replace(/_/g, ' ').padEnd(20) + ' '.repeat(20);
  const upload = (who: string, target: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(target)) f.set(k, v); f.set('templateVersionId', 'optik-7108-sekonic-v1'); f.set('file', new File([SHEETS.map(line).join('\r\n')], 'deneme.txt', { type: 'text/plain' })); return call(who, `/api/admin/result-network/operations/exams/${t.examId}/preview-file`, { method: 'POST', body: f }); };
  return { t, call, upload };
}

describe('S026 sonuc evaluation', () => {
  it('lets the Super Admin pick a MEB school without a card, evaluate it and reopen it from the history', async () => {
    const { t, call, upload } = await setup();
    const found = await call('admin', '/api/admin/result-network/operations/institutions?q=kuzey');
    expect(found.data.institutions).toEqual([{ id: null, code: '730001', name: 'Kuzey Ortaokulu', city: 'Ankara', district: 'Çankaya' }]);
    // the school is opened from the directory; this exam is narrowed to the helper's school, so it must be added first
    const blocked = await upload('admin', { mebCode: '730001' });
    expect(blocked.status).toBe(403);
    expect(blocked.data.error.message).toContain('yalnız seçili kurumlara açık');
    const inst = t.db.prepare(`SELECT id FROM institutions WHERE meb_code='730001'`).get() as any;
    expect(inst?.id).toBeTruthy();
    t.db.prepare(`INSERT INTO exam_institutions(id,exam_id,institution_id,enabled) VALUES('ei1',?,?,1)`).run(t.examId, inst.id);
    const up = await upload('admin', { mebCode: '730001' });
    expect(up.status, up.text).toBe(200);
    expect((await call('admin', '/api/admin/result-network/operations/institutions?q=730001')).data.institutions[0].id).toBe(inst.id);
    const history = await call('admin', '/api/admin/result-network/operations/history');
    expect(history.data.batches[0]).toMatchObject({ id: up.data.batchId, institution_name: 'Kuzey Ortaokulu', total: SHEETS.length });
    const batch = `/api/admin/result-network/operations/scan-batches/${up.data.batchId}`;
    for (const r of (await call('admin', batch)).data.records) if (r.match_status === 'NEW_GUEST' || r.match_status === 'AMBIGUOUS') expect((await call('admin', `${batch}/records/${r.id}/resolve`, { method: 'POST', body: { action: 'GUEST' } })).status).toBe(200);
    const ev = await call('admin', `${batch}/evaluate`, { method: 'POST' });
    expect(ev.status, ev.text).toBe(200);
    expect((await call('admin', `${batch}/report`)).data.rows).toHaveLength(SHEETS.length);
    expect((await call('admin', '/api/admin/result-network/operations/history')).data.batches[0].status).toBe('COMMITTED');
  });

  it('keeps a dealer inside its own region for search, upload and history', async () => {
    const { t, call, upload } = await setup();
    const q = async (text: string) => (await call('dealerA', `/api/admin/result-network/operations/institutions?mode=DEALER&q=${encodeURIComponent(text)}`)).data.institutions.map((x: any) => x.code);
    expect(await q('ortaokulu')).toEqual(['730001']);
    expect((await upload('dealerA', { mebCode: '730002' })).status).toBe(403);
    expect((t.db.prepare(`SELECT count(*) n FROM institutions WHERE meb_code='730002'`).get() as any).n).toBe(0);
    expect((await upload('teacher', { mebCode: '730001' })).status).toBe(403);
    await upload('dealerA', { mebCode: '730001' });
    const id = (t.db.prepare(`SELECT id FROM institutions WHERE meb_code='730001'`).get() as any).id;
    t.db.prepare(`INSERT INTO exam_institutions(id,exam_id,institution_id,enabled) VALUES('ei1',?,?,1)`).run(t.examId, id);
    const ok = await upload('dealerA', { mebCode: '730001' });
    expect(ok.status, ok.text).toBe(200);
    await upload('admin', { mebCode: '730002' }); // a batch elsewhere stays out of the dealer's history
    const other = (t.db.prepare(`SELECT id FROM institutions WHERE meb_code='730002'`).get() as any).id;
    t.db.prepare(`INSERT INTO exam_institutions(id,exam_id,institution_id,enabled) VALUES('ei2',?,?,1)`).run(t.examId, other);
    expect((await upload('admin', { mebCode: '730002' })).status).toBe(200);
    const mine = (await call('dealerA', '/api/admin/result-network/operations/history?mode=DEALER')).data.batches;
    expect(mine.map((b: any) => b.institution_code)).toEqual(['730001']);
  });

  it('ends the student result session on logout', async () => {
    const { t, call } = await setup();
    t.db.exec(`PRAGMA foreign_keys=OFF; INSERT INTO result_portal_sessions(id,identity_id,token_hash,ip_hash,expires_at) VALUES('rps','idn','h','i','2099-01-01')`);
    const crypto = globalThis.crypto; const hash = async (v: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)))].map((b) => b.toString(16).padStart(2, '0')).join('');
    t.db.prepare(`UPDATE result_portal_sessions SET token_hash=? WHERE id='rps'`).run(await hash('student-token'));
    const result = (await import('../worker/result-worker-entry')).default as any;
    const r = await result.fetch(new Request('https://sonuc.anunex.com/api/public/results/logout', { method: 'POST', headers: { Cookie: 'anunex_result_session=student-token', Origin: 'https://sonuc.anunex.com' } }), t.env, { waitUntil() {} });
    expect(r.status).toBe(200);
    expect(r.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect((t.db.prepare(`SELECT revoked_at IS NOT NULL r FROM result_portal_sessions WHERE id='rps'`).get() as any).r).toBe(1);
    void call;
  });
});

describe('S027 central exams are open to every institution unless narrowed', () => {
  it('evaluates a central exam for any school without an institution list, narrows on request, and keeps schools with results', async () => {
    const { t, call, upload } = await setup();
    t.db.exec(`DELETE FROM exam_institutions WHERE exam_id='${t.examId}'`);
    const up = await upload('admin', { mebCode: '730001' });
    expect(up.status, up.text).toBe(200);
    // an institution manager of another school sees the central exam too
    t.db.exec(`INSERT INTO institutions(id,name,code,status) VALUES('third','Third School','THIRD','ACTIVE');
      INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('mgr3','INSTITUTION_MANAGER','M3','u','u',1,'third');`);
    const list = async () => (await t.request('/api/exam-definitions', 'GET', undefined, 'admin')).data;
    expect((await list()).exams.some((e: any) => e.id === t.examId)).toBe(true);
    // narrowing must keep every school that already has results
    const narrow = await t.request(`/api/exam-definitions/${t.examId}/institutions`, 'PUT', { institutionIds: ['third'] });
    expect(narrow.response.status).toBe(409);
    expect(narrow.data.error.code).toBe('INSTITUTION_HAS_RESULTS');
    expect((await t.request(`/api/exam-definitions/${t.examId}/institutions`, 'PUT', { institutionIds: ['school'] })).response.status).toBe(200);
    const kuzey = (t.db.prepare(`SELECT id FROM institutions WHERE meb_code='730001'`).get() as any).id;
    expect((await upload('admin', { mebCode: '730001' })).status).toBe(403);
    const reopened = await t.request(`/api/exam-definitions/${t.examId}/institutions`, 'PUT', { institutionIds: [] });
    expect(reopened.data).toMatchObject({ openToAll: true });
    expect((await upload('admin', { mebCode: '730001' })).status).toBe(200);
    void kuzey;
  });
});
