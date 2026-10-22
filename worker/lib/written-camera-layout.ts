/**
 * A085: camera answer sheet of a final written paper (pure; shared by the Worker and the browser reader).
 * ANUNEX camera standard: four solid 10 mm corner squares inside the page, an orientation dot, bubbles of
 * at least 4 mm. Every page repeats the student-number grid and carries a printed page code; every question
 * has a framed answer box and a teacher score box; integer answers get a digit bubble grid (read exactly,
 * no AI). All positions are in millimetres on an A4 page.
 */
export type LayoutItem = { itemId: string; no: number; points: number; digitPositions: number | null; tall: boolean };
export type Region =
  | { purpose: 'student-number'; xMm: number; yMm: number; widthMm: number; heightMm: number; positions: number; values: string[]; bubbleRadiusMm: number }
  | { purpose: 'page-code'; bits: { xMm: number; yMm: number; radiusMm: number }[] }
  | { purpose: 'answer-box'; itemId: string; no: number; points: number; xMm: number; yMm: number; widthMm: number; heightMm: number }
  | { purpose: 'digit-grid'; itemId: string; xMm: number; yMm: number; widthMm: number; heightMm: number; positions: number; values: string[]; bubbleRadiusMm: number }
  | { purpose: 'score-box'; itemId: string; xMm: number; yMm: number; widthMm: number; heightMm: number };
export type WrittenLayout = {
  version: 1; paperId: string; pageWidthMm: number; pageHeightMm: number; studentDigits: number;
  fiducials: { targets: { xMm: number; yMm: number }[]; markerSizeMm: number; orientationProbe: { xMm: number; yMm: number; radiusMm: number } };
  pages: { pageNo: number; code: number[]; regions: Region[] }[];
};

export const PAGE = { w: 210, h: 297 };
const CORNERS = [{ xMm: 12, yMm: 12 }, { xMm: 198, yMm: 12 }, { xMm: 198, yMm: 285 }, { xMm: 12, yMm: 285 }];
const PROBE = { xMm: 30, yMm: 12, radiusMm: 2.5 };
const CODE_BITS = [{ xMm: 60, yMm: 12, radiusMm: 2.2 }, { xMm: 68, yMm: 12, radiusMm: 2.2 }, { xMm: 76, yMm: 12, radiusMm: 2.2 }];
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const ROW = 4.8, COL = 7, R = 2.0; // bubbles 4 mm across
const CONTENT_TOP = 76, CONTENT_BOTTOM = 272, LEFT = 15, WIDTH = 180;

/** An integer model answer gets a digit grid; at least 4 positions so the grid does not reveal its length. */
export function digitPositionsFor(modelAnswer: string | null | undefined): number | null {
  const m = String(modelAnswer ?? '').trim();
  if (!/^\d{1,8}$/.test(m)) return null;
  return Math.max(4, m.length);
}
export const pageCode = (pageNo: number) => [0, 1, 2].map((b) => ((pageNo - 1) >> b) & 1);

export function buildWrittenLayout(paperId: string, items: LayoutItem[], studentDigits: number): WrittenLayout {
  const digits = Math.min(8, Math.max(3, studentDigits));
  const studentRegion: Region = { purpose: 'student-number', xMm: 196 - digits * COL, yMm: 24, widthMm: digits * COL, heightMm: 10 * ROW, positions: digits, values: DIGITS, bubbleRadiusMm: R };
  const pages: WrittenLayout['pages'] = [];
  let page: WrittenLayout['pages'][number] | null = null; let y = CONTENT_TOP;
  const newPage = () => { page = { pageNo: pages.length + 1, code: pageCode(pages.length + 1), regions: [studentRegion, { purpose: 'page-code', bits: CODE_BITS }] }; pages.push(page); y = CONTENT_TOP; };
  newPage();
  for (const it of items) {
    const header = 9;
    const body = it.digitPositions ? 10 * ROW + 6 : it.tall ? 62 : 34;
    const h = header + body;
    if (y + h > CONTENT_BOTTOM) { if (pages.length >= 8) throw new Error('LAYOUT_TOO_LONG'); newPage(); }
    page!.regions.push({ purpose: 'answer-box', itemId: it.itemId, no: it.no, points: it.points, xMm: LEFT, yMm: y + header, widthMm: WIDTH, heightMm: body });
    page!.regions.push({ purpose: 'score-box', itemId: it.itemId, xMm: LEFT + WIDTH - 26, yMm: y + 1, widthMm: 26, heightMm: 7 });
    if (it.digitPositions) page!.regions.push({ purpose: 'digit-grid', itemId: it.itemId, xMm: LEFT + 8, yMm: y + header + 3, widthMm: it.digitPositions * COL, heightMm: 10 * ROW, positions: it.digitPositions, values: DIGITS, bubbleRadiusMm: R });
    y += h + 4;
  }
  return { version: 1, paperId, pageWidthMm: PAGE.w, pageHeightMm: PAGE.h, studentDigits: digits, fiducials: { targets: CORNERS, markerSizeMm: 10, orientationProbe: PROBE }, pages };
}

