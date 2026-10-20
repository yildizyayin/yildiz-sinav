import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import type { Env } from '../types';
import { all, one } from './db';
import { parseContentJson } from './question-content';
import { DEJAVU_SANS_BASE64, DEJAVU_SANS_BOLD_BASE64 } from './fonts/dejavu-subset.generated';
import { ANUNEX_MARK_PNG_BASE64, NIBIRU_MARK_PNG_BASE64 } from './fonts/brand-marks.generated';
import { isAiQuestionOrigin } from './question-review';

/**
 * A017: printable Studio booklets.
 * - Turkish text with an embedded font; full stems and options, never truncated.
 * - Real pagination in two columns; a question is never split across columns.
 * - Stem images (PNG/JPEG from R2) and structured TABLE/BAR_CHART visuals are drawn.
 * - Anything that cannot be printed faithfully stops the PDF with a named question and reason.
 * - The last page is a large, phone-readable optical answer form (A018 v2); its geometry is stored with the PDF.
 * - The answer key is a separate document, never inside the student booklet.
 */
export class StudioPrintError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

type Row = { id:string; stem_text:string|null; options_json:string|null; correct_answer:string|null; content_mode:string|null; origin_kind:string|null; question_no:number };
/** Booklet branding: institution logo and name top-left, ANUNEX top-right unless the institution removes it, Nibiru mark next to AI-produced questions. */
export type StudioBranding = { showAnunex: boolean; showNibiru: boolean; institutionName: string | null; institutionLogo: Uint8Array | null };
export const DEFAULT_BRANDING: StudioBranding = { showAnunex: true, showNibiru: true, institutionName: null, institutionLogo: null };
type Asset = { question_id:string; asset_type:string; r2_key:string|null; external_url:string|null; placement:string|null; option_label:string|null; sort_order:number|null; alt_text:string|null };
type Block = { question_id:string; block_type:string; placement:string|null; text_content:string|null; payload_json:string|null; alt_text:string|null; sort_order:number|null };

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 36;
const GUTTER = 18;
const COL_W = (PAGE_W - 2 * MARGIN - GUTTER) / 2;
const TOP = PAGE_H - MARGIN;
const BOTTOM = MARGIN + 22;
const BODY = 9.5;
const LINE = 12.6;
const INK = rgb(0.08, 0.1, 0.14);
const MUTED = rgb(0.38, 0.42, 0.5);
const RULE = rgb(0.72, 0.76, 0.82);
const FILL = rgb(0.93, 0.95, 0.98);
const BAR = rgb(0.2, 0.42, 0.66);
const LABELS = ['A', 'B', 'C', 'D', 'E'];

const b64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export function normalizePrintText(value: unknown): string {
  return String(value ?? '').normalize('NFC').replace(/\r\n?/g, '\n').replace(/[­​-‍﻿]/g, '').replace(/\t/g, ' ');
}

type Fonts = { regular: PDFFont; bold: PDFFont; charset: Set<number> };
async function loadFonts(pdf: PDFDocument): Promise<Fonts> {
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(b64(DEJAVU_SANS_BASE64), { subset: true });
  const bold = await pdf.embedFont(b64(DEJAVU_SANS_BOLD_BASE64), { subset: true });
  return { regular, bold, charset: new Set(regular.getCharacterSet()) };
}

function assertPrintable(fonts: Fonts, text: string, where: string) {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp === 10 || cp === 32) continue;
    if (!fonts.charset.has(cp)) throw new StudioPrintError('PRINT_UNSUPPORTED_CHARACTER', `${where}: "${ch}" (U+${cp.toString(16).toUpperCase().padStart(4, '0')}) karakteri baskı yazı tipinde yok. İçerik eksiltilerek PDF üretilmez.`);
  }
}

export function wrapText(font: PDFFont, text: string, size: number, width: number): string[] {
  const out: string[] = [];
  for (const paragraph of normalizePrintText(text).split('\n')) {
    const words = paragraph.split(/ +/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = '';
    for (let word of words) {
      while (font.widthOfTextAtSize(word, size) > width) {
        // Break an over-long token (long numbers, URLs) by characters instead of overflowing.
        let cut = word.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut), size) > width) cut--;
        if (line) { out.push(line); line = ''; }
        out.push(word.slice(0, cut)); word = word.slice(cut);
      }
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

// --- printable question model -------------------------------------------------------------
type Visual =
  | { kind: 'IMAGE'; bytes: Uint8Array; format: 'png' | 'jpg' }
  | { kind: 'TABLE'; title: string; unit: string; columns: string[]; rows: string[][] }
  | { kind: 'BAR_CHART'; title: string; unit: string; categories: string[]; values: number[] };
type Printable = { no: number; stem: string[]; extra: string[]; visuals: Visual[]; options: string[]; correct: string | null; ai: boolean };

function sniff(bytes: Uint8Array): 'png' | 'jpg' | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  return null;
}

