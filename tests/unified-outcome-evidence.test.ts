import { describe, expect, it } from 'vitest';
import { aggregateEvidence } from '../worker/lib/unified-outcome-evidence';
import { evaluatedExam } from './helpers/exam-flow';

/**
 * Birleşik Karne step 1 (owner, 9 Nov 2026): one record per outcome from every source. Owner decisions: 30 different
 * questions target; "learned" = in the last 30 days at least 8 different questions, at least 80% right. Synthetic data.
 */
const now = new Date('2026-11-09T12:00:00Z');
const day = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();
const row = (q: string, result: number | null, daysAgo: number, source: any = 'QUESTION_BANK') => ({ outcome_id: 'o1', question_key: q, source, result, at: day(daysAgo) });

describe('aggregation rules', () => {
  it('a question solved again counts once among different questions and every time among attempts', () => {
    const o = aggregateEvidence([row('q1', 0, 5), row('q1', 1, 3), row('q1', 1, 1), row('q2', null, 2)], now).get('o1')!;
    expect(o).toMatchObject({ uniqueQuestions: 2, attempts: 4, correct: 2, wrong: 1, blank: 1, target: 30 });
    expect(o.targetProgress).toBeCloseTo(2 / 30);
  });
  it('learned needs 8 different recent questions at 80%, judged on each question\'s latest attempt', () => {
    const eight = Array.from({ length: 8 }, (_, i) => row(`q${i}`, 1, 2));
    expect(aggregateEvidence(eight, now).get('o1')!.status).toBe('LEARNED');
    // the same question drilled 20 times is one question
    expect(aggregateEvidence(Array.from({ length: 20 }, () => row('q1', 1, 1)), now).get('o1')!.status).toBe('DEVELOPING');
    // 7 right of 9 (78%) is not enough; the latest attempt decides a repeated question
    const nine = [...Array.from({ length: 7 }, (_, i) => row(`q${i}`, 1, 2)), row('q7', 0, 2), row('q8', 1, 9), row('q8', 0, 1)];
    expect(aggregateEvidence(nine, now).get('o1')!).toMatchObject({ status: 'DEVELOPING', recent: { uniqueQuestions: 9, correct: 7 } });
    // evidence older than 30 days counts in totals but not towards "learned"
    const old = Array.from({ length: 10 }, (_, i) => row(`q${i}`, 1, 45));
    expect(aggregateEvidence(old, now).get('o1')!).toMatchObject({ status: 'DEVELOPING', uniqueQuestions: 10, recent: { uniqueQuestions: 0, rate: null } });
  });
  it('keeps the sources apart in its breakdown', () => {
    const o = aggregateEvidence([row('e1', 1, 1, 'EXAM'), row('w1', 0, 1, 'FOY'), row('m1', 1, 1, 'MINI_TEST')], now).get('o1')!;
    expect(o.bySource).toMatchObject({ EXAM: { attempts: 1, correct: 1 }, FOY: { attempts: 1, correct: 0 }, MINI_TEST: { attempts: 1, correct: 1 }, QUESTION_BANK: { attempts: 0 } });
  });
});

it('joins exam answers and question bank practice for the same outcome, and hides unpublished exams from the student', async () => {
  const t = await evaluatedExam('direct', { outcomes: true });
  try {
    const path = '/api/reporting/students/s1/outcome-evidence';
    const staff = await t.request(path, 'GET', undefined, 'admin');
    expect(staff.response.status, staff.text).toBe(200);
    const mat = staff.data.outcomes.find((o: any) => o.code === 'M.8.1.1');
    // ALI YILMAZ answered MAT "DC__" against "DCBA": 4 questions on M.8.1.1, 2 right, 2 blank
    expect(mat).toMatchObject({ uniqueQuestions: 4, attempts: 4, correct: 2, blank: 2, status: 'DEVELOPING', bySource: { EXAM: { attempts: 4, correct: 2 } } });
    expect(staff.data.rules).toEqual({ target: 30, learned: { days: 30, minQuestions: 8, minRate: 0.8 } });

    // the same outcome practised in the question bank: one question solved twice
    const o = t.db.prepare(`SELECT o.id,o.code,o.subject_id,cv.academic_year FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE o.code='M.8.1.1'`).get() as any;
    t.db.prepare(`INSERT OR IGNORE INTO learning_nodes(id,academic_year,node_type,subject_id,grade_level,code,title) VALUES('ln1',?,'OUTCOME',?,8,?,'Sentetik')`).run(o.academic_year, o.subject_id, o.code);
    const node = (t.db.prepare(`SELECT id FROM learning_nodes WHERE academic_year=? AND node_type='OUTCOME' AND code=?`).get(o.academic_year, o.code) as any).id;
    t.db.prepare(`INSERT INTO question_bank(id,subject_id,grade_level,stem_text,correct_answer,review_status) VALUES('qb1',?,8,'Sentetik soru','A','APPROVED')`).run(o.subject_id);
    t.db.prepare(`INSERT INTO question_learning_links(question_id,node_id) VALUES('qb1',?)`).run(node);
    t.db.exec(`INSERT INTO question_practice_attempts(id,student_id,question_id,selected_answer,is_correct) VALUES('pa1','s1','qb1','B',0),('pa2','s1','qb1','A',1);`);
    const again = (await t.request(path, 'GET', undefined, 'admin')).data.outcomes.find((x: any) => x.code === 'M.8.1.1');
    expect(again).toMatchObject({ uniqueQuestions: 5, attempts: 6, correct: 3, bySource: { QUESTION_BANK: { attempts: 2, correct: 1 } } });

    // the student sees practice at once, but the exam only after its results are published to learners
    const before = await t.request(path, 'GET', undefined, 'stuuser');
    expect(before.response.status, before.text).toBe(200);
    expect(before.data.outcomes.find((x: any) => x.code === 'M.8.1.1')).toMatchObject({ uniqueQuestions: 1, bySource: { EXAM: { attempts: 0 } } });
    expect(before.data.outcomes.find((x: any) => x.code === 'T.8.1.1')).toBeUndefined();
    expect((await t.request(`${t.base}/release`, 'POST', {})).response.status).toBe(200);
    const after = await t.request(path, 'GET', undefined, 'stuuser');
    expect(after.data.outcomes.find((x: any) => x.code === 'M.8.1.1')).toMatchObject({ uniqueQuestions: 5, bySource: { EXAM: { attempts: 4 } } });

    // a parent of another child, or a teacher without the class, sees nothing
    expect((await t.request(path, 'GET', undefined, 'teacher')).response.status).toBe(403);
  } finally { t.db.close(); }
}, 60000);
