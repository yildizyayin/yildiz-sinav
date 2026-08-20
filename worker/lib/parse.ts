import type { CanonicalRecord } from '../types';

export interface ParserTemplate {
  id: string;
  name: string;
  parser_definition: string | null;
}

export interface ParseResult {
  templateId?: string;
  templateName?: string;
  confidence: number;
  ambiguous: boolean;
  records: CanonicalRecord[];
  issues: string[];
}

export interface NormalizedAnswerSequence {
  sequence: string;
  invalidPositions: number[];
}

/**
 * Canonical answer strings are positional. A-E are marked answers and `_` is an
 * unanswered/blank position. Never delete a character from an answer block:
 * doing so would shift every question after an internal blank.
 */
export function normalizeAnswerSequence(value: string): NormalizedAnswerSequence {
  let sequence = '';
  const invalidPositions: number[] = [];
  const chars = Array.from(value.replace(/\r|\n/g, ''));
  for (let i = 0; i < chars.length; i++) {
    const upper = chars[i].toLocaleUpperCase('tr-TR');
    if (/^[ABCDE]$/.test(upper)) sequence += upper;
    else if (/\s/.test(chars[i]) || ['-', '_', '.', '0'].includes(chars[i])) sequence += '_';
    else {
      sequence += '_';
      invalidPositions.push(i + 1);
    }
  }
  return { sequence, invalidPositions };
}

function normalizeNewlines(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n+$/, '');
}

export function parseUploadedText(text: string, fileName: string, templates: ParserTemplate[]): ParseResult {
  const normalizedText = normalizeNewlines(text);
  if (!normalizedText.trim()) return { confidence: 0, ambiguous: false, records: [], issues: ['Dosya boş.'] };

  const header = normalizedText.split('\n')[0].toLowerCase();
  if (/(student_number|ogrenci_no|öğrenci_no|ad_soyad|name)/i.test(header) && /[,;\t]/.test(header)) {
    return parseDelimited(normalizedText, fileName);
  }

  const viable = templates
    .map((t) => ({ template: t, def: safeJson(t.parser_definition) }))
    .filter((x) => {
      const def = x.def as Record<string, unknown> | null;
      return !!def && def.type === 'fixed-width';
    });

  const lines = normalizedText.split('\n').filter((line) => line.length > 0);
  const matches = viable.filter((x) => {
    const def = x.def as any;
    if (typeof def.recordLength === 'number' && lines.some((line) => line.length !== def.recordLength)) return false;
    if (typeof def.signature === 'string' && def.signature && !normalizedText.includes(def.signature)) return false;
    return true;
  });

  if (matches.length === 1) {
    return parseFixedWidth(lines, fileName, matches[0].template.id, matches[0].template.name, matches[0].def as any);
  }
  if (matches.length > 1) {
    return { confidence: 0.5, ambiguous: true, records: [], issues: ['Birden fazla optik şablonu dosyayla eşleşiyor. Manuel seçim gerekli.'] };
  }

  return { confidence: 0.2, ambiguous: false, records: [], issues: ['Optik/FMT otomatik belirlenemedi. Şablon tanımı veya manuel seçim gerekli.'] };
}

export function parseWithTemplate(text: string, fileName: string, template: ParserTemplate): ParseResult {
  const def = safeJson(template.parser_definition) as any;
  if (!def) return { confidence: 0, ambiguous: false, records: [], issues: ['Seçilen optik şablonun parser tanımı yok.'] };
  const normalized = normalizeNewlines(text);
  if (def.type === 'fixed-width') return parseFixedWidth(normalized.split('\n').filter((line) => line.length > 0), fileName, template.id, template.name, def);
  if (def.type === 'delimited') return parseDelimited(normalized, fileName, template.id, template.name, def.delimiter);
  return { confidence: 0, ambiguous: false, records: [], issues: ['Desteklenmeyen parser türü.'] };
}

