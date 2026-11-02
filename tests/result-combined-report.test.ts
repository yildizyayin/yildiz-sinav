import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
import { familyOf } from '../worker/lib/result-combined-report';

process.env.TZ = 'UTC';

/**
 * Birleşik karne (combined-report-cloud.md): built only from the signed-in result identity's own published
 * snapshots, through the real sonuc Worker. Synthetic data only.
 */
async function setup() {
  const t = await evaluatedExam('direct', { outcomes: true });
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


describe('combined report on the result portal', () => {
  it('uses only the identity\'s published snapshots, never ranks, and reports skipped or withdrawn sources', async () => {
    const { t, call, issue, signIn } = await setup();
    const code = (await issue()).data.accessCode;
    const admin = (await createSession(t.env, 'admin', new Request('https://sonuc.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
    const finalize = await call('/api/admin/result-network/administrations/adm/finalize', { method: 'POST', body: {}, cookie: admin });
    expect(finalize.status, finalize.text).toBe(200);
    const cookie = (await signIn(code)).setCookie!.split(';')[0];

    expect((await call('/api/public/results/combined', { method: 'POST', body: { mode: 'LAST5', academicYear: '2026-2027', family: 'LGS' } })).status).toBe(401);
    const options = await call('/api/public/results/combined/options', { cookie });
    expect(options.status, options.text).toBe(200);
    expect(options.data.exams).toEqual([expect.objectContaining({ examId: t.examId, academicYear: '2026-2027', family: 'LGS' })]);

    const report = await call('/api/public/results/combined', { method: 'POST', body: { mode: 'LAST5', academicYear: '2026-2027', family: 'LGS' }, cookie });
    expect(report.status, report.text).toBe(200);
    expect(report.data.sources).toEqual([expect.objectContaining({ examId: t.examId, snapshotVersion: finalize.data.snapshotVersion, usedForOutcomes: true })]);
    const tur = report.data.subjects.find((s: any) => s.name.includes('Türk') || s.code === 'TUR');
    expect(tur).toMatchObject({ exams: 1, avgCorrect: 3, avgWrong: 1, avgBlank: 0 });
    expect(report.data.outcomes.map((o: any) => o.code).sort()).toEqual(['M.8.1.1', 'T.8.1.1']);
    expect(report.data.outcomes.find((o: any) => o.code === 'T.8.1.1')).toMatchObject({ evidence: 4, correct: 3, successPercent: 75 });
    expect(JSON.stringify(report.data)).not.toMatch(/_rank|rank"/);

    // a foreign or unknown exam id is never read; it is listed as skipped
    const custom = await call('/api/public/results/combined', { method: 'POST', body: { mode: 'CUSTOM', academicYear: '2026-2027', family: 'LGS', examIds: [t.examId, 'other-exam'] }, cookie });
    expect(custom.data.skipped).toEqual([expect.objectContaining({ examId: 'other-exam' })]);
    expect((await call('/api/public/results/combined', { method: 'POST', body: { mode: 'CUSTOM', academicYear: '2026-2027', family: 'LGS', examIds: ['other-exam'] }, cookie })).data.error.code).toBe('COMBINED_NO_EXAMS');
    expect((await call('/api/public/results/combined', { method: 'POST', body: { mode: 'CUSTOM', academicYear: '2026-2027', family: 'LGS', examIds: [] }, cookie })).data.error.code).toBe('COMBINED_EMPTY_SELECTION');
    expect((await call('/api/public/results/combined', { method: 'POST', body: { mode: 'LAST5', academicYear: '2026-2027', family: 'TYT' }, cookie })).data.error.code).toBe('COMBINED_NO_EXAMS');
    expect((await call('/api/public/results/combined', { method: 'POST', body: { mode: 'LAST5', academicYear: 'x', family: 'LGS' }, cookie })).data.error.code).toBe('COMBINED_SELECTION_INVALID');

    // withdrawn publication: nothing to combine any more
    const reopened = await call('/api/admin/result-network/administrations/adm/reopen-results', { method: 'POST', body: { reason: 'Cevap anahtarı düzeltmesi yapıldı.', expectedSnapshotVersion: finalize.data.snapshotVersion }, cookie: admin });
    expect(reopened.status, reopened.text).toBe(200);
    expect((await call('/api/public/results/combined', { method: 'POST', body: { mode: 'LAST5', academicYear: '2026-2027', family: 'LGS' }, cookie })).data.error.code).toBe('COMBINED_NO_EXAMS');

    // rate limit per identity
    const identity = (t.db.prepare(`SELECT identity_id FROM result_combined_report_requests LIMIT 1`).get() as any).identity_id;
    const ins = t.db.prepare(`INSERT INTO result_combined_report_requests(id,identity_id) VALUES(?,?)`);
    for (let i = 0; i < 30; i++) ins.run(`x${i}`, identity);
    expect((await call('/api/public/results/combined', { method: 'POST', body: { mode: 'LAST5', academicYear: '2026-2027', family: 'LGS' }, cookie })).status).toBe(429);
  });

  it('keeps exam families apart', () => {
    expect(familyOf('LGS', 8)).toBe('LGS');
    expect(familyOf('tyt', 12)).toBe('TYT');
    expect(familyOf('DENEME', 7)).toBe('OKUL_7');
  });
});
