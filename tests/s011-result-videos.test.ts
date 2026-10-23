import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';

// Workers run in UTC; the pre-S002 verify step reads SQLite times through JS Date, so pin the zone like production.
process.env.TZ = 'UTC';

/** S011: the portal shows only approved, published, working, learner-visible https videos of the student's own wrong questions. Synthetic data only. */
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

describe('S011 result portal videos', () => {
  it('serves only the right videos and nothing private or unrelated', async () => {
    const { t, call, issue, signIn } = await setup();
    const participant = (t.db.prepare(`SELECT id FROM exam_participants WHERE institution_id='school' LIMIT 1`).get() as any).id;
    const wrong = (t.db.prepare(`SELECT exam_question_id q FROM student_answers WHERE participant_id=? AND status='WRONG' LIMIT 1`).get(participant) as any)?.q;
    const right = (t.db.prepare(`SELECT exam_question_id q FROM student_answers WHERE participant_id=? AND status<>'WRONG' LIMIT 1`).get(participant) as any)?.q;
    expect(wrong).toBeTruthy(); expect(right).toBeTruthy();
    const v = (id: string, q: string, extra: Record<string, string> = {}) => {
      const cols = { id: `'${id}'`, exam_question_id: `'${q}'`, link_type: "'SOLUTION'", url: `'https://video.example/${id}'`, approved: '1', title: `'${id}'`, exam_id: `'${t.examId}'`, ...extra };
      t.db.exec(`INSERT INTO video_links(${Object.keys(cols).join(',')}) VALUES(${Object.values(cols).join(',')})`);
    };
    v('ok', wrong);
    v('public', wrong, { visibility: "'PUBLIC'" });
    v('correct_question', right);
    v('unapproved', wrong, { approved: '0' });
    v('draft', wrong, { status: "'DRAFT'" });
    v('later', wrong, { status: "'SCHEDULED'", publish_at: "'2099-01-01 00:00:00'" });
    v('future_time', wrong, { publish_at: "'2099-01-01 00:00:00'" });
    v('broken', wrong, { link_status: "'BROKEN'" });
    v('teacher_only', wrong, { visibility: "'INSTITUTION_TEACHER'" });
    v('admin_only', wrong, { visibility: "'SUPER_ADMIN'" });
    v('plain_http', wrong, { url: "'http://video.example/plain'" });
    const code = (await issue()).data.accessCode;
    const admin = (await createSession(t.env, 'admin', new Request('https://sonuc.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
    expect((await call('/api/admin/result-network/administrations/adm/finalize', { method: 'POST', body: {}, cookie: admin })).status).toBe(200);
    const cookie = (await signIn(code)).setCookie!.split(';')[0];
    const d = await call(`/api/public/results/exams/${t.examId}`, { cookie });
    expect(d.status, d.text).toBe(200);
    expect(d.data.videos.map((x: any) => x.title).sort()).toEqual(['ok', 'public']);
    // withdrawing approval later removes it, the frozen question choice stays
    t.db.exec(`UPDATE video_links SET approved=0 WHERE id='ok'`);
    expect((await call(`/api/public/results/exams/${t.examId}`, { cookie })).data.videos.map((x: any) => x.title)).toEqual(['public']);
    // no session, no video
    expect((await call(`/api/public/results/exams/${t.examId}`)).status).toBe(401);
  });
});