function parseDelimited(text: string, fileName: string, templateId?: string, templateName?: string, forcedDelimiter?: string): ParseResult {
  const lines = normalizeNewlines(text).split('\n').filter((line) => line.length > 0);
  const delimiter = forcedDelimiter || detectDelimiter(lines[0]);
  const headers = splitDelimited(lines[0], delimiter).map((x) => x.trim().toLowerCase());
  const find = (...names: string[]) => headers.findIndex((h) => names.includes(h));
  const noIdx = find('student_number', 'ogrenci_no', 'öğrenci_no', 'no', 'student_no');
  const nameIdx = find('name', 'ad_soyad', 'adsoyad', 'ogrenci', 'öğrenci');
  const classIdx = find('class', 'sinif', 'sınıf', 'class_name');
  const bookletIdx = find('booklet', 'kitapcik', 'kitapçık');
  const subjectIndexes = headers
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h.startsWith('answers_') || /^answers:[a-z0-9_]+$/.test(h) || /^cevap_[a-z0-9_]+$/.test(h));
  if (nameIdx < 0) return { confidence: 0.3, ambiguous: false, records: [], issues: ['Ad soyad sütunu bulunamadı.'] };
  if (subjectIndexes.length === 0) return { confidence: 0.3, ambiguous: false, records: [], issues: ['Ders cevap sütunları bulunamadı. Örnek: answers_MAT, answers_TUR.'] };

  const records: CanonicalRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitDelimited(lines[i], delimiter);
    const className = classIdx >= 0 ? (cols[classIdx] || '').trim() : '';
    const parsedClass = parseClass(className);
    const answers: Record<string, string> = {};
    const issues: string[] = [];
    for (const s of subjectIndexes) {
      const code = s.h.replace(/^answers[_:]/, '').replace(/^cevap_/, '').toUpperCase();
      const normalized = normalizeAnswerSequence(cols[s.i] || '');
      answers[code] = normalized.sequence;
      if (normalized.invalidPositions.length) issues.push(`${code} cevap alanında geçersiz karakter: ${normalized.invalidPositions.join(', ')}. Boş olarak işaretlendi.`);
    }
    const name = (cols[nameIdx] || '').trim();
    if (!name) issues.push('Ad soyad boş.');
    records.push({
      row_no: i,
      student_number: noIdx >= 0 ? (cols[noIdx] || '').trim() : undefined,
      name,
      class_name: className || undefined,
      grade_level: parsedClass.grade,
      section: parsedClass.section,
      booklet: bookletIdx >= 0 ? (cols[bookletIdx] || '').trim().toUpperCase() : undefined,
      answers_by_subject: answers,
      source_type: fileName.toLowerCase().endsWith('.dat') ? 'DAT' : fileName.toLowerCase().endsWith('.txt') ? 'TXT' : 'CSV',
      source_template: templateName || 'GENERIC_DELIMITED_V1',
      confidence: issues.length ? 0.9 : 0.95,
      issues,
    });
  }
  return { templateId, templateName: templateName || 'GENERIC_DELIMITED_V1', confidence: records.some((r) => r.issues.length) ? 0.9 : 0.96, ambiguous: false, records, issues: [] };
}

function parseFixedWidth(lines: string[], fileName: string, templateId: string, templateName: string, def: any): ParseResult {
  const fields = def.fields || {};
  const answersDef = def.answers || {};
  const records: CanonicalRecord[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const pick = (f: any) => f ? line.slice(Number(f.start), Number(f.end)).trim() : '';
    const pickRaw = (f: any) => f ? line.slice(Number(f.start), Number(f.end)) : '';
    const className = pick(fields.class);
    const parsedClass = parseClass(className);
    const answers: Record<string, string> = {};
    const issues: string[] = [];
    for (const [code, f] of Object.entries<any>(answersDef)) {
      const normalized = normalizeAnswerSequence(pickRaw(f));
      answers[code.toUpperCase()] = normalized.sequence;
      if (normalized.invalidPositions.length) issues.push(`${code.toUpperCase()} cevap alanında geçersiz karakter: ${normalized.invalidPositions.join(', ')}. Boş olarak işaretlendi.`);
    }
    records.push({
      row_no: i + 1,
      student_number: pick(fields.student_number) || undefined,
      name: pick(fields.name),
      class_name: className || undefined,
      grade_level: parsedClass.grade,
      section: parsedClass.section,
      booklet: pick(fields.booklet).toUpperCase() || undefined,
      answers_by_subject: answers,
      source_type: fileName.toLowerCase().endsWith('.dat') ? 'DAT' : 'TXT',
      source_template: templateName,
      confidence: issues.length ? 0.9 : 0.97,
      issues,
    });
  }
  return { templateId, templateName, confidence: records.some((r) => r.issues.length) ? 0.9 : 0.97, ambiguous: false, records, issues: [] };
}

function detectDelimiter(header: string): string {
  const options = [',', ';', '\t'];
  return options.sort((a, b) => header.split(b).length - header.split(a).length)[0];
}

function splitDelimited(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i++; } else quoted = !quoted;
    } else if (c === delimiter && !quoted) { out.push(current); current = ''; }
    else current += c;
  }
  out.push(current);
  return out;
}

function parseClass(value: string): { grade?: number; section?: string } {
  const m = value.trim().toLocaleUpperCase('tr-TR').match(/(\d{1,2})\s*[\/-]?\s*([A-ZÇĞİÖŞÜ])?/);
  if (!m) return {};
  return { grade: Number(m[1]), section: m[2] || undefined };
}

function safeJson(value: string | null): unknown {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}
