import { describe, expect, it } from 'vitest';
import { evaluatedExam, TITLE } from './helpers/exam-flow';

/**
 * A031: removing a wrong exam, archiving, restoring and copying, on the real schema through the production
 * entry chain. Synthetic data only.
 */
const STUDENT_VIEWS = ['/api/dashboard', '/api/platform/exam-center/results', '/api/reporting/students/s1/combined', '/api/my-results', '/api/my-outcomes', '/api/my-wrong-answers', '/api/notifications'];
async function studentSees(t: Awaited<ReturnType<typeof evaluatedExam>>) {
  const seen: string[] = [];
  for (const p of STUDENT_VIEWS) { const r = await t.request(p, 'GET', undefined, 'stuuser'); if (r.text.includes(TITLE) || r.text.includes(t.examId)) seen.push(p); }
  const one = await t.request(`/api/platform/exam-center/${t.examId}/result`, 'GET', undefined, 'stuuser');
  if (one.response.status === 200) seen.push('/result');
  return seen;
}
async function published(mode: 'direct' | 'chunked' = 'direct') {
  const t = await evaluatedExam(mode, { outcomes: true });
  expect((await t.request(`/api/platform/exam-center/${t.examId}/freeze`, 'POST')).response.status).toBe(200);
  expect((await t.request(`/api/platform/exam-center/${t.examId}/publish`, 'POST')).response.status).toBe(200);
  return t;
}

