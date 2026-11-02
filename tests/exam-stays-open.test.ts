import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { refreshAppLivePublication } from '../worker/lib/platform-expansion';

/**
 * Owner decision (2 Nov): "sınav sürekli açık kalmalı; yüklenen sınavlar hemen kullanıma açılacak; onayım olmadan
 * otomatik donma olmayacak". Publishing keeps the exam open for new uploads; their students join the published
 * results as a new snapshot version while the state stays PUBLISHED. Synthetic data only.
 */
describe('published exam stays open for new uploads', () => {
  it('refreshes the published app snapshot without changing its state', async () => {
    const t = await evaluatedExam('direct');
    try {
      expect((await t.request(`/api/platform/exam-center/${t.examId}/freeze`, 'POST')).response.status).toBe(200);
      expect((await t.request(`/api/platform/exam-center/${t.examId}/publish`, 'POST')).response.status).toBe(200);
      const before = t.db.prepare('SELECT result_freeze_status s,snapshot_version v,published_at p FROM exam_delivery_profiles WHERE exam_id=?').get(t.examId) as any;
      expect(await refreshAppLivePublication(t.env, t.examId, 'admin')).toBe(true);
      const after = t.db.prepare('SELECT result_freeze_status s,snapshot_version v,published_at p FROM exam_delivery_profiles WHERE exam_id=?').get(t.examId) as any;
      expect(after.s).toBe('PUBLISHED');
      expect(after.p).toBe(before.p);
      expect(after.v).toBeGreaterThan(before.v);
      const rows = t.db.prepare('SELECT COUNT(*) c FROM exam_result_snapshots WHERE exam_id=? AND snapshot_version=?').get(t.examId, after.v) as any;
      const results = t.db.prepare('SELECT COUNT(*) c FROM exam_results er JOIN exam_participants ep ON ep.id=er.participant_id WHERE ep.exam_id=?').get(t.examId) as any;
      expect(rows.c).toBe(results.c);
      expect((t.db.prepare("SELECT COUNT(*) c FROM audit_logs WHERE action='EXAM_RESULTS_LIVE_REFRESHED' AND entity_id=?").get(t.examId) as any).c).toBe(1);
    } finally { t.db.close(); }
  }, 60000);

  it('does nothing for an exam whose results are still open', async () => {
    const t = await evaluatedExam('direct');
    try { expect(await refreshAppLivePublication(t.env, t.examId, 'admin')).toBe(false); } finally { t.db.close(); }
  }, 60000);

  it('runs the refresh after an upload finishes evaluating', () => {
    const src = readFileSync(new URL('../worker/chunked-evaluation-entry.ts', import.meta.url), 'utf8');
    expect(src).toContain('refreshAppLivePublication(env, batch.exam_id, user.id)');
  });
});
