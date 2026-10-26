import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { activateDueExams, examLight } from '../worker/lib/exam-lifecycle';

/** S029: an exam is active by itself once the card and every booklet's answer key are complete; optional parts only change the light. Synthetic data only. */
async function draft(t: Awaited<ReturnType<typeof evaluatedExam>>, title: string) {
  const created = await t.request('/api/exam-definitions', 'POST', { ownerType: 'CENTRAL', academicYear: '2026-2027', title, examType: 'LGS', gradeLevel: 8, publisherName: 'Sentetik', sessionLabel: 'Tek', scoringRuleVersionId: 'srv_meb_lgs_2627', outcomeMode: 'OPTIONAL' });
  expect(created.response.status, created.text).toBe(201);
  const base = `/api/exam-definitions/${created.data.id}`;
  expect((await t.request(`${base}/structure`, 'PUT', { booklets: ['A', 'B'], subjects: [{ subjectId: 'sub_tur', questionCount: 2, questionStart: 1, questionEnd: 2, optionCount: 4, wrongDivisor: 3, sortOrder: 1 }] })).response.status).toBe(200);
  return { id: created.data.id as string, base };
}
const status = (t: any, id: string) => (t.db.prepare('SELECT status FROM exams WHERE id=?').get(id) as any).status;
const channels = (t: any, id: string) => t.db.prepare(`SELECT channel,status FROM exam_channel_publications WHERE exam_id=? ORDER BY channel`).all(id);

describe('S029 automatic activation', () => {
  it('stays a draft until every booklet has its key, then is active in the app and the result network', async () => {
    const t = await evaluatedExam('direct');
    const { id, base } = await draft(t, 'OTOMATIK 1');
    const onlyA = await t.request(`${base}/answer-key`, 'PUT', { entries: [{ subjectId: 'sub_tur', bookletCode: 'A', answers: 'AB', optionCount: 4 }, { subjectId: 'sub_tur', bookletCode: 'B', answers: '__', optionCount: 4 }] });
    expect(status(t, id)).toBe('DRAFT');
    void onlyA;
    const list = async () => (await t.request('/api/exam-definitions')).data.exams.find((e: any) => e.id === id);
    expect(await list()).toMatchObject({ light: 'ORANGE', label: 'Taslak' });
    expect((await t.request(`${base}/answer-key`, 'PUT', { entries: [{ subjectId: 'sub_tur', bookletCode: 'A', answers: 'AB', optionCount: 4 }, { subjectId: 'sub_tur', bookletCode: 'B', answers: 'BA', optionCount: 4 }] })).response.status).toBe(200);
    expect(status(t, id)).toBe('ACTIVE');
    expect(channels(t, id)).toEqual([{ channel: 'LICENSED', status: 'ACTIVE' }, { channel: 'RESULT_NETWORK', status: 'ACTIVE' }]);
    expect(await list()).toMatchObject({ light: 'YELLOW', label: 'Aktif · eksik', missing: expect.arrayContaining(['kazanımlar', 'video çözümler']) });
    // the button is a harmless no-op now
    expect((await t.request(`${base}/status`, 'PATCH', { status: 'ACTIVE' })).data).toMatchObject({ ok: true, alreadyActive: true });
    // archiving withdraws the unused automatic result network listing too
    expect((await t.request(`${base}/status`, 'PATCH', { status: 'ARCHIVED' })).response.status).toBe(200);
    expect(status(t, id)).toBe('ARCHIVED');
    expect(channels(t, id)).toEqual([{ channel: 'LICENSED', status: 'ARCHIVED' }, { channel: 'RESULT_NETWORK', status: 'ARCHIVED' }]);
  });

  it('waits for its start date, then the scheduler activates it', async () => {
    const t = await evaluatedExam('direct');
    const { id, base } = await draft(t, 'OTOMATIK 2');
    const future = new Date(Date.now() + 3600_000).toISOString();
    expect((await t.request(`/api/platform/exam-center/${id}/schedule`, 'PUT', { applicationStartAt: future })).response.status).toBe(200);
    expect((await t.request(`${base}/answer-key`, 'PUT', { entries: [{ subjectId: 'sub_tur', bookletCode: 'A', answers: 'AB', optionCount: 4 }, { subjectId: 'sub_tur', bookletCode: 'B', answers: 'BA', optionCount: 4 }] })).response.status).toBe(200);
    expect(status(t, id)).toBe('DRAFT');
    expect((await t.request('/api/exam-definitions')).data.exams.find((e: any) => e.id === id)).toMatchObject({ light: 'BLUE', label: 'Tarih bekliyor' });
    expect(await activateDueExams(t.env)).toBe(0);
    t.db.prepare('UPDATE exams SET application_start_at=? WHERE id=?').run(new Date(Date.now() - 60_000).toISOString(), id);
    expect(await activateDueExams(t.env)).toBe(1);
    expect(status(t, id)).toBe('ACTIVE');
    expect((t.db.prepare(`SELECT details_json FROM audit_logs WHERE action='EXAM_STATUS_ACTIVE' AND entity_id=? ORDER BY rowid DESC LIMIT 1`).get(id) as any).details_json).toContain('Başlangıç tarihi geldi');
  });

  it('gives the right light', () => {
    const complete = { status: 'ACTIVE', subject_count: 1, question_count: 2, booklet_count: 1, answer_count: 2, scoring_verified: 1, outcome_mapped_count: 2, answer_pdf_count: 1, exam_pdf_count: 1, video_count: 3 };
    expect(examLight(complete).light).toBe('GREEN');
    expect(examLight({ ...complete, outcome_mapped_count: 1 })).toMatchObject({ light: 'YELLOW', missing: ['kazanımlar'] });
    expect(examLight({ ...complete, status: 'DRAFT', answer_count: 1 })).toMatchObject({ light: 'ORANGE', missing: ['cevap anahtarı'] });
    expect(examLight({ ...complete, status: 'DRAFT', application_start_at: new Date(Date.now() + 86400_000).toISOString() }).light).toBe('BLUE');
    expect(examLight({ ...complete, status: 'ARCHIVED' }).light).toBe('RED');
    expect(examLight({ ...complete, app_archived: 1 }).light).toBe('RED');
  });
});
