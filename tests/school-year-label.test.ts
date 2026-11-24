import { expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { schoolYearLabel } from '../src/components/Layout';

/** The header shows the institution's own school year (owner, 11 Nov 2026), not a fixed one. Synthetic data only. */
it('labels the school year from the active season, else from the date', async () => {
  expect(schoolYearLabel('2027-2028')).toBe('2027–2028');
  expect(schoolYearLabel(null, new Date('2026-11-11'))).toBe('2026–2027');
  expect(schoolYearLabel(undefined, new Date('2027-03-01'))).toBe('2026–2027');
  expect(schoolYearLabel('bozuk', new Date('2027-09-20'))).toBe('2027–2028');
  const t = await evaluatedExam('direct');
  try {
    t.db.exec(`UPDATE institution_seasons SET academic_year='2027-2028',started_at='2027-09-13' WHERE id='season'`);
    const me = await t.request('/api/auth/me', 'GET', undefined, 'teacher');
    expect(me.data.institution).toMatchObject({ name: 'Synthetic School', academic_year: '2027-2028' });
  } finally { t.db.close(); }
});
