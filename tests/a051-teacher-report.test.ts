import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
import app from '../worker/preview-policy-production-entry';

/**
 * A051: subject-teacher report. Only the authorised subject and students are visible; other subjects'
 * results never leak (totals, nets, outcomes). Real schema, production entry chain, synthetic data.
 */
async function setup() {
  const t = await evaluatedExam('direct', { outcomes: true });
  expect((await t.request(`/api/platform/exam-center/${t.examId}/freeze`, 'POST')).response.status).toBe(200);
  t.db.exec(`INSERT INTO classes(id,institution_id,season_id,grade_level,section,name) VALUES('c8a','school','season',8,'A','8/A'),('c8b','school','season',8,'B','8/B');
    UPDATE student_enrollments SET class_id='c8a' WHERE student_id='s1';
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('tmat','TEACHER','Mat','u','u',1,'school'),('tb','TEACHER','B','u','u',1,'school'),('guide','GUIDANCE_TEACHER','G','u','u',1,'school'),('tnone','TEACHER','N','u','u',1,'school');
    INSERT INTO teacher_assignments(id,user_id,institution_id,season_id,class_id,subject_id,assignment_type,active) VALUES
      ('a1','teacher','school','season','c8a','sub_tur','SUBJECT',1),('a2','tmat','school','season','c8a','sub_mat','SUBJECT',1),('a3','tb','school','season','c8b','sub_tur','SUBJECT',1),('a4','guide','school','season','c8a',NULL,'GUIDANCE',1);`);
  const cookies: Record<string, string> = {};
  for (const id of ['teacher', 'tmat', 'tb', 'guide', 'tnone']) cookies[id] = (await createSession(t.env, id, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const as = async (who: string, path: string) => { const res = await (app as any).fetch(new Request(`https://app.anunex.com${path}`, { headers: { Cookie: cookies[who] } }), t.env, { waitUntil() {} }); const text = await res.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ } return { status: res.status, text, data }; };
  return { ...t, as };
}

describe('A051: subject-teacher report', () => {
  it('the Turkish teacher sees only Turkish; the maths teacher only maths; no totals or other-subject outcomes', async () => {
    const t = await setup();
    try {
      const tur = await t.as('teacher', '/api/reporting/students/s1/combined');
      expect(tur.status, tur.text).toBe(200);
      expect(tur.data.restrictedToSubjects).toBe(true);
      expect([...new Set(tur.data.subjectTrend.map((r: any) => r.subject_id))]).toEqual(['sub_tur']);
      expect([...new Set(tur.data.outcomes.map((o: any) => o.subject_id))]).toEqual(['sub_tur']);
      expect(tur.data.outcomes.map((o: any) => o.code)).toEqual(['T.8.1.1']);
      expect(tur.data.summary).toBe(null);
      for (const e of tur.data.exams) for (const k of ['net', 'score', 'correct_count', 'success_percent', 'institution_rank']) expect(e, k).not.toHaveProperty(k);
      expect(tur.text).not.toContain('M.8.1.1');
      expect(tur.text).not.toContain('sub_mat');

      const frozen = await t.as('teacher', `/api/reporting/students/s1/frozen-exams?academicYear=2026-2027&examIds=${t.examId}`);
      expect(frozen.status, frozen.text).toBe(200);
      expect(frozen.data.restrictedToSubjects).toBe(true);
      expect(frozen.text).not.toContain('M.8.1.1'); expect(frozen.text).not.toContain('sub_mat');
      const mat = await t.as('tmat', '/api/reporting/students/s1/combined');
      expect([...new Set(mat.data.subjectTrend.map((r: any) => r.subject_id))]).toEqual(['sub_mat']);
      expect(mat.text).not.toContain('T.8.1.1');

      // the guidance teacher of the class sees the whole report
      const g = await t.as('guide', '/api/reporting/students/s1/combined');
      expect([...new Set(g.data.subjectTrend.map((r: any) => r.subject_id))].sort()).toEqual(['sub_mat', 'sub_tur']);
      expect(g.data.restrictedToSubjects).toBe(false);
    } finally { t.db.close(); }
  }, 90000);

  it('students outside the teacher’s classes are not visible; removing the assignment closes the report', async () => {
    const t = await setup();
    try {
      expect((await t.as('tb', '/api/reporting/students/s1/combined')).status).toBe(403);
      expect((await t.as('tnone', '/api/reporting/students/s1/combined')).status).toBe(403);
      expect(((await t.as('tb', '/api/reporting/students')).data.students || []).map((s: any) => s.id)).not.toContain('s1');
      expect(((await t.as('teacher', '/api/reporting/students')).data.students || []).map((s: any) => s.id)).toEqual(['s1']);
      t.db.exec(`UPDATE teacher_assignments SET active=0 WHERE id='a1'`);
      expect((await t.as('teacher', '/api/reporting/students/s1/combined')).status).toBe(403);
    } finally { t.db.close(); }
  }, 90000);
});
