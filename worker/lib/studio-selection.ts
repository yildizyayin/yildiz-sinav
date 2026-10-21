/**
 * A083: one definition of "which questions may go into this Studio document", shared by
 * document creation and the catalog the form uses to show stock before creating.
 * Every step is a named filter so the form can say exactly which one narrowed the pool to zero.
 * The approval, copyright and tenant gates are always on and cannot be switched off by input.
 */
export type SelectionInput = {
  institutionId: string;
  gradeLevel?: number | null;
  subjectId?: string | null;
  academicYear?: string | null;
  optionMode?: 'FOUR' | 'FIVE' | 'MIXED';
  outcomeCodes?: string[];
  teacherUserId?: string | null;
};
export type SelectionStep = { key: string; label: string; clause: string; params: unknown[] };

export const MAX_OUTCOMES = 30;

export function outcomeWhere(input: SelectionInput, count: number) {
  return {
    clause: `o.code IN (${Array.from({ length: count }, () => '?').join(',')}) AND o.active=1 AND cv.verified=1 AND (? IS NULL OR o.grade_level=?) AND (? IS NULL OR o.subject_id=?) AND (? IS NULL OR cv.academic_year=?)`,
    params: [...(input.outcomeCodes || []), input.gradeLevel ?? null, input.gradeLevel ?? null, input.subjectId ?? null, input.subjectId ?? null, input.academicYear ?? null, input.academicYear ?? null],
  };
}

export function selectionSteps(input: SelectionInput): SelectionStep[] {
  const steps: SelectionStep[] = [
    { key: 'base', label: 'Onaylı, telif uygun, kurumun kullanabileceği çoktan seçmeli sorular',
      // A083: open-ended items have no options and cannot be printed on the optical sheet or scored by it.
      clause: `q.review_status='APPROVED' AND q.copyright_status IN ('OWNED','LICENSED','PUBLIC_DOMAIN') AND COALESCE(q.question_type,'MULTIPLE_CHOICE')='MULTIPLE_CHOICE' AND (COALESCE(q.owner_type,'PLATFORM')='PLATFORM' OR (q.owner_type='INSTITUTION' AND q.owner_id=?))`,
      params: [input.institutionId] },
  ];
  if (input.teacherUserId) steps.push({ key: 'teacher', label: 'Branş yetkiniz olan dersler', clause: `q.subject_id IN (SELECT ta.subject_id FROM teacher_assignments ta WHERE ta.user_id=? AND ta.institution_id=? AND ta.active=1 AND ta.assignment_type='SUBJECT')`, params: [input.teacherUserId, input.institutionId] });
  if (input.gradeLevel) steps.push({ key: 'grade', label: `${input.gradeLevel}. sınıf`, clause: 'q.grade_level=?', params: [input.gradeLevel] });
  if (input.subjectId) steps.push({ key: 'subject', label: 'Seçilen ders', clause: 'q.subject_id=?', params: [input.subjectId] });
  if (input.academicYear) steps.push({ key: 'year', label: `${input.academicYear} eğitim yılı`, clause: 'q.academic_year=?', params: [input.academicYear] });
  if (input.optionMode === 'FOUR') steps.push({ key: 'options', label: 'Yalnız A–D şıklı', clause: 'COALESCE(q.option_count,4)=4', params: [] });
  if (input.optionMode === 'FIVE') steps.push({ key: 'options', label: 'Yalnız A–E şıklı', clause: 'COALESCE(q.option_count,4)=5', params: [] });
  const codes = input.outcomeCodes || [];
  if (codes.length) {
    const ow = outcomeWhere(input, codes.length);
    steps.push({ key: 'outcomes', label: `Seçilen ${codes.length} kazanım`, clause: `EXISTS(SELECT 1 FROM question_learning_links l JOIN outcomes o ON l.node_id='ln_'||o.id JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE l.question_id=q.id AND ${ow.clause})`, params: ow.params });
  }
  return steps;
}

