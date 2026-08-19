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

export function parseUploadedText(text: string, fileName: string, templates: ParserTemplate[]): ParseResult {
  const normalizedText = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
  if (!normalizedText) return { confidence: 0, ambiguous: false, records: [], issues: ['Dosya boş.'] };

  const header = normalizedText.split('\n')[0].toLowerCase();
  if (/(student_number|ogrenci_no|öğrenci_no|ad_soyad|name)/i.test(header) && /[,;\t]/.test(header)) {
    return parseDelimited(normalizedText, fileName);
  }

  const viable = templates
    .map((t) => ({ template: t, def: safeJson(t.parser_definition) }))
    .filter((x) => x.def && typeof x.def === 'object' && x.def.type === 'fixed-width');

  const lines = normalizedText.split('\n').filter(Boolean);
  const matches = viable.filter((x) => {
    const def = x.def as any;
    if (typeof def.recordLength === 'number' && lines.some((line) => line.length !== def.recordLength)) return false;
    if (typeof def.signature === 'string' && !normalizedText.includes(def.signature)) return false;
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
  if (def.type === 'fixed-width') return parseFixedWidth(text.replace(/\r\n/g, '\n').trim().split('\n').filter(Boolean), fileName, template.id, template.name, def);
  if (def.type === 'delimited') return parseDelimited(text, fileName, template.id, template.name, def.delimiter);
  return { confidence: 0, ambiguous: false, records: [], issues: ['Desteklenmeyen parser türü.'] };
}

function parseDelimited(text: string, fileName: string, templateId?: string, templateName?: string, forcedDelimiter?: string): ParseResult {
  const lines = text.replace(/\r\n/g, '\n').trim().split('\n').filter(Boolean);
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
    for (const s of subjectIndexes) {
      const code = s.h.replace(/^answers[_:]/, '').replace(/^cevap_/, '').toUpperCase();
      answers[code] = (cols[s.i] || '').trim().toUpperCase().replace(/[^ABCDE]/g, '');
    }
    const name = (cols[nameIdx] || '').trim();
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
      confidence: 0.95,
      issues: name ? [] : ['Ad soyad boş.'],
    });
  }
  return { templateId, templateName: templateName || 'GENERIC_DELIMITED_V1', confidence: 0.96, ambiguous: false, records, issues: [] };
}

function parseFixedWidth(lines: string[], fileName: string, templateId: string, templateName: string, def: any): ParseResult {
  const fields = def.fields || {};
  const answersDef = def.answers || {};
  const records: CanonicalRecord[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const pick = (f: any) => f ? line.slice(Number(f.start), Number(f.end)).trim() : '';
    const className = pick(fields.class);
    const parsedClass = parseClass(className);
    const answers: Record<string, string> = {};
    for (const [code, f] of Object.entries<any>(answersDef)) answers[code.toUpperCase()] = pick(f).toUpperCase().replace(/[^ABCDE]/g, '');
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
      confidence: 0.97,
      issues: [],
    });
  }
  return { templateId, templateName, confidence: 0.97, ambiguous: false, records, issues: [] };
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
