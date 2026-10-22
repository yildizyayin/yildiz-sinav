import { describe, expect, it } from 'vitest';
import { evaluatedExam, TITLE } from './helpers/exam-flow';
import { createSession, hashPassword } from '../worker/lib/auth';
import app from '../worker/preview-policy-production-entry';

/**
 * A032b: the Super Admin owns the system. They see every institution's participants whether or not their
 * own account is bound to an institution, and in a dispute they can suspend, freeze, reactivate or delete
 * (reversibly) an institution together with every account bound to it. Real schema, production entry chain.
 */
const PASSWORD = 'Sentetik-Parola-2026';
async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT INTO institutions(id,name,code,status) VALUES('other','Other School','OTHER','ACTIVE');
    INSERT INTO institution_seasons(id,institution_id,academic_year,status) VALUES('season2','other','2026-2027','ACTIVE');`);
  const h = await hashPassword(PASSWORD);
  const add = (id: string, role: string, inst: string | null, username: string, extra = '') => t.db.prepare(`INSERT INTO users(id,role,display_name,username,password_hash,password_salt,password_iterations,password_algo,active,institution_id${extra ? ',student_id' : ''}) VALUES(?,?,?,?,?,?,?,'PBKDF2-SHA256-v1',1,?${extra ? ',?' : ''})`).run(...[id, role, id, username, h.hash, h.salt, h.iterations, inst, ...(extra ? [extra] : [])]);
  add('mgr', 'INSTITUTION_MANAGER', 'school', 'mgr.school');
  add('tch', 'TEACHER', 'school', 'tch.school');
  add('admin2', 'SUPER_ADMIN', 'school', 'owner.admin');
  add('othermgr', 'INSTITUTION_MANAGER', 'other', 'mgr.other');
  t.db.prepare(`UPDATE users SET username='stu.school',password_hash=?,password_salt=?,password_iterations=?,password_algo='PBKDF2-SHA256-v1' WHERE id='stuuser'`).run(h.hash, h.salt, h.iterations);
  t.db.prepare(`UPDATE users SET username='parent.school',password_hash=?,password_salt=?,password_iterations=?,password_algo='PBKDF2-SHA256-v1' WHERE id IN ('parent')`).run(h.hash, h.salt, h.iterations);
  // a participant of the other institution in the same central exam
  t.db.exec(`INSERT INTO exam_institutions(id,exam_id,institution_id,enabled) VALUES('ei2','${t.examId}','other',1);
    INSERT INTO student_entities(id,first_name,last_name,normalized_name,status) VALUES('s9','X','Y','x y','ACTIVE');
    INSERT INTO exam_participants(id,exam_id,institution_id,season_id,student_id,name_snapshot,participant_status) VALUES('p9','${t.examId}','other','season2','s9','X Y','ACTIVE');`);
  const fetchAs = async (cookie: string | null, path: string, method = 'GET', body?: any) => {
    const res = await (app as any).fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), Origin: 'https://app.anunex.com', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), t.env, { waitUntil() {} });
    const text = await res.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ }
    return { status: res.status, text, data };
  };
  const session = async (id: string) => (await createSession(t.env, id, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const login = async (username: string) => { const r = await fetchAs(null, '/api/auth/login', 'POST', { identifier: username, password: PASSWORD }); return r.status; };
  return { ...t, fetchAs, session, login };
}
const SCHOOL_ACCOUNTS = ['mgr.school', 'tch.school', 'stu.school', 'parent.school'];

describe('A032b: Super Admin and institution lifecycle', () => {
  it('a Super Admin bound to an institution still sees every institution’s participants', async () => {
    const t = await setup();
    try {
      for (const id of ['admin', 'admin2']) {
        const c = await t.session(id);
        const row = (await t.fetchAs(c, '/api/platform/exam-center/catalog')).data.exams.find((r: any) => r.id === t.examId);
        expect(row, id).toMatchObject({ participant_count: 3 });
        expect((await t.fetchAs(c, '/api/institutions')).data.institutions.map((i: any) => i.id)).toEqual(expect.arrayContaining(['school', 'other']));
      }
    } finally { t.db.close(); }
  }, 60000);

  it('suspend, freeze and delete close every account of the institution; reactivate and restore open them; the Super Admin is never locked out', async () => {
    const t = await setup();
    try {
      for (const u of SCHOOL_ACCOUNTS) expect(await t.login(u), u).toBe(200);
      const open = { mgr: await t.session('mgr'), stu: await t.session('stuuser'), parent: await t.session('parent') };
      const admin = await t.session('admin2'); // a Super Admin whose own account is bound to this institution

      const pause = await t.fetchAs(admin, '/api/institutions/school/status', 'POST', { status: 'PASSIVE', reason: 'Sözleşme anlaşmazlığı' });
      expect(pause.status, pause.text).toBe(200);
      expect(pause.data).toMatchObject({ status: 'PASSIVE', previousStatus: 'ACTIVE', accounts: 5 });
      for (const u of SCHOOL_ACCOUNTS) expect(await t.login(u), u).toBe(403);
      for (const [who, c] of Object.entries(open)) expect((await t.fetchAs(c, '/api/dashboard')).status, who).toBe(401);
      expect(await t.login('mgr.other')).toBe(200);
      expect(await t.login('owner.admin')).toBe(200);
      // the Super Admin bound to this institution keeps their open session
      expect((await t.fetchAs(admin, '/api/institutions')).status).toBe(200);
      for (const path of ['/api/dashboard', '/api/platform/exam-center/catalog', `/api/exam-definitions/${t.examId}`]) expect((await t.fetchAs(admin, path)).status, path).toBe(200);

      const freeze = await t.fetchAs(admin, '/api/institutions/school/status', 'POST', { status: 'FROZEN' });
      expect(freeze.data).toMatchObject({ status: 'FROZEN', previousStatus: 'PASSIVE' });
      for (const u of SCHOOL_ACCOUNTS) expect(await t.login(u), u).toBe(403);

      const react = await t.fetchAs(admin, '/api/institutions/school/status', 'POST', { status: 'ACTIVE' });
      expect(react.data).toMatchObject({ status: 'ACTIVE', previousStatus: 'FROZEN' });
      for (const u of SCHOOL_ACCOUNTS) expect(await t.login(u), u).toBe(200);

      expect((await t.fetchAs(admin, '/api/institutions/school/status', 'POST', { status: 'ARCHIVED', reason: 'kısa' })).data.error.code).toBe('REASON_REQUIRED');
      const del = await t.fetchAs(admin, '/api/institutions/school/status', 'POST', { status: 'ARCHIVED', reason: 'Kurumla sözleşme feshedildi.' });
      expect(del.status, del.text).toBe(200);
      for (const u of SCHOOL_ACCOUNTS) expect(await t.login(u), u).toBe(403);
      expect((await t.fetchAs(admin, '/api/institutions')).data.institutions.map((i: any) => i.id)).not.toContain('school');
      expect((await t.fetchAs(admin, '/api/institutions?archived=1')).data.institutions.map((i: any) => [i.id, i.lifecycle_status])).toEqual([['school', 'ARCHIVED']]);
      // data is kept
      expect((t.db.prepare(`SELECT count(*) c FROM exam_participants WHERE institution_id='school'`).get() as any).c).toBe(2);
      expect((t.db.prepare(`SELECT count(*) c FROM users WHERE institution_id='school'`).get() as any).c).toBe(6);

      const restore = await t.fetchAs(admin, '/api/institutions/school/status', 'POST', { status: 'ACTIVE' });
      expect(restore.data).toMatchObject({ status: 'ACTIVE', previousStatus: 'ARCHIVED' });
      for (const u of SCHOOL_ACCOUNTS) expect(await t.login(u), u).toBe(200);
      expect((await t.fetchAs(admin, '/api/institutions')).data.institutions.map((i: any) => i.id)).toContain('school');

      const events = t.db.prepare(`SELECT action,previous_status p,next_status n FROM institution_governance_events WHERE institution_id='school' ORDER BY rowid`).all().map((r: any) => `${r.action}:${r.p}>${r.n}`);
      expect(events).toEqual(['PASSIVE:ACTIVE>PASSIVE', 'FREEZE:PASSIVE>FROZEN', 'UNFREEZE:FROZEN>ACTIVE', 'ARCHIVE:ACTIVE>ARCHIVED', 'RESTORE:ARCHIVED>ACTIVE']);
      const audits = t.db.prepare(`SELECT action FROM audit_logs WHERE entity_type='institution' AND entity_id='school' ORDER BY rowid`).all().map((r: any) => r.action);
      expect(audits).toEqual(['INSTITUTION_PAUSED', 'INSTITUTION_FROZEN', 'INSTITUTION_REACTIVATED', 'INSTITUTION_DELETED', 'INSTITUTION_REACTIVATED']);
    } finally { t.db.close(); }
  }, 90000);

  it('only the Super Admin changes an institution’s lifecycle; a deleted institution leaves the exam assignment list', async () => {
    const t = await setup();
    try {
      for (const id of ['mgr', 'tch', 'othermgr']) expect((await t.fetchAs(await t.session(id), '/api/institutions/other/status', 'POST', { status: 'PASSIVE' })).status, id).toBe(403);
      const admin = await t.session('admin');
      expect((await t.fetchAs(admin, '/api/institutions/other/status', 'POST', { status: 'ARCHIVED', reason: 'Kurum kapatıldı, sözleşme bitti.' })).status).toBe(200);
      const assign = await t.fetchAs(admin, `/api/exam-definitions/${t.examId}/institutions`);
      if (assign.status === 200) expect(assign.text).not.toContain('Other School');
      expect(TITLE).toBeTruthy();
    } finally { t.db.close(); }
  }, 60000);
});
