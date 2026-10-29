import { PDFDocument, rgb } from 'pdf-lib';
import type { Env } from '../types';
import { one } from './db';
import { assertPrintable, drawOpticalPage, loadFonts, normalizePrintText, opticalGeometry, opticalLayout, sniff, STUDIO_OPTICAL_CAPACITY, wrapText, type Fonts } from './studio-pdf';
import { ANUNEX_MARK_PNG_BASE64 } from './fonts/brand-marks.generated';

/**
 * S044 Hızlı Test paper: cropped questions (or pool text questions) in one or two columns, never split across a
 * column; the institution's name and logo on top; a phone-readable optical form as the last page (same geometry as
 * Studio, so the existing camera reader reads it); the answer key as a separate teacher document.
 */
const PAGE_W = 595, PAGE_H = 842, MARGIN = 36, GUTTER = 18, TOP = PAGE_H - MARGIN, BOTTOM = MARGIN + 22;
const INK = rgb(0.08, 0.1, 0.14), MUTED = rgb(0.38, 0.42, 0.5), RULE = rgb(0.72, 0.76, 0.82);
const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
type Branding = { institutionName: string | null; logo: Uint8Array | null };

export async function brandingFor(env: Env, institutionId: string): Promise<Branding> {
  const inst = await one<any>(env.DB.prepare('SELECT name FROM institutions WHERE id=?').bind(institutionId)).catch(() => null);
  const brand = await one<any>(env.DB.prepare('SELECT logo_r2_key FROM campus_branding WHERE institution_id=?').bind(institutionId)).catch(() => null);
  let logo: Uint8Array | null = null;
  if (brand?.logo_r2_key) { const o = await env.FILES.get(brand.logo_r2_key); if (o) logo = new Uint8Array(await o.arrayBuffer()); }
  return { institutionName: typeof inst?.name === 'string' ? inst.name.trim() || null : null, logo };
}

export function quickTestOpticalTemplate(t: any, questionCount: number) {
  if (questionCount > STUDIO_OPTICAL_CAPACITY) return null;
  return { optical: opticalGeometry(opticalLayout(normalizePrintText(t.title), 'A', questionCount, t.option_count === 5 ? 5 : 4)) };
}

/** Crops are taken from pages drawn at 2x (≈144 dpi): half the pixel width is the question's natural print width. */
export function autoColumns(questions: any[]): 1 | 2 {
  const twoCol = (PAGE_W - 2 * MARGIN - GUTTER) / 2 - 18;
  const imgs = questions.filter((q) => q.kind === 'IMAGE');
  if (!imgs.length) return 2;
  const wide = imgs.filter((q) => Number(q.image_width || 0) / 2 > twoCol * 1.35).length;
  return wide / imgs.length > 0.5 ? 1 : 2;
}

