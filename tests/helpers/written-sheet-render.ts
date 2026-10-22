import { homography, type ImageDataLike } from '../../src/lib/omrEngine';
import { gridCells, type WrittenLayout } from '../../worker/lib/written-camera-layout';

/**
 * A085: renders a written answer sheet page as a synthetic "phone photo": the page on a grey desk, seen at an
 * angle (perspective), with the given bubbles filled and a pen stroke in chosen answer boxes.
 */
export function photographPage(layout: WrittenLayout, pageNo: number, marks: { student?: string; digits?: Record<string, string>; ink?: string[] }, opts: { width?: number; height?: number; corners?: number[][]; faint?: boolean } = {}): ImageDataLike {
  const W = opts.width ?? 1100, H = opts.height ?? 1450;
  // where the page corners land in the photo (TL, TR, BR, BL): a slanted shot
  const dst = opts.corners ?? [[90, 70], [1010, 110], [1040, 1390], [60, 1340]];
  const toMm = homography(dst, [[0, 0], [210, 0], [210, 297], [0, 297]])!;
  const page = layout.pages.find((p) => p.pageNo === pageNo)!;
  const filled: { x: number; y: number; r: number }[] = [];
  page.code.forEach((b, i) => { if (b) { const c = (page.regions.find((r) => r.purpose === 'page-code') as any).bits[i]; filled.push({ x: c.xMm, y: c.yMm, r: c.radiusMm }); } });
  const fillGrid = (region: any, value: string) => { const cells = gridCells(region); [...value].forEach((ch, k) => { if (ch === '_') return; const c = cells.find((x) => x.position === k + 1 && x.value === ch); if (c) filled.push({ x: c.xMm, y: c.yMm, r: c.radiusMm * 0.9 }); }); };
  if (marks.student) fillGrid(page.regions.find((r) => r.purpose === 'student-number'), marks.student);
  for (const [itemId, v] of Object.entries(marks.digits || {})) { const g = page.regions.find((r: any) => r.purpose === 'digit-grid' && r.itemId === itemId); if (g) fillGrid(g, v); }
  const boxes = page.regions.filter((r: any) => r.purpose === 'answer-box') as any[];
  const inkBoxes = boxes.filter((b) => (marks.ink || []).includes(b.itemId));
  const shade = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x > 210 || y > 297) return 110; // desk
    for (const c of layout.fiducials.targets) if (Math.abs(x - c.xMm) <= 5 && Math.abs(y - c.yMm) <= 5) return 15;
    const p = layout.fiducials.orientationProbe; if ((x - p.xMm) ** 2 + (y - p.yMm) ** 2 <= p.radiusMm ** 2) return 15;
    for (const f of filled) if ((x - f.x) ** 2 + (y - f.y) ** 2 <= f.r ** 2) return opts.faint ? 150 : 30;
    for (const b of boxes) { const onEdge = (Math.abs(x - b.xMm) < 0.3 || Math.abs(x - b.xMm - b.widthMm) < 0.3) && y >= b.yMm && y <= b.yMm + b.heightMm || (Math.abs(y - b.yMm) < 0.3 || Math.abs(y - b.yMm - b.heightMm) < 0.3) && x >= b.xMm && x <= b.xMm + b.widthMm; if (onEdge) return 40; }
    for (const b of inkBoxes) { const lx = x - b.xMm - 10, ly = y - b.yMm - 10; if (lx > 0 && lx < 80 && ly > 0 && ly < b.heightMm - 20 && Math.abs(ly - lx * (b.heightMm - 20) / 80) < 0.6) return 35; }
    return 238; // slightly grey paper
  };
  const data = new Uint8ClampedArray(W * H * 4);
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const w = toMm[6] * px + toMm[7] * py + toMm[8]; const x = (toMm[0] * px + toMm[1] * py + toMm[2]) / w, y = (toMm[3] * px + toMm[4] * py + toMm[5]) / w;
    const v = shade(x, y); const i = (py * W + px) * 4; data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  return { width: W, height: H, data };
}
