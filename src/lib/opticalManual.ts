export type ManualOpticalFieldKey =
  | 'student_number'
  | 'first_name'
  | 'last_name'
  | 'name'
  | 'class'
  | 'grade_class'
  | 'section'
  | 'booklet'
  | 'tckn'
  | 'phone'
  | 'gender'
  | 'institution_code'
  | 'school_type'
  | 'track';

export type ManualOpticalField = {
  key: ManualOpticalFieldKey;
  label: string;
  enabled: boolean;
  start: number;
  length: number;
};

export type ManualAnswerBlock = {
  code: string;
  label: string;
  enabled: boolean;
  start: number;
  length: number;
  questionCount: number;
  options: 4 | 5;
};

export const MANUAL_OPTICAL_FIELDS: Array<Pick<ManualOpticalField, 'key' | 'label'>> = [
  { key: 'student_number', label: 'Öğrenci No' },
  { key: 'first_name', label: 'Adı' },
  { key: 'last_name', label: 'Soyadı' },
  { key: 'name', label: 'Ad, Soyad' },
  { key: 'class', label: 'Sınıf' },
  { key: 'grade_class', label: 'Sınıf-Sınıf' },
  { key: 'section', label: 'Sınıf-Şube' },
  { key: 'booklet', label: 'Kitapçık' },
  { key: 'tckn', label: 'T.C. Kimlik No' },
  { key: 'phone', label: 'Telefon' },
  { key: 'gender', label: 'Cinsiyet' },
  { key: 'institution_code', label: 'Kurum Kodu' },
  { key: 'school_type', label: 'Lise Türü' },
  { key: 'track', label: 'Alan' },
];

export function defaultManualFields(): ManualOpticalField[] {
  return MANUAL_OPTICAL_FIELDS.map(({ key, label }) => ({
    key,
    label,
    enabled: key === 'student_number' || key === 'name' || key === 'class' || key === 'booklet' || key === 'tckn',
    start: 0,
    length: 0,
  }));
}

export function defaultManualAnswerBlocks(): ManualAnswerBlock[] {
  return Array.from({ length: 15 }, (_, index) => ({
    code: `TEST-${index + 1}`,
    label: `Test-${index + 1}`,
    enabled: false,
    start: 0,
    length: 0,
    questionCount: 0,
    options: 5 as 4 | 5,
  }));
}

export function buildManualParserDefinition(
  recordLength: number,
  fields: ManualOpticalField[],
  answers: ManualAnswerBlock[],
  indexBase: 0 | 1 = 0,
) {
  const fieldMap: Record<string, { start: number; end: number; length: number; label?: string }> = {};
  for (const field of fields) {
    if (!field.enabled || field.length <= 0) continue;
    const start = Math.max(0, Math.trunc(field.start) - indexBase);
    const length = Math.trunc(field.length);
    const parserKey = field.key === 'grade_class' ? 'class' : field.key;
    fieldMap[parserKey] = { start, end: start + length, length, label: field.label };
  }
  const answerMap: Record<string, { start: number; end: number; length: number; questionCount: number; options: number; label?: string }> = {};
  for (const block of answers) {
    const code = block.code.trim().toUpperCase();
    if (!block.enabled || !code || block.length <= 0) continue;
    const start = Math.max(0, Math.trunc(block.start) - indexBase);
    const length = Math.trunc(block.length);
    answerMap[code] = { start, end: start + length, length, questionCount: Math.max(0, Math.trunc(block.questionCount)), options: block.options, label: block.label };
  }
  return {
    type: 'fixed-width' as const,
    recordLength: Math.trunc(recordLength),
    signature: '',
    fields: fieldMap,
    answers: answerMap,
    source: 'MANUAL',
    indexBase,
  };
}

/**
 * Owner (5 Nov): an optic is defined only by the numbers the user types. Screens count positions from 1 (the 20th
 * character of a TXT line is "20"); the stored definition keeps 0-based start / exclusive end. Nothing is guessed
 * from a sample file, and a definition whose areas overlap or run past the line is refused before it is saved.
 */
type StoredSlice = { start: number; end: number; length?: number; label?: string; questionCount?: number; options?: number };
type StoredDefinition = { recordLength?: number; fields?: Record<string, StoredSlice>; answers?: Record<string, StoredSlice> };

