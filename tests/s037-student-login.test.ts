import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
import { namePrefix } from '../worker/result-network-entry';

process.env.TZ = 'UTC';

/** S037/D-S038: one-step student sign-in with il/ilçe/kurum, grade, number and the first three letters of the name; no code. Synthetic data only. */
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
  const login = (body: any) => call('/api/public/results/login', { method: 'POST', body: { institutionCode: '11111111', gradeLevel: 8, lookupType: 'STUDENT_NUMBER', lookupValue: '101', namePrefix: 'ali', ...body } });
  const signIn = async (code: string) => {
    const found = await call('/api/public/results/lookup', { method: 'POST', body: { institutionCode: '11111111', gradeLevel: 8, fullName: 'Ali Yılmaz', lookupType: 'STUDENT_NUMBER', lookupValue: '101' } });
    expect(found.data.found, found.text).toBe(true);
    const v = await call('/api/public/results/verify', { method: 'POST', body: { challengeId: found.data.challengeId, accessCode: code } });
    return { ...v, challengeId: found.data.challengeId as string };
  };
  return { t, call, issue, setStatus, signIn, login };
}

describe('S037 student sign-in', () => {
  it('normalizes the first three letters like stored names', () => {
    expect(namePrefix('MEL')).toBe('mel');
    expect(namePrefix('Çağ')).toBe('cag');
    expect(namePrefix('İl ker')).toBe('ilk');
    expect(namePrefix('Ş')).toBe('s');
  });

  it('signs in in one step without a code and answers the same for a wrong name or number (D-S038)', async () => {
    const { t, call, issue, setStatus, login } = await setup();
    await issue();
    const early = await login({});
    expect(early.data).toMatchObject({ found: false, reason: 'NOT_PUBLISHED' });
    setStatus('PUBLISHED');
    const wrongName = await login({ namePrefix: 'VEL' });
    const wrongNo = await login({ lookupValue: '999' });
    for (const r of [wrongName, wrongNo]) { expect(r.status).toBe(401); expect(r.data.error.code).toBe('LOGIN_NOT_MATCHED'); }
    expect(wrongName.text).toBe(wrongNo.text);
    const ok = await login({ namePrefix: 'Alİ' });
    expect(ok.status, ok.text).toBe(200);
    const cookie = ok.setCookie!.split(';')[0];
    expect((await call('/api/public/results/student', { cookie })).status).toBe(200);
    expect((t.db.prepare(`SELECT count(*) n FROM login_attempts WHERE success=1`).get() as any).n).toBe(1);
  });

  it('stops guessing: 8 misses lock a student number, 20 misses lock an IP, without telling which', async () => {
    const { issue, setStatus, login } = await setup();
    await issue(); setStatus('PUBLISHED');
    for (let i = 0; i < 8; i++) expect((await login({ namePrefix: `x${String.fromCharCode(97 + i)}z` })).status).toBe(401);
    const locked = await login({});
    expect(locked.status).toBe(401);
    expect(locked.data.error.code).toBe('LOGIN_NOT_MATCHED');
    for (let i = 0; i < 12; i++) await login({ lookupValue: String(500 + i) });
    expect((await login({ lookupValue: '600' })).status).toBe(429);
  });

  it('rejects a short name before looking anything up', async () => {
    const { login } = await setup();
    expect((await login({ namePrefix: 'al' })).status).toBe(400);
  });

  it('lists il, ilçe and the schools of an ilçe from the MEB directory', async () => {
    const { call } = await setup();
    expect((await call('/api/public/results/locations')).data.cities).toContain('ANKARA');
    expect((await call('/api/public/results/locations?city=ANKARA')).data.districts).toEqual(['ÇANKAYA']);
    const schools = (await call('/api/public/results/institutions?city=ANKARA&district=%C3%87ANKAYA')).data.institutions;
    expect(schools).toEqual([expect.objectContaining({ code: '11111111', name: 'Synthetic School' })]);
  });
});