async function loadPrintables(env: Env, documentId: string, booklet: string): Promise<{ rows: Row[]; items: Printable[] }> {
  const rows = await all<Row>(env.DB.prepare(`SELECT q.id,q.stem_text,q.options_json,q.correct_answer,q.content_mode,q.origin_kind,i.sort_order question_no
    FROM studio_document_items i JOIN question_bank q ON q.id=i.question_id WHERE i.document_id=? AND i.booklet_code=? ORDER BY i.sort_order`).bind(documentId, booklet));
  if (!rows.length) throw new StudioPrintError('BOOKLET_EMPTY', 'Bu kitapçıkta soru yok.');
  const ids = rows.map(r => r.id);
  const marks = ids.map(() => '?').join(',');
  const assets = await all<Asset>(env.DB.prepare(`SELECT question_id,asset_type,r2_key,external_url,placement,option_label,sort_order,alt_text FROM question_assets WHERE question_id IN (${marks}) ORDER BY question_id,sort_order,id`).bind(...ids)).catch(() => [] as Asset[]);
  const blocks = await all<Block>(env.DB.prepare(`SELECT question_id,block_type,placement,text_content,payload_json,alt_text,sort_order FROM question_content_blocks WHERE question_id IN (${marks}) ORDER BY question_id,sort_order,id`).bind(...ids)).catch(() => [] as Block[]);
  const items: Printable[] = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index], no = index + 1, where = `Soru ${no}`;
    const options = parseContentJson<any[]>(row.options_json, []).map((o: any) => normalizePrintText(typeof o === 'string' ? o : o?.text ?? o?.content ?? ''));
    if (options.length > 5) throw new StudioPrintError('PRINT_OPTION_COUNT', `${where}: ${options.length} seçenek basılamaz (en fazla 5).`);
    if (options.some(o => !o.trim()) && row.content_mode === 'TEXT') throw new StudioPrintError('PRINT_EMPTY_OPTION', `${where}: boş seçenek var.`);
    const visuals: Visual[] = [];
    const extra: string[] = [];
    for (const asset of assets.filter(a => a.question_id === row.id)) {
      if (asset.asset_type !== 'IMAGE') continue; // audio/video/solution media are not part of the printed booklet
      if ((asset.placement || 'STEM') !== 'STEM') throw new StudioPrintError('PRINT_OPTION_IMAGE_UNSUPPORTED', `${where}: şık veya çözüm görseli içeren soru henüz basılamaz.`);
      if (!asset.r2_key) throw new StudioPrintError('PRINT_EXTERNAL_IMAGE_UNSUPPORTED', `${where}: dış bağlantılı görsel baskıya alınamaz; görseli platforma yükleyin.`);
      const object = await env.FILES.get(asset.r2_key);
      if (!object) throw new StudioPrintError('PRINT_IMAGE_MISSING', `${where}: soru görseli depoda bulunamadı.`);
      const bytes = new Uint8Array(await object.arrayBuffer());
      const format = sniff(bytes);
      if (!format) throw new StudioPrintError('PRINT_IMAGE_FORMAT_UNSUPPORTED', `${where}: görsel PNG veya JPEG değil (WEBP/GIF baskıda desteklenmiyor).`);
      visuals.push({ kind: 'IMAGE', bytes, format });
    }
    for (const block of blocks.filter(b => b.question_id === row.id)) {
      const placement = block.placement || 'STEM';
      if (placement === 'SOLUTION') continue;
      if (placement !== 'STEM') throw new StudioPrintError('PRINT_OPTION_BLOCK_UNSUPPORTED', `${where}: şık içi zengin içerik henüz basılamaz.`);
      if (block.block_type === 'IMAGE') continue; // drawn from its asset above
      if (block.block_type === 'TEXT') { if (block.text_content?.trim()) extra.push(normalizePrintText(block.text_content)); continue; }
      const v = parseContentJson<any>(block.payload_json, null);
      if ((block.block_type === 'TABLE' || block.block_type === 'DIAGRAM') && v?.schemaVersion === 1) {
        if (v.kind === 'TABLE' && Array.isArray(v.columns) && Array.isArray(v.rows)) { visuals.push({ kind: 'TABLE', title: normalizePrintText(v.title), unit: normalizePrintText(v.unit), columns: v.columns.map(normalizePrintText), rows: v.rows.map((r: any[]) => r.map(normalizePrintText)) }); continue; }
        if (v.kind === 'BAR_CHART' && Array.isArray(v.categories) && Array.isArray(v.values) && v.values.every((n: any) => Number.isFinite(Number(n)) && Number(n) >= 0)) { visuals.push({ kind: 'BAR_CHART', title: normalizePrintText(v.title), unit: normalizePrintText(v.unit), categories: v.categories.map(normalizePrintText), values: v.values.map(Number) }); continue; }
      }
      throw new StudioPrintError('PRINT_BLOCK_UNSUPPORTED', `${where}: ${block.block_type} içeriği baskıda henüz desteklenmiyor.`);
    }
    if (row.content_mode && row.content_mode !== 'TEXT' && !visuals.some(v => v.kind === 'IMAGE')) throw new StudioPrintError('PRINT_IMAGE_MISSING', `${where}: görsel soru, ama basılabilir görseli yok.`);
    items.push({ no, stem: [normalizePrintText(row.stem_text)], extra, visuals, options, correct: row.correct_answer, ai: isAiQuestionOrigin(row.origin_kind) });
  }
  return { rows, items };
}

