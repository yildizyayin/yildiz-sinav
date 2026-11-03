import { describe, expect, it } from 'vitest';
import { setup } from './helpers/sonuc-setup';
import { generatedSheets } from './helpers/evaluation-snapshot';

process.env.TZ = 'UTC';

/** D-S038: on sonuc every uploaded sheet is a participant. A later upload whose names repeat earlier students' names
 * (with other numbers) is still evaluated, as new students. Synthetic data only. */
describe('sonuc: same names, other numbers', () => {
  it('evaluates later students who share names with students already evaluated twice', async () => {
    const { t, call, upload } = await setup();
    const named = (base: number) => generatedSheets(5, base).map((s, i) => ({ ...s, no: String(base * 100 + i), name: `AYNI ISIM ${'ABCDE'[i]}` }));
    for (const base of [11, 12, 13]) {
      const up = await upload('dealerI', named(base)); expect(up.status, up.text).toBe(200);
      const ev = await call('dealerI', `/api/admin/result-network/operations/scan-batches/${up.data.batchId}/evaluate`, { method: 'POST' });
      expect(ev.status, `${base} ${ev.text}`).toBe(200);
    }
    const inst = (t.db.prepare(`SELECT institution_id i FROM exam_participants WHERE exam_id='${t.examId}' AND institution_id<>'school' LIMIT 1`).get() as any).i;
    expect((t.db.prepare(`SELECT count(*) n FROM exam_participants WHERE exam_id='${t.examId}' AND institution_id='${inst}'`).get() as any).n).toBe(15);
  });
});
