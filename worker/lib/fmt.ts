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

export function parseFmtText(text: string, fileName = 'definition.fmt'): { ok: boolean; definition?: FmtDefinition; errors: string[]; warnings: string[] } {
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