// --- layout --------------------------------------------------------------------------------
type Cursor = { page: PDFPage; col: 0 | 1; y: number; top: number };
type Ctx = { pdf: PDFDocument; fonts: Fonts; images: Map<Uint8Array, any>; title: string; booklet: string; pages: PDFPage[]; branding: StudioBranding; marks: { anunex?: any; nibiru?: any; logo?: any } };

function newPage(ctx: Ctx, first: boolean): Cursor {
  const page = ctx.pdf.addPage([PAGE_W, PAGE_H]);
  ctx.pages.push(page);
  let top = TOP;
  if (first) {
    const { fonts, branding, marks } = ctx;
    let left = MARGIN;
    if (marks.logo) {
      const s = Math.min(40 / marks.logo.width, 40 / marks.logo.height);
      page.drawImage(marks.logo, { x: left, y: top - 40 + (40 - marks.logo.height * s) / 2, width: marks.logo.width * s, height: marks.logo.height * s });
      left += marks.logo.width * s + 10;
    }
    const rightBlock = branding.showAnunex ? 110 : 70;
    const textWidth = PAGE_W - MARGIN - rightBlock - left;
    if (branding.institutionName) page.drawText(branding.institutionName, { x: left, y: top - 11, size: 9.5, font: fonts.bold, color: MUTED, maxWidth: textWidth });
    page.drawText(ctx.title, { x: left, y: top - (branding.institutionName ? 28 : 20), size: 13, font: fonts.bold, color: INK, maxWidth: textWidth });
    if (branding.showAnunex && marks.anunex) {
      const size = 22, label = 'ANUNEX', lw = fonts.bold.widthOfTextAtSize(label, 10);
      page.drawImage(marks.anunex, { x: PAGE_W - MARGIN - size, y: top - size, width: size, height: size });
      page.drawText(label, { x: PAGE_W - MARGIN - size - 5 - lw, y: top - 15, size: 10, font: fonts.bold, color: rgb(0.07, 0.2, 0.5) });
    }
    const bk = `Kitapçık ${ctx.booklet}`;
    page.drawText(bk, { x: PAGE_W - MARGIN - fonts.bold.widthOfTextAtSize(bk, 12), y: top - 40, size: 12, font: fonts.bold, color: INK });
    page.drawText('Ad Soyad: ______________________________   Sınıf: ________   Numara: ____________', { x: MARGIN, y: top - 56, size: 9, font: fonts.regular, color: INK });
    page.drawLine({ start: { x: MARGIN, y: top - 66 }, end: { x: PAGE_W - MARGIN, y: top - 66 }, thickness: 0.8, color: RULE });
    top -= 78;
  } else {
    page.drawText(`${ctx.title} · Kitapçık ${ctx.booklet}`, { x: MARGIN, y: top - 9, size: 8, font: ctx.fonts.regular, color: MUTED, maxWidth: PAGE_W - 2 * MARGIN });
    top -= 20;
  }
  page.drawLine({ start: { x: PAGE_W / 2, y: top + 4 }, end: { x: PAGE_W / 2, y: BOTTOM - 4 }, thickness: 0.5, color: RULE });
  return { page, col: 0, y: top, top };
}

function colX(c: Cursor) { return MARGIN + c.col * (COL_W + GUTTER); }

type Op = { h: number; draw: (page: PDFPage, x: number, y: number) => void };

