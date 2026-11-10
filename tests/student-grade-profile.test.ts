import { expect, it } from 'vitest';
import { gradeProfile, nibiruStudentPrompts } from '../src/lib/gradeProfile';
import { evaluatedExam } from './helpers/exam-flow';

/** Owner (10 Nov 2026): the student panel follows the student's own grade. Synthetic data only. */
it('gives a target and a countdown only to 8 (LGS) and 12 / graduates (YKS)', () => {
  const rows = [4, 5, 6, 7, 8, 9, 10, 11, 12].map((g) => [g, gradeProfile(g).academicTarget, gradeProfile(g).officialExam, gradeProfile(g).designGroup]);
  expect(rows).toEqual([
    [4, null, null, 'A'], [5, null, null, 'A'], [6, null, null, 'A'], [7, null, null, 'B'], [8, 'LGS_SCHOOL', 'LGS', 'B'],
    [9, null, null, 'C'], [10, null, null, 'C'], [11, null, null, 'C'], [12, 'YKS_PROGRAM', 'YKS', 'C'],
  ]);
  expect(gradeProfile(null, true)).toMatchObject({ academicTarget: 'YKS_PROGRAM', academicTargetSlots: 3, countdown: true });
  expect(gradeProfile(null)).toMatchObject({ known: false, countdown: false, academicTarget: null });
  expect(gradeProfile(7).nibiruPrompts.join(' ')).not.toMatch(/LGS|YKS/);
  expect(gradeProfile(8).nibiruPrompts[0]).toContain('LGS');
  expect(gradeProfile(12).nibiruPrompts[0]).toContain('YKS');
  expect(nibiruStudentPrompts(gradeProfile(7), 'Kesirlerle işlem yapar.')[0]).toBe('“Kesirlerle işlem yapar.” konusunu nasıl güçlendiririm?');
  expect(nibiruStudentPrompts(gradeProfile(7), 'Kesirlerle işlem yapar.')).toHaveLength(4);
});

it('home: no countdown below 8, the official LGS date for 8, never another institution\'s exam', async () => {
  const t = await evaluatedExam('direct', { outcomes: true });
  try {
    // another institution's upcoming exam for the same grades: must never reach this student
    t.db.exec(`INSERT INTO institutions(id,name,code,status) VALUES('other_school','Başka Okul','OTHER','ACTIVE');
      INSERT INTO exams(id,owner_type,institution_id,academic_year,title,exam_type,exam_date,grade_level,status) VALUES('x_other','INSTITUTION','other_school','2026-2027','BAŞKA KURUM DENEMESİ','LGS',date('now','+20 days'),7,'DRAFT'),('x_other8','INSTITUTION','other_school','2026-2027','BAŞKA KURUM 8','LGS',date('now','+10 days'),8,'DRAFT');`);
    t.db.exec(`UPDATE student_enrollments SET grade_level=7 WHERE student_id='s1'`);
    const g7 = (await t.request('/api/student-standard/home-context', 'GET', undefined, 'stuuser')).data;
    expect(g7.profile).toMatchObject({ grade: 7, academicTarget: null, countdown: false });
    expect(g7.countdown).toMatchObject({ enabled: false, targetDate: null, days: null, label: null });
    expect(JSON.stringify(g7)).not.toContain('BAŞKA KURUM');

    expect((await t.request('/api/student-standard/professions', 'POST', { professionCode: 'ENGINEER', priority: 1 }, 'stuuser')).response.status).toBeLessThan(300);
    expect((await t.request('/api/student-standard/home-context', 'GET', undefined, 'stuuser')).data.professions).toMatchObject([{ title: 'Mühendis' }]);

    t.db.exec(`UPDATE student_enrollments SET grade_level=8 WHERE student_id='s1'; UPDATE official_exam_dates SET exam_date=date('now','+3 hours','+30 days') WHERE exam_code='LGS'`);
    const g8 = (await t.request('/api/student-standard/home-context', 'GET', undefined, 'stuuser')).data;
    expect(g8.countdown).toMatchObject({ enabled: true, label: 'LGS', days: 30 });
    expect(JSON.stringify(g8)).not.toContain('BAŞKA KURUM');
    expect(g8.professions).toEqual([]);

    // Nibiru's quick questions: the grade's set, led by the weakest outcome in the student's published results
    expect((await t.request(`${t.base}/release`, 'POST', {})).response.status).toBe(200);
    const profile = (await t.request('/api/student-standard/profile', 'GET', undefined, 'stuuser')).data;
    expect(profile).toMatchObject({ gradeLevel: 8, profile: { officialExam: 'LGS' } });
    expect(profile.nibiruPrompts).toHaveLength(4);
    expect(profile.weakOutcome?.title).toBeTruthy();
    expect(profile.nibiruPrompts[0]).toContain(profile.weakOutcome.title.slice(0, 20));
    expect((await t.request('/api/student-standard/profile', 'GET', undefined, 'teacher')).response.status).toBe(403);
  } finally { t.db.close(); }
}, 60000);

it('question practice serves only the student\'s own grade, whatever the address says', async () => {
  const t = await evaluatedExam('direct', { outcomes: true });
  try {
    t.env.SESSION_SECRET = 'synthetic-practice-secret';
    const add = t.db.prepare(`INSERT INTO question_bank(id,owner_type,academic_year,grade_level,subject_id,question_type,stem_text,options_json,correct_answer,option_count,copyright_status,review_status) VALUES(?,'PLATFORM','2026-2027',?,'sub_mat','MULTIPLE_CHOICE',?,'["A","B","C","D"]','A',4,'OWNED','APPROVED')`);
    add.run('q_g8', 8, 'Sekizinci sınıf sentetik'); add.run('q_g12', 12, 'On ikinci sınıf sentetik');
    for (const q of ['', '?gradeLevel=12', '?gradeLevel=12&limit=5']) {
      const r = await t.request(`/api/platform/student-practice${q}`, 'GET', undefined, 'stuuser');
      expect(r.response.status, r.text).toBe(200);
      expect(r.data.questions.map((x: any) => x.id)).toEqual(['q_g8']);
    }
  } finally { t.db.close(); }
}, 60000);
