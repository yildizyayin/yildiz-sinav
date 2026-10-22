import { describe, expect, it } from 'vitest';
import { evaluatedExam, TITLE } from './helpers/exam-flow';
import { createSession, hashPassword } from '../worker/lib/auth';
import app from '../worker/preview-policy-production-entry';

/**
 * A047: parent–student link. The right child is visible; removing the link cuts access at once; a phone
 * number alone never grants access. Real schema, production entry chain, synthetic data.
 */
async function setup() {
  const t = await evaluatedExam('direct', { outcomes: true });
  expect((await t.request(`/api/platform/exam-center/${t.examId}/freeze`, 'POST')).response.status).toBe(200);
  expect((await t.request(`/api/platform/exam-center/${t.examId}/publish`, 'POST')).response.status).toBe(200);
  t.db.exec(`INSERT INTO student_entities(id,first_name,last_name,normalized_name,status) VALUES('s2','CAN','ER','can er','ACTIVE');
    INSERT INTO student_enrollments(id,student_id,institution_id,season_id,student_number,grade_level,section,status) VALUES('e2','s2','school','season','102',8,'A','ACTIVE');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('mgr','INSTITUTION_MANAGER','M','u','u',1,'school');`);
  const cookies: Record<string, string> = {};
  for (const id of ['mgr', 'parent']) cookies[id] = (await createSession(t.env, id, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const as = async (who: string | null, path: string, method = 'GET', body?: any) => {
    const res = await (app as any).fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { ...(who ? { Cookie: cookies[who] } : {}), Origin: 'https://app.anunex.com', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), t.env, { waitUntil() {} });
    const text = await res.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ } return { status: res.status, text, data };
  };
  return { ...t, as };
}
const childIds = async (t: any) => ((await t.as('parent', '/api/reporting/students')).data.students || []).map((s: any) => s.id).sort();

describe('A047: parent–student link', () => {
  it('the parent sees their own child only; a new link shows the child; removing it cuts access at once', async () => {
    const t = await setup();
    try {
      expect(await childIds(t)).toEqual(['s1']);
      expect((await t.as('parent', '/api/my-results?studentId=s1')).text).toContain(TITLE);
      // not linked: s2 is not visible
      const before = await t.as('parent', '/api/reporting/students/s2/combined');
      expect([403, 404]).toContain(before.status);
      expect((await t.as('parent', '/api/my-results?studentId=s2')).text).not.toContain('CAN');

      expect((await t.as('mgr', '/api/parents/parent/links', 'POST', { studentId: 's2' })).status).toBe(200);
      expect(await childIds(t)).toEqual(['s1', 's2']);
      expect((await t.as('mgr', '/api/parents/parent/links/s1', 'DELETE')).status).toBe(200);
      // the next request no longer shows s1 anywhere
      expect(await childIds(t)).toEqual(['s2']);
      expect((await t.as('parent', '/api/my-results?studentId=s1')).text).not.toContain(TITLE);
      expect([403, 404]).toContain((await t.as('parent', '/api/reporting/students/s1/combined')).status);
      const audits = t.db.prepare(`SELECT action FROM audit_logs WHERE action LIKE 'PARENT_STUDENT_%' ORDER BY rowid`).all().map((r: any) => r.action);
      expect(audits).toEqual(['PARENT_STUDENT_LINKED', 'PARENT_STUDENT_UNLINKED']);
    } finally { t.db.close(); }
  }, 90000);

  it('a phone number alone never logs in; a phone shared by two accounts is decided by the password, never by order', async () => {
    const t = await setup();
    try {
      const pa = await hashPassword('Veli-Parola-2026'), te = await hashPassword('Ogretmen-Parola-2026');
      t.db.prepare(`UPDATE users SET phone='05551112233',password_hash=?,password_salt=?,password_iterations=?,password_algo='PBKDF2-SHA256-v1' WHERE id='parent'`).run(pa.hash, pa.salt, pa.iterations);
      t.db.prepare(`UPDATE users SET phone='05551112233',password_hash=?,password_salt=?,password_iterations=?,password_algo='PBKDF2-SHA256-v1' WHERE id='teacher'`).run(te.hash, te.salt, te.iterations);
      const login = async (password: string) => { const r = await t.as(null, '/api/auth/login', 'POST', { identifier: '05551112233', password }); const cookie = r.status === 200 ? true : false; return { status: r.status, code: r.data?.error?.code, cookie }; };
      expect(await login('yanlis-parola')).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
      // each password opens its own account, whichever row comes first
      const asParent = await t.as(null, '/api/auth/login', 'POST', { identifier: '05551112233', password: 'Veli-Parola-2026' });
      expect(asParent.status, asParent.text).toBe(200);
      const asTeacher = await t.as(null, '/api/auth/login', 'POST', { identifier: '05551112233', password: 'Ogretmen-Parola-2026' });
      expect(asTeacher.status).toBe(200);
      const sid = (r: any) => t.db.prepare(`SELECT u.role FROM sessions s JOIN users u ON u.id=s.user_id ORDER BY s.created_at DESC,s.rowid DESC LIMIT 1`).get() as any;
      expect(sid(asTeacher).role).toBe('TEACHER');
      // same password on both: refused, ask for the username
      t.db.prepare(`UPDATE users SET password_hash=?,password_salt=?,password_iterations=? WHERE id='teacher'`).run(pa.hash, pa.salt, pa.iterations);
      expect(await login('Veli-Parola-2026')).toMatchObject({ status: 401, code: 'PHONE_AMBIGUOUS' });
    } finally { t.db.close(); }
  }, 90000);
});
