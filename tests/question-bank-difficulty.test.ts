import { describe, expect, it } from 'vitest';
import { legacyDifficulty, normalizeDifficultyLevel } from '../worker/lib/question-bank';

describe('question bank six-level difficulty', () => {
  it('accepts levels one through six and rejects values outside the contract', () => {
    expect([1, 2, 3, 4, 5, 6].map(level => normalizeDifficultyLevel(level))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(normalizeDifficultyLevel(0)).toBeNull();
    expect(normalizeDifficultyLevel(7)).toBeNull();
    expect(normalizeDifficultyLevel('not-a-level')).toBeNull();
  });

  it('keeps level six readable for legacy five-level consumers', () => {
    expect(legacyDifficulty(6)).toBe(5);
    expect(legacyDifficulty(1)).toBe(1);
  });
});
