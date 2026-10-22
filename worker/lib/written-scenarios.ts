/**
 * A037: validation of common written exam distribution tables (konu–soru dağılım tabloları).
 * Pure functions; the entry stores what passes here.
 */
export type Authority = 'ODSGM' | 'IL_ZUMRE' | 'OKUL_ZUMRE';
export type RowInput = { unit?: string; topic?: string; outcomeCode?: string; questionCount: number };
export type ScenarioInput = { label: string; rows: RowInput[] };
export type TableInput = {
  academicYear: string; term: number; examNo?: number; gradeLevel: number; subjectId: string; authority: Authority;
  province?: string | null; institutionId?: string | null;
  sourceTitle: string; sourceUrl?: string | null; sourceAcademicYear?: string | null; sourcePublishedAt?: string | null;
  scenarios: ScenarioInput[];
};

const YEAR = /^(\d{4})-(\d{4})$/;
export const validYear = (y: unknown) => { const m = YEAR.exec(String(y || '')); return !!m && Number(m[2]) === Number(m[1]) + 1; };
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function normalizeTable(raw: any): { value?: TableInput; errors: string[] } {
  const errors: string[] = [];
  const academicYear = text(raw?.academicYear, 9);
  if (!validYear(academicYear)) errors.push('Eğitim yılı 2027-2028 biçiminde olmalıdır.');
  const term = Number(raw?.term); if (![1, 2].includes(term)) errors.push('Dönem 1 veya 2 olmalıdır.');
  const examNo = raw?.examNo === undefined || raw?.examNo === null || raw?.examNo === '' ? 1 : Number(raw.examNo);
  if (!Number.isInteger(examNo) || examNo < 1 || examNo > 3) errors.push('Sınav sırası 1–3 olmalıdır.');
  const gradeLevel = Number(raw?.gradeLevel); if (!Number.isInteger(gradeLevel) || gradeLevel < 1 || gradeLevel > 12) errors.push('Sınıf 1–12 olmalıdır.');
  const subjectId = text(raw?.subjectId, 80); if (!subjectId) errors.push('Ders seçilmelidir.');
  const authority = String(raw?.authority || '') as Authority;
  if (!['ODSGM', 'IL_ZUMRE', 'OKUL_ZUMRE'].includes(authority)) errors.push('Hazırlayan kurum ÖDSGM, il zümresi veya okul zümresi olmalıdır.');
  const province = text(raw?.province, 60) || null;
  const institutionId = text(raw?.institutionId, 80) || null;
  if (authority === 'IL_ZUMRE' && !province) errors.push('İl zümresi tablosunda il belirtilmelidir.');
  if (authority === 'OKUL_ZUMRE' && !institutionId) errors.push('Okul zümresi tablosu bir okula bağlı olmalıdır.');
  if (authority === 'ODSGM' && (province || institutionId)) errors.push('ÖDSGM tablosu ülke geneli içindir; il veya okul seçilmez.');
  const sourceTitle = text(raw?.sourceTitle, 300); if (!sourceTitle) errors.push('Kaynak belge adı gereklidir.');
  const sourceUrl = text(raw?.sourceUrl, 600) || null;
  if (sourceUrl && !/^https:\/\/[^\s/]+\.[^\s]+$/.test(sourceUrl)) errors.push('Kaynak bağlantısı https ile başlayan bir adres olmalıdır.');
  const sourceAcademicYear = text(raw?.sourceAcademicYear, 9) || null;
  if (sourceAcademicYear && !validYear(sourceAcademicYear)) errors.push('Kaynağın eğitim yılı 2027-2028 biçiminde olmalıdır.');
  const sourcePublishedAt = text(raw?.sourcePublishedAt, 30) || null;
  const scenarios: ScenarioInput[] = [];
  const list = Array.isArray(raw?.scenarios) ? raw.scenarios : [];
  if (!list.length) errors.push('En az bir senaryo girilmelidir.');
  if (list.length > 12) errors.push('Bir tabloda en çok 12 senaryo olabilir.');
  const labels = new Set<string>();
  list.slice(0, 12).forEach((s: any, i: number) => {
    const label = text(s?.label, 60) || `Senaryo ${i + 1}`;
    if (labels.has(label.toLocaleLowerCase('tr-TR'))) errors.push(`${label}: aynı adda iki senaryo var.`); labels.add(label.toLocaleLowerCase('tr-TR'));
    const rows: RowInput[] = [];
    const rawRows = Array.isArray(s?.rows) ? s.rows : [];
    if (!rawRows.length) errors.push(`${label}: en az bir satır gereklidir.`);
    rawRows.slice(0, 80).forEach((r: any, k: number) => {
      const questionCount = Number(r?.questionCount);
      const row = { unit: text(r?.unit, 200) || undefined, topic: text(r?.topic, 300) || undefined, outcomeCode: text(r?.outcomeCode, 60) || undefined, questionCount };
      if (!row.unit && !row.topic && !row.outcomeCode) errors.push(`${label} satır ${k + 1}: ünite, konu veya kazanım yazılmalıdır.`);
      if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 20) errors.push(`${label} satır ${k + 1}: soru sayısı 1–20 tam sayı olmalıdır.`);
      rows.push(row);
    });
    const total = rows.reduce((t, r) => t + (Number.isInteger(r.questionCount) ? r.questionCount : 0), 0);
    if (total > 50) errors.push(`${label}: toplam soru ${total}; en çok 50 olabilir.`);
    scenarios.push({ label, rows });
  });
  if (errors.length) return { errors };
  return { value: { academicYear, term, examNo, gradeLevel, subjectId, authority, province, institutionId, sourceTitle, sourceUrl, sourceAcademicYear, sourcePublishedAt, scenarios }, errors };
}

