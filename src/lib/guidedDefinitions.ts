export type SubjectOption = { id: string; code: string; name: string };
export type OutcomeReference = {
  code?: string;
  title?: string;
  /** The label/code supplied by the publisher; never treated as official by itself. */
  publisherCode?: string;
  publisherTitle?: string;
  /** An official code supplied alongside the publisher label in a source workbook. */
  officialCode?: string;
  unit?: string;
  topic?: string;
  subtopic?: string;
  parentCode?: string;
};
export type OutcomeCatalogEntry = { id: string; subject_id: string; code?: string | null; title?: string | null; topic?: string | null; subtopic?: string | null; official?: number | boolean; verified?: number | boolean };
export type ParsedAnswerEntry = {
  subjectId: string;
  bookletCode: string;
  answers: string;
  optionCount?: 4 | 5;
  acceptedAnswers?: Array<string | string[]>;
  questionStatuses?: Array<'ACTIVE' | 'CANCELLED' | 'EXCLUDED'>;
  outcomeRefs?: Array<OutcomeReference | null>;
  /** All outcome references supplied for each logical question. */
  outcomeRefsByQuestion?: Array<OutcomeReference[]>;
  /** Printed question number for each logical question, keyed by booklet. */
  bookletQuestionNumbers?: number[];
};
export type ParsedAnswerKey = {
  entries: ParsedAnswerEntry[];
  questionCounts: Record<string, number>;
  questionStarts: Record<string, number>;
  unknownLines: string[];
  detectedBooklets: string[];
  questionCountsByBooklet?: Record<string, Record<string, number>>;
  metadata?: { publisherName?: string; title?: string; gradeLevel?: number; externalExamCode?: string };
  warnings?: string[];
  detectedFormat?: 'TEXT' | 'TABULAR' | 'WIDE_BOOKLET_TABLE';
};

export type FixedWidthSuggestion = {
  recordLength: number;
  lineCount: number;
  studentNumber?: { start: number; end: number };
  name?: { start: number; end: number };
  answerBlocks: Array<{ start: number; end: number; confidence: number }>;
};

export type ExamChoice = {
  key: string;
  examType: 'STANDARD' | 'MIDDLE_COMPOSITE' | 'LGS' | 'TYT' | 'AYT' | 'YDT' | 'TYT_AYT' | 'CUSTOM';
  gradeLevel: number;
  label: string;
  description: string;
  sessionMode: 'SINGLE' | 'VERBAL_NUMERIC' | 'TYT_AYT';
  defaultWrongDivisor: number;
};

export type ExamTemplateSection = {
  subjectCode: string;
  label: string;
  questionCount: number;
  questionStart: number;
  questionEnd: number;
  optionCount: 4 | 5;
  wrongDivisor: number;
};

export type ExamTemplate = {
  key: string;
  label: string;
  description: string;
  examType: ExamChoice['examType'];
  gradeLevel: number;
  scoringCode: string;
  sections: ExamTemplateSection[];
  editable?: boolean;
  requiresOutcomes?: boolean;
  outcomeAuthority?: 'MEB' | 'ÖSYM';
  optionalSections?: Array<ExamTemplateSection & { subjectCode: string }>;
};

export const EXAM_CHOICES: ExamChoice[] = [
  { key: 'LGS', examType: 'LGS', gradeLevel: 8, label: '8. Sınıf · LGS', description: 'Sözel ve sayısal oturumlar öğrenci numarasıyla tek karnede birleşir.', sessionMode: 'VERBAL_NUMERIC', defaultWrongDivisor: 3 },
  { key: 'TYT', examType: 'TYT', gradeLevel: 12, label: 'TYT', description: 'TYT ders yapısı ve sürümlü puanlama kuralı.', sessionMode: 'SINGLE', defaultWrongDivisor: 4 },
  { key: 'AYT', examType: 'AYT', gradeLevel: 12, label: 'AYT', description: 'Sayısal, eşit ağırlık ve sözel alan sonuçları.', sessionMode: 'SINGLE', defaultWrongDivisor: 4 },
  { key: 'YDT', examType: 'YDT', gradeLevel: 12, label: 'YDT', description: 'Yabancı Dil Testi ve ÖSYM tabanlı dil puanlaması.', sessionMode: 'SINGLE', defaultWrongDivisor: 4 },
  { key: 'TYT_AYT', examType: 'TYT_AYT', gradeLevel: 12, label: 'TYT + AYT Bileşik', description: 'İki sınav sonucu ayrı gösterilir ve bileşik karneye bağlanır.', sessionMode: 'TYT_AYT', defaultWrongDivisor: 4 },
  { key: 'CUSTOM', examType: 'CUSTOM', gradeLevel: 0, label: 'Özel Sınav', description: 'Ders, soru aralığı, şık ve puanlama yapısı tamamen kurum tarafından tanımlanır.', sessionMode: 'SINGLE', defaultWrongDivisor: 0 },
  ...Array.from({ length: 8 }, (_, i): ExamChoice => {
    const grade = i + 5;
    return { key: `STD_${grade}`, examType: 'STANDARD', gradeLevel: grade, label: `${grade}. Sınıf`, description: `${grade}. sınıf genel, ders veya kazanım sınavı.`, sessionMode: 'SINGLE', defaultWrongDivisor: 4 };
  }),
  ...Array.from({ length: 4 }, (_, i): ExamChoice => {
    const grade = i + 5;
    return { key: `MID_${grade}`, examType: 'MIDDLE_COMPOSITE', gradeLevel: grade, label: `${grade}. Sınıf · Sözel + Sayısal`, description: 'Ayrı optik/dosya oturumları öğrenci numarasıyla birleştirilir.', sessionMode: 'VERBAL_NUMERIC', defaultWrongDivisor: 4 };
  }),
];

