import { describe, expect, it } from 'vitest';
import { evaluatedExam, TITLE } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
import app from '../worker/preview-policy-production-entry';

/**
 * A049: academic-year transition. The student's identity is kept; after promotion old results stay in their
 * old season and class; the last grade graduates; nothing licence-related is created. Real schema.
 */
async function setup() {
  const t = await evaluatedExam('direct', { outcomes: true });
  expect((await t.request(`/api/platform/exam-center/${t.examId}/freeze`, 'POST')).response.status).toBe(200);
  expect((await t.request(`/api/platform/exam-center/${t.examId}/publish`, 'POST')).response.status).toBe(200);
  t.db.exec(`INSERT INTO classes(id,institution_id,season_id,grade_level,section,name) VALUES('c7a','school','season',7,'A','7/A'),('c8a','school','season',8,'A','8/A');
    UPDATE student_enrollments SET class_id='c8a' WHERE student_id='s1';
    INSERT INTO student_entities(id,first_name,last_name,normalized_name,status) VALUES('s2','CAN','ER','can er','ACTIVE');
    INSERT INTO student_enrollments(id,student_id,institution_id,season_id,class_id,student_number,grade_level,section,status) VALUES('e2','s2','school','season','c7a','102',7,'A','ACTIVE');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('mgr','INSTITUTION_MANAGER','M','u','u',1,'school');
    INSERT INTO institutions(id,name,code,status) VALUES('other','Other','OTHER','ACTIVE');
    INSERT INTO institution_seasons(id,institution_id,academic_year,status) VALUES('season2','other','2026-2027','ACTIVE');`);
  const cookie = (await createSession(t.env, 'mgr', new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const as = async (path: string, body: any) => { const res = await (app as any).fetch(new Request(`https://app.anunex.com${path}`, { method: 'POST', headers: { Cookie: cookie, Origin: 'https://app.anunex.com', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), t.env, { waitUntil() {} }); const text = await res.text(); return { status: res.status, text, data: JSON.parse(text) }; };
  return { ...t, as };
}

describe('A049: academic-year transition', () => {
  it('validates the request: own active season, exactly the next year, an explicit last grade', async () => {
    const t = await setup();
    try {
      expect((await t.as('/api/seasons/rollover-preview', { fromSeasonId: 'season2', nextAcademicYear: '2027-2028', lastGrade: 8 })).data.error.code).toBe('SEASON_NOT_IN_INSTITUTION');
      expect((await t.as('/api/seasons/rollover-preview', { fromSeasonId: 'season', nextAcademicYear: '2028-2029', lastGrade: 8 })).data.error.code).toBe('INVALID_NEXT_YEAR');
      expect((await t.as('/api/seasons/rollover-commit', { fromSeasonId: 'season', nextAcademicYear: '2027-2028' })).data.error.code).toBe('LAST_GRADE_REQUIRED');
      const pre = await t.as('/api/seasons/rollover-preview', { fromSeasonId: 'season', nextAcademicYear: '2027-2028', lastGrade: 8 });
      expect(pre.data.groups.map((g: any) => [g.from, g.action, g.to])).toEqual([[7, 'PROMOTE', 8], [8, 'GRADUATE', null]]);
    } finally { t.db.close(); }
  }, 60000);

  it('keeps identity, promotes, graduates the last grade, keeps old results in the old season, closes it, creates no licence', async () => {
    const t = await setup();
    try {
      const participationBefore = t.db.prepare(`SELECT season_id,class_snapshot FROM exam_participants WHERE student_id='s1'`).get();
      const licBefore = t.db.prepare('SELECT count(*) c FROM institution_license_state').get();
      const r = await t.as('/api/seasons/rollover-commit', { fromSeasonId: 'season', nextAcademicYear: '2027-2028', lastGrade: 8 });
      expect(r.status, r.text).toBe(200);
      expect(r.data).toMatchObject({ promoted: 1, graduated: 1, unplaced: 0, oldSeasonClosed: true });
      const newSeason = r.data.seasonId;
      // same student id, new enrolment one grade up; the old one archived
      expect(t.db.prepare(`SELECT season_id s,grade_level g,section sec,status st FROM student_enrollments WHERE student_id='s2' ORDER BY st`).all()).toEqual([{ s: newSeason, g: 8, sec: 'A', st: 'ACTIVE' }, { s: 'season', g: 7, sec: 'A', st: 'ARCHIVED' }]);
      expect(t.db.prepare(`SELECT count(*) c FROM student_entities WHERE id='s2'`).get()).toEqual({ c: 1 });
      // the last grade graduates; no 9th grade in this school
      expect(t.db.prepare(`SELECT season_id s,status st FROM student_enrollments WHERE student_id='s1'`).all()).toEqual([{ s: 'season', st: 'GRADUATED' }]);
      // old results stay in the old season and class
      expect(t.db.prepare(`SELECT season_id,class_snapshot FROM exam_participants WHERE student_id='s1'`).get()).toEqual(participationBefore);
      expect((await t.request('/api/my-results', 'GET', undefined, 'stuuser')).text).toContain(TITLE);
      expect(t.db.prepare(`SELECT status FROM institution_seasons WHERE id='season'`).get()).toEqual({ status: 'CLOSED' });
      expect(t.db.prepare('SELECT count(*) c FROM institution_license_state').get()).toEqual(licBefore);
      // running it again changes nothing (the source season is closed)
      expect((await t.as('/api/seasons/rollover-commit', { fromSeasonId: 'season', nextAcademicYear: '2027-2028', lastGrade: 8 })).data.error.code).toBe('SEASON_NOT_ACTIVE');
    } finally { t.db.close(); }
  }, 60000);

  it('a student without a grade is not guessed: the old season stays open until placed', async () => {
    const t = await setup();
    try {
      t.db.exec(`INSERT INTO student_entities(id,first_name,last_name,normalized_name,status) VALUES('s3','EDA','OK','eda ok','ACTIVE');
        INSERT INTO student_enrollments(id,student_id,institution_id,season_id,student_number,status) VALUES('e3','s3','school','season','103','ACTIVE');`);
      const r = await t.as('/api/seasons/rollover-commit', { fromSeasonId: 'season', nextAcademicYear: '2027-2028', lastGrade: 8 });
      expect(r.data).toMatchObject({ unplaced: 1, oldSeasonClosed: false });
      expect(t.db.prepare(`SELECT status FROM student_enrollments WHERE id='e3'`).get()).toEqual({ status: 'ACTIVE' });
      expect(t.db.prepare(`SELECT status FROM institution_seasons WHERE id='season'`).get()).toEqual({ status: 'ACTIVE' });
    } finally { t.db.close(); }
  }, 60000);
});
