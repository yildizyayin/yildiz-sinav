/**
 * P02: the print layout contract shared by Studio booklets and Quick Test papers.
 *
 * Settings are validated, carry a schema `version`, and are turned into one LayoutModel (points). The PDF renderer
 * and the preview/plan endpoint both use that model and the same pagination, so what the preview shows is what the
 * PDF prints. The optical form and the answer key keep their own fixed A4 geometry (the phone reader depends on it).
 */
export const LAYOUT_SCHEMA_VERSION = 1;
const MM = 72 / 25.4;
const PAGE_SIZES = { A4: [595, 842], A5: [420, 595] } as const;
export type PageSize = keyof typeof PAGE_SIZES;
export type Orientation = 'PORTRAIT' | 'LANDSCAPE';
export type ColumnsSetting = 1 | 2 | 'AUTO';

export type PrintLayoutSettings = {
  version: typeof LAYOUT_SCHEMA_VERSION;
  pageSize: PageSize;
  orientation: Orientation;
  columns: ColumnsSetting;
  marginMm: number;
  fontSizePt: number;
  questionSpacingPt: number;
};

/** The values every booklet printed before P02 used: A4 portrait, two columns, 12.7 mm margins, 9.5 pt text. */
export const DEFAULT_LAYOUT_SETTINGS: PrintLayoutSettings = { version: 1, pageSize: 'A4', orientation: 'PORTRAIT', columns: 2, marginMm: 12.7, fontSizePt: 9.5, questionSpacingPt: 12 };
export const LAYOUT_LIMITS = { marginMm: [8, 25], fontSizePt: [8, 13], questionSpacingPt: [4, 30], minColumnWidthPt: 180 } as const;

export type LayoutModel = {
  pageW: number; pageH: number; margin: number; gutter: number; columns: 1 | 2; colW: number;
  top: number; bottom: number; body: number; line: number; questionGap: number;
};
export type LayoutIssue = { field: keyof PrintLayoutSettings | 'columns'; code: string; message: string };

const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN);
const inRange = (v: number, [lo, hi]: readonly [number, number]) => Number.isFinite(v) && v >= lo && v <= hi;

export function layoutModel(s: PrintLayoutSettings, columns: 1 | 2 = s.columns === 'AUTO' ? 2 : s.columns): LayoutModel {
  const [w, h] = PAGE_SIZES[s.pageSize];
  const pageW = s.orientation === 'LANDSCAPE' ? h : w, pageH = s.orientation === 'LANDSCAPE' ? w : h;
  const margin = Math.round(s.marginMm * MM * 10) / 10, gutter = 18;
  const colW = columns === 2 ? (pageW - 2 * margin - gutter) / 2 : pageW - 2 * margin;
  return { pageW, pageH, margin, gutter, columns, colW, top: pageH - margin, bottom: margin + 22, body: s.fontSizePt, line: Math.round(s.fontSizePt * 1.3263 * 10) / 10, questionGap: s.questionSpacingPt };
}

/**
 * Validates raw settings (undefined → defaults). Unknown versions, unsupported sizes and a column narrower than
 * 180 pt are errors, never silently corrected.
 */