describe('A031: remove, archive, restore, copy', () => {
  it('the removal dialog gets what removal affects: results and the student publication', async () => {
    const t = await published();
    try {
      const state = await t.request(`/api/admin/exams/${t.examId}/channels`);
      expect(state.response.status, state.text).toBe(200);
      expect(state.data).toMatchObject({ hasResults: true, resultCount: 2, appResults: { state: 'PUBLISHED' } });
      expect(state.data.appResults.publishedAt).toBeTruthy();
    } finally { t.db.close(); }
  }, 60000);

  it('removing a wrong exam from the app hides it from students and parents; nothing republishes it until someone decides to', async () => {
    const t = await published();
    try {
      expect((await studentSees(t)).length).toBeGreaterThan(5);
      // a pending scheduled publication must not bring it back either
      t.db.prepare(`UPDATE exam_delivery_profiles SET result_publish_at=? WHERE exam_id=?`).run(new Date(Date.now() - 1000).toISOString(), t.examId);
      const trashed = await t.request(`/api/admin/exams/${t.examId}/trash`, 'POST', { scope: 'APP' });
      expect(trashed.response.status, trashed.text).toBe(200);
      expect(trashed.data).toMatchObject({ resultsPreserved: true, appResultsWithdrawn: true });
      expect(await studentSees(t)).toEqual([]);
      const parent = await t.request('/api/my-results?studentId=s1', 'GET', undefined, 'parent');
      expect(parent.text).not.toContain(TITLE);
      const { publishScheduledExamResults } = await import('../worker/lib/exam-schedule');
      expect(await publishScheduledExamResults(t.env)).toBe(0);
      expect((await t.request(`/api/platform/exam-center/${t.examId}/publish`, 'POST')).data.error.code).toBe('EXAM_TRASHED');
      expect((await t.request(`/api/platform/exam-center/${t.examId}/freeze`, 'POST')).data.error.code).toBe('EXAM_TRASHED');
      // results and the frozen snapshot are kept
      expect(t.db.prepare('SELECT count(*) c FROM exam_results er JOIN exam_participants ep ON ep.id=er.participant_id WHERE ep.exam_id=?').get(t.examId)).toEqual({ c: 2 });
      expect((t.db.prepare('SELECT count(*) c FROM exam_result_snapshots WHERE exam_id=?').get(t.examId) as any).c).toBe(2);
      const audit = JSON.parse((t.db.prepare(`SELECT details_json FROM audit_logs WHERE action='EXAM_TRASHED' AND entity_id=?`).get(t.examId) as any).details_json);
      expect(audit).toMatchObject({ scope: 'APP', appResultsWithdrawn: true, previousAppResults: { state: 'PUBLISHED' } });

      const restored = await t.request(`/api/admin/exams/${t.examId}/restore`, 'POST', {});
      expect(restored.response.status, restored.text).toBe(200);
      expect(restored.data).toMatchObject({ publicationsRestored: false });
      expect(await studentSees(t)).toEqual([]);
      expect((await t.request(`/api/platform/exam-center/${t.examId}/publish`, 'POST')).response.status).toBe(200);
      expect((await studentSees(t)).length).toBeGreaterThan(5);
    } finally { t.db.close(); }
  }, 60000);

  it('removing only from the result portal leaves the app publication alone', async () => {
    const t = await published();
    try {
      const r = await t.request(`/api/admin/exams/${t.examId}/trash`, 'POST', { scope: 'RESULT_PORTAL' });
      // the result portal is managed from production only; the app publication is untouched either way
      expect([200, 400]).toContain(r.response.status);
      expect((t.db.prepare('SELECT result_freeze_status s FROM exam_delivery_profiles WHERE exam_id=?').get(t.examId) as any).s).toBe('PUBLISHED');
    } finally { t.db.close(); }
  }, 60000);

  it('archiving keeps the published result for students (data is kept; only active lists drop it)', async () => {
    const t = await published();
    try {
      const before = await studentSees(t);
      expect((await t.request(`/api/exam-definitions/${t.examId}/status`, 'PATCH', { status: 'ARCHIVED' })).response.status).toBe(200);
      expect(await studentSees(t)).toEqual(before);
    } finally { t.db.close(); }
  }, 60000);

  it('a copy is an independent draft: no results, its own rows, editing it leaves the source intact', async () => {
    const t = await published();
    try {
      const copy = await t.request(`/api/exam-definitions/${t.examId}/copy`, 'POST');
      expect(copy.response.status, copy.text).toBe(201);
      const id = copy.data.id as string;
      const one = (sql: string, ...a: any[]) => t.db.prepare(sql).get(...a) as any;
      expect(one('SELECT status,title FROM exams WHERE id=?', id)).toEqual({ status: 'DRAFT', title: `${TITLE} - Kopya` });
      expect(one('SELECT count(*) c FROM exam_participants WHERE exam_id=?', id).c).toBe(0);
      expect(one('SELECT count(*) c FROM exam_delivery_profiles WHERE exam_id=?', id).c).toBe(0);
      expect(one(`SELECT count(*) c FROM exam_questions a JOIN exam_questions b ON a.id=b.id WHERE a.exam_id=? AND b.exam_id=?`, id, t.examId).c).toBe(0);
      expect(one(`SELECT count(*) c FROM answer_keys ak JOIN exam_questions q ON q.id=ak.exam_question_id WHERE q.exam_id=?`, id).c).toBe(8);
      expect(one(`SELECT count(*) c FROM question_outcomes qo JOIN exam_questions q ON q.id=qo.exam_question_id WHERE q.exam_id=?`, id).c).toBe(8);
      const sourceKey = () => t.db.prepare(`SELECT q.global_no,ak.correct_answer FROM answer_keys ak JOIN exam_questions q ON q.id=ak.exam_question_id WHERE q.exam_id=? ORDER BY q.global_no`).all(t.examId);
      const before = sourceKey();
      const edited = await t.request(`/api/exam-definitions/${id}/answer-key`, 'PUT', { entries: [{ subjectId: 'sub_tur', bookletCode: 'A', answers: 'DDDD', optionCount: 4 }, { subjectId: 'sub_mat', bookletCode: 'A', answers: 'AAAA', optionCount: 4 }] });
      expect(edited.response.status, edited.text).toBe(200);
      expect(sourceKey()).toEqual(before);
      expect(one(`SELECT count(*) c FROM exam_results er JOIN exam_participants ep ON ep.id=er.participant_id WHERE ep.exam_id=?`, t.examId).c).toBe(2);
      // the copy is not something students see
      for (const p of ['/api/my-results', '/api/platform/exam-center/results']) expect((await t.request(p, 'GET', undefined, 'stuuser')).text).not.toContain(id);
    } finally { t.db.close(); }
  }, 60000);
});
