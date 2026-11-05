import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { autoOpenDueExams } from '../worker/lib/exam-release';
import { nextSnapshotVersion } from '../worker/lib/report-snapshot';

/**
 * Owner (5 Nov, MEBİ): after an upload is deleted and evaluated again, the result rows are gone but the publication
 * stats of their versions stay. The next version must skip those, or the publication is rolled back on every try and
 * the app keeps showing 0 students. Synthetic data only.
 */
const shown = (t: any) => Number((t.db.prepare(`SELECT count(*) n FROM exam_result_snapshots sn JOIN exam_delivery_profiles p ON p.exam_id=sn.exam_id AND p.snapshot_version=sn.snapshot_version WHERE sn.exam_id=?`).get(t.examId) as any).n);
describe('snapshot version after a deleted upload', () => {
  it('skips versions that only publication stats still hold', async () => {
    const t = await evaluatedExam('direct');
    try {
      const r = await t.request(`${t.base}/release`, 'POST', {});
      expect(r.response.status, r.text).toBe(200);
      const evaluated = shown(t);
      expect(evaluated).toBeGreaterThan(0);
      const v = Number((t.db.prepare('SELECT snapshot_version v FROM exam_delivery_profiles WHERE exam_id=?').get(t.examId) as any).v);
      // what MEBİ was left with: a later (network) version's stats, and no result rows at all
      t.db.prepare(`INSERT INTO exam_publication_stats(exam_id,snapshot_version,participant_count) VALUES(?,?,1)`).run(t.examId, v + 1);
      t.db.prepare('DELETE FROM exam_result_snapshots WHERE exam_id=?').run(t.examId);
      expect(await nextSnapshotVersion(t.env as any, t.examId, v)).toBe(v + 2);
      expect(await autoOpenDueExams(t.env as any)).toBe(1);
      expect(shown(t)).toBe(evaluated);
      expect(Number((t.db.prepare('SELECT snapshot_version v FROM exam_delivery_profiles WHERE exam_id=?').get(t.examId) as any).v)).toBe(v + 2);
      expect(await autoOpenDueExams(t.env as any)).toBe(0);
    } finally { t.db.close(); }
  }, 60000);
});