function textOps(ctx: Ctx, lines: string[], x0: number, size = BODY, bold = false, indent = 0): Op[] {
  return lines.map(line => ({ h: LINE, draw: (page, x, y) => { if (line) page.drawText(line, { x: x + x0 + indent, y: y - size, size, font: bold ? ctx.fonts.bold : ctx.fonts.regular, color: INK }); } }));
}

export function chartAxisMax(value: number) { const raw = Math.max(value, 1) / 4, unit = 10 ** Math.floor(Math.log10(raw)); return ([1, 2, 2.5, 5, 10].find(n => n * unit >= raw) ?? 10) * unit * 4; }

function visualOps(ctx: Ctx, v: Visual, width: number, where: string): Op[] {
  const { regular, bold } = ctx.fonts;
  const ops: Op[] = [];
  const caption = (title: string, unit: string) => {
    const t = [title, unit].filter(Boolean).join(' · ');
    if (t) { assertPrintable(ctx.fonts, t, where); ops.push(...textOps(ctx, wrapText(bold, t, 8.5, width), 0, 8.5, true)); }
  };
  if (v.kind === 'IMAGE') {
    // Images are embedded before layout (prepareImages), so their size is known here.
    const img = ctx.images.get(v.bytes);
    if (!img) throw new StudioPrintError('PRINT_IMAGE_MISSING', `${where}: görsel hazırlanamadı.`);
    const s = Math.min(width / img.width, 230 / img.height, 1), w = img.width * s, h = img.height * s;
    ops.push({ h: h + 6, draw: (page, x, y) => page.drawImage(img, { x: x + (width - w) / 2, y: y - h - 2, width: w, height: h }) });
    return ops;
  }
  if (v.kind === 'TABLE') {
    caption(v.title, v.unit);
    const cols = v.columns.length, cw = width / cols, size = 8;
    const cellLines = (cells: string[], font: PDFFont) => cells.map(c => { assertPrintable(ctx.fonts, c, where); return wrapText(font, c, size, cw - 6); });
    const rowsAll: { lines: string[][]; header: boolean }[] = [{ lines: cellLines(v.columns, bold), header: true }, ...v.rows.map(r => ({ lines: cellLines(r, regular), header: false }))];
    for (const r of rowsAll) {
      const h = Math.max(...r.lines.map(l => l.length)) * 10.5 + 5;
      ops.push({ h, draw: (page, x, y) => {
        if (r.header) page.drawRectangle({ x, y: y - h, width, height: h, color: FILL });
        r.lines.forEach((lines, ci) => {
          page.drawRectangle({ x: x + ci * cw, y: y - h, width: cw, height: h, borderColor: RULE, borderWidth: 0.6 });
          lines.forEach((line, li) => page.drawText(line, { x: x + ci * cw + 3, y: y - 3 - (li + 1) * 10.5 + 2.5, size, font: r.header ? bold : regular, color: INK }));
        });
      } });
    }
    ops.push({ h: 6, draw: () => {} });
    return ops;
  }
  // BAR_CHART: zero baseline, every bar labelled with its exact value.
  caption(v.title, v.unit);
  const max = chartAxisMax(Math.max(...v.values, 0));
  const plotH = 110, labelSize = 7, n = v.categories.length, slot = (width - 24) / n, barW = Math.min(28, slot * 0.6);
  const catLines = v.categories.map(c => { assertPrintable(ctx.fonts, c, where); return wrapText(regular, c, labelSize, slot - 2); });
  const labelH = Math.max(...catLines.map(l => l.length)) * 8.5;
  const h = plotH + labelH + 18;
  ops.push({ h, draw: (page, x, y) => {
    const x0 = x + 22, base = y - 10 - plotH;
    for (let t = 0; t <= 4; t++) {
      const val = (max / 4) * t, gy = base + (plotH * t) / 4, label = Number.isInteger(val) ? val.toLocaleString('tr-TR') : val.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
      page.drawLine({ start: { x: x0, y: gy }, end: { x: x + width, y: gy }, thickness: t === 0 ? 0.9 : 0.3, color: t === 0 ? INK : RULE });
      page.drawText(label, { x: x0 - 3 - regular.widthOfTextAtSize(label, 6.5), y: gy - 2, size: 6.5, font: regular, color: MUTED });
    }
    v.values.forEach((value, i) => {
      const bh = (plotH * value) / max, bx = x0 + i * slot + (slot - barW) / 2;
      page.drawRectangle({ x: bx, y: base, width: barW, height: bh, color: BAR });
      const vl = value.toLocaleString('tr-TR');
      page.drawText(vl, { x: bx + barW / 2 - regular.widthOfTextAtSize(vl, 7) / 2, y: base + bh + 2, size: 7, font: bold, color: INK });
      catLines[i].forEach((line, li) => page.drawText(line, { x: x0 + i * slot + slot / 2 - regular.widthOfTextAtSize(line, labelSize) / 2, y: base - 9 - li * 8.5, size: labelSize, font: regular, color: INK }));
    });
  } });
  ops.push({ h: 6, draw: () => {} });
  return ops;
}

