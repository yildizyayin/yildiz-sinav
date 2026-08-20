export type DefinitionSection = 'parser' | 'camera' | 'print' | 'fiducials';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface DefinitionReadiness {
  parser: boolean;
  camera: boolean;
  print: boolean;
  fiducials: boolean;
  parserTestPassed: boolean;
  ready: boolean;
  errors: string[];
}

type JsonObject = Record<string, any>;

export function parseDefinition(value: unknown): { value: JsonObject | null; errors: string[] } {
  if (value == null || value === '') return { value: null, errors: ['Tanım boş.'] };
  if (typeof value === 'object' && !Array.isArray(value)) return { value: value as JsonObject, errors: [] };
  if (typeof value !== 'string') return { value: null, errors: ['Tanım JSON nesnesi olmalıdır.'] };
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { value: null, errors: ['Tanım JSON nesnesi olmalıdır.'] };
    return { value: parsed as JsonObject, errors: [] };
  } catch {
    return { value: null, errors: ['Geçerli JSON girilmelidir.'] };
  }
}

function positiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function validateSlice(label: string, value: any, recordLength?: number): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== 'object') return [`${label} alanı tanımlanmalıdır.`];
  const start = Number(value.start);
  const end = Number(value.end);
  if (!Number.isInteger(start) || start < 0) errors.push(`${label}.start sıfır veya pozitif tam sayı olmalıdır.`);
  if (!Number.isInteger(end) || end <= start) errors.push(`${label}.end, start değerinden büyük tam sayı olmalıdır.`);
  if (recordLength && Number.isInteger(end) && end > recordLength) errors.push(`${label}.end kayıt uzunluğunu aşamaz.`);
  return errors;
}

export function validateParserDefinition(input: unknown): ValidationResult {
  const parsed = parseDefinition(input);
  if (!parsed.value) return { valid: false, errors: parsed.errors };
  const def = parsed.value;
  const errors: string[] = [];
  if (def.type === 'delimited') {
    if (typeof def.delimiter !== 'string' || ![',', ';', '\t'].includes(def.delimiter)) errors.push('Delimited parser için delimiter , ; veya tab olmalıdır.');
  } else if (def.type === 'fixed-width') {
    const recordLength = Number(def.recordLength);
    if (!Number.isInteger(recordLength) || recordLength <= 0 || recordLength > 5000) errors.push('recordLength 1-5000 arasında tam sayı olmalıdır.');
    const fields = def.fields || {};
    errors.push(...validateSlice('fields.name', fields.name, recordLength));
    if (fields.student_number) errors.push(...validateSlice('fields.student_number', fields.student_number, recordLength));
    if (fields.class) errors.push(...validateSlice('fields.class', fields.class, recordLength));
    if (fields.booklet) errors.push(...validateSlice('fields.booklet', fields.booklet, recordLength));
    const answers = def.answers;
    if (!answers || typeof answers !== 'object' || Array.isArray(answers) || Object.keys(answers).length === 0) {
      errors.push('En az bir ders cevap bloğu answers içinde tanımlanmalıdır.');
    } else {
      for (const [code, range] of Object.entries(answers)) {
        if (!/^[A-Za-z0-9_ÇĞİÖŞÜçğıöşü-]{1,24}$/.test(code)) errors.push(`Geçersiz ders kodu: ${code}`);
        errors.push(...validateSlice(`answers.${code}`, range, recordLength));
      }
    }
    if (def.signature != null && typeof def.signature !== 'string') errors.push('signature metin olmalıdır.');
  } else {
    errors.push("Parser type 'fixed-width' veya 'delimited' olmalıdır.");
  }
  return { valid: errors.length === 0, errors };
}

function validateRect(label: string, value: any, pageWidthMm: number, pageHeightMm: number): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== 'object') return [`${label} nesne olmalıdır.`];
  const x = Number(value.xMm ?? value.x);
  const y = Number(value.yMm ?? value.y);
  const width = Number(value.widthMm ?? value.width ?? 0);
  const height = Number(value.heightMm ?? value.height ?? 0);
  if (!finiteNonNegative(x)) errors.push(`${label}.xMm geçersiz.`);
  if (!finiteNonNegative(y)) errors.push(`${label}.yMm geçersiz.`);
  if (!positiveFinite(width)) errors.push(`${label}.widthMm pozitif olmalıdır.`);
  if (!positiveFinite(height)) errors.push(`${label}.heightMm pozitif olmalıdır.`);
  if (Number.isFinite(x) && Number.isFinite(width) && x + width > pageWidthMm + 0.01) errors.push(`${label} sayfa genişliğini aşıyor.`);
  if (Number.isFinite(y) && Number.isFinite(height) && y + height > pageHeightMm + 0.01) errors.push(`${label} sayfa yüksekliğini aşıyor.`);
  return errors;
}

