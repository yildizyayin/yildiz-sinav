import { expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/**
 * Owner (9 Nov): the teacher home leads with today's work — missing attendance, new results, outcomes the class
 * struggles with — and only for the teacher's own assignments. Synthetic data only.
 */
it('reports today only for the classes and subjects assigned to the teacher', async () => {
  const t = await evaluatedExam('direct', { outcomes: true });
  try {
    t.db.exec(`INSERT INTO classes(id,institution_id,season_id,grade_level,section,name,active) VALUES
        ('c8a','school','season',8,'A','8/A',1),('c8b','school','season',8,'B','8/B',1);
      UPDATE student_enrollments SET class_id='c8a' WHERE id='enr1';
      INSERT INTO teacher_assignments(id,user_id,institution_id,season_id,class_id,subject_id,assignment_type,active) VALUES
        ('ta1','teacher','school','season','c8a','sub_mat','SUBJECT',1);`);
    // one more synthetic exam answer set for the same MAT outcome so it reaches the 5-answer floor
    const row = t.db.prepare(`SELECT exam_id,outcome_id FROM outcome_results r JOIN outcomes o ON o.id=r.outcome_id WHERE r.student_id='s1' AND o.subject_id='sub_mat'`).get() as any;
    expect(row).toBeTruthy();
    t.db.prepare(`UPDATE outcome_results SET evidence_count=evidence_count+2 WHERE student_id='s1' AND outcome_id=?`).run(row.outcome_id);
    const r = await t.request('/api/dashboard', 'GET', undefined, 'teacher');
    expect(r.response.status, r.text).toBe(200);
    const today = r.data.today;
    expect(today.classes.map((c: any) => [c.name, c.student_count, c.attendance_today])).toEqual([['8/A', 1, false]]);
    expect(today.recentExams).toHaveLength(1);
    expect(today.recentExams[0]).toMatchObject({ participant_count: 1 });
    expect(today.weakOutcomes.length).toBeGreaterThan(0);
    expect(today.weakOutcomes.every((o: any) => o.subject_name === 'Matematik' || /mat/i.test(o.subject_name))).toBe(true);

    // completing today's daily attendance clears the reminder
    t.db.exec(`INSERT INTO attendance_period_sessions(id,institution_id,class_id,attendance_date,session_type,period_no,status,created_by)
      VALUES('as1','school','c8a',date('now','+3 hours'),'DAILY',0,'COMPLETED','teacher')`);
    const again = await t.request('/api/dashboard', 'GET', undefined, 'teacher');
    expect(again.data.today.classes[0].attendance_today).toBe(true);

    // a teacher without assignments sees nothing of the school
    t.db.exec(`UPDATE teacher_assignments SET active=0 WHERE id='ta1'`);
    const none = await t.request('/api/dashboard', 'GET', undefined, 'teacher');
    expect(none.data.today).toEqual({ classes: [], recentExams: [], weakOutcomes: [] });
  } finally { t.db.close(); }
}, 60000);
