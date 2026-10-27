import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluatedExam, SHEETS } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';

/** S033 Toplu Liste: reports come from saved results only (no re-evaluation), scoped to the operator. Synthetic fixture data only. */
async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT OR IGNORE INTO exam_channel_publications(id,exam_id,channel,status) VALUES('pub','${t.examId}','RESULT_NETWORK','ACTIVE');
    DELETE FROM exam_institutions WHERE exam_id='${t.examId}';
    INSERT INTO national_institution_directory(meb_code,name,normalized_name,city,district,source_url) VALUES('740001','Pendik Deneme Lisesi','PENDIK DENEME LISESI','İstanbul','Pendik','https://www.meb.gov.tr/x');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('dealerI','INSTITUTION_MANAGER','Bayi','u','u',1,NULL);
    INSERT INTO result_network_dealers(id,user_id,status) VALUES('dI','dealerI','APPROVED');
    INSERT INTO result_network_dealer_scopes(id,dealer_id,scope_type,city) VALUES('sI','dI','CITY','İstanbul');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('dealerA','INSTITUTION_MANAGER','Bayi A','u','u',1,NULL);
    INSERT INTO result_network_dealers(id,user_id,status) VALUES('dA','dealerA','APPROVED');
    INSERT INTO result_network_dealer_scopes(id,dealer_id,scope_type,city) VALUES('sA','dA','CITY','Ankara');`);
  const cookies: Record<string, string> = {};
  for (const id of ['admin', 'dealerI', 'dealerA']) cookies[id] = (await createSession(t.env, id, new Request('https://sonuc.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
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

describe('S033 Toplu Liste', () => {
  it('lists evaluated exams and institutions in scope and builds the pack without evaluating again', async () => {
    const { t, call, upload } = await setup();
    const up = await upload('dealerI', SHEETS);
    expect((await call('dealerI', `/api/admin/result-network/operations/scan-batches/${up.data.batchId}/evaluate`, { method: 'POST' })).status).toBe(200);
    const before = t.db.prepare(`SELECT count(*) c FROM audit_logs`).get() as any;
    const batches = (t.db.prepare(`SELECT count(*) c FROM scan_batches WHERE exam_id=?`).get(t.examId) as any).c;
    const exams = await call('dealerI', '/api/admin/result-network/operations/toplu/exams?mode=DEALER');
    expect(exams.status, exams.text).toBe(200);
    const exam = exams.data.exams.find((e: any) => e.id === t.examId);
    expect(exam).toMatchObject({ participants: SHEETS.length, institutions: 1 });
    const inst = await call('dealerI', `/api/admin/result-network/operations/toplu/institutions?mode=DEALER&examId=${t.examId}`);
    expect(inst.data.institutions).toEqual([expect.objectContaining({ name: 'Pendik Deneme Lisesi', city: 'İstanbul', district: 'Pendik', participants: SHEETS.length })]);
    const pack = await call('dealerI', `/api/admin/result-network/operations/toplu/bundle?mode=DEALER&examId=${t.examId}&institutionIds=${inst.data.institutions[0].id}`);
    expect(pack.status, pack.text).toBe(200);
    // S034: the report family bundle — LGS exam, its score, standings, topics and items
    expect(pack.data).toMatchObject({ family: 'LGS', primary: 'LGS', general: { counts: { students: SHEETS.length + 2 } } });
    const school = pack.data.institutions[0];
    expect(school.students).toHaveLength(SHEETS.length);
    expect(school.students[0].ranks.LGS).toMatchObject({ school: 1, class: 1 });
    expect(school.students[0].grid.sub_tur).toHaveLength(4);
    expect(school.classes.map((c: any) => c.name)).toEqual(['8A']);
    expect(school.items).toHaveLength(8);
    expect(school.rank.general[1]).toBe(2);
    expect((await call('dealerI', `/api/admin/result-network/operations/toplu/growth?institutionId=${inst.data.institutions[0].id}&examIds=${t.examId}`)).status).toBe(400);
    const growth = await call('admin', `/api/admin/result-network/operations/toplu/growth?institutionId=${inst.data.institutions[0].id}&examIds=${t.examId},${t.examId}`);
    expect(growth.status, growth.text).toBe(200);
    expect(growth.data.students.length).toBe(SHEETS.length);
    // reading reports changes nothing: no new batch, no new evaluation
    expect((t.db.prepare(`SELECT count(*) c FROM scan_batches WHERE exam_id=?`).get(t.examId) as any).c).toBe(batches);
    expect((t.db.prepare(`SELECT count(*) c FROM audit_logs`).get() as any).c).toBe(before.c);
    // Super Admin sees it; a dealer of another city does not
    expect((await call('admin', '/api/admin/result-network/operations/toplu/exams')).data.exams.some((e: any) => e.id === t.examId)).toBe(true);
    expect((await call('dealerA', '/api/admin/result-network/operations/toplu/exams?mode=DEALER')).data.exams.some((e: any) => e.id === t.examId)).toBe(false);
    expect((await call('dealerA', `/api/admin/result-network/operations/toplu/institutions?mode=DEALER&examId=${t.examId}`)).data.institutions).toEqual([]);
    expect((await call('dealerA', `/api/admin/result-network/operations/toplu/bundle?mode=DEALER&examId=${t.examId}&institutionIds=${inst.data.institutions[0].id}`)).status).toBeGreaterThanOrEqual(403);
  });

  it('opens Toplu Liste from history and after evaluation instead of the evaluation screen', () => {
    const ws = readFileSync('src/pages/ResultOperatorWorkspace.tsx', 'utf8');
    expect(ws).toContain("x.status==='COMMITTED'?openTopluListe(x.exam_id,x.institution_id)");
    expect(ws).toContain('Raporlara git (Toplu Liste)');
    expect(ws).not.toContain('Rapor ve kartlar');
    const ui = readFileSync('src/components/ResultTopluListe.tsx', 'utf8');
    for (const k of ['KURUM_KARNE', 'SUBE_KARNE', 'MADDE', 'BRANS', 'KONU_EKSIK', 'GELISIM', 'KURUM_ORT', 'Yalnız AYT']) expect(ui).toContain(k);
  });
});