/** Bubble centres of a grid region (position columns × value rows), as the reader samples them. */
export function gridCells(r: { xMm: number; yMm: number; widthMm: number; heightMm: number; positions: number; values: string[]; bubbleRadiusMm: number }) {
  const out: { position: number; value: string; xMm: number; yMm: number; radiusMm: number }[] = [];
  for (let p = 0; p < r.positions; p++) for (let v = 0; v < r.values.length; v++) out.push({ position: p + 1, value: r.values[v], xMm: r.xMm + (p + 0.5) * r.widthMm / r.positions, yMm: r.yMm + (v + 0.5) * r.heightMm / r.values.length, radiusMm: r.bubbleRadiusMm });
  return out;
}

/** A read digit string ("__42", blanks "_", double marks "?") as a number; null when anything but leading blanks is unclear. */
export function digitValue(read: string): number | null {
  const t = read.replace(/^_+/, '');
  if (!/^\d+$/.test(t)) return null;
  return Number(t);
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
/** Printable SVG sheet in millimetres; what is printed is exactly what the reader expects. */
export function writtenLayoutHtml(layout: WrittenLayout, title: string, school: string) {
  const pages = layout.pages.map((p) => {
    const parts: string[] = [];
    for (const c of layout.fiducials.targets) parts.push(`<rect x="${c.xMm - 5}" y="${c.yMm - 5}" width="10" height="10" fill="#000"/>`);
    const pr = layout.fiducials.orientationProbe; parts.push(`<circle cx="${pr.xMm}" cy="${pr.yMm}" r="${pr.radiusMm}" fill="#000"/>`);
    parts.push(`<text x="40" y="22" font-size="4.2" font-weight="bold">${esc(school)}</text><text x="40" y="28" font-size="3.6">${esc(title)}</text><text x="40" y="34" font-size="3.2">Sayfa ${p.pageNo} / ${layout.pages.length} · Cevap kâğıdı (kamera ile okunur)</text>`);
    parts.push(`<text x="18" y="46" font-size="3.4">Adı Soyadı: ........................................</text><text x="18" y="54" font-size="3">Öğrenci numaranızı sağdaki ızgarada her sütunda bir baloncuk karartarak işaretleyin.</text><text x="18" y="60" font-size="3">Cevabınızı yalnız çerçevenin içine yazın. Puan kutusunu öğretmen doldurur.</text>`);
    for (const r of p.regions) {
      if (r.purpose === 'page-code') r.bits.forEach((b, i) => parts.push(`<circle cx="${b.xMm}" cy="${b.yMm}" r="${b.radiusMm}" fill="${p.code[i] ? '#000' : 'none'}" stroke="#000" stroke-width="0.3"/>`));
      if (r.purpose === 'student-number' || r.purpose === 'digit-grid') {
        if (r.purpose === 'student-number') parts.push(`<text x="${r.xMm}" y="${r.yMm - 2}" font-size="3">Öğrenci No</text>`);
        for (const c of gridCells(r)) parts.push(`<circle cx="${c.xMm}" cy="${c.yMm}" r="${c.radiusMm}" fill="none" stroke="#000" stroke-width="0.25"/><text x="${c.xMm}" y="${c.yMm + 0.9}" font-size="2.4" text-anchor="middle" fill="#666">${c.value}</text>`);
      }
      if (r.purpose === 'answer-box') parts.push(`<text x="${r.xMm}" y="${r.yMm - 3}" font-size="3.8" font-weight="bold">${r.no}. soru (${r.points} puan)</text><rect x="${r.xMm}" y="${r.yMm}" width="${r.widthMm}" height="${r.heightMm}" fill="none" stroke="#000" stroke-width="0.5"/>`);
      if (r.purpose === 'score-box') parts.push(`<rect x="${r.xMm}" y="${r.yMm}" width="${r.widthMm}" height="${r.heightMm}" fill="none" stroke="#000" stroke-width="0.4"/><text x="${r.xMm + 1.5}" y="${r.yMm + 4.8}" font-size="3">Puan:</text>`);
      if (r.purpose === 'digit-grid') parts.push(`<text x="${r.xMm + r.widthMm + 4}" y="${r.yMm + 6}" font-size="3">Sayısal cevabınızı sağa dayalı işaretleyin.</text>`);
    }
    return `<svg class="page" xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297" font-family="Arial, sans-serif">${parts.join('')}</svg>`;
  }).join('');
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(title)} — kamera cevap kâğıdı</title><style>@page{size:A4;margin:0}body{margin:0}.page{display:block;page-break-after:always}</style></head><body>${pages}</body></html>`;
}
