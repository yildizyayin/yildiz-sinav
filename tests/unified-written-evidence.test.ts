import { expect, it } from 'vitest';
import { finalWrittenPaper } from './helpers/written-item';

/**
 * Birleşik Karne: finalised written grades join the outcome record for staff. An item counts as right at 70% of its
 * points (the written report's "strong" threshold); items without an outcome are left out; learners do not see written
 * evidence, since written grades are not shown to them anywhere yet. Synthetic data only.
 */
it('adds finalised written items to the outcome record for staff only', async () => {
  const t = await finalWrittenPaper();
  try {
    const [bank, zumre] = t.items;
    const record = async (who: string) => (await t.as(who, '/api/reporting/students/s1/outcome-evidence')).data.outcomes.find((o: any) => o.code === 'T.8.1.1');
    const before = await record('mgr');
    await t.score('s1', bank.id, [20, 10]); await t.score('s1', zumre.id, [60]);
    // scored but not finalised: not evidence yet
    expect((await record('mgr'))?.bySource?.WRITTEN?.attempts ?? 0).toBe(0);
    await t.finalize('s1');
    const after = await record('mgr');
    expect(after.bySource.WRITTEN).toEqual({ attempts: 1, correct: 1 }); // 30/40 = 75% ≥ 70%
    expect(after.uniqueQuestions).toBe((before?.uniqueQuestions ?? 0) + 1);
    // a re-finalised lower grade replaces it: 20/40 = 50% is not right
    await t.score('s1', bank.id, [10, 10], 'Yeniden okundu, eksik adımlar var.'); await t.finalize('s1', 'İtiraz sonrası yeniden okundu.');
    expect((await record('mgr')).bySource.WRITTEN).toEqual({ attempts: 1, correct: 0 });
    // the student's own view does not include written evidence
    const own = await t.as('stuuser', '/api/reporting/students/s1/outcome-evidence');
    expect(own.response.status, own.text).toBe(200);
    expect(own.text).not.toMatch(/"WRITTEN":\{"attempts":[1-9]/);
  } finally { t.db.close(); }
}, 180000);
