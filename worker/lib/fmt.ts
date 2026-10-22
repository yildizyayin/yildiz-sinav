export type FmtSlice = { start: number; end: number; length?: number; label?: string; options?: number };

export interface FmtDefinition {
  type: 'fmt';
  version: '1';
  source: 'FMT';
  formName?: string;
  formType?: string;
  order?: number;
  recordLength: number;
  indexBase: 0 | 1;
  fields: Record<string, FmtSlice>;
  answers: Record<string, FmtSlice & { questionCount?: number }>;
  fixedWidth: {
    type: 'fixed-width';
    recordLength: number;
    fields: Record<string, FmtSlice>;
    answers: Record<string, FmtSlice & { questionCount?: number }>;
    signature?: string;
  };
  metadata?: Record<string, string>;
}

function key(value: unknown): string {
  return String(value ?? '').trim().toLocaleLowerCase('tr-TR').replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' }[c] || c)).replace(/[\s.-]+/g, '_');
}

function number(value: unknown): number | undefined {
  const text = String(value ?? '').trim();
  if (!text) return undefined;
  const n = Number(text.replace(',', '.'));
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

function slice(raw: Record<string, unknown>, indexBase: 0 | 1): FmtSlice | null {
  const startRaw = number(raw.start ?? raw.baslangic ?? raw.bas ?? raw.position ?? raw.pos);
  const endRaw = number(raw.end ?? raw.bitis ?? raw.uzunluk_end ?? raw.end_position);
  const length = number(raw.length ?? raw.uzunluk ?? raw.count ?? raw.width);
  if (startRaw == null || (endRaw == null && length == null)) return null;
  const start = Math.max(0, startRaw - indexBase);
  const end = endRaw != null ? Math.max(start + 1, endRaw - indexBase + (indexBase ? 1 : 0)) : start + Number(length);
  if (!Number.isInteger(end) || end <= start) return null;
  const out: FmtSlice = { start, end, length: end - start };
  if (typeof raw.label === 'string') out.label = raw.label;
  if (number(raw.options ?? raw.sik ?? raw.şık) != null) out.options = number(raw.options ?? raw.sik ?? raw.şık);
  return out;
}

function inferIndexBase(raw: any): 0 | 1 {
  const explicit = key(raw?.indexBase ?? raw?.index_base ?? raw?.baslangic_taban ?? raw?.start_base);
  if (explicit === '1' || explicit === 'one' || explicit === 'one_based' || explicit === '1_based') return 1;
  if (explicit === '0' || explicit === 'zero' || explicit === 'zero_based' || explicit === '0_based') return 0;
  const sources = [raw?.fields, raw?.alanlar, raw?.answers, raw?.tests, raw?.testler].filter(Boolean);
  const items = sources.flatMap((value: any) => Array.isArray(value) ? value : Object.values(value));
  const starts = items.map((item: any) => number(item?.start ?? item?.baslangic ?? item?.bas ?? item?.position)).filter((value): value is number => value != null);
  return starts.length > 0 && !starts.includes(0) ? 1 : 0;
}

function normalizeObject(raw: any): FmtDefinition | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw.parser_definition || raw.definition || raw;
  const indexBase = inferIndexBase(source);
  const fields: Record<string, FmtSlice> = {};
  const answers: Record<string, FmtSlice & { questionCount?: number }> = {};
  const fieldAliases: Record<string, string> = {
    ogrenci_no: 'student_number', student_no: 'student_number', student_number: 'student_number', numara: 'student_number',
    ad_soyad: 'name', adsoyad: 'name', name: 'name', ogrenci: 'name',
    sinif: 'class', class: 'class', sinif_subes: 'class', sube: 'class',
    kitapcik: 'booklet', booklet: 'booklet', kitapcik_turu: 'booklet',
    telefon: 'phone', phone: 'phone', cinsiyet: 'gender', gender: 'gender', kurum_kodu: 'institution_code', institution_code: 'institution_code',
  };
  const rawFields = source.fields || source.alanlar || {};
  if (Array.isArray(rawFields)) {
    for (const item of rawFields) {
      const name = fieldAliases[key(item?.key ?? item?.code ?? item?.name ?? item?.field)] || key(item?.key ?? item?.code ?? item?.name ?? item?.field);
      const value = slice(item, indexBase);
      if (name && value) fields[name] = value;
    }
  } else {
    for (const [nameRaw, item] of Object.entries<any>(rawFields)) {
      const value = slice(item, indexBase);
      const name = fieldAliases[key(nameRaw)] || key(nameRaw);
      if (value) fields[name] = value;
    }
  }
  const rawAnswers = source.answers || source.tests || source.testler || source.answerBlocks || {};
  if (Array.isArray(rawAnswers)) {
    for (const item of rawAnswers) {
      const code = String(item?.code ?? item?.subjectCode ?? item?.ders ?? item?.test ?? '').trim().toUpperCase();
      const value = slice(item, indexBase);
      if (code && value) answers[code] = { ...value, questionCount: number(item?.questionCount ?? item?.questioncount ?? item?.soruSayisi ?? item?.question_count) };
    }
  } else {
    for (const [codeRaw, item] of Object.entries<any>(rawAnswers)) {
      const value = slice(item, indexBase);
      const code = String(codeRaw).trim().toUpperCase();
      if (code && value) answers[code] = { ...value, questionCount: number(item?.questionCount ?? item?.questioncount ?? item?.soruSayisi ?? item?.question_count) };
    }
  }
  const maxEnd = [...Object.values(fields), ...Object.values(answers)].reduce((n, v) => Math.max(n, Number(v.end || 0)), 0);
  const recordLength = number(source.recordLength ?? source.record_length ?? source.kayitUzunlugu ?? source.kayit_uzunlugu) || maxEnd;
  if (!recordLength || !Object.keys(answers).length) return null;
  const fixedWidth = { type: 'fixed-width' as const, recordLength, fields, answers, ...(typeof source.signature === 'string' ? { signature: source.signature } : {}) };
  return {
    type: 'fmt', version: '1', source: 'FMT', formName: source.formName ?? source.form_name ?? source.formAdi,
    formType: source.formType ?? source.form_type ?? source.formTuru, order: number(source.order ?? source.sira), recordLength, indexBase, fields, answers, fixedWidth,
    metadata: typeof source.metadata === 'object' ? source.metadata : undefined,
  };
}

