import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
import { reportSource } from '../src/lib/resultReportSource';

// Workers run in UTC; the pre-S002 verify step reads SQLite times through JS Date, so pin the zone like production.
process.env.TZ = 'UTC';

/** S013: institution result files carry their source — published version N or an unpublished preview. Synthetic data only. */
async function setup() {
  const t = await evaluatedExam('direct');
  Object.assign(t.env, { RESULT_LOOKUP_SECRET: 'synthetic-lookup-secret' });
  const participant = (t.db.prepare(`SELECT id FROM exam_participants WHERE institution_id='school' LIMIT 1`).get() as any).id;
  t.db.exec(`UPDATE institutions SET code='11111111' WHERE id='school';
    INSERT INTO national_institution_directory(meb_code,name,normalized_name,city,district,source_url) VALUES('11111111','Synthetic School','SYNTHETIC SCHOOL','ANKARA','ÇANKAYA','https://example.invalid');
    INSERT INTO exam_administrations(id,exam_id,academic_year,channel,status) VALUES('adm','${t.examId}','2026-2027','RESULT_NETWORK','READY');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('mgr','INSTITUTION_MANAGER','M','u','u',1,'school');`);
  const cookies: Record<string, string> = {};
  for (const id of ['admin', 'mgr']) cookies[id] = (await createSession(t.env, id, new Request('https://sonuc.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const result = (await import('../worker/result-worker-entry')).default as any;
  const call = async (path: string, init: { method?: string; body?: any; cookie?: string } = {}) => {
    const r = await result.fetch(new Request(`https://sonuc.anunex.com${path}`, { method: init.method || 'GET', headers: { ...(init.cookie ? { Cookie: init.cookie } : {}), Origin: 'https://sonuc.anunex.com', 'Content-Type': 'application/json' }, ...(init.body ? { body: JSON.stringify(init.body) } : {}) }), t.env, { waitUntil() {} });
    const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ }
    return { status: r.status, data, text, setCookie: r.headers.get('Set-Cookie') };
  };
  const issueBody = { administrationId: 'adm', participantId: participant, mebCode: '11111111', studentNumber: '101', gradeLevel: 8, fullName: 'ALI YILMAZ' };
  const issue = (who = 'admin') => call('/api/admin/result-network/access', { method: 'POST', body: issueBody, cookie: cookies[who] });
  const setStatus = (s: string) => t.db.exec(`UPDATE exam_administrations SET status='${s}' WHERE id='adm'`);
  const signIn = async (code: string) => {
    const found = await call('/api/public/results/lookup', { method: 'POST', body: { institutionCode: '11111111', gradeLevel: 8, fullName: 'Ali Yılmaz', lookupType: 'STUDENT_NUMBER', lookupValue: '101' } });
    expect(found.data.found, found.text).toBe(true);
    const v = await call('/api/public/results/verify', { method: 'POST', body: { challengeId: found.data.challengeId, accessCode: code } });
    return { ...v, challengeId: found.data.challengeId as string };
  };
  return { t, call, issue, setStatus, signIn };
}

describe('S013 result documents', () => {
  it('labels files by source and never calls a preview final', () => {
    expect(reportSource({ source: 'PUBLISHED_SNAPSHOT', publication: { snapshotVersion: 3 } })).toEqual({ label: 'Yayımlanmış sonuç · sürüm 3', fileSuffix: '-surum-3', published: true });
    expect(reportSource({ source: 'LIVE_PREVIEW', publication: { status: 'READY' } })).toMatchObject({ fileSuffix: '-on-izleme', published: false });
    expect(reportSource({ source: 'PUBLISHED_SNAPSHOT', publication: {} }).published).toBe(false);
    expect(reportSource(null).published).toBe(false);
  });

  it('gives the institution a live preview before publication and the frozen version after it', async () => {
    const { t, call, issue } = await setup();
    t.db.exec(`INSERT INTO scan_batches(id,exam_id,institution_id,source_type,status,created_by) VALUES('bA','${t.examId}','school','TXT','COMMITTED','admin')`);
    await issue();
    const mgr = (await createSession(t.env, 'mgr', new Request('https://sonuc.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
    const admin = (await createSession(t.env, 'admin', new Request('https://sonuc.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
    const report = async () => (await call('/api/admin/result-network/operations/scan-batches/bA/report', { cookie: mgr })).data;
    const before = await report();
    expect(before.source).toBe('LIVE_PREVIEW');
    expect(reportSource(before).published).toBe(false);
    const fin = await call('/api/admin/result-network/administrations/adm/finalize', { method: 'POST', body: {}, cookie: admin });
    expect(fin.status, fin.text).toBe(200);
    const after = await report();
    expect(after.source).toBe('PUBLISHED_SNAPSHOT');
    expect(reportSource(after)).toMatchObject({ published: true, fileSuffix: `-surum-${fin.data.snapshotVersion}` });
  });
});
