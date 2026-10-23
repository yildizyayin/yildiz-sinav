import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';

/** A075: publisher / admissions / campus — working flows keep their roles; planned Campus routing is not shown or stored as active. Synthetic data only. */
describe('A075 publisher, admissions and campus scope', () => {
  it('keeps publisher analytics to granted users, admissions to managers, and never activates planned campus routing', async () => {
    const t = await evaluatedExam('direct');
    t.db.exec(`UPDATE platform_features SET enabled_default=1 WHERE feature_key IN ('PUBLISHER','ADMISSIONS','CAMPUS');
      INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('mgr','INSTITUTION_MANAGER','Müdür','u','u',1,'school'),('pubuser','TEACHER','Yayınevi','u','u',1,'school');
      INSERT INTO publishers(id,name,code) VALUES('pub1','Sentetik Yayın','SYN');
      INSERT INTO publisher_user_access(publisher_id,user_id,active) VALUES('pub1','pubuser',1);`);
    const cookies: Record<string, string> = {};
    for (const id of ['mgr', 'pubuser']) cookies[id] = (await createSession(t.env, id, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
    const app = (await import('../worker/preview-policy-production-entry')).default as any;
    const as = async (who: string, path: string, method = 'GET', body?: any) => { if (!cookies[who]) return { status: (await t.request(path, method, body, who)).response.status, data: (await t.request(path, method, body, who)).data }; const r = await app.fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookies[who], Origin: 'https://app.anunex.com', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), t.env, { waitUntil() {} }); return { status: r.status, data: await r.json().catch(() => null) as any }; };
    expect((await as('pubuser', '/api/platform/publishers/pub1/analytics')).status).toBe(200);
    expect((await as('teacher', '/api/platform/publishers/pub1/analytics')).status).toBe(403);
    expect((await as('teacher', '/api/platform/admissions')).status).toBe(403);
    expect((await as('mgr', '/api/platform/admissions', 'POST', { title: 'Bursluluk 2027', campaignType: 'SCHOLARSHIP' })).status).toBe(201);
    const put = await as('mgr', '/api/platform/campus', 'PUT', { subdomain: 'okul', enabled: true });
    expect(put.status).toBe(200); expect(put.data).toMatchObject({ routingAvailable: false, enabled: false });
    expect(t.db.prepare(`SELECT enabled,subdomain FROM campus_branding WHERE institution_id='school'`).get()).toMatchObject({ enabled: 0, subdomain: 'okul' });
    expect((await as('mgr', '/api/platform/campus')).data.routingAvailable).toBe(false);
    expect((await as('teacher', '/api/platform/campus')).status).toBe(403);
  });
});
