import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
import { schoolYearOf } from '../worker/lib/guidance-content';

/** Rehberlik R4 (owner, 12 Nov 2026): annual plan, class activities, resource library, screen & sleep diary. Synthetic data only. */
async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT INTO classes(id,institution_id,season_id,grade_level,section,name) VALUES('c8a','school','season',8,'A','8-A'),('c8b','school','season',8,'B','8-B');
    UPDATE student_enrollments SET class_id='c8a' WHERE student_id='s1';
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('gt','GUIDANCE_TEACHER','Rehber A','unused','unused',1,'school'),('t2','TEACHER','Öğretmen B','unused','unused',1,'school');
    INSERT INTO teacher_assignments(id,user_id,institution_id,season_id,class_id,assignment_type,active) VALUES('g1','gt','school','season','c8a','GUIDANCE',1),('t1','teacher','school','season','c8a','SUBJECT',1),('t2a','t2','school','season','c8b','SUBJECT',1);`);
  const cookies: Record<string, string> = {};
  for (const id of ['gt', 't2']) cookies[id] = (await createSession(t.env, id, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const app = (await import('../worker/preview-policy-production-entry')).default as any;
  const as = async (who: string, path: string, method = 'GET', body?: any) => {
    if (!cookies[who]) return t.request(path, method, body, who);
    const res = await app.fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookies[who], Origin: 'https://app.anunex.com', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), t.env, { waitUntil() {}, passThroughOnException() {} });
    const text = await res.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ }
    return { response: res, data, text };
  };
  return { ...t, as };
}
const day = (n: number) => new Date(Date.now() - n * 86400000 + 3 * 3600000).toISOString().slice(0, 10);

describe('guidance content R4', () => {
  it('knows the school year', () => {
    expect(schoolYearOf('2026-11-12')).toBe('2026-2027');
    expect(schoolYearOf('2027-06-30')).toBe('2026-2027');
    expect(schoolYearOf('2027-09-01')).toBe('2027-2028');
  });

  it('keeps the annual plan of the school', async () => {
    const t = await setup();
    expect((await t.as('gt', '/api/guidance-content/plan', 'PUT', { year: '2026-2027', theme: 'Selamlaşma', priorities: 'Akran ilişkileri' })).response.status).toBe(200);
    expect((await t.as('gt', '/api/guidance-content/plan/entries', 'POST', { year: '2026-2027', month: 13, kind: 'OTHER', area: 'ACADEMIC', title: 'x' })).response.status).toBe(400);
    const e = await t.as('gt', '/api/guidance-content/plan/entries', 'POST', { year: '2026-2027', month: 11, kind: 'PARENT_SEMINAR', area: 'SOCIAL_EMOTIONAL', title: 'Ekran ve uyku semineri' });
    expect(e.response.status, e.text).toBe(201);
    await t.as('gt', '/api/guidance-content/plan/entries', 'POST', { year: '2026-2027', month: 9, kind: 'SURVEY', area: 'ACADEMIC', title: 'Öğrenci bilgi formu' });
    const p = await t.as('gt', '/api/guidance-content/plan?year=2026-2027');
    expect(p.data.plan).toMatchObject({ theme: 'Selamlaşma' });
    expect(p.data.entries.map((x: any) => x.month)).toEqual([9, 11]); // school-year order: September first
    expect((await t.as('gt', `/api/guidance-content/plan/entries/${e.data.id}`, 'PATCH', { status: 'DONE' })).response.status).toBe(200);
    for (const who of ['teacher', 'stuuser', 'parent', 'admin']) expect((await t.as(who, '/api/guidance-content/plan')).response.status, who).toBe(403);
  });

  it('gives an approved activity to a class teacher, who marks it done', async () => {
    const t = await setup();
    expect((await t.as('gt', '/api/guidance-content/activities')).data.activities).toEqual([]); // nothing approved yet
    expect((await t.as('gt', '/api/guidance-content/activities/assign', 'POST', { activityId: 'gac_bully_mid', classId: 'c8a' })).response.status).toBe(404);
    const rq = await t.as('admin', '/api/guidance-content/review');
    expect(rq.data.activities).toHaveLength(8); expect(rq.data.resources).toHaveLength(8);
    expect((await t.as('admin', '/api/guidance-content/review/activities/gac_bully_mid', 'POST', { decision: 'APPROVE' })).response.status).toBe(200);
    expect((await t.as('gt', '/api/guidance-content/activities/assign', 'POST', { activityId: 'gac_bully_mid', classId: 'c8b' })).response.status).toBe(403);
    expect((await t.as('gt', '/api/guidance-content/activities/assign', 'POST', { activityId: 'gac_bully_mid', classId: 'c8a', teacherId: 't2' })).response.status).toBe(400);
    const a = await t.as('gt', '/api/guidance-content/activities/assign', 'POST', { activityId: 'gac_bully_mid', classId: 'c8a', teacherId: 'teacher', dueDate: day(-3) });
    expect(a.response.status, a.text).toBe(201);
    const mine = await t.as('teacher', '/api/guidance-content/my-activities');
    expect(mine.data.assignments[0]).toMatchObject({ title: 'Zorbalığa seyirci kalma', class_name: '8-A', status: 'ASSIGNED' });
    expect(mine.data.assignments[0].steps.length).toBe(4);
    expect((await t.as('t2', `/api/guidance-content/my-activities/${a.data.id}`, 'PATCH', {})).response.status).toBe(404);
    expect((await t.as('teacher', `/api/guidance-content/my-activities/${a.data.id}`, 'PATCH', { note: 'Yapıldı, öğrenciler ilgiliydi.' })).response.status).toBe(200);
    expect((await t.as('gt', '/api/guidance-content/activities')).data.assignments[0]).toMatchObject({ status: 'DONE', teacher_note: 'Yapıldı, öğrenciler ilgiliydi.' });
  });

  it('shares approved resources with the right audience only', async () => {
    const t = await setup();
    expect((await t.as('gt', '/api/guidance-content/resources/grs_p_screen/share', 'POST', {})).response.status).toBe(404); // not approved
    for (const id of ['grs_p_screen', 'grs_s_exam']) await t.as('admin', `/api/guidance-content/review/resources/${id}`, 'POST', { decision: 'APPROVE' });
    expect((await t.as('gt', '/api/guidance-content/resources/grs_p_screen/share', 'POST', {})).response.status).toBe(201);
    expect((await t.as('gt', '/api/guidance-content/resources/grs_s_exam/share', 'POST', { classId: 'c8a' })).response.status).toBe(201);
    expect((await t.as('parent', '/api/guidance-content/resources/mine')).data.resources.map((r: any) => r.id)).toEqual(['grs_p_screen']);
    expect((await t.as('stuuser', '/api/guidance-content/resources/mine')).data.resources.map((r: any) => r.id)).toEqual(['grs_s_exam']);
    expect((await t.as('teacher', '/api/guidance-content/resources/mine')).data.resources).toEqual([]);
  });

  it('keeps the screen & sleep diary and raises a reasoned signal only after a week of high use', async () => {
    const t = await setup();
    expect((await t.as('stuuser', '/api/guidance-content/screen/mine', 'POST', { date: day(9), screenMinutes: 60 })).response.status).toBe(400);
    expect((await t.as('stuuser', '/api/guidance-content/screen/mine', 'POST', { screenMinutes: 2000 })).response.status).toBe(400);
    for (const n of [0, 1, 2, 3]) expect((await t.as('stuuser', '/api/guidance-content/screen/mine', 'POST', { date: day(n), screenMinutes: 300, bedtime: '00:15' })).response.status).toBe(200);
    expect((await t.as('parent', '/api/guidance-content/screen/mine', 'POST', { date: day(0), screenMinutes: 240, bedtime: '23:00', studentId: 's1' })).response.status).toBe(200);
    const w = await t.as('gt', '/api/guidance-center/warnings');
    expect(w.data.warnings.find((x: any) => x.key === 'SCREEN')).toMatchObject({ studentId: 's1', reason: 'Ekran günlüğünde son 7 günde 4 kayıt: günlük ortalama 5 sa 0 dk, 4 gece 23.30’dan sonra yatış.' });
    const c = await t.as('gt', '/api/guidance-content/screen/class?classId=c8a');
    expect(c.data.students.find((s: any) => s.id === 's1')).toMatchObject({ days: 4, avgMinutes: 300, lateNights: 4 });
    expect((await t.as('parent', '/api/guidance-content/screen/mine?studentId=s1')).data.logs).toHaveLength(5);
    expect((await t.as('teacher', '/api/guidance-content/screen/mine')).response.status).toBe(403);
  });
});
