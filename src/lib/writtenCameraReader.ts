/**
 * A085: reads a photographed written answer sheet (layout from worker/lib/written-camera-layout).
 * Same engine as the optical forms: the four corner squares undo the perspective. Then: which page (printed
 * code), which student (number grid), the exact digit grids, and a flat crop of every answer box for the
 * teacher (and the AI suggestion). Pure: works on ImageData-like pixels, so it is tested without a browser.
 */
import { bubbleDarkness, estimateAlignment, luminance, type ImageDataLike, type OmrTemplateRuntime, type Transform } from './omrEngine';
import { gridCells, type WrittenLayout } from '../../worker/lib/written-camera-layout';

export type GrayCrop = { itemId: string; width: number; height: number; data: Uint8ClampedArray };
export type WrittenPageRead = { ok: boolean; pageNo: number | null; studentNumber: string | null; confidence: number; issues: string[]; digits: Record<string, { read: string; issues: string[] }>; crops: GrayCrop[] };

const MARK = 0.5, DOUBLE = 0.07;
function readGrid(image: ImageDataLike, t: Transform, region: any) {
  const cells = gridCells(region); let value = ''; const issues: string[] = []; const conf: number[] = [];
  for (let p = 1; p <= region.positions; p++) {
    const scored = cells.filter((c) => c.position === p).map((c) => ({ c, s: bubbleDarkness(image, t, { ...c }) })).sort((a, b) => b.s - a.s);
    const [top, second] = scored;
    if (!top || top.s < MARK) {
      if (top && top.s >= 0.28 && top.s - (second?.s || 0) >= 0.2) { value += top.c.value; issues.push(`${p}. hanede soluk işaret (${top.c.value}) okundu; kontrol edin.`); conf.push(0.6); continue; }
      value += '_'; conf.push(top && top.s >= 0.18 ? 0.4 : 1); if (top && top.s >= 0.18) issues.push(`${p}. hanede belirsiz soluk işaret; boş sayıldı.`); continue;
    }
    if (second && second.s >= MARK && top.s - second.s < DOUBLE) { value += '?'; issues.push(`${p}. hanede çift işaret.`); conf.push(0); continue; }
    value += top.c.value; conf.push(Math.min(1, top.s - (second?.s || 0) + 0.45));
  }
  return { value, issues, confidence: conf.length ? conf.reduce((a, b) => a + b, 0) / conf.length : 0 };
}

/** Flat greyscale crop of a millimetre rectangle at `pxPerMm`, sampled through the page transform. */
export function warpRegion(image: ImageDataLike, t: Transform, r: { xMm: number; yMm: number; widthMm: number; heightMm: number }, pxPerMm = 5): { width: number; height: number; data: Uint8ClampedArray } {
  const width = Math.round(r.widthMm * pxPerMm), height = Math.round(r.heightMm * pxPerMm);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = t(r.xMm + (x + 0.5) / pxPerMm, r.yMm + (y + 0.5) / pxPerMm);
    const v = p.x < 0 || p.y < 0 || p.x >= image.width || p.y >= image.height ? 255 : luminance(image, p.x, p.y);
    const i = (y * width + x) * 4; data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  return { width, height, data };
}

export function readWrittenPage(image: ImageDataLike, layout: WrittenLayout): WrittenPageRead {
  const template: OmrTemplateRuntime = { id: layout.paperId, name: 'Yazılı cevap kâğıdı', pageWidthMm: layout.pageWidthMm, pageHeightMm: layout.pageHeightMm, cameraGeometry: { regions: [] }, fiducials: layout.fiducials };
  const a = estimateAlignment(image, template);
  const fail = (issue: string): WrittenPageRead => ({ ok: false, pageNo: null, studentNumber: null, confidence: Math.min(0.35, a.confidence), issues: [...a.issues, issue], digits: {}, crops: [] });
  if (!a.transform || a.found < 4) return fail('Dört köşedeki siyah kare ve sol üstteki yön noktası kadrajda net görünmelidir.');
  const t = a.transform; const issues = [...a.issues];
  const bits = (layout.pages[0].regions.find((r) => r.purpose === 'page-code') as any).bits.map((b: any) => (bubbleDarkness(image, t, { ...b, value: '' }) >= MARK ? 1 : 0));
  const page = layout.pages.find((p) => p.code.every((v, i) => v === bits[i]));
  if (!page) return fail('Sayfa kodu okunamadı; bu kâğıt bu sınava ait olmayabilir.');
  const sn = readGrid(image, t, page.regions.find((r) => r.purpose === 'student-number'));
  const trimmed = sn.value.replace(/^_+|_+$/g, '');
  const studentNumber = trimmed && /^\d+$/.test(trimmed) ? trimmed : null;
  if (!studentNumber) issues.push('Öğrenci numarası okunamadı (boş, eksik veya çift işaret); elle seçin.');
  issues.push(...sn.issues.map((x) => `Öğrenci no: ${x}`));
  const digits: WrittenPageRead['digits'] = {}; const confs = [a.confidence, sn.confidence];
  for (const r of page.regions) if (r.purpose === 'digit-grid') { const g = readGrid(image, t, r); digits[r.itemId] = { read: g.value, issues: g.issues }; confs.push(g.confidence); }
  const crops: GrayCrop[] = page.regions.filter((r) => r.purpose === 'answer-box').map((r: any) => ({ itemId: r.itemId, ...warpRegion(image, t, r) }));
  return { ok: !!studentNumber, pageNo: page.pageNo, studentNumber, confidence: Math.round(confs.reduce((x, y) => x + y, 0) / confs.length * 1000) / 1000, issues, digits, crops };
}
