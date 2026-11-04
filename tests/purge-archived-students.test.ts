import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { purgeArchivedStudents } from '../worker/lib/batch-lifecycle';

/**
 * Owner (4 Nov, KVKK): students archived by a deleted upload/exam (they take part in nothing) are deleted for good,
 * with what cascades from them; if something else still points at a student, the personal data is erased instead.
 * Foreign keys are switched on as in D1. Synthetic data only.
 */
async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec(`PRAGMA foreign_keys=ON;
    INSERT INTO student_entities(id,first_name,last_name,normalized_name,status,tckn) VALUES
      ('g1','SENTETIK','BIR','sentetik bir','ARCHIVED','10000000146'),
      ('g2','SENTETIK','IKI','sentetik iki','ARCHIVED',NULL),
      ('g3','SENTETIK','UC','sentetik uc','GUEST',NULL);
    INSERT INTO student_enrollments(id,student_id,institution_id,season_id,student_number,grade_level,section,status) VALUES
      ('e1','g1','school','season','901',8,'A','ARCHIVED'),('e2','g2','school','season','902',8,'A','ARCHIVED'),('e3','g3','school','season','903',8,'A','ACTIVE');
    INSERT INTO guest_profiles(student_id) VALUES('g1');
    INSERT INTO learning_nodes(id,academic_year,node_type,title) VALUES('ln_x','2026-2027','OUTCOME','Sentetik kazanım');
    INSERT INTO learning_evidence(id,student_id,node_id,source_type,source_id,result,weight) VALUES('ev1','g1','ln_x','EXAM','${t.examId}',1,1);
    INSERT INTO student_learning_state(student_id,node_id,mastery,confidence,evidence_count) VALUES('g1','ln_x',1,0.3,1);
    INSERT INTO activation_requests(id,institution_id,student_id,requested_by) VALUES('ar1','school','g2','admin');`);
  return t;
}
const count = (t: any, sql: string) => Number((t.db.prepare(sql).get() as any).n);

describe('archived students are deleted for good', () => {
  it('deletes an unreferenced archived student with enrolment, guest profile and learning data; erases one that is still referenced; leaves others', async () => {
    const t = await setup();
    try {
      const r = await purgeArchivedStudents(t.env as any);
      expect(r).toEqual({ deleted: 1, anonymized: 1 });
      expect(count(t, `SELECT count(*) n FROM student_entities WHERE id='g1'`)).toBe(0);
      expect(count(t, `SELECT count(*) n FROM student_enrollments WHERE student_id='g1'`)).toBe(0);
      expect(count(t, `SELECT count(*) n FROM learning_evidence WHERE student_id='g1'`)).toBe(0);
      expect(count(t, `SELECT count(*) n FROM student_learning_state WHERE student_id='g1'`)).toBe(0);
      expect(t.db.prepare(`SELECT first_name,last_name,tckn FROM student_entities WHERE id='g2'`).get()).toEqual({ first_name: 'Silinmiş', last_name: 'Öğrenci', tckn: null });
      expect(t.db.prepare(`SELECT student_number FROM student_enrollments WHERE id='e2'`).get()).toEqual({ student_number: null });
      expect(count(t, `SELECT count(*) n FROM student_entities WHERE id IN ('g3','s1')`)).toBe(2); // a guest and an active student stay
      // a second run does not touch the erased student again
      expect(await purgeArchivedStudents(t.env as any)).toEqual({ deleted: 0, anonymized: 0 });
      expect(count(t, `SELECT count(*) n FROM audit_logs WHERE action='ARCHIVED_STUDENTS_PURGED'`)).toBe(1);
    } finally { t.db.close(); }
  }, 60000);

  it('can be limited to given students', async () => {
    const t = await setup();
    try {
      expect(await purgeArchivedStudents(t.env as any, ['g2'])).toEqual({ deleted: 0, anonymized: 1 });
      expect(count(t, `SELECT count(*) n FROM student_entities WHERE id='g1'`)).toBe(1);
    } finally { t.db.close(); }
  }, 60000);
});