export function validateCameraGeometry(input: unknown, pageWidthMm: number, pageHeightMm: number): ValidationResult {
  const parsed = parseDefinition(input);
  if (!parsed.value) return { valid: false, errors: parsed.errors };
  const def = parsed.value;
  const errors: string[] = [];
  const regions = def.regions;
  if (!Array.isArray(regions) || regions.length === 0) return { valid: false, errors: ['Kamera geometrisinde en az bir region tanımlanmalıdır.'] };
  let hasAnswers = false;
  for (let i = 0; i < regions.length; i++) {
    const region = regions[i];
    if (!region || typeof region !== 'object') { errors.push(`regions[${i}] nesne olmalıdır.`); continue; }
    if (typeof region.id !== 'string' || !region.id.trim()) errors.push(`regions[${i}].id gereklidir.`);
    if (typeof region.type !== 'string' || !region.type.trim()) errors.push(`regions[${i}].type gereklidir.`);
    if (region.type === 'answers' || region.type === 'bubble-grid') hasAnswers = true;
    errors.push(...validateRect(`regions[${i}]`, region, pageWidthMm, pageHeightMm));
  }
  if (!hasAnswers) errors.push("Kamera geometrisinde 'answers' veya 'bubble-grid' türünde cevap bölgesi bulunmalıdır.");
  return { valid: errors.length === 0, errors };
}

export function validatePrintFields(input: unknown, pageWidthMm: number, pageHeightMm: number): ValidationResult {
  const parsed = parseDefinition(input);
  if (!parsed.value) return { valid: false, errors: parsed.errors };
  const def = parsed.value;
  const errors: string[] = [];
  const fields = Array.isArray(def.fields)
    ? def.fields
    : Object.entries(def).map(([key, value]) => ({ key, ...(value as object) }));
  if (!fields.length) return { valid: false, errors: ['En az bir baskı alanı tanımlanmalıdır.'] };
  const allowedKeys = new Set(['studentName','studentNumber','class','section','institutionCode','qr','barcode','studentNumberBubbles']);
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i] as any;
    const key = String(field.key || '');
    if (!key) errors.push(`fields[${i}].key gereklidir.`);
    else if (!allowedKeys.has(key)) errors.push(`Desteklenmeyen baskı alanı: ${key}`);
    const x = Number(field.xMm ?? field.x);
    const y = Number(field.yMm ?? field.y);
    if (!finiteNonNegative(x) || x > pageWidthMm) errors.push(`${key || `fields[${i}]`}.xMm sayfa içinde olmalıdır.`);
    if (!finiteNonNegative(y) || y > pageHeightMm) errors.push(`${key || `fields[${i}]`}.yMm sayfa içinde olmalıdır.`);
    if (field.widthMm != null && (!positiveFinite(Number(field.widthMm)) || x + Number(field.widthMm) > pageWidthMm + 0.01)) errors.push(`${key}.widthMm geçersiz.`);
    if (field.heightMm != null && (!positiveFinite(Number(field.heightMm)) || y + Number(field.heightMm) > pageHeightMm + 0.01)) errors.push(`${key}.heightMm geçersiz.`);
  }
  return { valid: errors.length === 0, errors };
}

export function validateFiducials(input: unknown, pageWidthMm: number, pageHeightMm: number): ValidationResult {
  const parsed = parseDefinition(input);
  if (!parsed.value) return { valid: false, errors: parsed.errors };
  const targets = parsed.value.targets;
  if (!Array.isArray(targets) || targets.length < 3) return { valid: false, errors: ['En az 3 referans hedefi (fiducial) tanımlanmalıdır.'] };
  const errors: string[] = [];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const x = Array.isArray(t) ? Number(t[0]) : Number(t?.xMm ?? t?.x);
    const y = Array.isArray(t) ? Number(t[1]) : Number(t?.yMm ?? t?.y);
    if (!finiteNonNegative(x) || x > pageWidthMm) errors.push(`targets[${i}] x koordinatı sayfa dışında.`);
    if (!finiteNonNegative(y) || y > pageHeightMm) errors.push(`targets[${i}] y koordinatı sayfa dışında.`);
  }
  return { valid: errors.length === 0, errors };
}

export function definitionReadiness(
  values: { parser: unknown; camera: unknown; print: unknown; fiducials: unknown; pageWidthMm: number; pageHeightMm: number; parserTestPassed: boolean },
): DefinitionReadiness {
  const parser = validateParserDefinition(values.parser);
  const camera = validateCameraGeometry(values.camera, values.pageWidthMm, values.pageHeightMm);
  const print = validatePrintFields(values.print, values.pageWidthMm, values.pageHeightMm);
  const fiducials = validateFiducials(values.fiducials, values.pageWidthMm, values.pageHeightMm);
  const errors = [
    ...parser.errors.map((x) => `Parser: ${x}`),
    ...camera.errors.map((x) => `Kamera: ${x}`),
    ...print.errors.map((x) => `Baskı: ${x}`),
    ...fiducials.errors.map((x) => `Referans: ${x}`),
    ...(values.parserTestPassed ? [] : ['Parser: örnek TXT/DAT testi başarıyla tamamlanmalıdır.']),
  ];
  return {
    parser: parser.valid,
    camera: camera.valid,
    print: print.valid,
    fiducials: fiducials.valid,
    parserTestPassed: values.parserTestPassed,
    ready: parser.valid && camera.valid && print.valid && fiducials.valid && values.parserTestPassed,
    errors,
  };
}