export function joinSteps(steps: SelectionStep[]) {
  return { where: steps.map(s => `(${s.clause})`).join(' AND '), params: steps.flatMap(s => s.params) };
}

export function parseAcademicYear(raw: unknown): { ok: true; value: string | null } | { ok: false } {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (!v) return { ok: true, value: null };
  const y = /^(\d{4})-(\d{4})$/.exec(v);
  return y && Number(y[2]) === Number(y[1]) + 1 ? { ok: true, value: v } : { ok: false };
}

export function parseOutcomeCodes(raw: unknown): string[] {
  return [...new Set<string>((Array.isArray(raw) ? raw : String(raw || '').split(',')).map((x: any) => String(x).trim()).filter(Boolean))];
}

/** The first step after which nothing is left, phrased for the form. */
export function narrowingMessage(funnel: Array<{ key: string; label: string; count: number }>, requested: number): string | null {
  const last = funnel[funnel.length - 1];
  if (!last || last.count >= requested) return null;
  const culprit = funnel.find((f, i) => i > 0 && f.count < requested && funnel[i - 1].count >= requested) || funnel.find(f => f.count < requested)!;
  const before = funnel[funnel.indexOf(culprit) - 1];
  return before
    ? `${requested} soru gerekli, uygun ${last.count} soru var. Havuzu en çok daraltan: "${culprit.label}" (${before.count} → ${culprit.count}).`
    : `${requested} soru gerekli; kurumun kullanabileceği onaylı soru yalnız ${culprit.count}.`;
}

/** A083.2: difficulty mix. Bands are the editorial estimate (question_bank.difficulty_band); no measured item statistics exist yet. */
export const BANDS = ['EASY', 'MEDIUM', 'HARD'] as const;
export type Band = typeof BANDS[number];
export type DifficultyMix = Record<Band, number>;
export const BAND_LABEL: Record<Band, string> = { EASY: 'Kolay', MEDIUM: 'Orta', HARD: 'Zor' };

export function parseDifficultyMix(raw: unknown): { ok: true; value: DifficultyMix | null } | { ok: false; message: string } {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null };
  const src = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!src || typeof src !== 'object') return { ok: false, message: 'Zorluk karışımı EASY/MEDIUM/HARD yüzdeleri olmalıdır.' };
  const mix = {} as DifficultyMix;
  for (const b of BANDS) { const v = Number((src as any)[b] ?? 0); if (!Number.isInteger(v) || v < 0 || v > 100) return { ok: false, message: `${BAND_LABEL[b]} yüzdesi 0–100 arası tam sayı olmalıdır.` }; mix[b] = v; }
  const sum = BANDS.reduce((s, b) => s + mix[b], 0);
  if (sum !== 100) return { ok: false, message: `Zorluk yüzdelerinin toplamı 100 olmalıdır (şu an ${sum}).` };
  return { ok: true, value: mix };
}

/** Question counts per band; largest remainder so they always add up to the total. */
export function bandTargets(total: number, mix: DifficultyMix): DifficultyMix {
  const raw = BANDS.map(b => ({ b, exact: total * mix[b] / 100 }));
  const out = {} as DifficultyMix; let used = 0;
  for (const r of raw) { out[r.b] = Math.floor(r.exact); used += out[r.b]; }
  raw.sort((x, y) => (y.exact - Math.floor(y.exact)) - (x.exact - Math.floor(x.exact)) || BANDS.indexOf(x.b) - BANDS.indexOf(y.b));
  for (let i = 0; used < total; i++, used++) out[raw[i % raw.length].b]++;
  return out;
}

export function bandShortage(targets: DifficultyMix, stock: Partial<Record<Band, number>>): string | null {
  const short = BANDS.filter(b => targets[b] > Number(stock[b] || 0));
  return short.length ? `Zorluk karışımı karşılanamıyor: ${short.map(b => `${BAND_LABEL[b]} ${targets[b]} gerekli, ${Number(stock[b] || 0)} var`).join('; ')}.` : null;
}

export const BAND_SQL = `COALESCE(q.difficulty_band,'MEDIUM')`;
