import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession, hashPassword } from '../worker/lib/auth';

/** A079: password change ends other sessions; question media stays inside its school and drafts stay with staff. Synthetic data only. */
describe('A079 security and data lifecycle', () => {
  it('ends every other session of the account after a password change and keeps the one that changed it', async () => {
    const t = await evaluatedExam('direct');
    const p = await hashPassword('Eski-sifre-123');
    t.db.prepare('UPDATE users SET password_hash=?,password_salt=?,password_iterations=? WHERE id=?').run(p.hash, p.salt, p.iterations, 'teacher');
    const app = (await import('../worker/preview-policy-production-entry')).default as any;
    const cookie = async () => (await createSession(t.env, 'teacher', new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
    const [phone, laptop] = [await cookie(), await cookie()];
    const call = async (c: string, path: string, method = 'GET', body?: any) => app.fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: c, Origin: 'https://app.anunex.com', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), t.env, { waitUntil() {} });
    expect((await call(phone, '/api/auth/me')).status).toBe(200);
    expect((await call(laptop, '/api/auth/me')).status).toBe(200);
    const changed = await call(laptop, '/api/auth/change-password', 'POST', { currentPassword: 'Eski-sifre-123', newPassword: 'Yeni-sifre-456' });
    expect(changed.status, await changed.clone().text()).toBe(200);
    expect((await call(laptop, '/api/auth/me')).status).toBe(200);
    expect((await call(phone, '/api/auth/me')).status).toBe(401);
    // other accounts are untouched
    expect((await t.request('/api/auth/me', 'GET', undefined, 'stuuser')).response.status).toBe(200);
  });

  it('serves question media only inside its school and never a draft to learners', async () => {
    const t = await evaluatedExam('direct');
    const store = new Map<string, string>();
    (t.env as any).FILES = { get: async (k: string) => (store.has(k) ? { body: new Response(store.get(k)).body, httpMetadata: { contentType: 'image/png' } } : null) };
    t.db.exec(`INSERT INTO institutions(id,name,code,status) VALUES('other','Other School','OTHER','ACTIVE');`);
    const q = (id: string, owner: string, ownerId: string | null, review: string, copyright = 'OWNED') => t.db.prepare(`INSERT INTO question_bank(id,owner_type,owner_id,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,option_count,copyright_status,review_status)
      VALUES(?,?,?,'2026-2027',8,'sub_tur','MULTIPLE_CHOICE','Kök','["a","b","c","d"]','A',4,?,?)`).run(id, owner, ownerId, copyright, review);
    const asset = (id: string, qid: string, approved = 1) => { t.db.prepare(`INSERT INTO question_assets(id,question_id,asset_type,r2_key,approved) VALUES(?,?,'IMAGE',?,?)`).run(id, qid, `k/${id}`, approved); store.set(`k/${id}`, 'png'); };
    q('plat', 'PLATFORM', null, 'APPROVED'); asset('plat_ok', 'plat'); asset('plat_off', 'plat', 0);
    q('plat_draft', 'PLATFORM', null, 'REVIEW'); asset('pd', 'plat_draft');
    q('plat_restricted', 'PLATFORM', null, 'APPROVED', 'RESTRICTED'); asset('pr', 'plat_restricted');
    q('own_ok', 'INSTITUTION', 'school', 'APPROVED'); asset('oo', 'own_ok');
    q('own_draft', 'INSTITUTION', 'school', 'REVIEW'); asset('od', 'own_draft');
    q('foreign', 'INSTITUTION', 'other', 'APPROVED'); asset('fo', 'foreign');
    q('personal', 'USER', 'teacher', 'APPROVED'); asset('pe', 'personal');
    const get = async (qid: string, aid: string, as: string) => (await t.request(`/api/platform/questions/${qid}/assets/${aid}`, 'GET', undefined, as)).response.status;
    const table: [string, string, Record<string, number>][] = [
      ['plat', 'plat_ok', { stuuser: 200, parent: 200, teacher: 200, admin: 200 }],
      ['plat', 'plat_off', { stuuser: 403, teacher: 403, admin: 200 }],
      ['plat_draft', 'pd', { stuuser: 403, teacher: 403, admin: 200 }],
      ['plat_restricted', 'pr', { stuuser: 403, teacher: 403, admin: 200 }],
      ['own_ok', 'oo', { stuuser: 200, parent: 200, teacher: 200 }],
      ['own_draft', 'od', { stuuser: 403, parent: 403, teacher: 200 }],
      ['foreign', 'fo', { stuuser: 403, teacher: 403, admin: 200 }],
      ['personal', 'pe', { teacher: 200, stuuser: 403 }],
    ];
    const seen: string[] = [];
    for (const [qid, aid, want] of table) for (const [who, status] of Object.entries(want)) seen.push(`${aid}:${who}:${await get(qid, aid, who)}`), expect(seen.at(-1)).toBe(`${aid}:${who}:${status}`);
    expect(await get('plat', 'oo', 'admin')).toBe(404); // an asset is served only under its own question
  });
});
