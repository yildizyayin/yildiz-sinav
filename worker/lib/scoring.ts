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
  // A024: 0 means "wrong answers do not cancel correct ones" (school exams, custom "yanlış götürmez").
  // Before, 0 silently became 4.
  const divisor = Number(input.wrongDivisor);
  const net = round4(input.correct - (divisor > 0 ? input.wrong / divisor : 0));
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

/**
 * A024: the exam score next to the nets. Official MEB/ÖSYM scores need national cohort statistics,
 * which no practice exam has, so the only scores produced here are:
 *  - PERCENT (school 100): share of the maximum net, 0–100
 *  - CUSTOM: the institution's own scale over (optionally weighted) nets
 *  - LGS_ESTIMATE: 100 + 400 × weighted net share with MEB test weights (4/4/4/1/1/1); an estimate,
 *    labelled as such, not MEB's standard-score result
 * ÖSYM profiles return null until estimate coefficients are approved; ranking then uses nets.
 */
export type ScoreMethod = 'PERCENT' | 'CUSTOM' | 'LGS_ESTIMATE' | 'NONE';
export interface ScoredSubject { subjectId?: string; code?: string; net: number; questionCount: number }
const LGS_WEIGHTS: Record<string, number> = { TUR: 4, MAT: 4, FEN: 4, INK: 1, DIN: 1, YAB: 1 };

export function scoreMethodFor(config: any): ScoreMethod {
  const model = String(config?.scoreModel || '').toUpperCase();
  if (['PERCENT', 'CUSTOM', 'LGS_ESTIMATE', 'NONE'].includes(model)) return model as ScoreMethod;
  const mode = String(config?.mode || config?.profile || '').toUpperCase();
  if (mode === 'WEIGHTED_PERCENT' || mode === 'SCHOOL_100') return 'PERCENT';
  if (mode === 'CUSTOM' || mode === 'CUSTOM_EXAM') return 'CUSTOM';
  if (mode === 'LGS_STANDARD' || mode === 'MEB_LGS') return 'LGS_ESTIMATE';
  return 'NONE';
}

/** Effective wrong-answer divisor: a custom exam's own rule wins over the per-subject default. */
export function effectiveWrongDivisor(subjectDivisor: unknown, method: ScoreMethod, override: any): number {
  if (method === 'CUSTOM' && override && typeof override === 'object' && override.wrongDivisor !== undefined && override.wrongDivisor !== null) {
    const v = Number(override.wrongDivisor); return Number.isFinite(v) && v >= 0 ? v : 0;
  }
  const v = Number(subjectDivisor);
  return Number.isFinite(v) && v >= 0 ? v : 4;
}

function lgsWeight(code: string | undefined): number {
  const c = String(code || '').toUpperCase();
  for (const [k, w] of Object.entries(LGS_WEIGHTS)) if (c === k || c.endsWith(`_${k}`)) return w;
  return 1;
}

export function calculateExamScore(method: ScoreMethod, subjects: ScoredSubject[], override?: any): number | null {
  const valid = subjects.filter((s) => s.questionCount > 0);
  if (!valid.length || method === 'NONE') return null;
  const share = (weight: (s: ScoredSubject) => number) => {
    const max = valid.reduce((sum, s) => sum + weight(s) * s.questionCount, 0);
    return max > 0 ? valid.reduce((sum, s) => sum + weight(s) * Math.max(0, s.net), 0) / max : 0;
  };
  if (method === 'PERCENT') return round2(100 * share(() => 1));
  if (method === 'LGS_ESTIMATE') return round2(100 + 400 * share((s) => lgsWeight(s.code)));
  const weights = override && typeof override.weights === 'object' && override.weights ? override.weights : {};
  const scale = Number(override?.scoreScale) > 0 ? Number(override.scoreScale) : 100;
  return round2(scale * share((s) => { const w = Number(weights[s.subjectId || ''] ?? weights[s.code || ''] ?? 1); return Number.isFinite(w) && w >= 0 ? w : 1; }));
}
