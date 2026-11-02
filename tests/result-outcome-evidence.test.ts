import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { snapshotDetail, OUTCOME_LIMIT } from '../worker/lib/result-network-snapshot';

/**
 * 2 Nov (technical handoff, item 2): a frozen result keeps per-outcome wrong and blank counts next to the evidence
 * count, so wrong/blank are never inferred from evidence − correct; a guarded cut of the outcome list is reported.
 * Synthetic data (ALI YILMAZ: TUR ABCC vs ABCD → 3 correct 1 wrong; MAT DC__ vs DCBA → 2 correct 2 blank).
 */
describe('frozen outcome evidence', () => {
  it('stores correct, wrong and blank per outcome in the published snapshot', async () => {
    const t = await evaluatedExam('direct', { outcomes: true });
    expect((await t.request(`/api/platform/exam-center/${t.examId}/freeze`, 'POST')).response.status).toBe(200);
    const row = t.db.prepare(`SELECT s.payload_json FROM exam_result_snapshots s WHERE s.exam_id=? AND s.student_id='s1' ORDER BY s.snapshot_version DESC LIMIT 1`).get(t.examId) as any;
    const outcomes = JSON.parse(row.payload_json).outcomes as any[];
    const tur = outcomes.find((o) => o.code === 'T.8.1.1'), mat = outcomes.find((o) => o.code === 'M.8.1.1');
    expect(tur).toMatchObject({ evidence_count: 4, correct_count: 3, wrong_count: 1, blank_count: 0 });
    expect(mat).toMatchObject({ evidence_count: 4, correct_count: 2, wrong_count: 0, blank_count: 2 });
  });

  it('reports a cut outcome list instead of hiding it', () => {
    const many = Array.from({ length: OUTCOME_LIMIT + 5 }, (_, i) => ({ outcome_id: `o${i}`, title: `K${i}`, evidence_count: 1, correct_count: 1 }));
    const d = snapshotDetail({ subjects: [], outcomes: many });
    expect(d.outcomes).toHaveLength(OUTCOME_LIMIT);
    expect(d.outcomesTotal).toBe(OUTCOME_LIMIT + 5);
    expect(snapshotDetail({ subjects: [], outcomes: many.slice(0, 120) }).outcomes).toHaveLength(120);
  });
});
