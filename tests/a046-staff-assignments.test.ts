import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
import app from '../worker/preview-policy-production-entry';

/**
 * A046: staff and subject assignment. Teachers and guidance teachers work with the right class, subject and
 * institution; removing a permission takes effect on the next request. Real schema, production entry chain.
 */
async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT INTO institutions(id,name,code,status) VALUES('other','Other School','OTHER','ACTIVE');
    INSERT INTO institution_seasons(id,institution_id,academic_year,status) VALUES('season2','other','2026-2027','ACTIVE');
    INSERT INTO classes(id,institution_id,season_id,grade_level,section,name) VALUES('c8a','school','season',8,'A','8/A'),('c8b','school','season',8,'B','8/B'),('co','other','season2',8,'A','8/A');
    UPDATE student_enrollments SET class_id='c8a' WHERE student_number='101';
    INSERT INTO student_entities(id,first_name,last_name,normalized_name,status) VALUES('s2','CAN','ER','can er','ACTIVE'),('s3','EDA','OK','eda ok','ACTIVE');
    INSERT INTO student_enrollments(id,student_id,institution_id,season_id,class_id,student_number,grade_level,section,status) VALUES('e2','s2','school','season','c8b','102',8,'B','ACTIVE'),('e3','s3','other','season2','co','301',8,'A','ACTIVE');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('mgr','INSTITUTION_MANAGER','M','u','u',1,'school'),('othermgr','INSTITUTION_MANAGER','O','u','u',1,'other'),('guide','GUIDANCE_TEACHER','G','u','u',1,'school'),('tother','TEACHER','T','u','u',1,'other');`);
  const cookies: Record<string, string> = {};
  for (const id of ['mgr', 'othermgr', 'teacher', 'guide']) cookies[id] = (await createSession(t.env, id, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const as = async (who: string, path: string, method = 'GET', body?: any) => {
    const res = await (app as any).fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookies[who], Origin: 'https://app.anunex.com', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), t.env, { waitUntil() {} });
    const text = await res.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ } return { status: res.status, text, data };
  };
  const students = async (who: string) => ((await as(who, '/api/students')).data.students || []).map((s: any) => s.student_number).sort();
  const classes = async (who: string) => ((await as(who, '/api/classes')).data.classes || []).map((c: any) => c.id).sort();
  return { ...t, as, students, classes };
}

describe('A046: staff and subject assignment', () => {
  it('a teacher sees only assigned classes; guidance covers its class; removal is immediate; deactivation closes the session', async () => {
    const t = await setup();
    try {
      expect(await t.students('teacher')).toEqual([]);
      const a = await t.as('mgr', '/api/teacher-assignments', 'POST', { userId: 'teacher', classId: 'c8a', subjectId: 'sub_tur', assignmentType: 'SUBJECT' });
      expect(a.status, a.text).toBe(201);
      expect(await t.students('teacher')).toEqual(['101']);
      expect(await t.classes('teacher')).toEqual(['c8a']);
      // a subject assignment needs a subject; duplicates refused
      expect((await t.as('mgr', '/api/teacher-assignments', 'POST', { userId: 'teacher', classId: 'c8b', assignmentType: 'SUBJECT' })).status).toBe(400);
      expect((await t.as('mgr', '/api/teacher-assignments', 'POST', { userId: 'teacher', classId: 'c8a', subjectId: 'sub_tur', assignmentType: 'SUBJECT' })).status).toBe(409);
      // guidance: the class's students, no subject
      expect((await t.as('mgr', '/api/teacher-assignments', 'POST', { userId: 'guide', classId: 'c8b', assignmentType: 'GUIDANCE' })).status).toBe(201);
      expect(await t.students('guide')).toEqual(['102']);

      // removal applies on the next request
      expect((await t.as('mgr', `/api/teacher-assignments/${a.data.id}/status`, 'PATCH', { active: false })).status).toBe(200);
      expect(await t.students('teacher')).toEqual([]);
      expect(await t.classes('teacher')).toEqual([]);
      // deactivating the account closes the open session at once
      expect((await t.as('mgr', '/api/users/guide/status', 'PATCH', { active: false })).status).toBe(200);
      expect((await t.as('guide', '/api/students')).status).toBe(401);
    } finally { t.db.close(); }
  }, 60000);

  it('no cross-institution assignment; another school cannot change ours; a teacher who moved keeps no old classes', async () => {
    const t = await setup();
    try {
      // a class or a teacher of another school cannot be used
      expect((await t.as('mgr', '/api/teacher-assignments', 'POST', { userId: 'teacher', classId: 'co', subjectId: 'sub_tur', assignmentType: 'SUBJECT' })).status).toBe(404);
      expect((await t.as('mgr', '/api/teacher-assignments', 'POST', { userId: 'tother', classId: 'c8a', subjectId: 'sub_tur', assignmentType: 'SUBJECT' })).status).toBe(404);
      const a = await t.as('mgr', '/api/teacher-assignments', 'POST', { userId: 'teacher', classId: 'c8a', subjectId: 'sub_tur', assignmentType: 'SUBJECT' });
      expect((await t.as('othermgr', `/api/teacher-assignments/${a.data.id}/status`, 'PATCH', { active: false })).status).toBe(403);
      expect((await t.as('othermgr', '/api/teacher-assignments')).data.assignments.map((x: any) => x.id)).not.toContain(a.data.id);
      // the teacher moves to the other school; the old assignment stays recorded but no longer counts
      t.db.exec(`UPDATE users SET institution_id='other' WHERE id='teacher'`);
      const { loadPermissionScope } = await import('../worker/lib/permissions');
      const scope = await loadPermissionScope(t.env.DB, { id: 'teacher', role: 'TEACHER', institution_id: 'other' } as any, null);
      expect(scope.classIds).toEqual([]);
      expect(await t.students('teacher')).toEqual([]);
    } finally { t.db.close(); }
  }, 60000);
});