function questionOps(ctx: Ctx, q: Printable): Op[] {
  const where = `Soru ${q.no}`;
  const { regular, bold } = ctx.fonts;
  // Room for three-digit numbers so '100.' never touches the stem.
  const numW = bold.widthOfTextAtSize('100.', BODY + 0.5) + 5, inner = COL_W - numW;
  const ops: Op[] = [];
  const stemText = [...q.stem, ...q.extra].join('\n');
  assertPrintable(ctx.fonts, stemText, where);
  const stemLines = wrapText(regular, stemText, BODY, inner);
  const nibiru = q.ai && ctx.branding.showNibiru ? ctx.marks.nibiru : null;
  ops.push({ h: 0, draw: (page, x, y) => {
    page.drawText(`${q.no}.`, { x, y: y - BODY, size: BODY + 0.5, font: bold, color: INK });
    if (nibiru) page.drawImage(nibiru, { x: x + 1, y: y - BODY - 15, width: 11, height: 11 });
  } });
  ops.push(...textOps(ctx, stemLines, numW));
  for (const v of q.visuals) { ops.push({ h: 4, draw: () => {} }); for (const op of visualOps(ctx, v, inner, where)) ops.push({ h: op.h, draw: (page, x, y) => op.draw(page, x + numW, y) }); }
  ops.push({ h: 3, draw: () => {} });
  q.options.forEach((option, i) => {
    assertPrintable(ctx.fonts, option, `${where} ${LABELS[i]} seçeneği`);
    const label = `${LABELS[i]})`, labelW = bold.widthOfTextAtSize('E) ', BODY);
    const lines = wrapText(regular, option, BODY, inner - labelW);
    lines.forEach((line, li) => ops.push({ h: LINE, draw: (page, x, y) => {
      if (li === 0) page.drawText(label, { x: x + numW, y: y - BODY, size: BODY, font: bold, color: INK });
      if (line) page.drawText(line, { x: x + numW + labelW, y: y - BODY, size: BODY, font: regular, color: INK });
    } }));
  });
  ops.push({ h: 12, draw: () => {} });
  return ops;
}

async function prepareImages(ctx: Ctx, items: Printable[]) {
  for (const q of items) for (const v of q.visuals) if (v.kind === 'IMAGE' && !ctx.images.has(v.bytes)) {
    try { ctx.images.set(v.bytes, v.format === 'png' ? await ctx.pdf.embedPng(v.bytes) : await ctx.pdf.embedJpg(v.bytes)); }
    catch { throw new StudioPrintError('PRINT_IMAGE_UNREADABLE', `Soru ${q.no}: görsel dosyası okunamadı.`); }
  }
}

function footer(ctx: Ctx) {
  const total = ctx.pages.length;
  ctx.pages.forEach((page, i) => {
    const label = `Sayfa ${i + 1} / ${total}`;
    page.drawText(label, { x: PAGE_W / 2 - ctx.fonts.regular.widthOfTextAtSize(label, 7.5) / 2, y: MARGIN - 4, size: 7.5, font: ctx.fonts.regular, color: MUTED });
  });
}

// --- optical page (A018 v2) ------------------------------------------------------------------
// One full A4 page at the end of the booklet, drawn for a phone camera: four large solid corner squares
// (found anywhere in the photo, then the perspective is undone), a small disc under the top-left square that
// tells the reader which way is up, and bubbles that grow to fill the page for short tests.
export const STUDIO_OPTICAL_CAPACITY = 44;
const PT_TO_MM = 2.83465;
const mmX = (x: number) => Math.round(x / PT_TO_MM * 100) / 100;
const mmY = (y: number) => Math.round((PAGE_H - y) / PT_TO_MM * 100) / 100;
/** 30pt (10.6mm) solid squares; lower-left corners. */
export const STUDIO_MARKERS: Array<[number, number]> = [[24, 788], [541, 788], [24, 24], [541, 24]];
const MARKER = 30;
export const STUDIO_FIDUCIAL_TARGETS = STUDIO_MARKERS.map(([x, y]) => ({ xMm: mmX(x + MARKER / 2), yMm: mmY(y + MARKER / 2) }));
const PROBE = { x: 39, y: 768, r: 6 };
const BOOKLET_Y = 748, BOOKLET_X = [478, 512], BOOKLET_R = 10;
export const STUDIO_BOOKLET_REGION = { id: 'booklet', purpose: 'booklet', markThreshold: .45, doubleMarkDelta: .1,
  cells: ['A', 'B'].map((value, i) => ({ xMm: mmX(BOOKLET_X[i]), yMm: mmY(BOOKLET_Y), radiusMm: mmX(BOOKLET_R), value, position: 1 })) };

