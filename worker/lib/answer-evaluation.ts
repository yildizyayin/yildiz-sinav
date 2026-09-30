type AnyRow = Record<string, any>;
type AnswerStatus = 'CORRECT' | 'WRONG' | 'BLANK' | 'INVALID';

export function parseAcceptedAnswers(value: unknown, primary: string): string[] {
  const fallback = String(primary || '').trim().toUpperCase();
  if (Array.isArray(value)) {
    const parsed = value.map((item) => String(item ?? '').trim().toUpperCase()).filter(Boolean);
    return [...new Set(parsed.length ? parsed : [fallback])].filter(Boolean);
  }
  const raw = String(value ?? '').trim();
  if (!raw) return fallback ? [fallback] : [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parseAcceptedAnswers(parsed, fallback);
  } catch {
    // Legacy rows may contain a single answer or delimited text rather than JSON.
  }
  const parsed = raw.split(/[|/,;]/).map((item) => item.trim().toUpperCase()).filter(Boolean);
  return [...new Set(parsed.length ? parsed : [fallback])].filter(Boolean);
}

export function evaluateAnswer(rawValue: unknown, key: AnyRow): { status: AnswerStatus; contributesToScore: boolean; contributesToOutcome: boolean } {
  const questionStatus = String(key.question_status || 'ACTIVE').toUpperCase();
  if (questionStatus === 'CANCELLED' || questionStatus === 'EXCLUDED') {
    return { status: 'INVALID', contributesToScore: false, contributesToOutcome: false };
  }
  const raw = String(rawValue ?? '').trim().toUpperCase();
  if (!raw || raw === '_') return { status: 'BLANK', contributesToScore: true, contributesToOutcome: true };
  const accepted = parseAcceptedAnswers(key.accepted_answers, key.correct_answer);
  return accepted.includes(raw)
    ? { status: 'CORRECT', contributesToScore: true, contributesToOutcome: true }
    : { status: 'WRONG', contributesToScore: true, contributesToOutcome: true };
}

