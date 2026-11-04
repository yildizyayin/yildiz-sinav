import { describe, expect, it } from 'vitest';
import { evaluatedExam, KEY } from './helpers/exam-flow';

/**
 * Owner (4 Nov): an exam that became active by itself stays freely editable (card, scoring profile, subjects, answer
 * key) until its first evaluated student; then the lock applies again. Synthetic data only.
 */
describe('editable until the first evaluated student', () => {
  it('edits an active exam without results, and locks it once a student is evaluated', async () => {
    const t = await evaluatedExam('direct');
    try {
      const created = await t.request('/api/exam-definitions', 'POST', { ownerType: 'CENTRAL', academicYear: '2026-2027', title: 'Sentetik İkinci', examType: 'LGS', gradeLevel: 8, publisherName: 'Sentetik', sessionLabel: 'Tek', scoringRuleVersionId: 'srv_meb_lgs_2627', outcomeMode: 'OPTIONAL' });
      expect(created.response.status, created.text).toBe(201);
      const base = `/api/exam-definitions/${created.data.id}`;
      const structure = { booklets: ['A'], subjects: [
        { subjectId: 'sub_tur', questionCount: 4, questionStart: 1, questionEnd: 4, optionCount: 4, wrongDivisor: 3, sortOrder: 1 },
        { subjectId: 'sub_mat', questionCount: 4, questionStart: 5, questionEnd: 8, optionCount: 4, wrongDivisor: 3, sortOrder: 2 }] };
      expect((await t.request(`${base}/structure`, 'PUT', structure)).response.status).toBe(200);
      const key = { entries: [{ subjectId: 'sub_tur', bookletCode: 'A', answers: KEY.TUR, optionCount: 4 }, { subjectId: 'sub_mat', bookletCode: 'A', answers: KEY.MAT, optionCount: 4 }] };
      expect((await t.request(`${base}/answer-key`, 'PUT', key)).response.status).toBe(200);
      expect((await t.request(`${base}/status`, 'PATCH', { status: 'ACTIVE' })).response.status).toBe(200);
      const detail = await t.request(base);
      expect(detail.data).toMatchObject({ exam: { status: 'ACTIVE' }, editable: true, answerKeyEditable: true });

      const card = await t.request(base, 'PATCH', { title: 'Sentetik İkinci (düzeltildi)', scoringRuleVersionId: 'srv_meb_lgs_2627' });
      expect(card.response.status, card.text).toBe(200);
      expect((t.db.prepare(`SELECT json_extract(definition_json,'$.title') t FROM channel_definition_publications WHERE exam_id=? AND status='ACTIVE' LIMIT 1`).get(created.data.id) as any)?.t).toBe('Sentetik İkinci (düzeltildi)');
      expect((await t.request(`${base}/structure`, 'PUT', structure)).response.status).toBe(200);
      expect((await t.request(`${base}/answer-key`, 'PUT', { entries: [{ ...key.entries[0], answers: 'DCBA' }, key.entries[1]] })).response.status).toBe(200);

      // first evaluated student: locked again
      t.db.prepare(`INSERT INTO exam_participants(id,exam_id,institution_id,name_snapshot,participant_status) VALUES('pp',?, 'school','SENTETIK','GUEST')`).run(created.data.id);
      expect((await t.request(base, 'PATCH', { title: 'Yine' })).response.status).toBe(409);
      expect((await t.request(`${base}/structure`, 'PUT', structure)).response.status).toBe(409);
      expect((await t.request(`${base}/answer-key`, 'PUT', key)).response.status).toBe(409);
      expect((await t.request(base)).data).toMatchObject({ editable: false });
    } finally { t.db.close(); }
  }, 60000);
});