function rowsToObject(text: string): any {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const delimiter = lines[0]?.includes(';') ? ';' : lines[0]?.includes('|') ? '|' : lines[0]?.includes('\t') ? '\t' : ',';
  const header = lines[0]?.split(delimiter).map(key) || [];
  const looksLikeTable = header.some((x) => ['type', 'tur', 'alan', 'field', 'code', 'kod', 'start', 'baslangic', 'end', 'bitis', 'length', 'uzunluk'].includes(x));
  const raw: any = { fields: [], answers: [], metadata: {} };
  if (looksLikeTable && header.length > 1) {
    for (const line of lines.slice(1)) {
      const cols = line.split(delimiter);
      const row: any = {}; header.forEach((h, i) => { row[h] = cols[i] ?? ''; });
      const kind = key(row.type ?? row.tur ?? row.kind ?? row.tip);
      if (['field', 'alan', 'identity', 'kimlik'].includes(kind) || row.alan || row.field) raw.fields.push(row);
      else if (['answer', 'answers', 'test', 'ders', 'subject', 'cevap'].includes(kind) || row.code || row.kod || row.test) raw.answers.push(row);
      else if (row.key || row.name) raw.fields.push(row);
    }
    return raw;
  }
  for (const line of lines) {
    const cols = line.split(/[;|,\t]/).map((x) => x.trim());
    const k = key(cols[0]);
    if (['record_length', 'recordlength', 'kayit_uzunlugu', 'kayıt_uzunluğu', 'length'].includes(k)) raw.recordLength = number(cols[1]);
    else if (['index_base', 'start_base', 'baslangic_taban'].includes(k)) raw.indexBase = cols[1];
    else if (['field', 'alan', 'identity', 'kimlik'].includes(k)) raw.fields.push({ key: cols[1], start: cols[2], end: cols[3], length: cols[4] });
    else if (['answer', 'test', 'ders', 'subject', 'cevap'].includes(k)) raw.answers.push({ code: cols[1], start: cols[2], end: cols[3], length: cols[4], questionCount: cols[5], options: cols[6] });
  }
  return raw;
}

/**
 * Sekonic proprietary FMT ("xStart=xEnd=yStart=yEnd=K=D|Y=options=X2=LABEL="): each row is a bubble grid on
 * the sheet, and the reader writes the rows into the TXT in the same order. A "Y" (yatay) grid gives one
 * character per column (answer blocks: 40 columns = 40 questions); a "D" (dikey) grid gives one character per
 * row (ÖĞRENCİ NO 0–9 over 5 rows = 5 digits). Proven on the real OPT_K-129 file: the derived offsets give
 * exactly its 222-character records (student no 11–16, name 16–36, booklet 55, answers from 56).
 * Before A028b only the 129 and 7108 layouts were hard-coded; any other form (e.g. a school's 840) was refused.
 */
