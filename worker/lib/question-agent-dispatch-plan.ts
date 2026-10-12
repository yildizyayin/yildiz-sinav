export function pilotBatchLimit(requested: number, budget: number, reviewSlots: number): number {
  if (![requested,budget,reviewSlots].every(Number.isSafeInteger)) return 0;
  return Math.max(0, Math.min(requested, budget, reviewSlots, 10));
}