/**
 * Why a table cannot be officially verified (empty = it can). A school committee table is never "official".
 * Official needs a MEB source of the same academic year: for ÖDSGM on meb.gov.tr, for a province on a
 * *.meb.gov.tr address. Every outcome code must exist in the verified curriculum of that year.
 */
export function verificationBlockers(t: Pick<TableInput, 'authority' | 'academicYear' | 'sourceUrl' | 'sourceAcademicYear'>, unknownOutcomeCodes: string[] = []): string[] {
  const out: string[] = [];
  if (t.authority === 'OKUL_ZUMRE') out.push('Okul zümresi tablosu resmî olarak doğrulanmaz; zümre kararı olarak kullanılır.');
  if (!t.sourceUrl) out.push('Resmî kaynak bağlantısı yok.');
  else {
    let host = ''; try { host = new URL(t.sourceUrl).hostname.toLowerCase(); } catch { /* invalid */ }
    if (t.authority === 'ODSGM' && host !== 'meb.gov.tr' && host !== 'www.meb.gov.tr' && host !== 'odsgm.meb.gov.tr') out.push('ÖDSGM tablosunun kaynağı meb.gov.tr üzerinde olmalıdır.');
    if (t.authority === 'IL_ZUMRE' && !host.endsWith('.meb.gov.tr')) out.push('İl zümresi tablosunun kaynağı bir il MEB adresi (*.meb.gov.tr) olmalıdır.');
  }
  if (!t.sourceAcademicYear) out.push('Kaynağın hangi eğitim yılına ait olduğu girilmedi.');
  else if (t.sourceAcademicYear !== t.academicYear) out.push(`Kaynak ${t.sourceAcademicYear} yılına ait; ${t.academicYear} için resmî doğrulama ancak ${t.academicYear} belgesiyle yapılır.`);
  if (unknownOutcomeCodes.length) out.push(`Doğrulanmış ${t.academicYear} programında bulunmayan kazanım kodları: ${unknownOutcomeCodes.slice(0, 10).join(', ')}${unknownOutcomeCodes.length > 10 ? '…' : ''}.`);
  return out;
}
