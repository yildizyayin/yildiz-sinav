export interface SubjectScoreInput {
  correct: number;
  wrong: number;
  blank: number;
  wrongDivisor: number;
  questionCount: number;
}

export interface SubjectScore extends SubjectScoreInput {
  net: number;
  successPercent: number;
}

export function calculateSubjectScore(input: SubjectScoreInput): SubjectScore {
  const divisor = input.wrongDivisor > 0 ? input.wrongDivisor : 4;
  const net = round4(input.correct - input.wrong / divisor);
  const successPercent = input.questionCount > 0 ? round2((Math.max(0, net) / input.questionCount) * 100) : 0;
  return { ...input, net, successPercent };
}

export function calculateOverall(subjects: SubjectScore[]): { correct: number; wrong: number; blank: number; net: number; successPercent: number } {
  const correct = subjects.reduce((s, x) => s + x.correct, 0);
  const wrong = subjects.reduce((s, x) => s + x.wrong, 0);
  const blank = subjects.reduce((s, x) => s + x.blank, 0);
  const net = round4(subjects.reduce((s, x) => s + x.net, 0));
  const total = subjects.reduce((s, x) => s + x.questionCount, 0);
  return { correct, wrong, blank, net, successPercent: total ? round2((Math.max(0, net) / total) * 100) : 0 };
}

export function assertScoringRuleVerified(rule: { verified: number; authority?: string | null }): void {
  if (!rule.verified) throw new Error('OFFICIAL_SCORING_RULE_REQUIRED');
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round4(n: number): number { return Math.round(n * 10000) / 10000; }