export function normalizeLayoutSettings(raw: unknown, opts: { allowAuto?: boolean } = {}): { ok: true; value: PrintLayoutSettings } | { ok: false; errors: LayoutIssue[] } {
  if (raw === undefined || raw === null) return { ok: true, value: { ...DEFAULT_LAYOUT_SETTINGS } };
  if (typeof raw !== 'object') return { ok: false, errors: [{ field: 'version', code: 'LAYOUT_INVALID', message: 'Sayfa düzeni ayarı okunamadı.' }] };
  const r = raw as Record<string, unknown>;
  const errors: LayoutIssue[] = [];
  const version = r.version === undefined ? LAYOUT_SCHEMA_VERSION : Number(r.version);
  if (version !== LAYOUT_SCHEMA_VERSION) errors.push({ field: 'version', code: 'LAYOUT_VERSION_UNSUPPORTED', message: `Sayfa düzeni sürümü ${String(r.version)} desteklenmiyor (beklenen ${LAYOUT_SCHEMA_VERSION}).` });
  const pageSize = (r.pageSize ?? DEFAULT_LAYOUT_SETTINGS.pageSize) as PageSize;
  if (!(pageSize in PAGE_SIZES)) errors.push({ field: 'pageSize', code: 'PAGE_SIZE_UNSUPPORTED', message: 'Sayfa boyutu A4 veya A5 olmalı.' });
  const orientation = (r.orientation ?? DEFAULT_LAYOUT_SETTINGS.orientation) as Orientation;
  if (orientation !== 'PORTRAIT' && orientation !== 'LANDSCAPE') errors.push({ field: 'orientation', code: 'ORIENTATION_INVALID', message: 'Sayfa yönü dikey veya yatay olmalı.' });
  const rawCols = r.columns ?? DEFAULT_LAYOUT_SETTINGS.columns;
  const columns: ColumnsSetting = rawCols === 'AUTO' ? 'AUTO' : Number(rawCols) === 1 ? 1 : Number(rawCols) === 2 ? 2 : (NaN as any);
  if (Number.isNaN(columns as any) || (columns === 'AUTO' && !opts.allowAuto)) errors.push({ field: 'columns', code: 'COLUMNS_INVALID', message: opts.allowAuto ? 'Sütun sayısı 1, 2 veya otomatik olmalı.' : 'Sütun sayısı 1 veya 2 olmalı.' });
  const marginMm = r.marginMm === undefined ? DEFAULT_LAYOUT_SETTINGS.marginMm : num(r.marginMm);
  if (!inRange(marginMm, LAYOUT_LIMITS.marginMm)) errors.push({ field: 'marginMm', code: 'MARGIN_OUT_OF_RANGE', message: `Kenar boşluğu ${LAYOUT_LIMITS.marginMm[0]}–${LAYOUT_LIMITS.marginMm[1]} mm olmalı.` });
  const fontSizePt = r.fontSizePt === undefined ? DEFAULT_LAYOUT_SETTINGS.fontSizePt : num(r.fontSizePt);
  if (!inRange(fontSizePt, LAYOUT_LIMITS.fontSizePt)) errors.push({ field: 'fontSizePt', code: 'FONT_SIZE_OUT_OF_RANGE', message: `Punto ${LAYOUT_LIMITS.fontSizePt[0]}–${LAYOUT_LIMITS.fontSizePt[1]} olmalı.` });
  const questionSpacingPt = r.questionSpacingPt === undefined ? DEFAULT_LAYOUT_SETTINGS.questionSpacingPt : num(r.questionSpacingPt);
  if (!inRange(questionSpacingPt, LAYOUT_LIMITS.questionSpacingPt)) errors.push({ field: 'questionSpacingPt', code: 'SPACING_OUT_OF_RANGE', message: `Soru aralığı ${LAYOUT_LIMITS.questionSpacingPt[0]}–${LAYOUT_LIMITS.questionSpacingPt[1]} pt olmalı.` });
  if (errors.length) return { ok: false, errors };
  const value: PrintLayoutSettings = { version: LAYOUT_SCHEMA_VERSION, pageSize, orientation, columns, marginMm: Math.round(marginMm * 10) / 10, fontSizePt: Math.round(fontSizePt * 10) / 10, questionSpacingPt: Math.round(questionSpacingPt) };
  const widest = layoutModel(value, value.columns === 1 ? 1 : 2);
  if (widest.colW < LAYOUT_LIMITS.minColumnWidthPt) return { ok: false, errors: [{ field: 'columns', code: 'COLUMN_TOO_NARROW', message: `Bu sayfa boyutu, yön ve kenar boşluğuyla sütun genişliği ${Math.round(widest.colW)} pt kalıyor (en az ${LAYOUT_LIMITS.minColumnWidthPt}). Tek sütun, yatay sayfa veya daha dar kenar boşluğu seçin.` }] };
  return { ok: true, value };
}

/** One question's place on a page, top-left origin, in points (what a preview draws). */
export type Placement = { questionId: string; no: number; page: number; column: 0 | 1; x: number; y: number; width: number; height: number; minImageDpi?: number };
export type LayoutPlan = { settings: PrintLayoutSettings; model: LayoutModel; pages: number; placements: Placement[] };

/** Stable digest of anything that changes the printed result; equal revisions mean the same paper. */
export async function contentRevision(parts: unknown): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(parts)));
  return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}