const section = (subjectCode: string, label: string, questionCount: number, wrongDivisor: number, optionCount: 4 | 5 = 5): ExamTemplateSection => ({
  subjectCode, label, questionCount, questionStart: 1, questionEnd: questionCount, optionCount, wrongDivisor,
});

/**
 * Definition templates only describe the exam envelope. They do not create an
 * answer key and they never define an optical/FMT import format.
 */
export const EXAM_TEMPLATES: ExamTemplate[] = [
  {
    key: 'TYT', label: 'TYT Şablonu', description: 'Türkçe 40 · Sosyal 20 · Temel Matematik 40 · Fen 20', examType: 'TYT', gradeLevel: 12, scoringCode: 'OSYM_TYT',
    sections: [section('TYT_TUR', 'Türkçe', 40, 4), section('TYT_SOS', 'Sosyal Bilimler', 20, 4), section('TYT_MAT', 'Temel Matematik', 40, 4), section('TYT_FEN', 'Fen Bilimleri', 20, 4)],
  },
  {
    key: 'AYT', label: 'AYT Şablonu', description: 'Matematik, Fen, Edebiyat-Sosyal 1 ve Sosyal Bilimler 2 testleri', examType: 'AYT', gradeLevel: 12, scoringCode: 'OSYM_AYT', editable: true,
    sections: [section('AYT_MAT', 'Matematik', 40, 4), section('AYT_FIZ', 'Fizik', 14, 4), section('AYT_KIM', 'Kimya', 13, 4), section('AYT_BIY', 'Biyoloji', 13, 4), section('AYT_TDE', 'Türk Dili ve Edebiyatı', 24, 4), section('AYT_TAR1', 'Tarih-1', 10, 4), section('AYT_COG1', 'Coğrafya-1', 6, 4), section('AYT_TAR2', 'Tarih-2', 11, 4), section('AYT_COG2', 'Coğrafya-2', 11, 4), section('AYT_FEL', 'Felsefe Grubu', 12, 4), section('AYT_DIN', 'Din Kültürü', 6, 4)],
  },
  {
    key: 'YDT', label: 'YDT Şablonu', description: 'Yabancı Dil 80 soru', examType: 'YDT', gradeLevel: 12, scoringCode: 'OSYM_YDT',
    sections: [section('YDT_DIL', 'Yabancı Dil', 80, 4)],
  },
  {
    key: 'LGS', label: 'LGS — MEB Şablonu', description: 'Sözel 50 · Sayısal 40 soru; 3 yanlış 1 doğru', examType: 'LGS', gradeLevel: 8, scoringCode: 'MEB_LGS',
    sections: [section('TUR', 'Türkçe', 20, 3), section('INK', 'İnkılap Tarihi', 10, 3), section('DIN', 'Din Kültürü', 10, 3), section('YAB', 'Yabancı Dil', 10, 3), section('MAT', 'Matematik', 20, 3), section('FEN', 'Fen Bilimleri', 20, 3)],
  },
  ...[5, 6, 7].map((grade): ExamTemplate => ({
    key: `SCHOOL_${grade}`, label: `${grade}. Sınıf Şablonu`, description: 'Temel ders yapısı; soru adetleri oluşturma aşamasında düzenlenebilir.', examType: 'STANDARD', gradeLevel: grade, scoringCode: 'SCHOOL_100', editable: true,
    sections: [section('TUR', 'Türkçe', 20, 4), section('MAT', 'Matematik', 20, 4), section('FEN', 'Fen Bilimleri', 20, 4), section('SOS', 'Sosyal Bilgiler', 20, 4), section('DIN', 'Din Kültürü', 10, 4), section('YAB', 'Yabancı Dil', 10, 4)],
  })),
  { key: 'CUSTOM', label: 'Özel Sınav', description: 'Ders, soru aralığı, şık sayısı ve puanlama kurum standardına göre tanımlanır.', examType: 'CUSTOM', gradeLevel: 0, scoringCode: 'CUSTOM_EXAM', sections: [], editable: true },
];

