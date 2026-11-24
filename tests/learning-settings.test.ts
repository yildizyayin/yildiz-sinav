import { expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/** Owner (9 Nov): 30 different questions per outcome by default; an institution may choose 20–100. Synthetic data. */
it('the institution target is validated, audited and used in the unified outcome record', async () => {
  const t = await evaluatedExam('direct', { outcomes: true });
  try {
    const path = '/api/reporting/learning-settings?institutionId=school';
    expect((await t.request(path, 'GET', undefined, 'admin')).data).toMatchObject({ outcomeQuestionTarget: 30, default: 30, min: 20, max: 100 });
    for (const bad of [19, 101, 25.5, 'otuz']) expect((await t.request(path, 'PUT', { outcomeQuestionTarget: bad }, 'admin')).response.status).toBe(400);
    expect((await t.request(path, 'PUT', { outcomeQuestionTarget: 40 }, 'admin')).response.status).toBe(200);
    expect((await t.request(path, 'GET', undefined, 'admin')).data.outcomeQuestionTarget).toBe(40);
    expect((t.db.prepare(`SELECT count(*) n FROM audit_logs WHERE action='LEARNING_TARGET_UPDATED'`).get() as any).n).toBe(1);
    const mat = (await t.request('/api/reporting/students/s1/outcome-evidence', 'GET', undefined, 'admin')).data.outcomes.find((o: any) => o.code === 'M.8.1.1');
    expect(mat).toMatchObject({ target: 40, uniqueQuestions: 4 });
    expect(mat.targetProgress).toBeCloseTo(0.1);
    // students, parents and teachers cannot change it
    for (const who of ['stuuser', 'parent', 'teacher']) expect((await t.request(path, 'PUT', { outcomeQuestionTarget: 50 }, who)).response.status).toBe(403);
  } finally { t.db.close(); }
}, 60000);
