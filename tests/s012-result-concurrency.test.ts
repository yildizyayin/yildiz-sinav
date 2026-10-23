import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';

// Workers run in UTC; the pre-S002 verify step reads SQLite times through JS Date, so pin the zone like production.
process.env.TZ = 'UTC';

/** S012: while another operation holds the exam, publish / correct / remove / issue are refused and change nothing; the portal never mixes versions. Synthetic data only. */
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

describe('S012 result publication concurrency', () => {
  it('refuses every publication change while the exam is busy and leaves data untouched', async () => {
    const { t, call, issue, signIn } = await setup();
    const code = (await issue()).data.accessCode;
    const admin = (await createSession(t.env, 'admin', new Request('https://sonuc.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
    const finalize = () => call('/api/admin/result-network/administrations/adm/finalize', { method: 'POST', body: {}, cookie: admin });
    const v1 = await finalize(); expect(v1.status, v1.text).toBe(200);
    const cookie = (await signIn(code)).setCookie!.split(';')[0];
    const before = (await call('/api/public/results/student', { cookie })).data.exams;
    expect(before).toHaveLength(1);
    const snapshot = () => JSON.stringify([
      t.db.prepare('SELECT status,published_snapshot_version FROM exam_administrations').all(),
      t.db.prepare('SELECT snapshot_version,participant_id,net FROM exam_result_snapshots ORDER BY snapshot_version,participant_id').all(),
      t.db.prepare('SELECT access_code_hash FROM result_access_identities').all(),
      t.db.prepare('SELECT status FROM exam_channel_publications').all(),
    ]);
    const state = snapshot();
    // another long operation (for example an evaluation chunk) holds the exam
    t.db.prepare(`INSERT INTO exam_operation_locks(exam_id,owner_token,operation) VALUES(?,?,?)`).run(t.examId, 'examop_other', 'SCAN_EVALUATE');
    const reopen = await call('/api/admin/result-network/administrations/adm/reopen-results', { method: 'POST', body: { reason: 'Cevap anahtarı düzeltmesi yapıldı.', expectedSnapshotVersion: v1.data.snapshotVersion }, cookie: admin });
    const reissue = await call('/api/admin/result-network/access', { method: 'POST', body: { administrationId: 'adm', participantId: (t.db.prepare('SELECT participant_id p FROM result_access_identities').get() as any).p, mebCode: '11111111', studentNumber: '101', gradeLevel: 8, fullName: 'ALI YILMAZ' }, cookie: admin });
    for (const r of [reopen, reissue]) expect(r.status, r.text).toBe(409);
    expect(snapshot()).toBe(state);
    expect((await call('/api/public/results/student', { cookie })).data.exams).toEqual(before);
    // once the other operation finishes, the correction goes through as one step
    t.db.exec(`DELETE FROM exam_operation_locks WHERE exam_id='${t.examId}'`);
    const ok = await call('/api/admin/result-network/administrations/adm/reopen-results', { method: 'POST', body: { reason: 'Cevap anahtarı düzeltmesi yapıldı.', expectedSnapshotVersion: v1.data.snapshotVersion }, cookie: admin });
    expect(ok.status, ok.text).toBe(200);
    // a second, stale correction of the same version is refused
    const stale = await call('/api/admin/result-network/administrations/adm/reopen-results', { method: 'POST', body: { reason: 'Cevap anahtarı düzeltmesi yapıldı.', expectedSnapshotVersion: v1.data.snapshotVersion }, cookie: admin });
    expect(stale.status).toBe(409);
    expect((await call('/api/public/results/student', { cookie })).data.exams).toEqual([]);
    expect((t.db.prepare('SELECT count(*) n FROM exam_operation_locks').get() as any).n).toBe(0);
  });
});