type Bubble = { x: number; y: number; r: number; option: string; questionNo: number };
export type OpticalLayout = { title: string; booklet: string; questionCount: number; options: string[]; bubbles: Bubble[]; numbers: Array<{ no: number; x: number; y: number; size: number }> };

export function opticalLayout(title: string, booklet: string, questionCount: number, optionCount: number): OpticalLayout {
  const options = optionCount === 5 ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D'];
  const top = 690, bottom = 78, left = 64, right = 531;
  const columns = questionCount <= 15 ? 1 : questionCount <= 30 ? 2 : 3;
  const rows = Math.ceil(questionCount / columns);
  const pitch = Math.min(36, (top - bottom) / Math.max(1, rows));
  const colW = (right - left) / columns;
  const spacing = Math.min(38, (colW - 34) / options.length);
  const r = Math.max(6, Math.min(11, spacing * .38, pitch * .36));
  const block = 34 + spacing * options.length;
  const bubbles: Bubble[] = [], numbers: OpticalLayout['numbers'] = [];
  for (let i = 0; i < questionCount; i++) {
    const col = Math.floor(i / rows), row = i % rows;
    const x0 = left + col * colW + (colW - block) / 2, y = top - pitch / 2 - row * pitch;
    numbers.push({ no: i + 1, x: x0 + 26, y, size: Math.min(12, r * 1.05) });
    options.forEach((option, j) => bubbles.push({ x: x0 + 34 + spacing * (j + .5), y, r, option, questionNo: i + 1 }));
  }
  return { title, booklet, questionCount, options, bubbles, numbers };
}

export function opticalGeometry(layout: OpticalLayout): Record<string, unknown> {
  return { version: 'ANUNEX-OPTICAL-2', pageWidthMm: 210, pageHeightMm: 297,
    fiducials: { targets: STUDIO_FIDUCIAL_TARGETS, searchRadiusRatio: .06, orientationProbe: { xMm: mmX(PROBE.x), yMm: mmY(PROBE.y), radiusMm: mmX(PROBE.r) } },
    cameraGeometry: { regions: [
      { id: 'answers', purpose: 'answers', subjectCode: 'GENEL', questionCount: layout.questionCount, options: layout.options, markThreshold: .45, doubleMarkDelta: .1,
        cells: layout.bubbles.map(b => ({ xMm: mmX(b.x), yMm: mmY(b.y), questionNo: b.questionNo, option: b.option, radiusMm: mmX(b.r) })) },
      STUDIO_BOOKLET_REGION] } };
}

/** Kept for callers/tests that want both at once. */
export function opticalPage(title: string, booklet: string, questionCount: number, optionCount: number) {
  const layout = opticalLayout(title, booklet, questionCount, optionCount);
  return { layout, geometry: opticalGeometry(layout) };
}

