import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';

// Workers run in UTC; the pre-S002 verify step reads SQLite times through JS Date, so pin the zone like production.
process.env.TZ = 'UTC';

/** S007: the app's channel decision governs the portal — an exam removed from the result channel cannot be found or opened there. Synthetic data only. */
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

const lookupBody = { institutionCode: '11111111', gradeLevel: 8, fullName: 'Ali Yılmaz', lookupType: 'STUDENT_NUMBER', lookupValue: '101' };

describe('S007 result channel decision', () => {
  it('hides a removed exam from search and from an open session, and shows it again only after an explicit republish', async () => {
    const { t, call, issue, setStatus, signIn } = await setup();
    const code = (await issue()).data.accessCode;
    setStatus('PUBLISHED');
    const lookup = () => call('/api/public/results/lookup', { method: 'POST', body: lookupBody });
    const session = await signIn(code);
    const cookie = session.setCookie!.split(';')[0];
    const app = (await import('../worker/preview-policy-production-entry')).default as any;
    const cookieOf = async (id: string) => (await createSession(t.env, id, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
    const admin = await cookieOf('admin');
    const channel = async (action: string, who = admin) => {
      const state = await (await app.fetch(new Request(`https://app.anunex.com/api/admin/exams/${t.examId}/channels`, { headers: { Cookie: admin } }), t.env, { waitUntil() {} })).json();
      t.env.ENVIRONMENT = 'production';
      try {
        return await app.fetch(new Request(`https://app.anunex.com/api/admin/exams/${t.examId}/channels/RESULT_NETWORK/${action}`, { method: 'POST', headers: { Cookie: who, Origin: 'https://app.anunex.com', 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: state.savedRevision }) }), t.env, { waitUntil() {} });
      } finally { t.env.ENVIRONMENT = 'test'; }
    };
    const removed = await channel('remove');
    expect(removed.status, await removed.clone().text()).toBe(200);
    expect((t.db.prepare(`SELECT status FROM exam_channel_publications WHERE exam_id=? AND channel='RESULT_NETWORK'`).get(t.examId) as any).status).toBe('ARCHIVED');
    expect((await lookup()).data.found).toBe(false);
    // the same holds for "remove from the result portal" in the trash flow, also for an exam that never had a channel row
    t.db.exec(`DELETE FROM exam_channel_publications WHERE exam_id='${t.examId}' AND channel='RESULT_NETWORK'`);
    expect((await lookup()).data.found).toBe(true);
    t.env.ENVIRONMENT = 'production';
    try { expect((await app.fetch(new Request(`https://app.anunex.com/api/admin/exams/${t.examId}/trash`, { method: 'POST', headers: { Cookie: admin, Origin: 'https://app.anunex.com', 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'RESULT_PORTAL' }) }), t.env, { waitUntil() {} })).status).toBe(200); }
    finally { t.env.ENVIRONMENT = 'test'; }
    expect((await lookup()).data.found).toBe(false);
    const listed = await call('/api/public/results/student', { cookie });
    expect(listed.status).toBe(200);
    expect(listed.data.exams).toEqual([]);
    expect((await call(`/api/public/results/exams/${t.examId}`, { cookie })).status).toBe(404);
    expect((await channel('publish', await cookieOf('mgr'))).status).toBe(403);
    expect((await lookup()).data.found).toBe(false);
    const again = await channel('publish');
    expect(again.status, await again.clone().text()).toBe(200);
    expect((await lookup()).data.found).toBe(true);
  });

  it('does not show an administration that is not published, whatever the channel says', async () => {
    const { t, call, issue } = await setup();
    await issue();
    t.db.exec(`INSERT INTO exam_channel_publications(id,exam_id,channel,status) VALUES('ecp','${t.examId}','RESULT_NETWORK','ACTIVE') ON CONFLICT(exam_id,channel) DO UPDATE SET status='ACTIVE'`);
    for (const s of ['DRAFT', 'UPLOADING', 'READY', 'ARCHIVED']) {
      t.db.exec(`UPDATE exam_administrations SET status='${s}' WHERE id='adm'`);
      expect((await call('/api/public/results/lookup', { method: 'POST', body: lookupBody })).data.found, s).toBe(false);
    }
    t.db.exec(`UPDATE exam_administrations SET status='PUBLISHED' WHERE id='adm'`);
    expect((await call('/api/public/results/lookup', { method: 'POST', body: lookupBody })).data.found).toBe(true);
  });
});
