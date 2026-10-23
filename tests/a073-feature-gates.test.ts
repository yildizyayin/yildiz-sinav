import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { requiredOuterFeatureForPath, requiredFeatureForPath } from '../worker/lib/platform-feature-policy';

/** A073: a closed feature cannot be used through its API either; the menu and the API use the same switch. Synthetic data only. */
describe('A073 feature gates', () => {
  it('refuses the APIs of closed features for school users and opens them when the feature is enabled', async () => {
    const t = await evaluatedExam('direct');
    const set = (key: string, on: number) => t.db.prepare(`UPDATE platform_features SET enabled_default=? WHERE feature_key=?`).run(on, key);
    const cases: Array<[string, string, string]> = [
      ['ASSIGNMENTS', '/api/homework/mistakes', 'stuuser'],
      ['PERSONAL_BOOKS', '/api/student-books/personal', 'stuuser'],
      ['ZERO_ERROR_BOOKLET', '/api/student-books/zero-error', 'stuuser'],
      ['GUIDANCE_TESTS', '/api/nibiru/guidance/assessments/my', 'stuuser'],
      ['GAMES', '/api/student-standard/games', 'stuuser'],
      ['QUESTION_BANK', '/api/platform/student-practice', 'stuuser'],
    ];
    for (const [key, path, who] of cases) {
      set(key, 0);
      const off = await t.request(path, 'GET', undefined, who);
      expect(off.response.status, `${key} off`).toBe(403); expect(off.data.error.code).toBe('FEATURE_DISABLED');
      set(key, 1);
      expect((await t.request(path, 'GET', undefined, who)).data?.error?.code, `${key} on`).not.toBe('FEATURE_DISABLED');
    }
    // an institution override wins over the platform default
    set('GAMES', 1);
    t.db.exec(`INSERT INTO institution_feature_overrides(institution_id,feature_key,enabled) VALUES('school','GAMES',0)`);
    expect((await t.request('/api/student-standard/games', 'GET', undefined, 'stuuser')).response.status).toBe(403);
    // the Super Admin is never gated
    set('ASSIGNMENTS', 0);
    expect((await t.request('/api/homework/x/results')).data?.error?.code).not.toBe('FEATURE_DISABLED');
  });

  it('maps every menu-gated area to a feature key that exists', () => {
    expect(requiredOuterFeatureForPath('/api/homework/abc/submit')).toBe('ASSIGNMENTS');
    expect(requiredOuterFeatureForPath('/api/attendance')).toBeNull();
    expect(requiredFeatureForPath('/api/platform/student-practice/attempts')).toBe('QUESTION_BANK');
  });
});
