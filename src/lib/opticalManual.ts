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
