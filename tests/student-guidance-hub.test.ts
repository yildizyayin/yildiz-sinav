import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
import { istanbulDate } from '../worker/lib/guidance-center';

/** Rehberliğim (owner, 13 Nov 2026): a student sees only what the guidance teacher sent. Synthetic data only. */
async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT INTO classes(id,institution_id,season_id,grade_level,section,name) VALUES('c8a','school','season',8,'A','8-A');
    UPDATE student_enrollments SET class_id='c8a' WHERE student_id='s1';
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('gt','GUIDANCE_TEACHER','Rehber A','unused','unused',1,'school');
    INSERT INTO teacher_assignments(id,user_id,institution_id,season_id,class_id,assignment_type,active) VALUES('g1','gt','school','season','c8a','GUIDANCE',1);`);
  const cookie = (await createSession(t.env, 'gt', new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const app = (await import('../worker/preview-policy-production-entry')).default as any;
  const gt = async (path: string, method = 'GET', body?: any) => {
    const res = await app.fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookie, Origin: 'https://app.anunex.com', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), t.env, { waitUntil() {}, passThroughOnException() {} });
    return { status: res.status, data: await res.json().catch(() => null) as any };
  };
  return { ...t, gt };
}

describe('Rehberliğim', () => {
  it('is empty until the guidance teacher sends something, and the test catalog is never shown to a student', async () => {
    const t = await setup();
    const hub = await t.request('/api/guidance-center/my-hub', 'GET', undefined, 'stuuser');
    expect(hub.response.status, hub.text).toBe(200);
    expect(hub.data).toMatchObject({ program: null, tests: { todo: 0, done: 0 }, surveys: 0, resources: 0, supportPlan: false, diary: null, meetings: [], pending: 0, any: false });
    expect((await t.request('/api/nibiru/guidance/instruments', 'GET', undefined, 'stuuser')).data.instruments).toEqual([]);
    expect((await t.gt('/api/nibiru/guidance/instruments')).data.instruments.length).toBeGreaterThan(0);
    expect((await t.request('/api/guidance-center/my-hub', 'GET', undefined, 'parent')).response.status).toBe(403);
  });

  it('shows the diary only while the guidance teacher asks for it, and a planned meeting by its time only', async () => {
    const t = await setup();
    expect((await t.request('/api/guidance-content/screen/mine', 'GET', undefined, 'stuuser')).data.requested).toBeNull();
    expect((await t.request('/api/guidance-content/screen/requests', 'POST', { classId: 'c8a', days: 7 }, 'teacher')).response.status).toBe(403);
    const r = await t.gt('/api/guidance-content/screen/requests', 'POST', { classId: 'c8a', days: 14, note: 'Sınav haftası' });
    expect(r.status).toBe(201);
    expect((await t.request('/api/guidance-content/screen/mine', 'GET', undefined, 'stuuser')).data.requested).toMatchObject({ note: 'Sınav haftası' });
    expect((await t.request('/api/guidance-content/screen/mine', 'GET', undefined, 'parent')).data.requested).toMatchObject({ note: 'Sınav haftası' });
    const today = istanbulDate();
    await t.gt('/api/guidance-center/meetings', 'POST', { kind: 'INDIVIDUAL', area: 'SOCIAL_EMOTIONAL', topic: 'PEER_BULLYING', title: 'Gizli başlık', scheduledAt: `${today}T23:59`, studentIds: ['s1'] });
    const hub = await t.request('/api/guidance-center/my-hub', 'GET', undefined, 'stuuser');
    expect(hub.data.diary).toMatchObject({ note: 'Sınav haftası' });
    expect(hub.data.meetings).toEqual([`${today}T23:59`]);
    expect(hub.text).not.toMatch(/Gizli başlık|PEER_BULLYING/);
    expect(hub.data).toMatchObject({ any: true, pending: 2 });
  });
});
