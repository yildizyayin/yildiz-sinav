import { describe, expect, it } from 'vitest';
import { evaluatedExam, TITLE } from './helpers/exam-flow';

/**
 * A050: student report card. The student sees their own published results, strong / developing outcomes,
 * and the chosen period only. Real schema, production entry chain, synthetic data.
 */
async function setup() {
  const t = await evaluatedExam('direct', { outcomes: true });
  expect((await t.request(`/api/platform/exam-center/${t.examId}/freeze`, 'POST')).response.status).toBe(200);
  expect((await t.request(`/api/platform/exam-center/${t.examId}/publish`, 'POST')).response.status).toBe(200);
  // a published exam of the previous academic year, built from the same snapshot with its year and title changed
  const snap = t.db.prepare(`SELECT * FROM exam_result_snapshots WHERE exam_id=? AND student_id='s1'`).get(t.examId) as any;
  const ep = t.db.prepare(`SELECT * FROM exam_participants WHERE id=?`).get(snap.participant_id) as any;
  t.db.exec(`CREATE TEMP TABLE xe AS SELECT * FROM exams WHERE id='${t.examId}'; UPDATE xe SET id='old',title='GECEN YIL DENEMESI',academic_year='2025-2026',exam_date='2026-03-01'; INSERT INTO exams SELECT * FROM xe;`);
  t.db.prepare(`INSERT INTO exam_participants(id,exam_id,institution_id,season_id,student_id,name_snapshot,participant_status) VALUES('pold','old',?,?,?,?,?)`).run(ep.institution_id, ep.season_id, 's1', ep.name_snapshot, 'ACTIVE');
  t.db.prepare(`INSERT INTO exam_delivery_profiles(exam_id,result_freeze_status,snapshot_version,published_at) VALUES('old','PUBLISHED',1,'2026-03-05T00:00:00Z')`).run();
  const payload = JSON.parse(snap.payload_json); payload.exam = { ...payload.exam, exam_id: 'old', title: 'GECEN YIL DENEMESI', academic_year: '2025-2026', exam_date: '2026-03-01' };
  t.db.prepare(`INSERT INTO exam_result_snapshots(id,exam_id,participant_id,snapshot_version,student_id,institution_id,score,net,payload_json) VALUES('sold','old','pold',1,'s1',?,?,?,?)`).run(snap.institution_id, snap.score, snap.net, JSON.stringify(payload));
  return t;
}

describe('A050: student report card', () => {
  it('own published results only, by chosen period, with strong and developing outcomes', async () => {
    const t = await setup();
    try {
      const all = await t.request('/api/reporting/students/s1/combined', 'GET', undefined, 'stuuser');
      expect(all.response.status, all.text).toBe(200);
      expect(all.data.availableYears).toEqual(['2026-2027', '2025-2026']);
      expect(all.data.availableExams.map((e: any) => e.title).sort()).toEqual(['GECEN YIL DENEMESI', TITLE].sort());

      const last = await t.request('/api/reporting/students/s1/combined?academicYear=2025-2026', 'GET', undefined, 'stuuser');
      expect(last.data.selectedAcademicYear).toBe('2025-2026');
      expect(last.data.availableExams.map((e: any) => e.title)).toEqual(['GECEN YIL DENEMESI']);
      expect(last.data.selectedExamIds).toEqual(['old']);
      const now = await t.request('/api/reporting/students/s1/combined?academicYear=2026-2027', 'GET', undefined, 'stuuser');
      expect(now.data.selectedExamIds).toEqual([t.examId]);
      expect(now.data.strong.length + now.data.developing.length).toBeGreaterThan(0);
      // an exam id from the other period is ignored, never mixed in
      expect((await t.request(`/api/reporting/students/s1/combined?academicYear=2026-2027&examIds=old,${t.examId}`, 'GET', undefined, 'stuuser')).data.selectedExamIds).toEqual([t.examId]);
      // an unknown period falls back to all periods instead of showing someone else's
      expect((await t.request('/api/reporting/students/s1/combined?academicYear=1999-2000', 'GET', undefined, 'stuuser')).data.selectedAcademicYear).toBe(null);

      // an unpublished exam is not on the card
      t.db.prepare(`UPDATE exam_delivery_profiles SET result_freeze_status='FROZEN',published_at=NULL WHERE exam_id='old'`).run();
      expect((await t.request('/api/reporting/students/s1/combined', 'GET', undefined, 'stuuser')).data.availableYears).toEqual(['2026-2027']);
      // another student's card is not reachable
      t.db.exec(`INSERT INTO student_entities(id,first_name,last_name,normalized_name,status) VALUES('s2','CAN','ER','can er','ACTIVE');
        INSERT INTO student_enrollments(id,student_id,institution_id,season_id,student_number,grade_level,section,status) VALUES('e2','s2','school','season','102',8,'A','ACTIVE');`);
      expect((await t.request('/api/reporting/students/s2/combined', 'GET', undefined, 'stuuser')).response.status).toBe(403);
      // the card page offers the print/PDF action
      const src = (await import('node:fs')).readFileSync(new URL('../src/pages/Reports.tsx', import.meta.url), 'utf8');
      expect(src).toContain('Yazdır / PDF'); expect(src).toContain("STUDENT:{title:'Bireysel gelişim karnem'");
    } finally { t.db.close(); }
  }, 90000);
});
