import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { setup } from './helpers/sonuc-setup';
import { generatedSheets } from './helpers/evaluation-snapshot';

process.env.TZ = 'UTC';

/** 3 Nov (load measurement): institution ranks are written in one pass, and stay correct across several uploads. Synthetic data only. */
describe('institution rank after evaluation', () => {
  it('is computed once and joined, not re-ranked per row', () => {
    const src = readFileSync(new URL('../worker/chunked-evaluation-entry.ts', import.meta.url), 'utf8');
    expect(src).toContain('SET institution_rank=ranked.rn FROM (');
    expect(src).not.toContain('SET institution_rank=(SELECT rn FROM');
  });
  it('ranks every student of the school across uploads by score, net and correct answers', async () => {
    const { t, call, upload } = await setup();
    for (const [n, seed, base] of [[30, 3, 1000], [25, 9, 2000], [20, 15, 3000]] as const) {
      const up = await upload('dealerI', generatedSheets(n, seed).map((s, i) => ({ ...s, no: String(base + i), name: `OGR ${base + i} ${s.name.split(' ').pop()}` })));
      expect(up.status, up.text).toBe(200);
      const ev = await call('dealerI', `/api/admin/result-network/operations/scan-batches/${up.data.batchId}/evaluate`, { method: 'POST' });
      expect(ev.status, `${base} ${ev.text}`).toBe(200);
    }
    const inst = (t.db.prepare(`SELECT institution_id i FROM exam_participants WHERE exam_id='${t.examId}' AND institution_id<>'school' LIMIT 1`).get() as any).i;
    const rows = t.db.prepare(`SELECT er.institution_rank r,er.score,er.net,er.correct_count c FROM exam_results er JOIN exam_participants ep ON ep.id=er.participant_id WHERE ep.exam_id='${t.examId}' AND ep.institution_id='${inst}' ORDER BY er.institution_rank`).all() as any[];
    expect(rows).toHaveLength(75);
    expect(rows.map((r) => r.r)).toEqual(Array.from({ length: 75 }, (_, i) => i + 1));
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i], ka = [a.score ?? -1e9, a.net, a.c], kb = [b.score ?? -1e9, b.net, b.c];
      expect(ka[0] > kb[0] || (ka[0] === kb[0] && (ka[1] > kb[1] || (ka[1] === kb[1] && ka[2] >= kb[2])))).toBe(true);
    }
  });
});
