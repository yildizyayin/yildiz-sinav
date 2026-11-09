import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
import app from '../worker/preview-policy-production-entry';

/**
 * Owner (9 Nov): no student could sign in to the app. An institution opens its students' accounts in one step and
 * prints sign-in cards: username = institution code + student number, a temporary password shown once, changed at
 * first sign-in. Synthetic data only.
 */
describe('student accounts with sign-in cards', () => {
  it('opens accounts for the selected students, skips what it cannot do, and the card signs in', async () => {
    const t = await evaluatedExam('direct');
    try {
      t.db.exec(`UPDATE institutions SET code='999001' WHERE id='school';
        INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('mgr','INSTITUTION_MANAGER','Müdür','u','u',1,'school');
        INSERT INTO student_entities(id,first_name,last_name,normalized_name,status) VALUES('s2','Ayşe','Deneme','ayse deneme','ACTIVE'),('s3','Can','Numarasız','can numarasiz','ACTIVE');
        INSERT INTO student_enrollments(id,student_id,institution_id,season_id,student_number,grade_level,section,status) VALUES('enr2','s2','school','season','0102',8,'A','ACTIVE'),('enr3','s3','school','season','',8,'A','ACTIVE');`);
      const cookie = (await createSession(t.env, 'mgr', new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
      const call = async (path: string, body: any, c = cookie) => { const r = await (app as any).fetch(new Request('https://app.anunex.com' + path, { method: 'POST', headers: { Cookie: c, Origin: 'https://app.anunex.com', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), t.env, { waitUntil() {} }); const text = await r.text(); return { status: r.status, data: JSON.parse(text), text }; };
      const r = await call('/api/students/access-accounts/auto', { studentIds: ['s1', 's2', 's3'] });
      expect(r.status, r.text).toBe(201);
      expect(r.data.created).toHaveLength(1);
      expect(r.data.created[0]).toMatchObject({ studentId: 's2', name: 'Ayşe Deneme', username: '999001-0102', gradeLevel: 8, section: 'A' });
      expect(r.data.created[0].password).toMatch(/^.{12}$/);
      expect(r.data.skipped.map((s: any) => s.reason).join(' | ')).toMatch(/Hesabı zaten açık.*numarası yok|numarası yok.*Hesabı zaten açık/);
      const user = t.db.prepare(`SELECT role,username,must_change_password,institution_id,password_hash FROM users WHERE student_id='s2'`).get() as any;
      expect(user).toMatchObject({ role: 'STUDENT', username: '999001-0102', must_change_password: 1, institution_id: 'school' });
      expect(user.password_hash).not.toContain(r.data.created[0].password);
      expect((t.db.prepare(`SELECT count(*) n FROM audit_logs WHERE action='STUDENT_ACCESS_CREATED'`).get() as any).n).toBe(1);
      // the card signs in, and the first thing asked is a new password
      const login = await (app as any).fetch(new Request('https://app.anunex.com/api/auth/login', { method: 'POST', headers: { Origin: 'https://app.anunex.com', 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: '999001-0102', password: r.data.created[0].password }) }), t.env, { waitUntil() {} });
      expect(login.status, await login.clone().text()).toBe(200);
      const session = login.headers.get('Set-Cookie')!.split(';')[0];
      const me = await (app as any).fetch(new Request('https://app.anunex.com/api/auth/me', { headers: { Cookie: session, Origin: 'https://app.anunex.com' } }), t.env, { waitUntil() {} });
      expect((await me.json()).user).toMatchObject({ role: 'STUDENT', must_change_password: true, student_id: 's2' });
      // a second run opens nothing again
      const again = await call('/api/students/access-accounts/auto', { studentIds: ['s2'] });
      expect(again.data.created).toHaveLength(0);
      // a student cannot open accounts
      const stu = (await createSession(t.env, 'stuuser', new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
      expect((await call('/api/students/access-accounts/auto', { studentIds: ['s3'] }, stu)).status).toBe(403);
    } finally { t.db.close(); }
  }, 60000);
});
