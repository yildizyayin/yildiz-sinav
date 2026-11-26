import { expect, it } from 'vitest';
import { CASES, caseFor, caseProblems } from '../src/components/universe/mysteryCases';

/** Gizem Dosyası (owner, 26 Nov 2026): every case can be solved by its own clues, kindly, the same way each time. */
it('every case has three suspects and three clues that lead to exactly one person', () => {
  for (const c of CASES) {
    expect(caseProblems(c), c.id).toEqual([]);
    // the culprit fits every clue's facts the case relies on: never ruled out, and the last clue names no one else
    const left = c.suspects.filter((s) => !c.clues.some((k) => k.rulesOut === s.id));
    expect(left.map((s) => s.id), c.id).toEqual([c.culprit]);
    expect(c.ending.length, c.id).toBeGreaterThan(40);
  }
  expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
});

it('gives the same play the same case and spreads plays over the cases', () => {
  expect(caseFor('abc').id).toBe(caseFor('abc').id);
  const seen = new Set(Array.from({ length: 40 }, (_, k) => caseFor(`session-${k}`).id));
  expect(seen.size).toBe(CASES.length);
});