// These variants are deliberately separate from the ordinary templates: a
// qualified key must be matched against a verified official catalog before it
// can be published. The question envelope and scoring profile stay identical.
const officialTemplate = (baseKey: string, key: string, authority: 'MEB' | 'ÖSYM'): ExamTemplate => {
  const base = EXAM_TEMPLATES.find((template) => template.key === baseKey);
  if (!base) throw new Error(`Template not found: ${baseKey}`);
  return {
    ...base,
    key,
    label: `${base.label} · ${authority} Kazanımlı`,
    description: `${base.description} · ${authority} doğrulanmış kazanım kodlarıyla`,
    requiresOutcomes: true,
    outcomeAuthority: authority,
  };
};

EXAM_TEMPLATES.push(
  officialTemplate('TYT', 'TYT_OUTCOME', 'ÖSYM'),
  officialTemplate('AYT', 'AYT_OUTCOME', 'ÖSYM'),
  officialTemplate('YDT', 'YDT_OUTCOME', 'ÖSYM'),
  officialTemplate('LGS', 'LGS_OUTCOME', 'MEB'),
  officialTemplate('SCHOOL_5', 'SCHOOL_5_OUTCOME', 'MEB'),
  officialTemplate('SCHOOL_6', 'SCHOOL_6_OUTCOME', 'MEB'),
  officialTemplate('SCHOOL_7', 'SCHOOL_7_OUTCOME', 'MEB'),
);

export function cleanAnswers(value: string): string {
  return value.toLocaleUpperCase('tr-TR').replace(/[^ABCDE]/g, '');
}

function norm(value: string): string {
  return value
    .toLocaleUpperCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/İ/g, 'I')
    .replace(/Ş/g, 'S')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C')
    .replace(/[^A-Z0-9]/g, '');
}

export function normalizeCatalogText(value: string | null | undefined): string {
  return norm(String(value || ''));
}

export function matchOfficialOutcome(reference: OutcomeReference | null | undefined, subjectId: string, catalog: OutcomeCatalogEntry[]): { outcomeId?: string; reason: 'CODE' | 'TITLE' | 'AMBIGUOUS' | 'MISSING' | 'UNVERIFIED' } {
  if (!reference) return { reason: 'MISSING' };
  const candidates = catalog.filter((outcome) => outcome.subject_id === subjectId);
  const verified = candidates.filter((outcome) => Number(outcome.official) === 1 && Number(outcome.verified) === 1);
  if (!verified.length) return { reason: 'UNVERIFIED' };
  const referenceCode = reference.officialCode || reference.code;
  if (referenceCode) {
    const allByCode = candidates.filter((outcome) => normalizeCatalogText(outcome.code) === normalizeCatalogText(referenceCode));
    const byCode = verified.filter((outcome) => normalizeCatalogText(outcome.code) === normalizeCatalogText(referenceCode));
    if (byCode.length === 1) return { outcomeId: byCode[0].id, reason: 'CODE' };
    if (byCode.length > 1) return { reason: 'AMBIGUOUS' };
    if (allByCode.length) return { reason: 'UNVERIFIED' };
  }
  if (reference.title) {
    const title = normalizeCatalogText(reference.title);
    const byTitle = verified.filter((outcome) => normalizeCatalogText(outcome.title) === title
      && (!reference.topic || normalizeCatalogText(outcome.topic) === normalizeCatalogText(reference.topic))
      && (!reference.subtopic || normalizeCatalogText(outcome.subtopic) === normalizeCatalogText(reference.subtopic)));
    if (byTitle.length === 1) return { outcomeId: byTitle[0].id, reason: 'TITLE' };
    if (byTitle.length > 1) return { reason: 'AMBIGUOUS' };
  }
  return { reason: 'MISSING' };
}

function cellText(value: unknown): string {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim();
}

function columnLabel(index: number): string {
  let value = '';
  for (let current = index; current >= 0; current = Math.floor(current / 26) - 1) value = String.fromCharCode(65 + (current % 26)) + value;
  return value;
}

function looksLikeOfficialOutcomeCode(value: string): boolean {
  return /^\d{1,3}(?:\.\d+){1,6}$/.test(value) || /^[A-ZÇĞİÖŞÜ]{1,10}[._-]\d+(?:[._-]\d+)*$/i.test(value);
}

function workbookHeaderIndex(headers: string[], matcher: RegExp): number {
  return headers.findIndex((header) => matcher.test(norm(header)));
}

/**
 * Parses the multi-section XLSX layout used by the publisher export shared by
 * the user.  It intentionally keeps the publisher label and the official code
 * as separate pieces of information.  The official code is only a candidate
 * for the verified MEB catalog; it is not accepted as an official mapping until
 * matchOfficialOutcome/backend validation succeeds.
 */
