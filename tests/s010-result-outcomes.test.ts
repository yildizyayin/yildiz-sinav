import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';

// Workers run in UTC; the pre-S002 verify step reads SQLite times through JS Date, so pin the zone like production.
process.env.TZ = 'UTC';

/** S010: the portal shows outcomes only from a verified curriculum and says plainly when there are none. Synthetic data only. */
async function setup(outcomes = false) {
  const t = await evaluatedExam('direct', { outcomes });
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

async function published(withOutcomes: boolean) {
  const ctx = await setup(withOutcomes);
  const code = (await ctx.issue()).data.accessCode;
  const admin = (await createSession(ctx.t.env, 'admin', new Request('https://sonuc.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const fin = await ctx.call('/api/admin/result-network/administrations/adm/finalize', { method: 'POST', body: {}, cookie: admin });
  expect(fin.status, fin.text).toBe(200);
  const cookie = (await ctx.signIn(code)).setCookie!.split(';')[0];
  const detail = async () => { const r = await ctx.call(`/api/public/results/exams/${ctx.t.examId}`, { cookie }); expect(r.status, r.text).toBe(200); return r.data; };
  return { ...ctx, detail };
}

describe('S010 result portal outcomes', () => {
  it('shows verified outcomes, hides them when the curriculum is not verified, and says why', async () => {
    const { t, detail } = await published(true);
    const d = await detail();
    expect(d.outcomesStatus).toBe('AVAILABLE');
    expect(d.outcomes.map((o: any) => o.code).sort()).toEqual(['M.8.1.1', 'T.8.1.1']);
    t.db.exec(`UPDATE curriculum_versions SET verified=0 WHERE id='cv8'`);
    const hidden = await detail();
    expect(hidden).toMatchObject({ outcomesStatus: 'NOT_VERIFIED', outcomes: [] });
    expect(hidden.subjects.length).toBeGreaterThan(0);
  });

  it('states that there is no outcome data instead of showing an empty route', async () => {
    const { detail } = await published(false);
    expect(await detail()).toMatchObject({ outcomesStatus: 'NO_OUTCOME_DATA', outcomes: [] });
  });
});
