import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';

// Workers run in UTC; the pre-S002 verify step reads SQLite times through JS Date, so pin the zone like production.
process.env.TZ = 'UTC';

/** S008: the portal summary comes from the published, frozen version; a later re-evaluation shows only after an explicit republish. Synthetic data only. */
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

describe('S008 result portal summary', () => {
  it('shows the frozen numbers of the published version, unchanged by re-evaluation until republished', async () => {
    const { t, call, issue, signIn } = await setup();
    const participant = (t.db.prepare(`SELECT ep.id,er.correct_count c,er.wrong_count w,er.blank_count b,er.net n,er.score s FROM exam_participants ep JOIN exam_results er ON er.participant_id=ep.id WHERE ep.institution_id='school' LIMIT 1`).get() as any);
    const code = (await issue()).data.accessCode;
    const admin = (await createSession(t.env, 'admin', new Request('https://sonuc.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
    const finalize = () => call('/api/admin/result-network/administrations/adm/finalize', { method: 'POST', body: {}, cookie: admin });
    const v1 = await finalize();
    expect(v1.status, v1.text).toBe(200);
    const session = await signIn(code);
    const cookie = session.setCookie!.split(';')[0];
    const summary = async () => { const r = await call('/api/public/results/student', { cookie }); expect(r.status, r.text).toBe(200); return r.data.exams[0]; };
    const first = await summary();
    expect(first).toMatchObject({ correct_count: participant.c, wrong_count: participant.w, blank_count: participant.b, net: participant.n });
    // a re-evaluation changes the live result; the portal keeps the frozen version
    t.db.prepare(`UPDATE exam_results SET correct_count=correct_count-1,wrong_count=wrong_count+1,net=net-1.3333,score=score-5 WHERE participant_id=?`).run(participant.id);
    expect(await summary()).toEqual(first);
    // explicit correction: reopen (withdraws), re-evaluate, publish a new version
    const reopened = await call('/api/admin/result-network/administrations/adm/reopen-results', { method: 'POST', body: { reason: 'Cevap anahtarı düzeltmesi yapıldı.', expectedSnapshotVersion: v1.data.snapshotVersion }, cookie: admin });
    expect(reopened.status, reopened.text).toBe(200);
    expect((await call('/api/public/results/student', { cookie })).data.exams).toEqual([]);
    t.db.exec(`UPDATE scan_batches SET status='COMMITTED' WHERE exam_id='${t.examId}'`);
    const v2 = await finalize();
    expect(v2.status, v2.text).toBe(200);
    expect(v2.data.snapshotVersion).toBe(v1.data.snapshotVersion + 1);
    const second = await summary();
    expect(second).toMatchObject({ correct_count: participant.c - 1, wrong_count: participant.w + 1, blank_count: participant.b });
    expect(Number(second.net)).toBeCloseTo(participant.n - 1.3333, 3);
  });
});
