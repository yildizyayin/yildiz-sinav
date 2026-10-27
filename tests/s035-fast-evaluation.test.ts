import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { evaluationSnapshot, generatedSheets } from './helpers/evaluation-snapshot';
import { setup } from './helpers/sonuc-setup';
import { chunkSizeFor } from '../worker/chunked-evaluation-entry';

/**
 * S035 (owner report 27 Oct: 100 students on sonuc never finished). The engine now writes set-based; these tests
 * prove it writes exactly what the previous engine wrote. tests/fixtures/evaluation-golden.json was produced by the
 * unchanged main branch (c3bc5c7) on the same synthetic sheets: participants, results, subject results, every
 * answer, outcomes and the assessment ledger.
 */
const golden = JSON.parse(readFileSync('tests/fixtures/evaluation-golden.json', 'utf8'));
const norm = (x: any) => JSON.parse(JSON.stringify(x).replace(/"inst_[0-9a-f-]+"/g, '"INST"'));
const twoSheets = [{ no: '7', name: 'AYSE KAYA', TUR: 'ABCD', MAT: 'DCB_' }, { no: '8', name: 'CAN DEMIR', TUR: 'A_CC', MAT: 'DDDD' }];

async function sonuc(n: number) {
  const { t, call, upload } = await setup();
  const up = await upload('dealerI', n === 2 ? twoSheets : generatedSheets(n, 29));
  expect(up.status, up.text).toBe(200);
  const steps: any[] = [];
  for (let i = 0; i < 50; i++) {
    const ev = await call('dealerI', `/api/admin/result-network/operations/scan-batches/${up.data.batchId}/evaluate`, { method: 'POST' });
    expect(ev.status, ev.text).toBe(200);
    steps.push(ev.data);
    if (ev.data.done !== false) break;
  }
  return { t, steps, batchId: up.data.batchId, call };
}

describe('S035 fast evaluation', () => {
  it('writes the same rows as the previous engine (app, small and 240 students)', async () => {
    for (const [name, sheets] of [['small-chunked', undefined], ['large-chunked', generatedSheets(240)]] as const) {
      const t = await evaluatedExam('chunked', { outcomes: true, sheets: sheets as any });
      expect(norm(evaluationSnapshot(t.db, t.examId)), name).toEqual(norm(golden[name]));
    }
  }, 120000);

  it('writes the same rows on sonuc and finishes 240 students in one request', async () => {
    const small = await sonuc(2);
    expect(norm(evaluationSnapshot(small.t.db, small.t.examId))).toEqual(norm(golden['sonuc-small']));
    const large = await sonuc(240);
    expect(norm(evaluationSnapshot(large.t.db, large.t.examId))).toEqual(norm(golden['sonuc-large']));
    expect(large.steps).toHaveLength(1);
    expect(large.steps[0]).toMatchObject({ ok: true, done: true, processed: 240, total: 240 });
    expect(large.t.db.prepare(`SELECT status FROM scan_batches WHERE id=?`).get(large.batchId)).toEqual({ status: 'COMMITTED' });
  }, 120000);

  it('keeps every request far under the D1 query limit', async () => {
    // count database calls made while one sonuc request evaluates 240 students (a batch counts once, as on D1)
    const { t, call, upload } = await setup();
    const up = await upload('dealerI', generatedSheets(240, 5));
    const db = t.env.DB; let calls = 0;
    t.env.DB = { ...db, prepare: (sql: string) => { const st = db.prepare(sql); const wrap = (s: any): any => ({ ...s, __sql: s.__sql, bind: (...v: any[]) => wrap(s.bind(...v)), first: (...a: any[]) => { calls++; return s.first(...a); }, all: () => { calls++; return s.all(); }, run: () => { calls++; return s.run(); }, raw: () => { calls++; return s.raw(); } }); return wrap(st); }, batch: (st: any[]) => { calls++; return db.batch(st); } };
    const ev = await call('dealerI', `/api/admin/result-network/operations/scan-batches/${up.data.batchId}/evaluate`, { method: 'POST' });
    expect(ev.status, ev.text).toBe(200);
    expect(ev.data.done).toBe(true);
    console.log("S035 D1 calls for 240 students:", calls);
    expect(calls).toBeGreaterThan(10);
    expect(calls).toBeLessThan(150);
  }, 120000);

  it('sizes chunks by answer rows: TYT ~320 students, small exams capped at 400', () => {
    expect(chunkSizeFor(125)).toBe(320);
    expect(chunkSizeFor(90)).toBe(400);
    expect(chunkSizeFor(1000)).toBe(40);
  });
});