const BLACK = rgb(0, 0, 0), LETTER = rgb(0.55, 0.58, 0.63);
function drawOpticalPage(pdf: PDFDocument, fonts: Fonts, layout: OpticalLayout) {
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  for (const [x, y] of STUDIO_MARKERS) page.drawRectangle({ x, y, width: MARKER, height: MARKER, color: BLACK });
  page.drawCircle({ x: PROBE.x, y: PROBE.y, size: PROBE.r, color: BLACK });
  page.drawText(layout.title, { x: 70, y: 800, size: 15, font: fonts.bold, color: INK, maxWidth: 400 });
  page.drawText(`Cevap Formu · Kitapçık ${layout.booklet} · ${layout.questionCount} soru`, { x: 70, y: 786, size: 9, font: fonts.regular, color: MUTED });
  page.drawText('Ad Soyad: ____________________________   Sınıf: ________', { x: 70, y: BOOKLET_Y - 3.5, size: 10, font: fonts.regular, color: INK });
  page.drawText('Kitapçık', { x: 418, y: BOOKLET_Y - 3.5, size: 10, font: fonts.bold, color: INK });
  ['A', 'B'].forEach((v, i) => bubbleAt(page, fonts, BOOKLET_X[i], BOOKLET_Y, BOOKLET_R, v));
  page.drawLine({ start: { x: 64, y: 728 }, end: { x: 531, y: 728 }, thickness: .6, color: RULE });
  page.drawText('Koyu kurşun kalemle yuvarlağın tamamını doldurun. Okuturken dört köşedeki siyah kare görünsün.', { x: 64, y: 712, size: 8.5, font: fonts.regular, color: MUTED, maxWidth: 467 });
  for (const n of layout.numbers) { const label = `${n.no}.`; page.drawText(label, { x: n.x - fonts.bold.widthOfTextAtSize(label, n.size), y: n.y - n.size * .36, size: n.size, font: fonts.bold, color: INK }); }
  for (const b of layout.bubbles) bubbleAt(page, fonts, b.x, b.y, b.r, b.option);
  const foot = 'ANUNEX · telefonla okutulabilir optik form';
  page.drawText(foot, { x: PAGE_W / 2 - fonts.regular.widthOfTextAtSize(foot, 7.5) / 2, y: 36, size: 7.5, font: fonts.regular, color: MUTED });
  return page;
}
function bubbleAt(page: PDFPage, fonts: Fonts, x: number, y: number, r: number, label: string) {
  page.drawCircle({ x, y, size: r, borderColor: rgb(0.2, 0.24, 0.32), borderWidth: .9 });
  const size = r * .95; page.drawText(label, { x: x - fonts.regular.widthOfTextAtSize(label, size) / 2, y: y - size * .36, size, font: fonts.regular, color: LETTER });
}

