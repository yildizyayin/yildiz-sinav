import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { snapshotDetail } from '../worker/lib/result-network-snapshot';

/**
 * Alt ders (2 Nov): ranges on the exam card become sub-subject rows of the next frozen result; totals stay as they
 * were. Synthetic: the helper exam is relabelled TYT (Matematik test = TYT_MAT, 4 questions, key DCBA).
 * ALI YILMAZ answered DC__ → Matematik 1–3: 2 correct, 1 blank; Geometri 4: 1 blank.
 */
describe('exam sub-subject ranges', () => {
  it('validates ranges, and the frozen result carries the branch rows without touching totals', async () => {
    const t = await evaluatedExam('direct');
    t.db.exec(`UPDATE exams SET exam_type='TYT' WHERE id='${t.examId}'; UPDATE subjects SET code='TYT_MAT_UNUSED' WHERE id='sub_tyt_mat'; UPDATE subjects SET code='TYT_MAT' WHERE id='sub_mat';`);
    const url = `${t.base}/branches`;
    const get = await t.request(url);
    expect(get.response.status, get.text).toBe(200);
    expect(get.data.subjects.map((s: any) => s.code)).toEqual(['TYT_MAT']);
    expect((await t.request(url, 'PUT', { branches: [{ subjectId: 'sub_mat', code: 'TYT_FIZ', start: 1, end: 2 }] })).data.error.code).toBe('BRANCH_NOT_ALLOWED');
    expect((await t.request(url, 'PUT', { branches: [{ subjectId: 'sub_mat', code: 'TYT_MATEMATIK', start: 1, end: 9 }] })).data.error.code).toBe('BRANCH_RANGE_INVALID');
    expect((await t.request(url, 'PUT', { branches: [{ subjectId: 'sub_mat', code: 'TYT_MATEMATIK', start: 1, end: 3 }, { subjectId: 'sub_mat', code: 'TYT_GEO', start: 3, end: 4 }] })).data.error.code).toBe('BRANCH_OVERLAP');
    expect((await t.request(url, 'PUT', { branches: [] }, 'teacher')).response.status).toBe(403);
    const ok = await t.request(url, 'PUT', { branches: [{ subjectId: 'sub_mat', code: 'TYT_MATEMATIK', start: 1, end: 3 }, { subjectId: 'sub_mat', code: 'TYT_GEO', start: 4, end: 4 }] });
    expect(ok.response.status, ok.text).toBe(200);
    expect(ok.data.branches).toHaveLength(2);

    expect((await t.request(`/api/platform/exam-center/${t.examId}/freeze`, 'POST')).response.status).toBe(200);
    const payload = JSON.parse((t.db.prepare(`SELECT payload_json FROM exam_result_snapshots WHERE exam_id=? AND student_id='s1' ORDER BY snapshot_version DESC LIMIT 1`).get(t.examId) as any).payload_json);
    const mat = payload.branches.find((b: any) => b.subject_code === 'TYT_MATEMATIK'), geo = payload.branches.find((b: any) => b.subject_code === 'TYT_GEO');
    expect(mat).toMatchObject({ subject_name: 'Matematik', correct_count: 2, wrong_count: 0, blank_count: 1, net: 2 });
    expect(geo).toMatchObject({ subject_name: 'Geometri', correct_count: 0, wrong_count: 0, blank_count: 1, net: 0 });
    // parent totals are the evaluation's own, unchanged
    const parent = payload.subjects.find((s: any) => s.subject_id === 'sub_mat');
    expect(parent).toMatchObject({ correct_count: 2, blank_count: 2 });
    expect(payload.subjects.some((s: any) => s.subject_code === 'TYT_GEO')).toBe(false);
    // the student detail shows parent + children; nothing is summed again
    const detail = snapshotDetail(payload);
    expect(detail.subjects.filter((s: any) => s.branch).map((s: any) => s.subject_code)).toEqual(['TYT_MATEMATIK', 'TYT_GEO']);
  });

  it('refuses ranges for a non-TYT exam', async () => {
    const t = await evaluatedExam('direct');
    expect((await t.request(`${t.base}/branches`, 'PUT', { branches: [] })).data.error.code).toBe('BRANCHES_TYT_ONLY');
  });
});
