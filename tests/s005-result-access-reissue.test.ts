import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';

// Workers run in UTC; the pre-S002 verify step reads SQLite times through JS Date, so pin the zone like production.
process.env.TZ = 'UTC';

/** S005: result access codes are issued only by the Super Admin, shown once, and a re-issued code ends the old one at once. Synthetic data only. */
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

describe('S005 result access codes', () => {
  it('lets only the Super Admin issue a code, shows it once and never stores it in clear', async () => {
    const { t, issue } = await setup();
    expect((await issue('mgr')).status).toBe(403);
    const r = await issue();
    expect(r.status, r.text).toBe(201);
    expect(r.data).toMatchObject({ oneTimeDisplay: true });
    expect(r.data.accessCode).toMatch(/^\d{8}$/);
    const stored = JSON.stringify(t.db.prepare('SELECT * FROM result_access_identities').all());
    expect(stored).not.toContain(r.data.accessCode);
    expect(JSON.stringify(t.db.prepare(`SELECT details_json FROM audit_logs WHERE action='RESULT_ACCESS_ISSUED'`).all())).not.toContain(r.data.accessCode);
  });

  it('ends open sessions and unfinished searches of the student when the code is re-issued', async () => {
    const { t, call, issue, setStatus, signIn } = await setup();
    const first = (await issue()).data.accessCode;
    setStatus('PUBLISHED');
    const session = await signIn(first);
    expect(session.status, session.text).toBe(200);
    const cookie = session.setCookie!.split(';')[0];
    expect((await call('/api/public/results/student', { cookie })).status).toBe(200);
    const pending = (await call('/api/public/results/lookup', { method: 'POST', body: { institutionCode: '11111111', gradeLevel: 8, fullName: 'Ali Yılmaz', lookupType: 'STUDENT_NUMBER', lookupValue: '101' } })).data.challengeId;
    setStatus('READY');
    const second = (await issue()).data.accessCode;
    expect(second).not.toBe(first);
    setStatus('PUBLISHED');
    expect((await call('/api/public/results/student', { cookie })).status).toBe(401);
    expect((await call('/api/public/results/verify', { method: 'POST', body: { challengeId: pending, accessCode: second } })).status).toBe(401);
    expect((await signIn(first)).status).toBe(401);
    expect((await signIn(second)).status).toBe(200);
    expect((t.db.prepare('SELECT count(*) n FROM result_access_identities').get() as any).n).toBe(1);
  });
});