// --- public API ----------------------------------------------------------------------------
export async function renderStudioPdf(env: Env, documentId: string, booklet: string, branding: StudioBranding = DEFAULT_BRANDING): Promise<{ bytes: ArrayBuffer; metadata: Record<string, unknown>; questionCount: number }> {
  const doc = await one<any>(env.DB.prepare('SELECT * FROM studio_documents WHERE id=?').bind(documentId)); if (!doc) throw new Error('STUDIO_NOT_FOUND');
  const { items } = await loadPrintables(env, documentId, booklet);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${doc.title} - Kitapçık ${booklet}`); pdf.setCreator('ANUNEX Studio'); pdf.setProducer('ANUNEX Studio');
  const fonts = await loadFonts(pdf);
  const title = normalizePrintText(doc.title);
  assertPrintable(fonts, title, 'Belge başlığı');
  if (branding.institutionName) assertPrintable(fonts, branding.institutionName, 'Kurum adı');
  const marks: Ctx['marks'] = {};
  if (branding.showAnunex) marks.anunex = await pdf.embedPng(b64(ANUNEX_MARK_PNG_BASE64));
  if (branding.showNibiru && items.some(q => q.ai)) marks.nibiru = await pdf.embedPng(b64(NIBIRU_MARK_PNG_BASE64));
  if (branding.institutionLogo) {
    const format = sniff(branding.institutionLogo);
    if (!format) throw new StudioPrintError('PRINT_LOGO_FORMAT_UNSUPPORTED', 'Kurum logosu PNG veya JPEG olmalıdır.');
    try { marks.logo = format === 'png' ? await pdf.embedPng(branding.institutionLogo) : await pdf.embedJpg(branding.institutionLogo); }
    catch { throw new StudioPrintError('PRINT_LOGO_UNREADABLE', 'Kurum logosu okunamadı.'); }
  }
  const ctx: Ctx = { pdf, fonts, images: new Map(), title, booklet, pages: [], branding, marks };
  await prepareImages(ctx, items);
  let cur = newPage(ctx, true);
  for (const q of items) {
    const ops = questionOps(ctx, q);
    const height = ops.reduce((s, o) => s + o.h, 0);
    if (height > TOP - 20 - BOTTOM) throw new StudioPrintError('PRINT_QUESTION_TOO_LONG', `Soru ${q.no}: tek sütuna sığmayacak kadar uzun. İçerik eksiltilerek PDF üretilmez.`);
    if (cur.y - height < BOTTOM) {
      if (cur.col === 0) cur = { ...cur, col: 1, y: cur.top };
      else cur = newPage(ctx, false);
      if (cur.y - height < BOTTOM) { cur = newPage(ctx, false); }
    }
    let y = cur.y;
    for (const op of ops) { op.draw(cur.page, colX(cur), y); y -= op.h; }
    cur.y = y;
  }
  footer(ctx);
  let deliveryMode = 'PDF_OPTICAL'; try { deliveryMode = String(JSON.parse(doc.config_json || '{}').deliveryMode || 'PDF_OPTICAL').toUpperCase(); } catch {}
  const withOptical = deliveryMode === 'PDF_OPTICAL';
  if (withOptical && items.length > STUDIO_OPTICAL_CAPACITY) throw new StudioPrintError('PRINT_OPTICAL_CAPACITY', `Bu optik form en fazla ${STUDIO_OPTICAL_CAPACITY} soruyu okutabilir; kitapçıkta ${items.length} soru var. Soru sayısını azaltın veya optiksiz PDF teslimi seçin.`);
  const optionCount = items.some(q => q.options.length >= 5) ? 5 : 4;
  const optical = withOptical ? opticalPage(title, booklet, items.length, optionCount) : null;
  if (optical) drawOpticalPage(pdf, fonts, optical.layout);
  const bytes = await pdf.save();
  return { bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, metadata: { bookletCode: booklet, questionCount: items.length, optionCount, questionPages: ctx.pages.length, branding: { showAnunex: branding.showAnunex, showNibiru: branding.showNibiru, institutionName: branding.institutionName, institutionLogo: !!branding.institutionLogo }, optical: optical?.geometry ?? null }, questionCount: items.length };
}

/** Teacher-facing answer key: one table per booklet, derived from the same stored order as the booklets. */
export async function renderStudioAnswerKey(env: Env, documentId: string): Promise<{ bytes: ArrayBuffer; booklets: Record<string, string[]> }> {
  const doc = await one<any>(env.DB.prepare('SELECT * FROM studio_documents WHERE id=?').bind(documentId)); if (!doc) throw new Error('STUDIO_NOT_FOUND');
  const rows = await all<{ booklet_code: string; sort_order: number; correct_answer: string | null }>(env.DB.prepare(`SELECT i.booklet_code,i.sort_order,q.correct_answer FROM studio_document_items i JOIN question_bank q ON q.id=i.question_id WHERE i.document_id=? ORDER BY i.booklet_code,i.sort_order`).bind(documentId));
  const booklets: Record<string, string[]> = {};
  for (const r of rows) {
    const answer = String(r.correct_answer || '').trim().toUpperCase();
    if (!LABELS.includes(answer)) throw new StudioPrintError('PRINT_ANSWER_KEY_INVALID', `Kitapçık ${r.booklet_code} soru ${(booklets[r.booklet_code]?.length ?? 0) + 1}: cevap anahtarı geçersiz.`);
    (booklets[r.booklet_code] ??= []).push(answer);
  }
  if (!Object.keys(booklets).length) throw new StudioPrintError('BOOKLET_EMPTY', 'Bu belgede soru yok.');
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${doc.title} - Cevap Anahtarı`); pdf.setCreator('ANUNEX Studio');
  const fonts = await loadFonts(pdf);
  const title = normalizePrintText(doc.title);
  assertPrintable(fonts, title, 'Belge başlığı');
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  page.drawText(title, { x: MARGIN, y: TOP - 14, size: 14, font: fonts.bold, color: INK, maxWidth: PAGE_W - 2 * MARGIN });
  page.drawText('Cevap Anahtarı · Öğretmen kopyası · Öğrenciye dağıtmayın', { x: MARGIN, y: TOP - 32, size: 9, font: fonts.regular, color: MUTED });
  let y = TOP - 60;
  for (const code of Object.keys(booklets).sort()) {
    const answers = booklets[code];
    page.drawText(`Kitapçık ${code}`, { x: MARGIN, y, size: 11, font: fonts.bold, color: INK }); y -= 18;
    const perRow = 10, cellW = (PAGE_W - 2 * MARGIN) / perRow, cellH = 26;
    for (let i = 0; i < answers.length; i++) {
      const r = Math.floor(i / perRow), c = i % perRow, x = MARGIN + c * cellW, cy = y - r * cellH;
      if (cy - cellH < BOTTOM) throw new StudioPrintError('PRINT_ANSWER_KEY_TOO_LONG', 'Cevap anahtarı tek sayfaya sığmıyor.');
      page.drawRectangle({ x, y: cy - cellH, width: cellW, height: cellH, borderColor: RULE, borderWidth: 0.6 });
      page.drawText(`${i + 1}`, { x: x + 4, y: cy - 10, size: 7, font: fonts.regular, color: MUTED });
      page.drawText(answers[i], { x: x + cellW / 2 - 4, y: cy - 21, size: 12, font: fonts.bold, color: INK });
    }
    y -= Math.ceil(answers.length / perRow) * cellH + 22;
  }
  const bytes = await pdf.save();
  return { bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, booklets };
}
