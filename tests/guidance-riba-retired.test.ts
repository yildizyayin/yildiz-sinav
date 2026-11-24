import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';

/** Rehberlik: RİBA kullanılmıyor (owner, 12 Nov 2026). The row stays but is closed and cannot be loaded or opened. */
describe('RİBA retired', () => {
  it('keeps RİBA closed, out of the catalog, without a form loader and impossible to open as a survey', async () => {
    const t = await evaluatedExam('direct');
    t.db.exec(`INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('gt','GUIDANCE_TEACHER','Rehber A','unused','unused',1,'school');`);
    const cookie = (await createSession(t.env, 'gt', new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
    const app = (await import('../worker/preview-policy-production-entry')).default as any;
    const gt = async (path: string, method = 'GET', body?: any) => {
      const res = await app.fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookie, Origin: 'https://app.anunex.com', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), t.env, { waitUntil() {}, passThroughOnException() {} });
      return { status: res.status, data: await res.json().catch(() => null) as any };
    };
    expect(t.db.prepare(`SELECT review_status,active FROM guidance_survey_templates WHERE kind='RIBA'`).get()).toEqual({ review_status: 'REJECTED', active: 0 });
    const cat = await gt('/api/guidance-tools/catalog');
    expect(cat.status).toBe(200);
    expect(cat.data.templates.some((x: any) => x.kind === 'RIBA')).toBe(false);
    expect((await gt('/api/guidance-tools/surveys', 'POST', { templateCode: 'RIBA' })).status).toBe(404);
    const id = (t.db.prepare(`SELECT id FROM guidance_survey_templates WHERE kind='RIBA'`).get() as any).id;
    const put = await t.request(`/api/guidance-tools/templates/${id}/form`, 'PUT', { formCode: 'X', items: [{ id: 'r1', text: 'Madde' }] }, 'admin');
    expect(put.response.status, put.text).toBe(410);
    const plan = await gt('/api/guidance-content/plan');
    expect(plan.status).toBe(200);
    expect(plan.data.ribaTop).toBeUndefined();
  });
});
