import { describe, expect, it } from 'vitest';
import { writtenSetup } from './helpers/written-item';
import { normalizeRubric } from '../worker/lib/question-rubrics';

/**
 * A039: analytic rubric records. Criteria, alternative solutions and partial-credit levels are stored; totals
 * add up; a teacher's approval is required before grading can use a version; approved versions never change.
 */
const rubric = (over: any = {}) => ({
  totalPoints: 10, changeNote: 'Kısmi puan düzeyleri eklendi',
  criteria: [
    { criterion: 'Metni okuma ve paragraf konularını belirleme', points: 4, levels: [{ points: 0, descriptor: 'Adım yok' }, { points: 2, descriptor: 'Adımlardan biri eksik' }, { points: 4, descriptor: 'Bütün adımlar doğru' }] },
    { criterion: 'Ana fikri tek cümleyle doğru ifade etme', points: 6, levels: [{ points: 0, descriptor: 'Yanlış' }, { points: 3, descriptor: 'Kısmen doğru' }, { points: 6, descriptor: 'Tam doğru' }] },
  ],
  alternatives: [{ answerText: 'Başlık ve anahtar sözcüklerden yola çıkarak yazarın asıl mesajını bulurum.', note: 'Farklı strateji, tam puan' }],
  ...over,
});