export async function renderQuickTestPdf(env: Env, t: any, questions: any[], branding: Branding, requested: 0 | 1 | 2): Promise<ArrayBuffer> {
  const columns: 1 | 2 = requested === 1 || requested === 2 ? requested : autoColumns(questions);
  const pdf = await PDFDocument.create();
  pdf.setTitle(t.title); pdf.setCreator('ANUNEX Studio · Hızlı Test'); pdf.setProducer('ANUNEX Studio');
  const fonts: Fonts = await loadFonts(pdf);
  const title = normalizePrintText(t.title);
  assertPrintable(fonts, title, 'Test adı');
  const anunex = await pdf.embedPng(b64(ANUNEX_MARK_PNG_BASE64));
  let logo: any = null;
  if (branding.logo) { const f = sniff(branding.logo); try { logo = f === 'png' ? await pdf.embedPng(branding.logo) : f === 'jpg' ? await pdf.embedJpg(branding.logo) : null; } catch { logo = null; } }
  const colW = columns === 2 ? (PAGE_W - 2 * MARGIN - GUTTER) / 2 : PAGE_W - 2 * MARGIN;
  const pages: any[] = [];
  const newPage = (first: boolean) => {
    const page = pdf.addPage([PAGE_W, PAGE_H]); pages.push(page);
    let top = TOP;
    if (first) {
      let left = MARGIN;
      if (logo) { const s = Math.min(40 / logo.width, 40 / logo.height); page.drawImage(logo, { x: left, y: top - 40, width: logo.width * s, height: logo.height * s }); left += logo.width * s + 10; }
      const textW = PAGE_W - MARGIN - 110 - left;
      if (branding.institutionName) page.drawText(normalizePrintText(branding.institutionName), { x: left, y: top - 11, size: 9.5, font: fonts.bold, color: MUTED, maxWidth: textW });
      page.drawText(title, { x: left, y: top - (branding.institutionName ? 28 : 20), size: 13, font: fonts.bold, color: INK, maxWidth: textW });
      page.drawImage(anunex, { x: PAGE_W - MARGIN - 22, y: top - 22, width: 22, height: 22 });
      const info = `${questions.length} soru`;
      page.drawText(info, { x: PAGE_W - MARGIN - fonts.bold.widthOfTextAtSize(info, 11), y: top - 40, size: 11, font: fonts.bold, color: INK });
      page.drawText('Ad Soyad: ______________________________   Sınıf: ________   Numara: ____________', { x: MARGIN, y: top - 56, size: 9, font: fonts.regular, color: INK });
      page.drawLine({ start: { x: MARGIN, y: top - 66 }, end: { x: PAGE_W - MARGIN, y: top - 66 }, thickness: 0.8, color: RULE });
      top -= 78;
    } else {
      page.drawText(title, { x: MARGIN, y: top - 9, size: 8, font: fonts.regular, color: MUTED, maxWidth: PAGE_W - 2 * MARGIN });
      top -= 20;
    }
    if (columns === 2) page.drawLine({ start: { x: PAGE_W / 2, y: top + 4 }, end: { x: PAGE_W / 2, y: BOTTOM - 4 }, thickness: 0.5, color: RULE });
    return { page, col: 0, y: top, top };
  };
  let cur = newPage(true);
  const colX = () => MARGIN + cur.col * (colW + GUTTER);
  const place = (height: number) => {
    if (cur.y - height >= BOTTOM) return;
    if (columns === 2 && cur.col === 0) { cur = { ...cur, col: 1, y: cur.top }; if (cur.y - height >= BOTTOM) return; }
    cur = newPage(false);
  };
  for (const [i, q] of questions.entries()) {
    const label = `${i + 1}.`;
    if (q.kind === 'IMAGE') {
      const obj = await env.FILES.get(q.image_key);
      if (!obj) throw Object.assign(new Error(`${i + 1}. sorunun görseli bulunamadı.`), { code: 'PRINT_IMAGE_MISSING' });
      const bytes = new Uint8Array(await obj.arrayBuffer());
      const img = sniff(bytes) === 'png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const maxW = colW - 18, maxH = (TOP - 98) - BOTTOM;
      // Crops are taken from screen-resolution pages: never upscale past ~1.25x, keep the aspect ratio.
      let w = Math.min(maxW, img.width / 2), h = (img.height / img.width) * w;
      if (h > maxH) { h = maxH; w = (img.width / img.height) * h; }
      place(h + 14);
      cur.page.drawText(label, { x: colX(), y: cur.y - 10, size: 10, font: fonts.bold, color: INK });
      cur.page.drawImage(img, { x: colX() + 18, y: cur.y - h, width: w, height: h });
      cur.y -= h + 14;
    } else {
      const stem = normalizePrintText(q.stem_text || '');
      let opts: string[] = []; try { const v = JSON.parse(q.options_json || '[]'); opts = Array.isArray(v) ? v.map((o: any) => typeof o === 'string' ? o : String(o?.text ?? '')) : Object.values(v || {}).map(String); } catch { opts = []; }
      const lines = wrapText(fonts.regular, stem, 9.5, colW - 18);
      const optLines = opts.flatMap((o, j) => wrapText(fonts.regular, `${'ABCDE'[j]}) ${normalizePrintText(o)}`, 9.5, colW - 24));
      const h = (lines.length + optLines.length) * 12.6 + 12;
      place(h);
      cur.page.drawText(label, { x: colX(), y: cur.y - 10, size: 10, font: fonts.bold, color: INK });
      let y = cur.y;
      for (const l of lines) { if (l) cur.page.drawText(l, { x: colX() + 18, y: y - 9.5, size: 9.5, font: fonts.regular, color: INK }); y -= 12.6; }
      for (const l of optLines) { if (l) cur.page.drawText(l, { x: colX() + 24, y: y - 9.5, size: 9.5, font: fonts.regular, color: INK }); y -= 12.6; }
      cur.y = y - 12;
    }
  }
  pages.forEach((page, i) => { const l = `Sayfa ${i + 1} / ${pages.length}`; page.drawText(l, { x: PAGE_W / 2 - fonts.regular.widthOfTextAtSize(l, 7.5) / 2, y: MARGIN - 4, size: 7.5, font: fonts.regular, color: MUTED }); });
  if (questions.length <= STUDIO_OPTICAL_CAPACITY) drawOpticalPage(pdf, fonts, opticalLayout(title, 'A', questions.length, t.option_count === 5 ? 5 : 4));
  const bytes = await pdf.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function renderQuickTestAnswerKey(t: any, answers: string[]): Promise<ArrayBuffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${t.title} - Cevap Anahtarı`); pdf.setCreator('ANUNEX Studio · Hızlı Test');
  const fonts = await loadFonts(pdf);
  const title = normalizePrintText(t.title);
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  page.drawText(title, { x: MARGIN, y: TOP - 14, size: 14, font: fonts.bold, color: INK, maxWidth: PAGE_W - 2 * MARGIN });
  page.drawText('Cevap Anahtarı · Öğretmen kopyası · Öğrenciye dağıtmayın · X = iptal edilen soru', { x: MARGIN, y: TOP - 32, size: 9, font: fonts.regular, color: MUTED });
  const perRow = 10, cellW = (PAGE_W - 2 * MARGIN) / perRow, cellH = 26, y0 = TOP - 56;
  answers.forEach((a, i) => {
    const r = Math.floor(i / perRow), c = i % perRow, x = MARGIN + c * cellW, cy = y0 - r * cellH;
    page.drawRectangle({ x, y: cy - cellH, width: cellW, height: cellH, borderColor: RULE, borderWidth: 0.6 });
    page.drawText(`${i + 1}`, { x: x + 4, y: cy - 10, size: 7, font: fonts.regular, color: MUTED });
    page.drawText(a, { x: x + cellW / 2 - 4, y: cy - 21, size: 12, font: fonts.bold, color: INK });
  });
  const bytes = await pdf.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
