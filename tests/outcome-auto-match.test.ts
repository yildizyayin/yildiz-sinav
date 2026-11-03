import { describe, expect, it } from 'vitest';
import { catalogSubjectsFor, matchScopedOutcome, examOutcomeScope } from '../worker/lib/exam-outcome-matching';

/** Owner (3 Nov): a clearly best outcome is linked automatically (AUTO); a close call still waits for a person. Synthetic data. */
const row = (id: string, title: string, subject = 'sub_mat') => ({ id, code: id.toUpperCase(), title, topic: '', subtopic: '', subject_id: subject, official: 1, verified: 1 });
describe('automatic outcome matching', () => {
  const scope = examOutcomeScope({ exam_type: 'STANDARD', grade_level: 7, academic_year: '2026-2027' });
  const catalog = [row('m1', 'Rasyonel sayılarla toplama ve çıkarma işlemlerini yapar.'), row('m2', 'Oran ve orantı problemlerini çözer.'), row('m3', 'Cebirsel ifadelerin değerini hesaplar.')];
  it('links the clearly best candidate', () => {
    const r = matchScopedOutcome({ publisherTitle: 'Rasyonel sayılarla toplama çıkarma' }, 'sub_mat', catalog, scope);
    expect(r).toMatchObject({ reason: 'AUTO', outcomeId: 'm1' });
  });
  it('keeps exact code and title matches as they were', () => {
    expect(matchScopedOutcome({ code: 'M2' }, 'sub_mat', catalog, scope)).toMatchObject({ reason: 'CODE', outcomeId: 'm2' });
    expect(matchScopedOutcome({ publisherTitle: 'Cebirsel ifadelerin değerini hesaplar.' }, 'sub_mat', catalog, scope)).toMatchObject({ reason: 'TITLE', outcomeId: 'm3' });
  });
  it('leaves a close call or a weak hint for a person', () => {
    const two = [row('a', 'Problemleri çözer, oran kurar.'), row('b', 'Problemleri çözer, orantı kurar.')];
    expect(matchScopedOutcome({ publisherTitle: 'Problemler' }, 'sub_mat', two, scope).outcomeId).toBeUndefined();
    expect(matchScopedOutcome({ publisherTitle: 'Karma tekrar' }, 'sub_mat', catalog, scope).outcomeId).toBeUndefined();
  });
  it('maps a middle-school YAB test to the English programme', () => {
    expect(catalogSubjectsFor(scope, 'sub_yab')).toEqual(['sub_ing']);
    const eng = [row('e1', 'Describes daily routines and free time activities.', 'sub_ing')];
    expect(matchScopedOutcome({ publisherTitle: 'Daily routines and free time' }, 'sub_yab', eng, scope)).toMatchObject({ reason: 'AUTO', outcomeId: 'e1' });
  });
});
