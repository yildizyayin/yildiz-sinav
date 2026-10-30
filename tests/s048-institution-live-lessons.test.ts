import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
import { validJoinUrl } from '../worker/lib/institution-live-lessons';

/** S048: the institution's own live lessons — plan with its Zoom/Teams/Meet link, the class sees "Derse katıl". */
async function world(enabled = true) {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT INTO classes(id,institution_id,season_id,grade_level,section,name,active) VALUES('c8a','school','season',8,'A','8-A',1),('c8b','school','season',8,'B','8-B',1);
    UPDATE student_enrollments SET class_id='c8a' WHERE id='enr1';
    INSERT INTO teacher_assignments(id,user_id,institution_id,season_id,class_id,assignment_type,active) VALUES('ta1','teacher','school','season','c8a','SUBJECT',1);
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('mgr','INSTITUTION_MANAGER','Müdür','u','u',1,'school');
    INSERT INTO institutions(id,name,code,status) VALUES('other','Başka Okul','OTHER','ACTIVE');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('mgr2','INSTITUTION_MANAGER','Başka Müdür','u','u',1,'other');`);
  if (enabled) t.db.exec(`INSERT INTO institution_feature_overrides(institution_id,feature_key,enabled) VALUES('school','LIVE',1),('other','LIVE',1);`);
  const cookies: Record<string, string> = {};
  const as = async (who: string, path: string, method = 'GET', body?: any) => {
    if (['mgr', 'mgr2'].includes(who)) {
      if (!cookies[who]) cookies[who] = (await createSession(t.env, who, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
      const app = (await import('../worker/preview-policy-production-entry')).default as any;
      const r = await app.fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookies[who], Origin: 'https://app.anunex.com', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), t.env, { waitUntil() {}, passThroughOnException() {} });
      return { status: r.status, data: await r.json() as any };
    }
    const r = await t.request(path, method, body, who);
    return { status: r.response.status, data: r.data };
  };
  return { t, as };
}

const soon = () => new Date(Date.now() + 5 * 60000).toISOString();
const later = () => new Date(Date.now() + 2 * 86400000).toISOString();

describe('S048 kurum canlı dersi', () => {
  it('accepts only https links on the chosen provider', () => {
    expect(validJoinUrl('ZOOM', 'https://us02web.zoom.us/j/123')).toBeTruthy();
    expect(validJoinUrl('ZOOM', 'https://zoom.us.evil.example/j/1')).toBeNull();
    expect(validJoinUrl('TEAMS', 'https://teams.microsoft.com/l/meetup-join/x')).toBeTruthy();
    expect(validJoinUrl('MEET', 'https://meet.google.com/abc-defg-hij')).toBeTruthy();
    expect(validJoinUrl('MEET', 'http://meet.google.com/abc')).toBeNull();
    expect(validJoinUrl('OTHER', 'javascript:alert(1)')).toBeNull();
    expect(validJoinUrl('OTHER', 'https://user:pw@example.com/x')).toBeNull();
  });

  it('is closed for institutions without the app feature', async () => {
    const { as } = await world(false);
    expect((await as('mgr', '/api/live-lessons')).status).toBe(403);
    expect((await as('stuuser', '/api/live-lessons')).status).toBe(403);
  });

  it('plans per class, shows the link to that class only around the lesson, and keeps schools apart', async () => {
    const { t, as } = await world();
    const bad = await as('mgr', '/api/live-lessons', 'POST', { title: 'Mat', provider: 'ZOOM', joinUrl: 'https://meet.google.com/x', startsAt: soon(), durationMinutes: 40, classIds: ['c8a'] });
    expect(bad.data.error.code).toBe('JOIN_URL_INVALID');
    const ok = await as('mgr', '/api/live-lessons', 'POST', { title: 'Matematik · Üslü sayılar', provider: 'ZOOM', joinUrl: 'https://us02web.zoom.us/j/111', startsAt: soon(), durationMinutes: 40, classIds: ['c8a', 'c8b'] });
    expect(ok.status).toBe(201);
    expect(ok.data.ids).toHaveLength(2);
    await as('mgr', '/api/live-lessons', 'POST', { title: 'Fen', provider: 'MEET', joinUrl: 'https://meet.google.com/abc-defg-hij', startsAt: later(), durationMinutes: 40, classIds: ['c8a'] });

    const student = await as('stuuser', '/api/live-lessons');
    expect(student.data.lessons.map((l: any) => l.class_id)).toEqual(['c8a', 'c8a']);
    const [now, future] = student.data.lessons;
    expect(now.joinOpen).toBe(true);
    expect(now.join_url).toBe('https://us02web.zoom.us/j/111');
    expect(future.joinOpen).toBe(false);
    expect(future.join_url).toBeNull();
    expect((await as('parent', '/api/live-lessons')).data.lessons).toHaveLength(2);
    expect((await as('stuuser', '/api/live-lessons', 'POST', { title: 'x' })).status).toBe(403);

    // The other school sees none of it and cannot cancel it.
    expect((await as('mgr2', '/api/live-lessons')).data.lessons).toHaveLength(0);
    expect((await as('mgr2', `/api/live-lessons/${ok.data.ids[0]}/cancel`, 'POST')).status).toBe(403);

    // A teacher plans only for assigned classes.
    expect((await as('teacher', '/api/live-lessons', 'POST', { title: 'T', provider: 'TEAMS', joinUrl: 'https://teams.microsoft.com/l/x', startsAt: later(), durationMinutes: 30, classIds: ['c8b'] })).status).toBe(403);
    expect((await as('teacher', '/api/live-lessons', 'POST', { title: 'T', provider: 'TEAMS', joinUrl: 'https://teams.microsoft.com/l/x', startsAt: later(), durationMinutes: 30, classIds: ['c8a'] })).status).toBe(201);

    // Cancelled lessons disappear for students.
    expect((await as('mgr', `/api/live-lessons/${ok.data.ids[0]}/cancel`, 'POST')).status).toBe(200);
    expect((await as('stuuser', '/api/live-lessons')).data.lessons.map((l: any) => l.title)).not.toContain('Matematik · Üslü sayılar');
    expect((t.db.prepare(`SELECT count(*) n FROM institution_live_lessons`).get() as any).n).toBe(4);
  });

  it('lets the manager open and close the remote-teaching period', async () => {
    const { as } = await world();
    const today = new Date().toISOString().slice(0, 10);
    const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    expect((await as('teacher', '/api/live-lessons/remote-mode', 'PUT', { startsOn: today, endsOn: week })).status).toBe(403);
    expect((await as('mgr', '/api/live-lessons/remote-mode', 'PUT', { startsOn: week, endsOn: today })).status).toBe(400);
    expect((await as('mgr', '/api/live-lessons/remote-mode', 'PUT', { startsOn: today, endsOn: week, note: 'Okul kapalı' })).status).toBe(200);
    expect((await as('stuuser', '/api/live-lessons')).data.remoteMode).toMatchObject({ starts_on: today, ends_on: week, note: 'Okul kapalı' });
    expect((await as('mgr', '/api/live-lessons/remote-mode', 'PUT', { off: true })).status).toBe(200);
    expect((await as('stuuser', '/api/live-lessons')).data.remoteMode).toBeNull();
  });
});
