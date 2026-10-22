import { describe, expect, it } from 'vitest';
import { finalWrittenPaper } from './helpers/written-item';

/**
 * A042: written outcome report. Student / section / class feedback rests on the teacher-finalised points
 * and the outcomes of each question; a written score is points out of 100, never a deneme net.
 */
describe('A042: written outcome report', () => {
  it('reports per outcome from finalised grades only; sections and class add up; nothing enters deneme results', async () => {
    const t = await finalWrittenPaper();
    try {
      const [bank, zumre] = t.items;
      const guest = (t.db.prepare(`SELECT student_id FROM student_enrollments WHERE student_number='555'`).get() as any).student_id;
      t.db.prepare(`UPDATE student_enrollments SET section='B' WHERE student_id=?`).run(guest);
      const before = { results: (t.db.prepare('SELECT count(*) c FROM exam_results').get() as any).c, answers: (t.db.prepare('SELECT count(*) c FROM student_answers').get() as any).c };
      const rep = () => t.as('teacher', `/api/written-papers/${t.id}/report`);

      // s1: 30/40 on T.8.1.1, 60/60 on the committee question → 90; the guest: 10/40 and 0/60 → 10
      await t.score('s1', bank.id, [20, 10]); await t.score('s1', zumre.id, [60]); await t.finalize('s1');
      await t.score(guest, bank.id, [10, 0]); await t.score(guest, zumre.id, [0]);
      let r = await rep();
      expect(r.response.status, r.text).toBe(200);
      // the guest is scored but not finalised: not in the report, listed as pending
      expect(r.data.students.map((s: any) => s.studentNumber)).toEqual(['101']);
      expect(r.data.pending.map((s: any) => s.studentNumber)).toEqual(['555']);
      const s1 = r.data.students[0];
      expect(s1).toMatchObject({ total: 90, finalVersion: 1, strengths: ['T.8.1.1', 'Yazma · Metin'], improvements: [] });
      expect(s1.outcomes.map((o: any) => [o.code, o.title, o.earned, o.possible, o.percent])).toEqual([['T.8.1.1', 'Metnin ana fikrini belirler.', 30, 40, 75], [null, 'Yazma · Metin', 60, 60, 100]]);
      expect(r.data.scale).toMatchObject({ kind: 'POINTS_PERCENT' });
      expect(r.text).not.toMatch(/"net"|netScore|net_score/i);

      await t.finalize(guest);
      r = await rep();
      const g = r.data.students.find((s: any) => s.studentNumber === '555');
      expect(g).toMatchObject({ total: 10, strengths: [], improvements: ['T.8.1.1', 'Yazma · Metin'] });
      expect(r.data.sections.map((s: any) => [s.section, s.students, s.averageTotal])).toEqual([['A', 1, 90], ['B', 1, 10]]);
      expect(r.data.class).toMatchObject({ students: 2, averageTotal: 50 });
      expect(r.data.class.outcomes.map((o: any) => [o.code, o.earned, o.possible, o.percent])).toEqual([['T.8.1.1', 40, 80, 50], [null, 60, 120, 50]]);

      // an unfinalised correction does not change the report; re-finalising does
      await t.score('s1', zumre.id, [30], 'Ana fikir eksik, yeniden okundu.');
      const still = (await rep()).data.students.find((s: any) => s.studentNumber === '101');
      expect(still.total).toBe(90);
      expect(still.outcomes.map((o: any) => o.earned)).toEqual([30, 60]);
      await t.finalize('s1', 'İtiraz sonrası yeniden okundu.');
      expect((await rep()).data.students.find((s: any) => s.studentNumber === '101')).toMatchObject({ total: 60, finalVersion: 2 });

      // the manager reads it; another school, another subject and learners cannot
      expect((await t.as('mgr', `/api/written-papers/${t.id}/report`)).response.status).toBe(200);
      for (const who of ['tch_other', 'tch_mat']) expect((await t.as(who, `/api/written-papers/${t.id}/report`)).response.status, who).toBe(404);
      for (const who of ['stuuser', 'parent']) expect((await t.as(who, `/api/written-papers/${t.id}/report`)).response.status, who).toBe(403);

      // written grading never wrote into deneme results or answers
      expect({ results: (t.db.prepare('SELECT count(*) c FROM exam_results').get() as any).c, answers: (t.db.prepare('SELECT count(*) c FROM student_answers').get() as any).c }).toEqual(before);
    } finally { t.db.close(); }
  }, 180000);
});
