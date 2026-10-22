import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { markConflicts } from '../worker/lib/calendar';

/** A063: panel calendar — homework due moments read in Türkiye time, clashes marked. Synthetic data only. */
describe('A063 panel calendar', () => {
  it('marks overlapping timed events and ignores due moments and day items', () => {
    const ev = (id: string, s: string, e: string, extra: any = {}) => ({ occurrenceId: id, starts_at: s, ends_at: e, ...extra });
    const out = markConflicts([
      ev('lesson', '2026-10-26T09:00:00+03:00', '2026-10-26T10:00:00+03:00'),
      ev('meeting', '2026-10-26T09:30:00+03:00', '2026-10-26T10:30:00+03:00'),
      ev('after', '2026-10-26T10:30:00+03:00', '2026-10-26T11:00:00+03:00'),
      ev('due', '2026-10-26T09:45:00+03:00', '2026-10-26T09:45:00+03:00'),
      ev('exam', '2026-10-26T09:00:00+03:00', '2026-10-26T10:00:00+03:00', { timeUnspecified: true }),
    ]);
    const by = Object.fromEntries(out.map((e: any) => [e.occurrenceId, e.conflictsWith]));
    expect(by).toEqual({ lesson: ['meeting'], meeting: ['lesson'], after: [], due: [], exam: [] });
  });

  it('shows a date-only homework due date at 23:59 Türkiye time on that day for the student', async () => {
    const t = await evaluatedExam('direct');
    t.db.exec(`INSERT INTO assignments(id,institution_id,season_id,created_by,title,status,due_at) VALUES('hw1','school','season','teacher','Ödev 1','ASSIGNED','2026-10-26'),('hw2','school','season','teacher','Ödev 2','ASSIGNED','2026-10-27T17:00');
      INSERT INTO assignment_recipients(assignment_id,student_id) VALUES('hw1','s1'),('hw2','s1');`);
    const r = await t.request('/api/calendar?from=2026-10-26&to=2026-10-27', 'GET', undefined, 'stuuser');
    expect(r.response.status, r.text).toBe(200);
    const hw = r.data.events.filter((e: any) => e.source === 'ASSIGNMENT');
    expect(hw.map((e: any) => [e.title, e.starts_at])).toEqual([['Ödev 1', '2026-10-26T20:59:59.000Z']]);
    const next = await t.request('/api/calendar?from=2026-10-27&to=2026-10-28', 'GET', undefined, 'stuuser');
    expect(next.data.events.filter((e: any) => e.source === 'ASSIGNMENT').map((e: any) => e.starts_at)).toEqual(['2026-10-27T14:00:00.000Z']);
  });
});