export function parseAnswerKeyWorkbookRows(rows: unknown[][], subjects: SubjectOption[], defaultBooklet = 'A'): ParsedAnswerKey {
  const values = rows.map((row) => row.map(cellText));
  const answerSection = values.findIndex((row) => row.some((cell) => norm(cell) === 'CEVAPANAHTARI'));
  const headerIndex = answerSection >= 0
    ? values.findIndex((row, index) => index > answerSection && row.some((cell) => norm(cell).includes('DOGRUCEVAP')))
    : values.findIndex((row) => row.some((cell) => norm(cell).includes('DOGRUCEVAP')));
  if (headerIndex < 0) return parseAnswerKeyText(values.map((row) => row.join(',')).join('\n'), subjects, defaultBooklet);

  const headers = values[headerIndex] || [];
  const testNoColumn = workbookHeaderIndex(headers, /TESTNO/) >= 0 ? workbookHeaderIndex(headers, /TESTNO/) : 0;
  const testNameColumn = workbookHeaderIndex(headers, /TESTADI|ACIKLAMATESTADI/) >= 0 ? workbookHeaderIndex(headers, /TESTADI|ACIKLAMATESTADI/) : 2;
  const answerColumn = workbookHeaderIndex(headers, /DOGRUCEVAP/) >= 0 ? workbookHeaderIndex(headers, /DOGRUCEVAP/) : 8;
  const publisherTitleColumn = workbookHeaderIndex(headers, /KAZANIMKODU|KAZANIM/) >= 0 ? workbookHeaderIndex(headers, /KAZANIMKODU|KAZANIM/) : 10;
  const questionColumns: Record<string, number> = {};
  for (const booklet of ['A', 'B', 'C', 'D']) {
    const column = workbookHeaderIndex(headers, new RegExp(`${booklet}SORUNO`));
    if (column >= 0) questionColumns[booklet] = column;
  }

  const testNames = new Map<string, string>();
  for (const row of values.slice(0, headerIndex)) {
    const testNo = cellText(row[0]);
    if (!/^\d+$/.test(testNo)) continue;
    const candidate = row.find((cell, index) => index > 0 && /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(cell) && !/TEST|KİTAPÇIK|KITAPCIK/i.test(cell));
    if (candidate) testNames.set(testNo, candidate);
  }

  const metadataRows = values.slice(0, Math.max(0, answerSection >= 0 ? answerSection : headerIndex));
  const metadataValues = metadataRows.flatMap((row) => row.filter(Boolean));
  const title = metadataRows
    .map((row) => { const labelIndex = row.findIndex((value) => norm(value) === 'SINAVADI'); return labelIndex >= 0 ? row.slice(labelIndex + 1).find((value) => value && norm(value) !== 'SINAVADI') : undefined; })
    .find(Boolean) || undefined;
  const publisherName = metadataValues.find((value) => /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(value) && !/SINAV|SINIF|TYT|AYT|YDT|LGS|FORMUL|FORMÜL|DERS|TEST/i.test(value)) || undefined;
  const gradeLabelIndex = metadataValues.findIndex((value) => ['SINIF', 'SINIFLAR'].includes(norm(value)));
  const gradeValue = gradeLabelIndex >= 0 ? metadataValues[gradeLabelIndex + 1] || '' : '';
  const gradeLevel = Number(String(gradeValue).match(/(?:^|\D)([1-9]|1[0-2])(?:\D|$)/)?.[1] || 0) || undefined;
  const optionLabelIndex = metadataValues.findIndex((value) => norm(value) === 'SECENEKSAYISI');
  const optionCount = (Number(optionLabelIndex >= 0 ? metadataValues[optionLabelIndex + 1] : '') || undefined) as 4 | 5 | undefined;
  const warnings: string[] = [];
  const unknownLines: string[] = [];
  const grouped = new Map<string, Array<{ questionNumbers: Record<string, number>; answer: string; reference: OutcomeReference | null; }>>();
  const detectedBooklets: string[] = [];

  for (const row of values.slice(headerIndex + 1)) {
    if (!row.some(Boolean)) continue;
    const testNo = cellText(row[testNoColumn]);
    const subjectToken = cellText(row[testNameColumn]) || testNames.get(testNo) || '';
    const subject = subjectForToken(subjectToken, subjects);
    const questionNumbers: Record<string, number> = {};
    for (const [booklet, column] of Object.entries(questionColumns)) {
      const value = Number(row[column]);
      if (Number.isInteger(value) && value > 0) questionNumbers[booklet] = value;
    }
    const answer = cleanAnswers(row[answerColumn] || '').slice(0, 1);
    const publisherTitle = cellText(row[publisherTitleColumn]);
    const officialCode = row
      .slice(Math.max(publisherTitleColumn + 1, 0))
      .map(cellText)
      .find((value) => looksLikeOfficialOutcomeCode(value));
    const publisherCode = publisherTitle && looksLikeOfficialOutcomeCode(publisherTitle) ? publisherTitle : undefined;
    const reference = publisherTitle || officialCode
      ? { code: officialCode || publisherCode, title: publisherTitle && !looksLikeOfficialOutcomeCode(publisherTitle) ? publisherTitle : undefined, publisherCode, publisherTitle: publisherTitle || undefined, officialCode }
      : null;
    const primaryQuestion = Object.values(questionNumbers)[0];
    if (!subject || !primaryQuestion || !answer) {
      unknownLines.push(row.map((cell, index) => cell ? `${columnLabel(index)}=${cell}` : '').filter(Boolean).join(' | '));
      continue;
    }
    for (const booklet of Object.keys(questionNumbers)) if (!detectedBooklets.includes(booklet)) detectedBooklets.push(booklet);
    const group = grouped.get(subject.id) || [];
    group.push({ questionNumbers, answer, reference });
    grouped.set(subject.id, group);
  }

  if (!detectedBooklets.length) detectedBooklets.push(defaultBooklet.toUpperCase());
  const entries: ParsedAnswerEntry[] = [];
  const questionCounts: Record<string, number> = {};
  const questionStarts: Record<string, number> = {};
  const questionCountsByBooklet: Record<string, Record<string, number>> = {};
  for (const [subjectId, rawRows] of grouped.entries()) {
    const sorted = rawRows.sort((a, b) => (Object.values(a.questionNumbers)[0] || 0) - (Object.values(b.questionNumbers)[0] || 0));
    const start = Object.values(sorted[0]?.questionNumbers || {})[0] || 1;
    questionStarts[subjectId] = start;
    questionCounts[subjectId] = sorted.length;
    questionCountsByBooklet[subjectId] = {};
    for (const booklet of detectedBooklets) {
      const questionNumbers = sorted.map((row) => row.questionNumbers[booklet] || Object.values(row.questionNumbers)[0]);
      const refs = sorted.map((row) => row.reference);
      entries.push({ subjectId, bookletCode: booklet, answers: sorted.map((row) => row.answer).join(''), optionCount: optionCount || 5, acceptedAnswers: sorted.map((row) => [row.answer]), questionStatuses: sorted.map(() => 'ACTIVE'), outcomeRefs: refs, outcomeRefsByQuestion: refs.map((ref) => ref ? [ref] : []), bookletQuestionNumbers: questionNumbers });
      questionCountsByBooklet[subjectId][booklet] = questionNumbers.length;
    }
  }
  if (!entries.length) warnings.push('CEVAP ANAHTARI bölümünde işlenebilir soru satırı bulunamadı.');
  return {
    entries, questionCounts, questionStarts, questionCountsByBooklet, unknownLines, detectedBooklets,
    metadata: { title, publisherName, gradeLevel }, warnings, detectedFormat: 'WIDE_BOOKLET_TABLE',
  };
}

