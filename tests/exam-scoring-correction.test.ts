import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';

process.env.TZ = 'UTC';

/**
 * 2 Nov: an active exam's scoring profile can change only while its publication is opened for correction, to a
 * verified profile of the same exam type, with a reason; the re-evaluation after that uses the new profile.
 */
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


describe('scoring profile correction', () => {
  it('is refused until the publication is opened for correction, then changes with a reason and is audited', async () => {
    const { t, call, issue } = await setup();
    await issue();
    const admin = (await createSession(t.env, 'admin', new Request('https://sonuc.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
    const url = `${t.base}/scoring-profile`;
    const before = await t.request(url);
    expect(before.response.status, before.text).toBe(200);
    expect(before.data.options.map((o: any) => o.rule_code).sort()).toEqual(['ANUNEX_LGS_PRACTICE', 'MEB_LGS']);
    expect(before.data.correctionOpen).toBe(false);
    // active and not opened for correction: locked
    expect((await t.request(url, 'PUT', { scoringRuleVersionId: 'srv_anunex_lgs_2627', reason: 'Yanlış profil seçilmişti.' })).data.error.code).toBe('CORRECTION_NOT_OPEN');

    const finalize = await call('/api/admin/result-network/administrations/adm/finalize', { method: 'POST', body: {}, cookie: admin });
    expect(finalize.status, finalize.text).toBe(200);
    // published and frozen: still locked
    expect((await t.request(url, 'PUT', { scoringRuleVersionId: 'srv_anunex_lgs_2627', reason: 'Yanlış profil seçilmişti.' })).data.error.code).toBe('CORRECTION_NOT_OPEN');
    const reopened = await call('/api/admin/result-network/administrations/adm/reopen-results', { method: 'POST', body: { reason: 'Puanlama profili düzeltmesi.', expectedSnapshotVersion: finalize.data.snapshotVersion }, cookie: admin });
    expect(reopened.status, reopened.text).toBe(200);
    expect((await t.request(url)).data.correctionOpen).toBe(true);

    expect((await t.request(url, 'PUT', { scoringRuleVersionId: 'srv_anunex_lgs_2627', reason: 'kısa' })).data.error.code).toBe('REASON_REQUIRED');
    expect((await t.request(url, 'PUT', { scoringRuleVersionId: 'srv_osym_tyt_2627', reason: 'Yanlış profil seçilmişti.' })).data.error.code).toBe('SCORING_PROFILE_NOT_ALLOWED');
    expect((await t.request(url, 'PUT', { scoringRuleVersionId: 'srv_anunex_lgs_2627', reason: 'Yanlış profil seçilmişti.' }, 'teacher')).response.status).toBe(403);
    const ok = await t.request(url, 'PUT', { scoringRuleVersionId: 'srv_anunex_lgs_2627', reason: 'Yanlış profil seçilmişti.' });
    expect(ok.response.status, ok.text).toBe(200);
    expect(ok.data.current).toBe('srv_anunex_lgs_2627');
    expect((t.db.prepare(`SELECT scoring_rule_version_id v FROM exams WHERE id=?`).get(t.examId) as any).v).toBe('srv_anunex_lgs_2627');
    expect((t.db.prepare(`SELECT details_json d FROM audit_logs WHERE action='EXAM_SCORING_PROFILE_CORRECTED'`).get() as any).d).toMatch(/Yanlış profil/);
  });
});
