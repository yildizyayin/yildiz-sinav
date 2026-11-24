import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
import { istanbulDate, isPersonalHarm } from '../worker/lib/guidance-center';

/** Rehberlik R5 (owner, 12 Nov 2026): activity report, school summary without names, class report, Nibiru safety link. Synthetic data only. */
async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT INTO classes(id,institution_id,season_id,grade_level,section,name) VALUES('c8a','school','season',8,'A','8-A');
    UPDATE student_enrollments SET class_id='c8a' WHERE student_id='s1';
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('gt','GUIDANCE_TEACHER','Rehber A','unused','unused',1,'school'),('mgr','INSTITUTION_MANAGER','Müdür','unused','unused',1,'school');
    INSERT INTO teacher_assignments(id,user_id,institution_id,season_id,class_id,assignment_type,active) VALUES('g1','gt','school','season','c8a','GUIDANCE',1);`);
  const cookies: Record<string, string> = {};
  for (const id of ['gt', 'mgr']) cookies[id] = (await createSession(t.env, id, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const app = (await import('../worker/preview-policy-production-entry')).default as any;
  const as = async (who: string, path: string, method = 'GET', body?: any) => {
    if (!cookies[who]) return t.request(path, method, body, who);
    const res = await app.fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookies[who], Origin: 'https://app.anunex.com', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), t.env, { waitUntil() {}, passThroughOnException() {} });
    const text = await res.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ }
    return { response: res, data, text };
  };
  return { ...t, as };
}
const today = istanbulDate();

describe('guidance reports R5', () => {
  it('counts the guidance work for the counsellor and gives the manager school totals without any name or note', async () => {
    const t = await setup();
    const m = await t.as('gt', '/api/guidance-center/meetings', 'POST', { kind: 'INDIVIDUAL', area: 'SOCIAL_EMOTIONAL', topic: 'PEER_BULLYING', scheduledAt: `${today}T09:00`, studentIds: ['s1'] });
    await t.as('gt', `/api/guidance-center/meetings/${m.data.id}`, 'PATCH', { status: 'DONE', summary: 'Gizli özet metni' });
    await t.as('stuuser', '/api/guidance-center/messages', 'POST', { category: 'STUDY', body: 'Görüşmek istiyorum.' });
    const r = await t.as('gt', `/api/guidance-summary/activity?from=${today}&to=${today}`);
    expect(r.response.status, r.text).toBe(200);
    expect(r.data).toMatchObject({ scope: 'COUNSELOR', totals: { individual: 1, studentsReached: 1 }, messages: { total: 1, student: 1 } });
    const s = await t.as('mgr', `/api/guidance-summary/activity?from=${today}&to=${today}`);
    expect(s.data.scope).toBe('SCHOOL'); expect(s.data.totals.individual).toBe(1);
    expect(s.text).not.toMatch(/Gizli özet|Görüşmek istiyorum|ALI|s1/);
    for (const who of ['teacher', 'stuuser', 'parent']) expect((await t.as(who, '/api/guidance-summary/activity')).response.status, who).toBe(403);
    expect((await t.as('gt', '/api/guidance-summary/activity?from=2026-12-01&to=2026-11-01')).response.status).toBe(400);
  });

  it('reports a class to its guidance teacher only', async () => {
    const t = await setup();
    const r = await t.as('gt', '/api/guidance-summary/class?classId=c8a');
    expect(r.response.status, r.text).toBe(200);
    expect(r.data.summary).toMatchObject({ students: 1, withWarnings: 0, met: 0 });
    expect((await t.as('mgr', '/api/guidance-summary/class?classId=c8a')).response.status).toBe(403);
  });

  it('tells the guidance teacher, without the text, when a student writes words of harm to Nibiru', async () => {
    expect(isPersonalHarm('Bazen kendime zarar vermek istiyorum')).toBe(true);
    expect(isPersonalHarm('Akran zorbalığı nedir, ödevim için lazım')).toBe(false);
    const t = await setup();
    const chat = await t.request('/api/nibiru/chat', 'POST', { message: 'Okulda biri beni dövüyor, ne yapayım' }, 'stuuser');
    expect(chat.response.status, chat.text).toBe(200);
    expect(JSON.stringify(chat.data)).toContain('rehber öğretmenine seninle konuşması için haber verdim');
    const msg = t.db.prepare(`SELECT student_id,urgent,body FROM guidance_messages`).all() as any[];
    expect(msg).toHaveLength(1);
    expect(msg[0]).toMatchObject({ student_id: 's1', urgent: 1 });
    expect(msg[0].body).not.toContain('dövüyor');
    expect(t.db.prepare(`SELECT count(*) n FROM notifications WHERE recipient_user_id='gt' AND type='GUIDANCE_MESSAGE'`).get()).toEqual({ n: 1 });
    await t.request('/api/nibiru/chat', 'POST', { message: 'beni dövüyorlar' }, 'stuuser');
    expect(t.db.prepare(`SELECT count(*) n FROM guidance_messages`).get()).toEqual({ n: 1 }); // once a day
  });
});
