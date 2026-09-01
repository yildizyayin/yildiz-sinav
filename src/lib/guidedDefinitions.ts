export type SubjectOption = { id: string; code: string; name: string };
export type ParsedAnswerEntry = { subjectId: string; bookletCode: string; answers: string };
export type ParsedAnswerKey = {
  entries: ParsedAnswerEntry[];
  questionCounts: Record<string, number>;
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
  examType: 'STANDARD' | 'MIDDLE_COMPOSITE' | 'LGS' | 'TYT' | 'AYT' | 'TYT_AYT';
  gradeLevel: number;
  label: string;
  description: string;
  sessionMode: 'SINGLE' | 'VERBAL_NUMERIC' | 'TYT_AYT';
  defaultWrongDivisor: number;
};

export const EXAM_CHOICES: ExamChoice[] = [
  { key: 'LGS', examType: 'LGS', gradeLevel: 8, label: '8. Sınıf · LGS', description: 'Sözel ve sayısal oturumlar öğrenci numarasıyla tek karnede birleşir.', sessionMode: 'VERBAL_NUMERIC', defaultWrongDivisor: 3 },
  { key: 'TYT', examType: 'TYT', gradeLevel: 12, label: 'TYT', description: 'TYT ders yapısı ve sürümlü puanlama kuralı.', sessionMode: 'SINGLE', defaultWrongDivisor: 4 },
  { key: 'AYT', examType: 'AYT', gradeLevel: 12, label: 'AYT', description: 'Sayısal, eşit ağırlık ve sözel alan sonuçları.', sessionMode: 'SINGLE', defaultWrongDivisor: 4 },
  { key: 'TYT_AYT', examType: 'TYT_AYT', gradeLevel: 12, label: 'TYT + AYT Bileşik', description: 'İki sınav sonucu ayrı gösterilir ve bileşik karneye bağlanır.', sessionMode: 'TYT_AYT', defaultWrongDivisor: 4 },
  ...Array.from({ length: 8 }, (_, i): ExamChoice => {
    const grade = i + 5;
    return { key: `STD_${grade}`, examType: 'STANDARD', gradeLevel: grade, label: `${grade}. Sınıf`, description: `${grade}. sınıf genel, ders veya kazanım sınavı.`, sessionMode: 'SINGLE', defaultWrongDivisor: 4 };
  }),
  ...Array.from({ length: 4 }, (_, i): ExamChoice => {
    const grade = i + 5;
    return { key: `MID_${grade}`, examType: 'MIDDLE_COMPOSITE', gradeLevel: grade, label: `${grade}. Sınıf · Sözel + Sayısal`, description: 'Ayrı optik/dosya oturumları öğrenci numarasıyla birleştirilir.', sessionMode: 'VERBAL_NUMERIC', defaultWrongDivisor: 4 };
  }),
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
  const unknownLines: string[] = [];
  const detectedBooklets: string[] = [];
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
    questionCounts[subject.id] = Math.max(questionCounts[subject.id] || 0, answers.length);
  }

  return { entries, questionCounts, unknownLines, detectedBooklets };
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
