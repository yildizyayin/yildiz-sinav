import { expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/** Owner (9 Nov): the institution home leads with today's work, within its own institution. Synthetic data only. */
it('lists classes missing today\'s attendance, students without accounts and classes without a teacher', async () => {
  const t = await evaluatedExam('direct');
  try {
    t.db.exec(`INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('mgr','INSTITUTION_MANAGER','Müdür','unused','unused',1,'school');
      INSERT INTO classes(id,institution_id,season_id,grade_level,section,name,active) VALUES('c8a','school','season',8,'A','8/A',1),('c8b','school','season',8,'B','8/B',1);
      UPDATE student_enrollments SET class_id='c8a' WHERE id='enr1';
      INSERT INTO teacher_assignments(id,user_id,institution_id,season_id,class_id,subject_id,assignment_type,active) VALUES('ta1','teacher','school','season','c8a','sub_mat','SUBJECT',1);`);
    const r = await t.request('/api/v2/institution-dashboard?institutionId=school', 'GET', undefined, 'admin');
    expect(r.response.status, r.text).toBe(200);
    const today = r.data.today;
    expect(today.attendanceMissing.map((c: any) => c.name)).toEqual(['8/A']); // 8/B has no students
    expect(today.classesWithoutTeacher.map((c: any) => c.name)).toEqual(['8/B']);
    expect(today.studentsWithoutAccount).toBe(0); // the synthetic student already has a student account
    expect(today.studentsWithoutNumber).toBe(0);
    t.db.exec(`UPDATE users SET active=0 WHERE id='stuuser';
      INSERT INTO attendance_period_sessions(id,institution_id,class_id,attendance_date,session_type,period_no,status,created_by) VALUES('as1','school','c8a',date('now','+3 hours'),'DAILY',0,'COMPLETED','teacher');`);
    const again = (await t.request('/api/v2/institution-dashboard?institutionId=school', 'GET', undefined, 'admin')).data.today;
    expect(again.attendanceMissing).toEqual([]);
    expect(again.studentsWithoutAccount).toBe(1);
  } finally { t.db.close(); }
}, 60000);
