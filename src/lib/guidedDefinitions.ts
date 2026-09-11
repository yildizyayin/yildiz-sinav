export type SubjectOption = { id: string; code: string; name: string };
export type ParsedAnswerEntry = {
  subjectId: string;
  bookletCode: string;
  answers: string;
  optionCount?: 4 | 5;
  acceptedAnswers?: Array<string | string[]>;
  questionStatuses?: Array<'ACTIVE' | 'CANCELLED' | 'EXCLUDED'>;
};
export type ParsedAnswerKey = {
  entries: ParsedAnswerEntry[];
  questionCounts: Record<string, number>;
  questionStarts: Record<string, number>;
  unknownLines: string[];
  detectedBooklets: string[];
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
  const unknownLines: string[] = [];
  const detectedBooklets: string[] = [];
  const lines = text.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n').filter((line) => line.trim());
  const tableHeaders = lines.length ? splitDelimitedLine(lines[0]).map(norm) : [];
  const subjectColumn = tableHeaderIndex(tableHeaders, ['DERS', 'TEST', 'SUBJECT', 'SUBJECTCODE', 'DERSKODU']);
  const questionColumn = tableHeaderIndex(tableHeaders, ['SORU', 'SORUNO', 'QUESTION', 'QUESTIONNO', 'SORUNUMARASI']);
  const answerColumn = tableHeaderIndex(tableHeaders, ['CEVAP', 'DOGRUCEVAP', 'ANSWER', 'CORRECTANSWER', 'DOGRU']);
  if (subjectColumn >= 0 && questionColumn >= 0 && answerColumn >= 0) {
    const bookletColumn = tableHeaderIndex(tableHeaders, ['KITAPCIK', 'BOOKLET', 'KITAPCIKKODU']);
    const optionColumn = tableHeaderIndex(tableHeaders, ['SIKSAYISI', 'OPTIONCOUNT', 'OPTIONS']);
    const acceptedColumn = tableHeaderIndex(tableHeaders, ['KABULEDILENCEVAPLAR', 'ACCEPTEDANSWERS', 'ALTERNATIFCEVAP']);
    const statusColumn = tableHeaderIndex(tableHeaders, ['DURUM', 'STATUS', 'QUESTIONSTATUS']);
    const grouped = new Map<string, { subject: SubjectOption; booklet: string; answers: Map<number, string>; accepted: Map<number, string[]>; statuses: Map<number, 'ACTIVE' | 'CANCELLED' | 'EXCLUDED'>; optionCount: 4 | 5 }>();
    for (const line of lines.slice(1)) {
      const cells = splitDelimitedLine(line);
      const subject = subjectForToken(cells[subjectColumn] || '', subjects);
      const questionNo = Number(cells[questionColumn]);
      const answer = cleanAnswers(cells[answerColumn] || '').slice(0, 1);
      if (!subject || !Number.isInteger(questionNo) || questionNo < 1 || !answer) { unknownLines.push(line); continue; }
      const booklet = String(bookletColumn >= 0 ? cells[bookletColumn] || defaultBooklet : defaultBooklet).trim().toUpperCase() || defaultBooklet.toUpperCase();
      const optionCount = Number(cells[optionColumn] || 5) === 4 ? 4 : 5;
      const key = `${subject.id}::${booklet}`;
      const group = grouped.get(key) || { subject, booklet, answers: new Map(), accepted: new Map(), statuses: new Map(), optionCount };
      group.answers.set(questionNo, answer);
      const alternatives = String(acceptedColumn >= 0 ? cells[acceptedColumn] || answer : answer).split(/[|/,]/).map((x) => cleanAnswers(x).slice(0, 1)).filter(Boolean);
      group.accepted.set(questionNo, [...new Set(alternatives)]);
      const statusValue = norm(statusColumn >= 0 ? cells[statusColumn] || '' : 'ACTIVE');
      group.statuses.set(questionNo, statusValue === 'CANCELLED' || statusValue === 'IPTAL' ? 'CANCELLED' : statusValue === 'EXCLUDED' || statusValue === 'DEGERLENDIRMEDISI' ? 'EXCLUDED' : 'ACTIVE');
      grouped.set(key, group);
      questionCounts[subject.id] = Math.max(questionCounts[subject.id] || 0, questionNo);
      if (!detectedBooklets.includes(booklet)) detectedBooklets.push(booklet);
    }
    for (const group of grouped.values()) {
      const questionNumbers = [...group.answers.keys()].sort((a, b) => a - b);
      const start = questionNumbers[0] || 1;
      const end = questionNumbers[questionNumbers.length - 1] || start;
      questionStarts[group.subject.id] = Math.min(questionStarts[group.subject.id] || start, start);
      questionCounts[group.subject.id] = end - start + 1;
      const answers = Array.from({ length: end - start + 1 }, (_, index) => group.answers.get(start + index) || '').join('');
      entries.push({ subjectId: group.subject.id, bookletCode: group.booklet, answers, optionCount: group.optionCount, acceptedAnswers: Array.from({ length: end - start + 1 }, (_, index) => group.accepted.get(start + index) || [answers[index]]), questionStatuses: Array.from({ length: end - start + 1 }, (_, index) => group.statuses.get(start + index) || 'ACTIVE') });
    }
    return { entries, questionCounts, questionStarts, unknownLines, detectedBooklets };
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

    const match = line.match(/^(.+?)\s*[:;,=|\t]\s*([ABCDE\s._-]+)$/i)
      || line.match(/^([^\s]+)\s+([ABCDE]{4,})$/i);
    if (!match) { unknownLines.push(line); continue; }
    const subject = subjectForToken(match[1], subjects);
    const answers = cleanAnswers(match[2]);
    if (!subject || !answers) { unknownLines.push(line); continue; }

    entries.push({ subjectId: subject.id, bookletCode: booklet, answers });
    questionStarts[subject.id] = questionStarts[subject.id] || 1;
    questionCounts[subject.id] = Math.max(questionCounts[subject.id] || 0, answers.length);
  }

  return { entries, questionCounts, questionStarts, unknownLines, detectedBooklets };
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
