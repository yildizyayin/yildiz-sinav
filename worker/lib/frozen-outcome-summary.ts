// Call only after the source reader has authorized and validated frozen evidence.
// A question linked to several outcomes contributes once to each outcome; these
// rows must never be summed to obtain the subject's question total.
export type FrozenOutcomeContext = {
  subjectId: string; curriculumVersionId: string; academicYear: string;
  gradeLevel: number; programVersion: string | null;
};
type Counts = { correct: number; wrong: number; blank: number; invalid: number };
export type FrozenOutcomeSummary = FrozenOutcomeContext & Counts & {
  outcomeId: string; outcomeCode: string | null; outcomeTitle: string | null;
  titleConflict: boolean; evidenceCount: number; accuracyPercent: number | null;
  sourceBreakdown?: ({ sourceType: string } & Counts & { evidenceCount: number })[];
};
export type FrozenOutcomeMap = Map<string, FrozenOutcomeSummary>;
export const outcomeKey = (row: FrozenOutcomeContext & { outcomeId: string }) => JSON.stringify([
  row.subjectId, row.curriculumVersionId, row.academicYear, row.gradeLevel,
  row.programVersion, row.outcomeId,
]);
const label = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
function resolveLabels(target: FrozenOutcomeSummary, value: any) {
  if (target.titleConflict || value.titleConflict ||
      (target.outcomeTitle && label(value.outcomeTitle) && target.outcomeTitle !== label(value.outcomeTitle)) ||
      (target.outcomeCode && label(value.outcomeCode) && target.outcomeCode !== label(value.outcomeCode))) {
    target.titleConflict = true; target.outcomeTitle = null; target.outcomeCode = null;
  } else {
    target.outcomeTitle ||= label(value.outcomeTitle);
    target.outcomeCode ||= label(value.outcomeCode);
  }
}
function createRow(context: FrozenOutcomeContext, outcomeId: string): FrozenOutcomeSummary {
  return { ...context, outcomeId, outcomeCode: null, outcomeTitle: null,
    titleConflict: false, correct: 0, wrong: 0, blank: 0, invalid: 0,
    evidenceCount: 0, accuracyPercent: null };
}
export function addFrozenOutcomeEvidence(target: FrozenOutcomeMap, refs: any[], status: string,
  context: FrozenOutcomeContext, frozenLabels: any[] = []) {
  if (!['CORRECT', 'WRONG', 'BLANK', 'INVALID'].includes(status)) return;
  const seen = new Set<string>();
  for (const ref of refs) {
    if (typeof ref?.outcomeId !== 'string' || !ref.outcomeId || ref.outcomeId.length > 100 || seen.has(ref.outcomeId) ||
        ref.subjectId !== context.subjectId || ref.curriculumVersionId !== context.curriculumVersionId ||
        ref.academicYear !== context.academicYear || ref.gradeLevel !== context.gradeLevel ||
        (ref.programVersion ?? null) !== context.programVersion) continue;
    seen.add(ref.outcomeId);
    const key = outcomeKey({ ...context, outcomeId: ref.outcomeId });
    let row = target.get(key);
    if (!row) { row = createRow(context, ref.outcomeId); target.set(key, row); }
    const snapshotLabel = frozenLabels.find(value => value?.outcome_id === ref.outcomeId && value.subject_id === context.subjectId);
    resolveLabels(row, { outcomeCode: ref.outcomeCode ?? snapshotLabel?.code, outcomeTitle: ref.outcomeTitle ?? snapshotLabel?.title });
    row[status.toLowerCase() as keyof Counts]++;
  }
}
export function finishFrozenOutcomes(target: FrozenOutcomeMap) {
  return [...target.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, row]) => {
    const evidenceCount = row.correct + row.wrong + row.blank;
    return { ...row, evidenceCount, accuracyPercent: evidenceCount ? Math.round(row.correct / evidenceCount * 10000) / 100 : null };
  });
}
export function mergeFrozenOutcomes(sources: { sourceType: string; report: any }[]) {
  const target: FrozenOutcomeMap = new Map();
  for (const { sourceType, report } of sources) for (const raw of report?.outcomes || []) {
    if (!raw?.outcomeId || !raw.subjectId || !raw.curriculumVersionId || !raw.academicYear || !Number.isInteger(raw.gradeLevel) ||
        ['correct', 'wrong', 'blank', 'invalid'].some(key => !Number.isSafeInteger(raw[key] ?? 0) || (raw[key] ?? 0) < 0)) continue;
    const context = { subjectId: raw.subjectId, curriculumVersionId: raw.curriculumVersionId,
      academicYear: raw.academicYear, gradeLevel: raw.gradeLevel, programVersion: raw.programVersion ?? null };
    const key = outcomeKey({ ...context, outcomeId: raw.outcomeId });
    let row = target.get(key);
    if (!row) { row = { ...createRow(context, raw.outcomeId), sourceBreakdown: [] }; target.set(key, row); }
    resolveLabels(row, raw);
    row.correct += raw.correct; row.wrong += raw.wrong; row.blank += raw.blank; row.invalid += raw.invalid || 0;
    if (sourceType === 'COMBINED_BASE') row.sourceBreakdown!.push(...(raw.sourceBreakdown || []));
    else row.sourceBreakdown!.push({ sourceType, correct: raw.correct, wrong: raw.wrong,
      blank: raw.blank, invalid: raw.invalid || 0, evidenceCount: raw.correct + raw.wrong + raw.blank });
  }
  return finishFrozenOutcomes(target);
}
export function outcomeFeedback(outcomes: FrozenOutcomeSummary[]) {
  return {
    policy: 'SELECTED_FROZEN_OUTCOME_FORMATIVE_FEEDBACK_V1',
    basis: 'SOURCE_QUESTION_EVENTS',
    competenceLevel: null, processComponentLevel: null,
    message: 'Öneriler seçili sorulardaki doğru, yanlış ve boş kanıtlarına dayanır. Bir sorunun birden fazla öğrenme çıktısı olabilir; çıktı satırları ders toplamı için toplanmaz. Beceri ve süreç bileşeni düzeyi için ayrıca performans kanıtı ve doğrulanmış rubrik gerekir.',
    rows: outcomes.map(row => ({ ...row,
      suggestions: row.evidenceCount === 0 ? ['Bu seçimde değerlendirilebilir soru kanıtı yok. Yeni bir çalışma seçin.'] : [
        ...(row.wrong > 0 ? ['Yanlış çözümlerde çözüm adımlarını karşılaştırın ve farklı bir soruda aynı yöntemi deneyin.'] : []),
        ...(row.blank > 0 ? ['Boş bırakılan sorularda ilk çözüm adımını belirleyin; gereken konu desteğini öğretmeninizle seçin.'] : []),
        ...(row.wrong === 0 && row.blank === 0 ? ['Seçili sorulardaki doğru çözümleri farklı bir bağlamda uygulayarak pekiştirin.'] : []),
      ],
      reflectionPrompt: 'Hangi adımı kendi başıma açıklayabiliyorum, hangi adımda destek istiyorum?',
    })),
  };
}
