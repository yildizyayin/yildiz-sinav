import { expect, it } from 'vitest';
import { schoolPeriods, schoolYearBounds } from '../worker/lib/unified-outcome-evidence';
import { evaluatedExam } from './helpers/exam-flow';

/** Birleşik Karne: 3. ay, 6. ay and year-end views, cumulative from the school year start. Synthetic data only. */
it('uses the MEB 2026-2027 calendar unless the institution set its own start', () => {
  expect(schoolYearBounds('2026-2027')).toEqual({ start: '2026-09-14', end: '2027-06-25' });
  expect(schoolYearBounds('2026-2027', '2026-09-07 08:00:00')).toEqual({ start: '2026-09-07', end: '2027-06-25' });
  expect(schoolYearBounds('2027-2028')).toEqual({ start: '2027-09-15', end: '2028-06-25' });
  expect(schoolPeriods(schoolYearBounds('2026-2027')).map((p) => [p.key, p.from, p.to])).toEqual([
    ['M3', '2026-09-14', '2026-12-14'], ['M6', '2026-09-14', '2027-03-14'], ['YEAR', '2026-09-14', '2027-06-25']]);
});

it('reports each period for the student, scoped like the current record', async () => {
  const t = await evaluatedExam('direct', { outcomes: true });
  try {
    const today = new Date().toISOString().slice(0, 10);
    t.db.exec(`UPDATE institution_seasons SET started_at='${today}' WHERE id='season'`); // the exam falls inside every period
    const r = await t.request('/api/reporting/students/s1/outcome-evidence/periods', 'GET', undefined, 'admin');
    expect(r.response.status, r.text).toBe(200);
    expect(r.data.academicYear).toBe('2026-2027');
    expect(r.data.bounds.start).toBe(today);
    expect(r.data.periods.map((p: any) => p.key)).toEqual(['M3', 'M6', 'YEAR']);
    for (const p of r.data.periods) expect(p).toMatchObject({ state: 'IN_PROGRESS', summary: { outcomes: 2, learned: 0, uniqueQuestions: 8 } });
    const mat = r.data.trajectories.find((x: any) => x.code === 'M.8.1.1');
    expect(mat).toMatchObject({ subjectName: expect.any(String), statuses: { M3: 'DEVELOPING', M6: 'DEVELOPING', YEAR: 'DEVELOPING' } });
    // a school year that has not started yet shows nothing in its periods
    const later = await t.request('/api/reporting/students/s1/outcome-evidence/periods?academicYear=2027-2028', 'GET', undefined, 'admin');
    expect(later.data.periods.every((p: any) => p.state === 'NOT_STARTED' && p.summary.outcomes === 0)).toBe(true);
    expect((await t.request('/api/reporting/students/s1/outcome-evidence/periods', 'GET', undefined, 'teacher')).response.status).toBe(403);
  } finally { t.db.close(); }
}, 60000);
