import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
import { normalizeName } from '../worker/lib/db';
import app from '../worker/preview-policy-production-entry';

/**
 * A035: student optical sheets (Deimos). The booklet printed for a student is the same on every print of
 * the exam, the identity fields come from the student record, and only the right exams and classes print.
 * Real schema, production entry chain. Physical printing/calibration is checked by hand (K002).
 */
async function setup() {
  const t = await evaluatedExam('direct'); // s1 (ALI YILMAZ, no 101) sat the exam with booklet A
  t.db.exec(`INSERT INTO institutions(id,name,code,status) VALUES('other','Other School','OTHER','ACTIVE');
    INSERT INTO institution_seasons(id,institution_id,academic_year,status) VALUES('season2','other','2026-2027','ACTIVE');
    INSERT INTO classes(id,institution_id,season_id,grade_level,section,name,active) VALUES('c8a','school','season',8,'A','8/A',1),('cother','other','season2',8,'A','8/A',1);
    UPDATE student_enrollments SET class_id='c8a' WHERE student_id='s1';
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('mgr','INSTITUTION_MANAGER','M','u','u',1,'school'),('othermgr','INSTITUTION_MANAGER','O','u','u',1,'other');
    UPDATE optical_template_versions SET print_fields='{"fields":[]}' WHERE id='optik-7108-sekonic-v1';
    INSERT INTO exam_booklets(id,exam_id,code,active) SELECT 'bkB',id,'B',1 FROM exams WHERE title LIKE 'GIZLI%';`);
  const addStudent = (id: string, first: string, last: string, no: string) => {
    t.db.prepare('INSERT INTO student_entities(id,first_name,last_name,normalized_name,status) VALUES(?,?,?,?,?)').run(id, first, last, normalizeName(`${first} ${last}`), 'ACTIVE');
    t.db.prepare('INSERT INTO student_enrollments(id,student_id,institution_id,season_id,class_id,student_number,grade_level,section,status) VALUES(?,?,?,?,?,?,?,?,?)').run(`e_${id}`, id, 'school', 'season', 'c8a', no, 8, 'A', 'ACTIVE');
  };
  addStudent('s2', 'ZEYNEP', 'AK', '102'); addStudent('s3', 'BURAK', 'CAN', '103'); addStudent('s4', 'ECE', 'DAL', '104');
  const cookies: Record<string, string> = {};
  for (const id of ['admin', 'mgr', 'othermgr', 'teacher']) cookies[id] = (await createSession(t.env, id, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const prepare = async (as: string, q: Record<string, string>) => {
    const res = await (app as any).fetch(new Request(`https://app.anunex.com/api/optical-prepare?${new URLSearchParams({ classId: 'c8a', templateVersionId: 'optik-7108-sekonic-v1', ...q })}`, { headers: { Cookie: cookies[as] } }), t.env, { waitUntil() {} });
    const text = await res.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ }
    return { status: res.status, text, data };
  };
  const booklets = (r: any) => Object.fromEntries(r.data.students.map((s: any) => [s.id, s.booklet_code]));
  return { ...t, prepare, booklets, addStudent };
}

describe('A035: student optical sheets', () => {
  it('each student keeps the same booklet on every print, whatever the order; a new student gets the least used booklet; the sheet booklet wins', async () => {
    const t = await setup();
    try {
      const first = await t.prepare('mgr', { examId: t.examId, sort: 'number' });
      expect(first.status, first.text).toBe(200);
      expect(first.data.bookletCodes).toEqual(['A', 'B']);
      const b1 = t.booklets(first);
      expect(b1.s1).toBe('A'); // read from the evaluated sheet
      expect(Object.values(b1).filter((x) => x === 'A').length).toBe(2);
      expect(Object.values(b1).filter((x) => x === 'B').length).toBe(2);
      expect(first.data.students.map((s: any) => [s.student_number, s.first_name, s.last_name])).toEqual([['101', 'ALI', 'YILMAZ'], ['102', 'ZEYNEP', 'AK'], ['103', 'BURAK', 'CAN'], ['104', 'ECE', 'DAL']]);
      // name order and repeat prints keep every booklet
      expect(t.booklets(await t.prepare('mgr', { examId: t.examId, sort: 'name' }))).toEqual(b1);
      expect(t.booklets(await t.prepare('admin', { examId: t.examId }))).toEqual(b1);
      // a student added later keeps the class balanced and changes nobody else
      t.addStudent('s5', 'ADA', 'AY', '099');
      const after = t.booklets(await t.prepare('mgr', { examId: t.examId, sort: 'number' }));
      expect({ ...after, s5: undefined }).toEqual({ ...b1, s5: undefined });
      expect(['A', 'B']).toContain(after.s5);
      expect(t.db.prepare('SELECT count(*) c FROM optical_print_booklets WHERE exam_id=?').get(t.examId)).toEqual({ c: 4 });
    } finally { t.db.close(); }
  }, 60000);

  it('only the right people, classes and exams print', async () => {
    const t = await setup();
    try {
      expect((await t.prepare('teacher', { examId: t.examId })).status).toBe(403);
      expect((await t.prepare('othermgr', { examId: t.examId })).status).toBe(403);
      // a central exam not assigned to this institution
      t.db.prepare(`UPDATE exam_institutions SET enabled=0 WHERE exam_id=?`).run(t.examId);
      expect((await t.prepare('mgr', { examId: t.examId })).data.error.code).toBe('EXAM_NOT_FOUND');
      t.db.prepare(`UPDATE exam_institutions SET enabled=1 WHERE exam_id=?`).run(t.examId);
      expect((await t.prepare('mgr', { examId: t.examId })).status).toBe(200);
      // removed from the app
      t.db.prepare(`UPDATE exam_revision_state SET app_trashed_at=CURRENT_TIMESTAMP WHERE exam_id=?`).run(t.examId);
      expect((await t.prepare('mgr', { examId: t.examId })).data.error.code).toBe('EXAM_NOT_FOUND');
      // a booklet the exam does not have
      t.db.prepare(`UPDATE exam_revision_state SET app_trashed_at=NULL WHERE exam_id=?`).run(t.examId);
      expect((await t.prepare('mgr', { examId: t.examId, bookletSet: 'C' })).data.error.code).toBe('BOOKLET_INVALID');
    } finally { t.db.close(); }
  }, 60000);
});
