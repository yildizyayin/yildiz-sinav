export type MasteryStatus = 'INSUFFICIENT_EVIDENCE' | 'DEVELOPING' | 'STRONG';

export function masteryStatus(correct: number, evidence: number, threshold = 0.6, minEvidence = 3): MasteryStatus {
  if (evidence < minEvidence) return 'INSUFFICIENT_EVIDENCE';
  const rate = evidence ? correct / evidence : 0;
  return rate >= threshold ? 'STRONG' : 'DEVELOPING';
}
