/**
 * Owner (3 Nov): every exam produces a net and a puan. The scoring profiles offered for an exam are the ones of its
 * type that produce a score; net-only practice profiles are no longer offered (an exam that already has one keeps it
 * until it is changed). 5–7. sınıf exams get an LGS-type 100–500 estimate. Shared by the exam form and the server.
 */
export type ScoringChoiceInput = { examType?: string | null; gradeLevel?: number | string | null };

export function scoringRuleCodesFor({ examType, gradeLevel }: ScoringChoiceInput): string[] {
  const type = String(examType || '').toUpperCase(), grade = Number(gradeLevel) || 0;
  if (type === 'LGS') return ['MEB_LGS', 'CUSTOM_EXAM'];
  if (type === 'TYT') return ['OSYM_TYT', 'CUSTOM_EXAM'];
  if (type === 'AYT') return ['OSYM_YKS_SAY', 'OSYM_YKS_EA', 'OSYM_YKS_SOZ', 'CUSTOM_EXAM'];
  if (type === 'YDT') return ['OSYM_YKS_DIL', 'CUSTOM_EXAM'];
  if (type === 'TYT_AYT') return ['OSYM_YKS_SAY', 'OSYM_YKS_EA', 'OSYM_YKS_SOZ', 'OSYM_YKS_DIL', 'CUSTOM_EXAM'];
  if (type === 'CUSTOM') return ['CUSTOM_EXAM', 'SCHOOL_100'];
  // STANDARD / MIDDLE_COMPOSITE by grade
  if (grade >= 5 && grade <= 7) return ['ANUNEX_LGS_TYPE', 'SCHOOL_100', 'CUSTOM_EXAM'];
  if (grade === 8) return ['MEB_LGS', 'SCHOOL_100', 'CUSTOM_EXAM'];
  return ['SCHOOL_100', 'CUSTOM_EXAM'];
}

/** Same rule as worker/lib/scoring.ts scoreMethodFor: a profile whose score model is NONE (or a net-only practice mode) gives no puan. */
export function profileProducesScore(configJson: unknown): boolean {
  let c: any = {}; try { c = typeof configJson === 'string' ? JSON.parse(configJson || '{}') : (configJson || {}); } catch { return true; }
  const model = String(c?.scoreModel || '').toUpperCase();
  if (model) return model !== 'NONE';
  const mode = String(c?.mode || c?.profile || '').toUpperCase();
  return ['WEIGHTED_PERCENT', 'SCHOOL_100', 'CUSTOM', 'CUSTOM_EXAM', 'LGS_STANDARD', 'MEB_LGS'].includes(mode);
}

/** The profiles to offer, in the order above (the first is the default); the current one stays visible. */
export function scoringChoices<T extends { id: string; rule_code?: string; config_json?: unknown }>(versions: T[], input: ScoringChoiceInput, currentId?: string | null): T[] {
  const codes = scoringRuleCodesFor(input);
  const offered = codes.flatMap((code) => versions.filter((v) => String(v.rule_code || '').toUpperCase() === code && profileProducesScore(v.config_json)));
  const current = currentId ? versions.find((v) => v.id === currentId) : undefined;
  return current && !offered.includes(current) ? [current, ...offered] : offered;
}