function subjectForToken(token: string, subjects: SubjectOption[]): SubjectOption | undefined {
  const wanted = norm(token);
  if (!wanted) return undefined;
  return subjects.find((s) => norm(s.code) === wanted)
    || subjects.find((s) => norm(s.name) === wanted)
    || subjects.find((s) => norm(s.name).startsWith(wanted) || wanted.startsWith(norm(s.name)));
}

function splitDelimitedLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"' && quoted) { cell += '"'; i++; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (!quoted && (char === ',' || char === ';' || char === '\t')) { cells.push(cell.trim()); cell = ''; continue; }
    cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

function tableHeaderIndex(headers: string[], names: string[]): number {
  return headers.findIndex((header) => names.includes(norm(header)));
}

/**
 * Friendly answer-key parser.
 * Supported examples:
 *   MAT: ABCDEABCDE
 *   TUR;ABCDEABCDE
 *   [A]\nMAT: ...\nTUR: ...\n[B]\nMAT: ...
 *   KITAPCIK B
 */
export function parseAnswerKeyText(text: string, subjects: SubjectOption[], defaultBooklet = 'A'): ParsedAnswerKey {
  const entries: ParsedAnswerEntry[] = [];
  const questionCounts: Record<string, number> = {};
  const questionStarts: Record<string, number> = {};
  const questionCountsByBooklet: Record<string, Record<string, number>> = {};
  const unknownLines: string[] = [];
  const detectedBooklets: string[] = [];
  const warnings: string[] = [];
  const lines = text.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n').filter((line) => line.trim());
  const cleanBooklet = (value: string) => String(value || defaultBooklet).trim().toUpperCase() || defaultBooklet.toUpperCase();
  const unique = <T,>(values: T[]) => [...new Set(values)];

  // XLSX exports frequently contain publisher/title rows before the actual
  // header. Scan a short prefix instead of assuming row one is the header.
  let headerIndex = -1;
  let tableHeaders: string[] = [];
  for (let index = 0; index < Math.min(lines.length, 15); index++) {
    const candidate = splitDelimitedLine(lines[index]).map(norm);
    const hasSubject = candidate.some((x) => ['DERS', 'TEST', 'SUBJECT', 'SUBJECTCODE', 'DERSKODU'].includes(x));
    const hasAnswer = candidate.some((x) => ['CEVAP', 'DOGRUCEVAP', 'ANSWER', 'CORRECTANSWER', 'DOGRU'].includes(x))
      || candidate.some((x) => /^[A-D]CEVAP$/.test(x));
    const hasQuestion = candidate.some((x) => ['SORU', 'SORUNO', 'QUESTION', 'QUESTIONNO', 'SORUNUMARASI'].includes(x))
      || candidate.some((x) => /^[A-D]SORU$/.test(x));
    if (hasSubject && hasAnswer && hasQuestion) { headerIndex = index; tableHeaders = candidate; break; }
  }

  const metadata = (() => {
    if (headerIndex <= 0) return undefined;
    const rows = lines.slice(0, headerIndex).flatMap((line) => splitDelimitedLine(line).map((value) => value.trim()).filter(Boolean));
    const joined = rows.join(' ');
    const gradeMatches = [...norm(joined).matchAll(/(\d{1,2})SINIF/g)].map((match) => Number(match[1]));
    const title = rows.find((value) => /TYT|AYT|YDT|LGS|SINAV|HAZIR|BULUNUS|DENEME/i.test(value) && value.length > 4);
    const publisherName = rows.find((value) => /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(value) && !/SINIF|SINAV|TYT|AYT|YDT|LGS/i.test(value)) || rows[0];
    const externalExamCode = rows.find((value) => /^\d{3,12}$/.test(value));
    const gradeLevel = gradeMatches[0];
    if (new Set(gradeMatches).size > 1) warnings.push(`Dosya üst bilgisinde birden fazla sınıf bilgisi bulundu: ${unique(gradeMatches).join(', ')}. Yayınlamadan önce sınav kartını kontrol edin.`);
    return { publisherName, title, gradeLevel, externalExamCode };
  })();

  if (headerIndex >= 0) {
    const subjectColumn = tableHeaderIndex(tableHeaders, ['DERS', 'SUBJECT', 'SUBJECTCODE', 'DERSKODU']);
    const testColumn = tableHeaderIndex(tableHeaders, ['TEST']);
    const questionColumn = tableHeaderIndex(tableHeaders, ['SORU', 'SORUNO', 'QUESTION', 'QUESTIONNO', 'SORUNUMARASI']);
    const answerColumn = tableHeaderIndex(tableHeaders, ['CEVAP', 'DOGRUCEVAP', 'ANSWER', 'CORRECTANSWER', 'DOGRU']);
    const bookletColumn = tableHeaderIndex(tableHeaders, ['KITAPCIK', 'BOOKLET', 'KITAPCIKKODU']);
    const optionColumn = tableHeaderIndex(tableHeaders, ['SIKSAYISI', 'OPTIONCOUNT', 'OPTIONS']);
    const acceptedColumn = tableHeaderIndex(tableHeaders, ['KABULEDILENCEVAPLAR', 'ACCEPTEDANSWERS', 'ALTERNATIFCEVAP']);
    const statusColumn = tableHeaderIndex(tableHeaders, ['DURUM', 'STATUS', 'QUESTIONSTATUS']);
    const outcomeCodeColumn = tableHeaderIndex(tableHeaders, ['KAZANIMKODU', 'OUTCOMECODE', 'OGRENMECIKTISIKODU']);
    const outcomeTitleColumn = tableHeaderIndex(tableHeaders, ['KAZANIM', 'KAZANIMACIKLAMASI', 'OUTCOME', 'OUTCOMETITLE', 'OGRENMECIKTISI', 'OGRENMECIKTISIACIKLAMASI']);
    const unitColumn = tableHeaderIndex(tableHeaders, ['UNIT', 'UNITE']);
    const topicColumn = tableHeaderIndex(tableHeaders, ['KONU', 'TOPIC']);
    const subtopicColumn = tableHeaderIndex(tableHeaders, ['ALTKONU', 'SUBTOPIC', 'ALTKAZANIM']);
    const parentCodeColumn = tableHeaderIndex(tableHeaders, ['PARENTCODE', 'USTKAZANIMKODU', 'ALTKAZANIMKODU']);
    const bookletQuestionColumns = Object.fromEntries(tableHeaders
      .map((header, index) => { const match = header.match(/^([A-D])SORU$/); return match ? [match[1], index] : null; })
      .filter((value): value is [string, number] => Boolean(value)));
    const bookletAnswerColumns = Object.fromEntries(tableHeaders
      .map((header, index) => { const match = header.match(/^([A-D])(?:CEVAP|DOGRUCEVAP)$/); return match ? [match[1], index] : null; })
      .filter((value): value is [string, number] => Boolean(value)));
    const bookletCodes = unique([
      ...Object.keys(bookletQuestionColumns),
      ...Object.keys(bookletAnswerColumns),
      ...(bookletColumn >= 0 ? lines.slice(headerIndex + 1).map((line) => cleanBooklet(splitDelimitedLine(line)[bookletColumn] || '')).filter(Boolean) : []),
    ]);
    if (!bookletCodes.length) bookletCodes.push(defaultBooklet.toUpperCase());
    for (const code of bookletCodes) if (!detectedBooklets.includes(code)) detectedBooklets.push(code);
    const primaryBooklet = bookletCodes.includes('A') ? 'A' : bookletCodes[0];

    type ParsedRow = {
      subject: SubjectOption;
      canonicalQuestion: number;
      questionNumbers: Record<string, number>;
      answers: Record<string, string>;
      commonAnswer: string;
      accepted: string[];
      status: 'ACTIVE' | 'CANCELLED' | 'EXCLUDED';
      outcomes: OutcomeReference[];
      optionCount: 4 | 5;
    };
    const grouped = new Map<string, ParsedRow[]>();

    for (const line of lines.slice(headerIndex + 1)) {
      const cells = splitDelimitedLine(line);
      const subjectToken = String((subjectColumn >= 0 ? cells[subjectColumn] : '') || (testColumn >= 0 ? cells[testColumn] : '') || '').trim();
      const subject = subjectForToken(subjectToken, subjects);
      const questionNumbers: Record<string, number> = {};
      for (const [code, column] of Object.entries(bookletQuestionColumns)) {
        const value = Number(cells[column]);
        if (Number.isInteger(value) && value > 0) questionNumbers[code] = value;
      }
      if (!Object.keys(questionNumbers).length && questionColumn >= 0) {
        const value = Number(cells[questionColumn]);
        if (Number.isInteger(value) && value > 0) questionNumbers[cleanBooklet(bookletColumn >= 0 ? cells[bookletColumn] : primaryBooklet)] = value;
      }
      const canonicalQuestion = questionNumbers[primaryBooklet] || Object.values(questionNumbers)[0];
      const commonAnswer = cleanAnswers(answerColumn >= 0 ? cells[answerColumn] || '' : '').slice(0, 1);
      const answers: Record<string, string> = {};
      for (const [code, column] of Object.entries(bookletAnswerColumns)) answers[code] = cleanAnswers(cells[column] || '').slice(0, 1);
      for (const code of Object.keys(questionNumbers)) if (!answers[code]) answers[code] = commonAnswer;
      if (!subject || !Number.isInteger(canonicalQuestion) || canonicalQuestion < 1 || !Object.keys(questionNumbers).length || !commonAnswer && !Object.values(answers).some(Boolean)) {
        unknownLines.push(line);
        continue;
      }
      const acceptedRaw = String(acceptedColumn >= 0 ? cells[acceptedColumn] || commonAnswer : commonAnswer);
      const accepted = unique(acceptedRaw.split(/[|\/,]/).map((value) => cleanAnswers(value).slice(0, 1)).filter(Boolean));
      const statusValue = norm(statusColumn >= 0 ? cells[statusColumn] || '' : 'ACTIVE');
      const status = statusValue === 'CANCELLED' || statusValue === 'IPTAL' ? 'CANCELLED'
        : statusValue === 'EXCLUDED' || statusValue === 'DEGERLENDIRMEDISI' ? 'EXCLUDED' : 'ACTIVE';
      const rawOutcomeCode = String(outcomeCodeColumn >= 0 ? cells[outcomeCodeColumn] || '' : '').trim();
      const rawOutcomeTitle = String(outcomeTitleColumn >= 0 ? cells[outcomeTitleColumn] || '' : '').trim();
      const codeIsLikelyCode = looksLikeOfficialOutcomeCode(rawOutcomeCode) || /^[A-ZÇĞİÖŞÜ]{1,12}[._-]?\d/i.test(rawOutcomeCode);
      const primaryOutcome: OutcomeReference = {
        code: codeIsLikelyCode ? rawOutcomeCode || undefined : undefined,
        title: rawOutcomeTitle || (!codeIsLikelyCode ? rawOutcomeCode || undefined : undefined),
        publisherCode: rawOutcomeCode || undefined,
        publisherTitle: rawOutcomeTitle || (!codeIsLikelyCode ? rawOutcomeCode || undefined : undefined),
        unit: String(unitColumn >= 0 ? cells[unitColumn] || '' : '').trim() || undefined,
        topic: String(topicColumn >= 0 ? cells[topicColumn] || '' : '').trim() || undefined,
        subtopic: String(subtopicColumn >= 0 ? cells[subtopicColumn] || '' : '').trim() || undefined,
        parentCode: String(parentCodeColumn >= 0 ? cells[parentCodeColumn] || '' : '').trim() || undefined,
      };
      const outcomes = [primaryOutcome];
      for (const [column, header] of tableHeaders.entries()) {
        if (!/^KAZANIM\d+$/.test(header) || column === outcomeTitleColumn) continue;
        const title = String(cells[column] || '').trim();
        if (title) outcomes.push({ title });
      }
      const optionCount = Object.values(answers).some((answer) => answer === 'E') || commonAnswer === 'E' ? 5 : 4;
      const row: ParsedRow = { subject, canonicalQuestion, questionNumbers, answers, commonAnswer, accepted: accepted.length ? accepted : [commonAnswer], status, outcomes: unique(outcomes.filter((outcome) => outcome.code || outcome.title || outcome.topic || outcome.subtopic) as any[]), optionCount };
      const rows = grouped.get(subject.id) || [];
      rows.push(row);
      grouped.set(subject.id, rows);
    }

    for (const [subjectId, rows] of grouped.entries()) {
      const sorted = rows.sort((a, b) => a.canonicalQuestion - b.canonicalQuestion);
      const start = sorted[0]?.canonicalQuestion || 1;
      questionStarts[subjectId] = start;
      questionCounts[subjectId] = sorted.length;
      questionCountsByBooklet[subjectId] = {};
      if (sorted.some((row, index) => row.canonicalQuestion !== start + index)) warnings.push(`${subjectId} soruları ardışık değil; soru aralığını ve kitapçık eşleşmesini kontrol edin.`);
      for (const booklet of bookletCodes) {
        const answers = sorted.map((row) => row.answers[booklet] || row.commonAnswer || '').join('');
        const bookletQuestionNumbers = sorted.map((row) => row.questionNumbers[booklet] || row.canonicalQuestion);
        const acceptedAnswers = sorted.map((row) => row.accepted);
        const questionStatuses = sorted.map((row) => row.status);
        const outcomeRefs = sorted.map((row) => row.outcomes[0] || null);
        const outcomeRefsByQuestion = sorted.map((row) => row.outcomes);
        entries.push({ subjectId, bookletCode: booklet, answers, optionCount: sorted.some((row) => row.optionCount === 5) ? 5 : 4, acceptedAnswers, questionStatuses, outcomeRefs, outcomeRefsByQuestion, bookletQuestionNumbers });
        questionCountsByBooklet[subjectId][booklet] = sorted.length;
      }
    }
    return { entries, questionCounts, questionStarts, questionCountsByBooklet, unknownLines, detectedBooklets, metadata, warnings, detectedFormat: Object.keys(bookletQuestionColumns).length ? 'WIDE_BOOKLET_TABLE' : 'TABULAR' };
  }

  let booklet = defaultBooklet.toUpperCase();
  if (!detectedBooklets.includes(booklet)) detectedBooklets.push(booklet);
  for (const rawLine of text.replace(/\r/g, '').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const bookletMatch = line.match(/^\[?\s*(?:KITAP(?:Ç|C)IK\s*)?([A-Z0-9]{1,4})\s*\]?$/i);
    if (bookletMatch && !/[ABCDE]{5,}/i.test(line)) {
      booklet = bookletMatch[1].toUpperCase();
      if (!detectedBooklets.includes(booklet)) detectedBooklets.push(booklet);
      continue;
    }
    const match = line.match(/^(.+?)\s*[:;,=|\t]\s*([ABCDE\s._-]+)$/i) || line.match(/^([^\s]+)\s+([ABCDE]{4,})$/i);
    if (!match) { unknownLines.push(line); continue; }
    const subject = subjectForToken(match[1], subjects);
    const answers = cleanAnswers(match[2]);
    if (!subject || !answers) { unknownLines.push(line); continue; }
    entries.push({ subjectId: subject.id, bookletCode: booklet, answers });
    questionStarts[subject.id] = questionStarts[subject.id] || 1;
    questionCounts[subject.id] = Math.max(questionCounts[subject.id] || 0, answers.length);
  }
  return { entries, questionCounts, questionStarts, unknownLines, detectedBooklets, warnings, detectedFormat: entries.length ? 'TEXT' : undefined };
}