const ASCII = (value: string) => value.trim().toLocaleUpperCase('tr-TR').replace(/İ/g, 'I').replace(/Ö/g, 'O').replace(/Ü/g, 'U').replace(/Ş/g, 'S').replace(/Ğ/g, 'G').replace(/Ç/g, 'C').replace(/\s+/g, ' ');
const FIELD_LABELS: Array<[RegExp, string]> = [
  [/^(OGRENCI NO|OGRENCI NUMARASI|NUMARA|OKUL NO)$/, 'student_number'],
  [/^(ADI SOYADI|AD SOYAD|ADI VE SOYADI|AD-SOYAD)$/, 'name'],
  [/^ADI$/, 'first_name'], [/^SOYADI$/, 'last_name'],
  [/^(TC|TC\/TEL|TC NO|TC KIMLIK|TC KIMLIK NO|T\.C\. KIMLIK NO)$/, 'tckn'],
  [/^(KITAPCIK|KITAPCIK TURU)$/, 'booklet'],
  [/^(OKUL KODU|KURUM KODU)$/, 'institution_code'],
  [/^(OTURUM|OTURUM NO)$/, 'session'],
];
const CLASS_LABEL = /^(SINIF(-\d)?|SUBE|SINIF SUBE)$/;
const ANSWER_LABELS: Array<[RegExp, string]> = [
  [/^TURKCE$/, 'TUR'], [/^(TEMEL )?MATEMATIK$/, 'MAT'], [/^FEN( BILIMLERI| VE TEKNOLOJI)?$/, 'FEN'],
  [/^(T\.?C\.? )?INKILAP( TARIHI)?( VE ATATURKCULUK)?$/, 'INK'], [/^SOSYAL BILGILER$/, 'SOS'], [/^SOSYAL( BILIMLER)?$/, 'SOS'],
  [/^DIN( KULTURU)?( VE AHLAK BILGISI)?$/, 'DIN'], [/^(INGILIZCE|YABANCI DIL|ALMANCA|FRANSIZCA|ARAPCA)$/, 'YAB'],
];
const KNOWN_LABELS = ['OGRENCI NO', 'ADI SOYADI', 'TC/TEL', 'KITAPCIK', 'OKUL KODU', 'OTURUM NO', 'SINIF-1', 'SINIF-2', 'SUBE', 'TURKCE', 'SOSYAL BILIMLER', 'SOSYAL BILGILER', 'MATEMATIK', 'FEN BILIMLERI', 'SOSYAL', 'DIN', 'DIN KULTURU', 'INGILIZCE', 'FEN', 'INKILAP', 'T.C. INKILAP TARIHI', 'YABANCI DIL'];
/** A025: Turkish letters lost as U+FFFD still count as one character each, so a known label still matches. */
function proprietaryLabel(value: string): string {
  const plain = ASCII(value);
  if (!plain.includes('�')) return plain;
  const hit = KNOWN_LABELS.find((label) => label.length === plain.length && [...plain].every((ch, i) => ch === '�' || ch === label[i]));
  return hit || plain;
}
const labelTo = (table: Array<[RegExp, string]>, label: string) => table.find(([re]) => re.test(label))?.[1];