/** The stored definition shown with 1-based positions (start = character number of the first position). */
export function manualFromDefinition(def: StoredDefinition | null | undefined): { recordLength: number; fields: ManualOpticalField[]; answers: ManualAnswerBlock[] } {
  const fields = defaultManualFields().map((f) => ({ ...f, enabled: false }));
  const stored = def?.fields || {};
  for (const field of fields) {
    const key = field.key === 'grade_class' ? null : field.key;
    const s = key ? stored[key] : null;
    if (s && Number.isFinite(Number(s.start)) && Number(s.end) > Number(s.start)) Object.assign(field, { enabled: true, start: Number(s.start) + 1, length: Number(s.end) - Number(s.start) });
  }
  const answers: ManualAnswerBlock[] = Object.entries(def?.answers || {}).map(([code, s]) => ({
    code, label: s.label || code, enabled: true, start: Number(s.start) + 1, length: Number(s.end) - Number(s.start),
    questionCount: Number(s.questionCount || Number(s.end) - Number(s.start)), options: Number(s.options) === 4 ? 4 : 5,
  }));
  return { recordLength: Number(def?.recordLength || 0), fields, answers };
}

export type ManualArea = { name: string; first: number; last: number };

/** Areas in use, as 1-based inclusive character ranges. */
export function manualAreas(fields: ManualOpticalField[], answers: ManualAnswerBlock[]): ManualArea[] {
  const out: ManualArea[] = [];
  for (const f of fields) if (f.enabled && f.length > 0) out.push({ name: f.label, first: Math.trunc(f.start), last: Math.trunc(f.start) + Math.trunc(f.length) - 1 });
  for (const a of answers) if (a.enabled && a.length > 0) out.push({ name: a.label || a.code, first: Math.trunc(a.start), last: Math.trunc(a.start) + Math.trunc(a.length) - 1 });
  return out;
}

/** Problems that stop a manual definition from being saved (1-based inputs). */
export function manualLayoutProblems(recordLength: number, fields: ManualOpticalField[], answers: ManualAnswerBlock[]): string[] {
  const problems: string[] = [];
  if (!Number.isInteger(recordLength) || recordLength < 1) problems.push('Satır uzunluğu (karakter sayısı) girilmelidir.');
  const name = fields.find((f) => f.key === 'name');
  const first = fields.find((f) => f.key === 'first_name'), last = fields.find((f) => f.key === 'last_name');
  if (!(name?.enabled && name.length > 0) && !(first?.enabled && first.length > 0 && last?.enabled && last.length > 0)) problems.push('Ad Soyad alanı (ya da Adı ve Soyadı) girilmelidir.');
  if (!answers.some((a) => a.enabled && a.length > 0)) problems.push('En az bir test / cevap alanı girilmelidir.');
  for (const f of [...fields, ...answers]) {
    if (!f.enabled) continue;
    const label = 'code' in f ? (f.label || f.code) : f.label;
    if (!Number.isInteger(f.start) || f.start < 1) problems.push(`${label}: başlangıç 1 veya daha büyük olmalıdır.`);
    if (!Number.isInteger(f.length) || f.length < 1) problems.push(`${label}: hane sayısı 1 veya daha büyük olmalıdır.`);
  }
  for (const a of answers) {
    if (!a.enabled || a.length < 1) continue;
    if (!a.code.trim()) problems.push(`${a.label || 'Test'}: test kodu boş olamaz.`);
    if (a.questionCount > 0 && a.questionCount !== a.length) problems.push(`${a.label || a.code}: ${a.questionCount} soru yazılmış ama ${a.length} hane girilmiş; her soru bir hanedir.`);
  }
  const areas = manualAreas(fields, answers);
  if (recordLength > 0) for (const area of areas) if (area.last > recordLength) problems.push(`${area.name}: ${area.first}–${area.last}. haneler satır uzunluğunu (${recordLength}) aşıyor.`);
  for (let i = 0; i < areas.length; i++) for (let j = i + 1; j < areas.length; j++) {
    const a = areas[i], b = areas[j];
    if (a.first <= b.last && b.first <= a.last) problems.push(`${a.name} (${a.first}–${a.last}) ile ${b.name} (${b.first}–${b.last}) aynı hanelere düşüyor.`);
  }
  return problems;
}

/** What each area reads from the first lines of a sample file; the definition itself is never changed. */
export function manualSamplePreview(text: string, fields: ManualOpticalField[], answers: ManualAnswerBlock[], lines = 3): { areas: ManualArea[]; rows: string[][]; lineLengths: number[] } {
  const areas = manualAreas(fields, answers);
  const sample = String(text || '').split(/\r?\n/).filter((line) => line.trim()).slice(0, lines);
  return { areas, rows: sample.map((line) => areas.map((a) => line.slice(a.first - 1, a.last))), lineLengths: sample.map((line) => line.length) };
}
