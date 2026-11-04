import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { autoOpenDueExams } from '../worker/lib/exam-release';
import { syncAppResults } from '../worker/lib/platform-expansion';

/**
 * Owner (4 Nov): open app results always show the evaluated students. A publication left without its rows (an upload
 * deleted and evaluated again on sonuc) is written again by the schedule; with no student left it goes back to OPEN.
 * Synthetic data only.
 */
const shown = (t: any) => Number((t.db.prepare(`SELECT count(*) n FROM exam_result_snapshots sn JOIN exam_delivery_profiles p ON p.exam_id=sn.exam_id AND p.snapshot_version=sn.snapshot_version WHERE sn.exam_id=?`).get(t.examId) as any).n);
describe('open app results stay in step with the evaluated students', () => {
  it('rewrites a publication whose rows are missing', async () => {
    const t = await evaluatedExam('direct');
    try {
      const r = await t.request(`${t.base}/release`, 'POST', {});
      expect(r.response.status, r.text).toBe(200);
      const evaluated = shown(t);
      expect(evaluated).toBeGreaterThan(0);
      t.db.prepare('DELETE FROM exam_result_snapshots WHERE exam_id=?').run(t.examId); // what a delete + new sonuc evaluation left behind
      expect(shown(t)).toBe(0);
      expect(await autoOpenDueExams(t.env as any)).toBe(1);
      expect(shown(t)).toBe(evaluated);
      expect((t.db.prepare('SELECT result_freeze_status s FROM exam_delivery_profiles WHERE exam_id=?').get(t.examId) as any).s).toBe('PUBLISHED');
      expect(await autoOpenDueExams(t.env as any)).toBe(0); // in step now
    } finally { t.db.close(); }
  }, 60000);

  it('goes back to OPEN when no evaluated student is left', async () => {
    const t = await evaluatedExam('direct');
    try {
      expect((await t.request(`${t.base}/release`, 'POST', {})).response.status).toBe(200);
      t.db.exec(`DELETE FROM exam_result_snapshots WHERE exam_id='${t.examId}'; DELETE FROM subject_results WHERE participant_id IN (SELECT id FROM exam_participants WHERE exam_id='${t.examId}'); DELETE FROM exam_results WHERE participant_id IN (SELECT id FROM exam_participants WHERE exam_id='${t.examId}');`);
      expect(await syncAppResults(t.env as any, t.examId, null)).toBe('WITHDRAWN');
      expect((t.db.prepare('SELECT result_freeze_status s FROM exam_delivery_profiles WHERE exam_id=?').get(t.examId) as any).s).toBe('OPEN');
    } finally { t.db.close(); }
  }, 60000);
});