function parseSekonicRows(text: string, fileName: string): FmtDefinition | null {
  const rows = text.replace(/^﻿/, '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const grids = rows.map((line) => line.split('=')).filter((parts) => parts.length >= 9 && [0, 1, 2, 3].every((i) => /^\d+$/.test(parts[i])))
    .map((parts) => ({ xStart: Number(parts[0]), xEnd: Number(parts[1]), yStart: Number(parts[2]), yEnd: Number(parts[3]), orientation: String(parts[5] || '').trim().toUpperCase(), options: String(parts[6] || ''), label: proprietaryLabel(parts[8] || '') }));
  if (!grids.length || !grids.some((g) => labelTo(FIELD_LABELS, g.label) === 'student_number' || labelTo(FIELD_LABELS, g.label) === 'name')) return null;
  const fields: Record<string, FmtSlice> = {};
  const answers: Record<string, FmtSlice & { questionCount?: number }> = {};
  const classParts: Array<{ start: number; end: number }> = [];
  const unknown: string[] = [];
  const kod: Array<{ start: number; width: number; mark: string }> = [];
  let offset = 0;
  for (const g of grids) {
    const width = g.orientation === 'Y' ? g.xEnd - g.xStart + 1 : g.yEnd - g.yStart + 1;
    if (!(width > 0)) return null;
    const start = offset, end = offset + width; offset = end;
    const field = labelTo(FIELD_LABELS, g.label);
    const letters = g.options.replace(/\s/g, '');
    const isAnswerBlock = g.orientation === 'Y' && /^[A-E]{4,5}$/.test(letters) && field !== 'booklet';
    if (field) { fields[field] ??= { start, end, length: width, label: g.label }; continue; }
    if (CLASS_LABEL.test(g.label)) { classParts.push({ start, end }); continue; }
    if (isAnswerBlock) {
      const code = labelTo(ANSWER_LABELS, g.label) || g.label.replace(/[^A-Z0-9]+/g, '_');
      let key = code, n = 2; while (answers[key]) key = `${code}_${n++}`;
      answers[key] = { start, end, length: width, questionCount: width, label: g.label, options: letters.length };
      continue;
    }
    if (/^KOD-\d+$/.test(g.label)) { kod.push({ start, width, mark: g.options.trim() }); continue; }
    unknown.push(g.label);
  }
  if (!Object.keys(answers).length) return null;
  if (classParts.length) { const s0 = Math.min(...classParts.map((c) => c.start)), e0 = Math.max(...classParts.map((c) => c.end)); fields.class = { start: s0, end: e0, length: e0 - s0, label: 'SINIF/ŞUBE' }; }
  // TYT forms (four tests 40/46/40/40 on Sekonic 129) keep the TYT subject codes and expose the optional philosophy.
  const counts = Object.entries(answers).map(([k, v]) => `${k}:${v.length}`).join(',');
  const isTyt = counts === 'TUR:40,SOS:46,MAT:40,FEN:40';
  if (isTyt) {
    const renamed: typeof answers = {};
    for (const [k, v] of Object.entries(answers)) renamed[`TYT_${k}`] = v;
    const s0 = renamed.TYT_SOS.start + 20;
    renamed.TYT_FEL = { start: s0, end: s0 + 5, length: 5, questionCount: 5, label: 'FELSEFE (SEÇMELİ)', options: 5 };
    Object.keys(answers).forEach((k) => delete answers[k]); Object.assign(answers, renamed);
  }
  const recordLength = offset;
  const upper = fileName.toLocaleUpperCase('tr-TR');
  const formCode = (upper.match(/(?:OPT[_ -]?K?[-_ ]?|OPTIK[_ -]?)(\d{3,4})/) || [])[1];
  // A028b: the KOD timing columns print the form number into every line (e.g. "129"). When they are adjacent
  // single marks they become the format signature, so two forms of equal line length are still told apart.
  const signature = kod.length > 1 && kod.every((k, i) => k.width === 1 && /^\w$/.test(k.mark) && (i === 0 || k.start === kod[i - 1].start + 1)) ? kod.map((k) => k.mark).join('') : undefined;
  // A084: where the form number sits, so a TXT written back from a camera reading carries it in place.
  const fixedWidth = { type: 'fixed-width' as const, recordLength, fields, answers, ...(signature ? { signature, signatureStart: kod[0].start } : {}) };
  return {
    type: 'fmt', version: '1', source: 'FMT', formName: formCode ? `Sekonic Optik ${formCode}` : 'Sekonic optik formu', formType: isTyt ? 'TYT' : 'SCHOOL', recordLength, indexBase: 0,
    fields, answers, fixedWidth,
    metadata: { format: 'SEKONIC_PROPRIETARY', sourceFile: fileName, ...(unknown.length ? { unmappedLabels: unknown.join(', ') } : {}) },
  };
}

export function parseFmtText(text: string, fileName = 'definition.fmt'): { ok: boolean; definition?: FmtDefinition; errors: string[]; warnings: string[] } {
  const proprietary = parseSekonicRows(text, fileName);
  if (proprietary) return { ok: true, definition: proprietary, errors: [], warnings: [`Sekonic özel FMT biçimi tanındı; TXT/DAT sabit kayıt eşlemesi ${proprietary.formName || 'form'} yerleşimine göre oluşturuldu.`] };
  let raw: any;
  try { raw = JSON.parse(text); } catch { raw = rowsToObject(text); }
  const definition = normalizeObject(raw);
  if (!definition) return { ok: false, errors: [`${fileName} içinde recordLength ve en az bir cevap/test bloğu bulunamadı.`], warnings: [] };
  const errors: string[] = [];
  if (!definition.fields.name) errors.push('Ad Soyad alanı bulunamadı.');
  if (!definition.fields.student_number) errors.push('Öğrenci No alanı bulunamadı.');
  if (definition.recordLength > 5000) errors.push('Kayıt uzunluğu 5000 karakteri aşamaz.');
  return { ok: errors.length === 0, definition, errors, warnings: definition.indexBase === 1 ? ['Başlangıç değerleri 1 tabanlı kabul edilerek 0 tabanlı sisteme dönüştürüldü.'] : [] };
}

export async function parseFmtBytes(bytes: ArrayBuffer, fileName?: string) {
  const value = new Uint8Array(bytes);
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(value); }
  catch { text = new TextDecoder('windows-1254', { fatal: false }).decode(value); }
  return parseFmtText(text, fileName);
}

export function fixedWidthFromDefinition(value: any): any {
  if (value?.type === 'fmt' && value.fixedWidth) return value.fixedWidth;
  return value;
}