function contiguousRanges(flags: boolean[], minLength: number): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let start = -1;
  for (let i = 0; i <= flags.length; i++) {
    if (i < flags.length && flags[i]) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      if (i - start >= minLength) ranges.push({ start, end: i });
      start = -1;
    }
  }
  return ranges;
}

/** Conservative fixed-width analysis. It only proposes ranges; the user must confirm them. */
export function analyzeFixedWidthSample(text: string): FixedWidthSuggestion | null {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n').filter((x) => x.length > 0).slice(0, 200);
  if (lines.length < 1) return null;
  const lengths = new Map<number, number>();
  for (const line of lines) lengths.set(line.length, (lengths.get(line.length) || 0) + 1);
  const recordLength = [...lengths.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
  if (!recordLength) return null;
  const same = lines.filter((x) => x.length === recordLength);
  if (!same.length) return null;

  const answerFlags: boolean[] = [];
  const digitFlags: boolean[] = [];
  const letterFlags: boolean[] = [];
  for (let col = 0; col < recordLength; col++) {
    const chars = same.map((x) => x[col] || ' ');
    const answerish = chars.filter((c) => /[ABCDE\s._-]/i.test(c)).length / chars.length;
    const nonSpace = chars.filter((c) => !/\s/.test(c)).length;
    const digitish = chars.filter((c) => /\d|\s/.test(c)).length / chars.length;
    const letterish = chars.filter((c) => /[A-Za-zÇĞİÖŞÜçğıöşü\s]/.test(c)).length / chars.length;
    answerFlags[col] = answerish >= 0.92 && nonSpace >= Math.max(1, Math.floor(chars.length * 0.25));
    digitFlags[col] = digitish >= 0.9 && nonSpace > 0;
    letterFlags[col] = letterish >= 0.9 && nonSpace > 0;
  }

  const answerBlocks = contiguousRanges(answerFlags, 5).map((r) => ({ ...r, confidence: 0.8 }));
  const digitRanges = contiguousRanges(digitFlags, 2).filter((r) => r.end - r.start <= 20);
  const letterRanges = contiguousRanges(letterFlags, 4).filter((r) => r.end - r.start >= 4);
  const studentNumber = digitRanges[0];
  const name = letterRanges.sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];

  return { recordLength, lineCount: same.length, studentNumber, name, answerBlocks };
}
