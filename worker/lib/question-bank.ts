export const QUESTION_DIFFICULTY_LEVELS = [1, 2, 3, 4, 5, 6] as const;

export function normalizeDifficultyLevel(value: unknown, fallback: number | null = null): number | null {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const level = Number(value);
  return Number.isInteger(level) && level >= 1 && level <= 6 ? level : fallback;
}

/** Legacy consumers still read question_bank.difficulty, which only supports 1–5. */
export function legacyDifficulty(level: number): number {
  return Math.max(1, Math.min(5, Math.round(level)));
}