describe('A039: analytic rubrics', () => {
  it('validation: totals add up, partial levels within range with 0 and full, alternatives kept', () => {
    expect(normalizeRubric(rubric()).errors).toEqual([]);
    expect(normalizeRubric(rubric({ totalPoints: 12 })).errors.join()).toContain('toplamı 10, toplam puan 12');
    expect(normalizeRubric(rubric(), 20).errors.join()).toContain('puanı 20');
    const bad = (criteria: any[]) => normalizeRubric(rubric({ criteria, totalPoints: criteria.reduce((t, c) => t + c.points, 0) })).errors.join(' | ');
    expect(bad([{ criterion: 'Tek ölçüt', points: 4, levels: [{ points: 2, descriptor: 'yarım' }, { points: 4, descriptor: 'tam' }] }])).toContain('0 puan ve tam puan');
    expect(bad([{ criterion: 'Tek ölçüt', points: 4, levels: [{ points: 0, descriptor: 'yok' }, { points: 5, descriptor: 'fazla' }, { points: 4, descriptor: 'tam' }] }])).toContain('0 ile 4 arasında');
    expect(bad([{ criterion: 'Tek ölçüt', points: 4, levels: [{ points: 0, descriptor: 'yok' }, { points: 1.5, descriptor: 'kesir' }, { points: 4, descriptor: 'tam' }] }])).toContain('0 ile 4 arasında');
    expect(bad([{ criterion: 'Aynı', points: 2 }, { criterion: 'aynı', points: 2 }])).toContain('iki kez');
    // levels default to 0 and full credit
    expect(normalizeRubric({ totalPoints: 3, criteria: [{ criterion: 'Sonuç doğru', points: 3 }] }).value!.criteria[0].levels.map((l) => l.points)).toEqual([0, 3]);
    expect(normalizeRubric(rubric({ alternatives: [{ answerText: '' }] })).errors.join()).toContain('alternatif');
  });

  it('the AI rubric is a draft; the teacher adds partial credit and alternatives, approves it, and it is then locked', async () => {
    const t = await writtenSetup();
    try {
      const [qid] = t.questionIds;
      // before the content/rights approval teachers do not see the item
      expect((await t.as('teacher', `/api/question-rubrics/${qid}`)).response.status).toBe(404);
      await t.approve(qid);
      const first = await t.as('teacher', `/api/question-rubrics/${qid}`);
      expect(first.response.status, first.text).toBe(200);
      expect(first.data.versions.map((v: any) => [v.version, v.status, v.source, v.total_points])).toEqual([[1, 'DRAFT', 'AI_DRAFT', 10]]);
      expect(first.data.versions[0].criteria.map((c: any) => c.levels.map((l: any) => l.points))).toEqual([[0, 4], [0, 6]]);
      expect(first.data.effectiveVersion).toBe(null);

      // the teacher cannot change the platform draft; they make their school's version
      expect((await t.as('teacher', `/api/question-rubrics/${qid}/versions/1`, 'PUT', rubric())).response.status).toBe(403);
      // points are the teacher's decision (A040): a school version may weight the item differently, but its totals must add up
      expect((await t.as('teacher', `/api/question-rubrics/${qid}/versions`, 'POST', rubric({ totalPoints: 12 }))).data.error.message).toContain('toplamı 10, toplam puan 12');
      const v2 = await t.as('teacher', `/api/question-rubrics/${qid}/versions`, 'POST', rubric());
      expect(v2.response.status, v2.text).toBe(201);
      expect(v2.data.version).toBe(2);
      expect((await t.as('teacher', `/api/question-rubrics/${qid}/versions`, 'POST', rubric())).data.error.code).toBe('RUBRIC_DRAFT_EXISTS');

      // approval needs explicit confirmation; then grading can use it
      expect((await t.as('teacher', `/api/question-rubrics/${qid}/versions/2/approve`, 'POST', {})).data.error.code).toBe('CONFIRMATION_REQUIRED');
      const ap = await t.as('teacher', `/api/question-rubrics/${qid}/versions/2/approve`, 'POST', { confirm: true, note: 'Zümrede görüşüldü' });
      expect(ap.response.status, ap.text).toBe(200);
      expect(ap.data.scope).toBe('school');
      const after = await t.as('teacher', `/api/question-rubrics/${qid}`);
      expect(after.data.effectiveVersion).toBe(2);
      const v = after.data.versions.find((x: any) => x.version === 2);
      expect(v.criteria.map((c: any) => c.levels.map((l: any) => l.points))).toEqual([[0, 2, 4], [0, 3, 6]]);
      expect(v.alternatives.map((a: any) => a.answer_text)).toEqual(['Başlık ve anahtar sözcüklerden yola çıkarak yazarın asıl mesajını bulurum.']);
      expect(v.approvals).toMatchObject([{ approver_role: 'TEACHER', institution_id: 'school', approved_by: 'teacher' }]);

      // approved means locked, at the API and in the database
      expect((await t.as('teacher', `/api/question-rubrics/${qid}/versions/2`, 'PUT', rubric())).data.error.code).toBe('RUBRIC_LOCKED');
      expect((await t.as('teacher', `/api/question-rubrics/${qid}/versions/2/archive`, 'POST', {})).data.error.code).toBe('RUBRIC_LOCKED');
      expect(() => t.db.prepare(`UPDATE question_rubric_levels SET points=1 WHERE points=2`).run()).toThrow(/RUBRIC_LOCKED/);
      expect(() => t.db.prepare(`DELETE FROM question_rubric_alternatives`).run()).toThrow(/RUBRIC_LOCKED/);
      expect(() => t.db.prepare(`UPDATE question_rubrics SET total_points=9 WHERE version=2`).run()).toThrow(/RUBRIC_LOCKED/);
      expect(() => t.db.prepare(`UPDATE question_rubrics SET status='DRAFT' WHERE version=2`).run()).toThrow(/RUBRIC_LOCKED/);

      // the school's version is not seen by another school; their effective rubric is unaffected
      const other = await t.as('tch_other', `/api/question-rubrics/${qid}`);
      expect(other.data.versions.map((x: any) => x.version)).toEqual([1]);
      expect(other.data.effectiveVersion).toBe(null);
      // the Super Admin approves the platform draft platform-wide; the school keeps its own approval
      expect((await t.as('admin', `/api/question-rubrics/${qid}/versions/1/approve`, 'POST', { confirm: true })).data.scope).toBe('PLATFORM');
      expect((await t.as('tch_other', `/api/question-rubrics/${qid}`)).data.effectiveVersion).toBe(1);
      expect((await t.as('teacher', `/api/question-rubrics/${qid}`)).data.effectiveVersion).toBe(2);

      const audits = t.db.prepare(`SELECT action FROM audit_logs WHERE entity_type='question_rubric' ORDER BY rowid`).all().map((r: any) => r.action);
      expect(audits).toEqual(['RUBRIC_VERSION_CREATED', 'RUBRIC_VERSION_APPROVED', 'RUBRIC_VERSION_APPROVED']);
    } finally { t.db.close(); }
  }, 90000);

  it('only humans with the subject approve; an inconsistent version cannot be approved even if written directly', async () => {
    const t = await writtenSetup();
    try {
      const [qid] = t.questionIds; await t.approve(qid);
      for (const who of ['tch_mat', 'mgr', 'stuuser', 'parent']) expect((await t.as(who, `/api/question-rubrics/${qid}/versions/1/approve`, 'POST', { confirm: true })).response.status, who).not.toBe(200);
      expect((await t.as('tch_mat', '/api/question-rubrics')).data.questions).toEqual([]);
      expect((await t.as('teacher', '/api/question-rubrics')).data.questions.map((q: any) => q.id)).toEqual([qid]);

      // a draft made inconsistent behind the API is refused at approval (API check and database guard)
      t.db.prepare(`UPDATE question_rubric_criteria SET points=5 WHERE rubric_id='qr_'||? AND sort_order=1`).run(qid);
      const r = await t.as('teacher', `/api/question-rubrics/${qid}/versions/1/approve`, 'POST', { confirm: true });
      expect(r.data.error.code).toBe('RUBRIC_INCONSISTENT');
      expect(() => t.db.prepare(`INSERT INTO question_rubric_approvals(id,rubric_id,institution_id,approved_by,approver_role) VALUES('x','qr_'||?,'school','teacher','TEACHER')`).run(qid)).toThrow(/RUBRIC_INCONSISTENT/);
      expect(t.db.prepare(`SELECT status FROM question_rubrics WHERE id='qr_'||?`).get(qid)).toEqual({ status: 'DRAFT' });
    } finally { t.db.close(); }
  }, 90000);
});
