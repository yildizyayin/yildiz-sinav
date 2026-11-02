/**
 * Sonuç raporları "PDF indir" (owner, 2 Nov): the earlier version turned every page into a picture one by one, so a
 * 216-page report took minutes. Now the pages are written into the PDF as text, lines and coloured boxes (vector),
 * the way Okulizyon/Fernus files look: hundreds of pages in seconds, small files, selectable text, sharp at any zoom.
 *
 * How: every `.rx-page` is laid out once off screen with the report fonts bundled in /fonts (Inter + DejaVu Sans
 * Mono, Latin + Turkish subsets). Because the browser measures with exactly the font the PDF embeds, each text run
 * lands where it stands on screen. Boxes, borders, charts (SVG lines, rectangles, polylines, circles, text) are read
 * from the laid-out page and drawn with pdf-lib. Nothing is sent to a server.
 */
import type { PDFDocument as PDFDocumentT, PDFFont, PDFImage } from 'pdf-lib';

const A4 = { w: 595.28, h: 841.89 };
const FONT_FILES = { regular: '/fonts/rx-inter-regular.ttf', bold: '/fonts/rx-inter-bold.ttf', mono: '/fonts/rx-mono.ttf' } as const;
type FontKey = keyof typeof FONT_FILES;

let fontBytes: Promise<Record<FontKey, ArrayBuffer>> | null = null;
let faces: Promise<void> | null = null;
function loadFontBytes() {
  fontBytes ||= Promise.all((Object.keys(FONT_FILES) as FontKey[]).map(async (k) => {
    const r = await fetch(FONT_FILES[k]); if (!r.ok) throw new Error('Rapor yazı tipi yüklenemedi.');
    return [k, await r.arrayBuffer()] as const;
  })).then((pairs) => Object.fromEntries(pairs) as Record<FontKey, ArrayBuffer>).catch((e) => { fontBytes = null; throw e; });
  return fontBytes;
}
/** The same files as browser fonts, so on-screen measuring and the PDF use identical glyph widths. */
function registerFaces() {
  faces ||= loadFontBytes().then(async (b) => {
    const list = [new FontFace('RxPdf', b.regular.slice(0), { weight: '100 549' }), new FontFace('RxPdf', b.bold.slice(0), { weight: '550 1000' }), new FontFace('RxPdfMono', b.mono.slice(0), { weight: '100 1000' })];
    for (const f of list) { await f.load(); document.fonts.add(f); }
  }).catch((e) => { faces = null; throw e; });
  return faces;
}

/** Loads the libraries and fonts ahead of the click, so pressing "PDF indir" starts at once. */
export function preloadPdfTools() { void import('pdf-lib'); void import('@pdf-lib/fontkit'); void registerFaces().catch(() => undefined); }

type RGBA = { r: number; g: number; b: number; a: number };
function parseColor(v: string | null | undefined): RGBA | null {
  if (!v || v === 'none' || v === 'transparent') return null;
  let m = v.match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/);
  if (m) { const a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]); return a <= 0 ? null : { r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255, a }; }
  m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) { const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]; return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255, a: 1 }; }
  return null;
}
/** A gradient is drawn as one colour: its first stop that is not near-white (the soft card tints are all light). */
function gradientColor(img: string) {
  if (!img || img === 'none') return null;
  const stops = (img.match(/rgba?\([^)]*\)|#[0-9a-f]{3,6}\b/gi) || []).map(parseColor).filter(Boolean) as RGBA[];
  return stops.find((c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b < 0.9) || stops[0] || null;
}

const WS = /[\s ]+/g;
function transformText(t: string, mode: string) {
  if (mode === 'uppercase') return t.toLocaleUpperCase('tr-TR');
  if (mode === 'lowercase') return t.toLocaleLowerCase('tr-TR');
  return t;
}

export async function downloadPagesAsPdf(root: Element | null | undefined, fileName: string, onProgress?: (done: number, total: number) => void): Promise<number> {
  const source = root ? [...root.querySelectorAll<HTMLElement>('.rx-page')] : [];
  if (!source.length) return 0;
  const [{ PDFDocument, rgb, pushGraphicsState, popGraphicsState, setCharacterSpacing, LineCapStyle }, fontkit, bytes] = await Promise.all([import('pdf-lib'), import('@pdf-lib/fontkit'), loadFontBytes(), registerFaces()]).then(([a, b, c]) => [a, b.default, c] as const);
  const pdf: PDFDocumentT = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(fileName.replace(/\.pdf$/i, ''));
  pdf.setCreator('ANUNEX Sonuç Ağı');
  const fonts: Record<FontKey, PDFFont> = {
    regular: await pdf.embedFont(bytes.regular, { subset: false }),
    bold: await pdf.embedFont(bytes.bold, { subset: false }),
    mono: await pdf.embedFont(bytes.mono, { subset: false }),
  };
  // ascent / (ascent + descent) of each font: where the baseline sits inside the browser's text box.
  const baseRatio: Record<FontKey, number> = { regular: 1984 / (1984 + 494), bold: 1984 / (1984 + 494), mono: 1901 / (1901 + 483) };
  const color = (c: RGBA) => rgb(c.r, c.g, c.b);

  // Off-screen stage: all pages at their real A4 size, inside the same scoped wrappers as the preview.
  const stage = document.createElement('div');
  stage.setAttribute('aria-hidden', 'true');
  stage.style.cssText = 'position:fixed;left:-100000px;top:0;z-index:-1;pointer-events:none;background:#fff';
  const style = document.createElement('style');
  style.textContent = '.rx-pdf-stage,.rx-pdf-stage *{font-family:RxPdf!important}.rx-pdf-stage .rx-ans,.rx-pdf-stage .rx-ans *{font-family:RxPdfMono!important}.rx-pdf-stage .rx-ans td.rx-al{font-family:RxPdf!important}.rx-pdf-stage .rx-pn::after{content:none!important}';
  stage.appendChild(style);
  const scope = root!.closest('.rm') ? document.createElement('div') : null;
  if (scope) scope.className = 'rm';
  const holder = (scope || stage).appendChild(document.createElement('div'));
  holder.className = 'rx-pages rx-pdf-stage';
  holder.style.cssText = 'max-height:none;overflow:visible;padding:0;background:#fff;border-radius:0';
  if (scope) stage.appendChild(scope);
  const pages = source.map((p, i) => {
    const clone = p.cloneNode(true) as HTMLElement;
    clone.classList.remove('is-current');
    clone.style.cssText += ';display:flex;position:static;transform:none;margin:0 0 4px;box-shadow:none;border-radius:0';
    clone.querySelectorAll('.rx-pn').forEach((n) => n.append(`Sayfa ${i + 1}`)); // the CSS page counter, written out
    holder.appendChild(clone);
    return clone;
  });
  document.body.appendChild(stage);

  const images = new Map<string, Promise<PDFImage | null>>();
  const imageFor = (src: string) => {
    if (!images.has(src)) images.set(src, (async () => {
      try {
        const img = new Image(); img.src = src; await img.decode();
        const c = document.createElement('canvas'); const s = 4; c.width = Math.max(1, img.naturalWidth || 64) * s; c.height = Math.max(1, img.naturalHeight || 64) * s;
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        return await pdf.embedPng(c.toDataURL('image/png'));
      } catch { return null; }
    })());
    return images.get(src)!;
  };

  try {
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    for (let pi = 0; pi < pages.length; pi++) {
      const el = pages[pi];
      const land = el.classList.contains('rx-land');
      const size = land ? { w: A4.h, h: A4.w } : A4;
      const page = pdf.addPage([size.w, size.h]);
      const box = el.getBoundingClientRect();
      const k = size.w / box.width; // CSS px → PDF pt
      const X = (x: number) => (x - box.left) * k;
      const Y = (y: number) => size.h - (y - box.top) * k;
      await drawElement(el, 1, null);
      onProgress?.(pi + 1, pages.length);
      if (pi % 20 === 19) await new Promise((r) => setTimeout(r, 0)); // let the progress text paint

      // ---- per-page helpers (closures over k / X / Y) ----
      function fillRect(l: number, t: number, w: number, h: number, c: RGBA, alpha: number, radius = 0) {
        if (w <= 0 || h <= 0) return;
        const opacity = c.a * alpha;
        if (radius > 0.3) {
          const r = Math.min(radius * k, (w * k) / 2, (h * k) / 2), x = X(l), y = (t - box.top) * k, W = w * k, H = h * k;
          const d = `M${x + r},${y} H${x + W - r} Q${x + W},${y} ${x + W},${y + r} V${y + H - r} Q${x + W},${y + H} ${x + W - r},${y + H} H${x + r} Q${x},${y + H} ${x},${y + H - r} V${y + r} Q${x},${y} ${x + r},${y} Z`;
          page.drawSvgPath(d, { x: 0, y: size.h, color: color(c), opacity, borderWidth: 0 });
        } else page.drawRectangle({ x: X(l), y: Y(t + h), width: w * k, height: h * k, color: color(c), opacity });
      }
      function line(x1: number, y1: number, x2: number, y2: number, c: RGBA, width: number, alpha: number) {
        page.drawLine({ start: { x: X(x1), y: Y(y1) }, end: { x: X(x2), y: Y(y2) }, thickness: Math.max(0.2, width * k), color: color(c), opacity: c.a * alpha });
      }
      function text(str: string, left: number, top: number, height: number, width: number, cs: CSSStyleDeclaration, alpha: number, sizePx?: number, c?: RGBA | null) {
        const s = str.replace(WS, ' ').trim(); if (!s) return;
        const fill = c === undefined ? parseColor(cs.color) : c; if (!fill) return;
        const mono = cs.fontFamily.includes('RxPdfMono');
        const key: FontKey = mono ? 'mono' : Number(cs.fontWeight) >= 550 ? 'bold' : 'regular';
        const font = fonts[key];
        let pt = (sizePx ?? parseFloat(cs.fontSize)) * k;
        const ls = cs.letterSpacing === 'normal' ? 0 : (parseFloat(cs.letterSpacing) || 0) * k;
        const target = width * k;
        const natural = font.widthOfTextAtSize(s, pt) + ls * Math.max(0, s.length - 1);
        if (target > 0 && natural > target * 1.015) pt *= target / natural; // never overflow its box
        const baseline = top + height * baseRatio[key];
        const opts = { x: X(left), y: Y(baseline), size: pt, font, color: color(fill), opacity: fill.a * alpha };
        if (ls) { page.pushOperators(pushGraphicsState(), setCharacterSpacing(ls)); page.drawText(s, opts); page.pushOperators(popGraphicsState()); }
        else page.drawText(s, opts);
      }
      /** Clip box from the nearest overflow:hidden ancestor (ellipsis cells, bars). */
      function clipOf(node: Element, parentClip: DOMRect | null, cs: CSSStyleDeclaration) {
        if (cs.overflow === 'hidden' || cs.overflowX === 'hidden') {
          const r = node.getBoundingClientRect();
          if (!parentClip) return r;
          const l = Math.max(r.left, parentClip.left), t = Math.max(r.top, parentClip.top), R = Math.min(r.right, parentClip.right), B = Math.min(r.bottom, parentClip.bottom);
          return new DOMRect(l, t, Math.max(0, R - l), Math.max(0, B - t));
        }
        return parentClip;
      }
      function drawTextNode(node: Text, cs: CSSStyleDeclaration, alpha: number, clip: DOMRect | null) {
        const raw = node.data; if (!raw || !raw.replace(WS, '')) return;
        const first = raw.search(/[^\s ]/), last = raw.length - (raw.match(/[\s ]*$/)?.[0].length || 0);
        const range = document.createRange();
        range.setStart(node, first); range.setEnd(node, last);
        const rects = range.getClientRects();
        if (!rects.length) return;
        const tt = cs.textTransform;
        if (rects.length === 1) {
          const r = rects[0]; let s = transformText(raw.slice(first, last), tt);
          if (clip && r.right > clip.right + 0.5) { // text-overflow: ellipsis
            const fit = clip.right - r.left; if (fit <= 0) return;
            const font = Number(cs.fontWeight) >= 550 ? fonts.bold : fonts.regular, pt = parseFloat(cs.fontSize) * k;
            while (s.length > 1 && font.widthOfTextAtSize(s + '…', pt) > fit * k) s = s.slice(0, -1);
            text(s + '…', r.left, r.top, r.height, fit, cs, alpha); return;
          }
          text(s, r.left, r.top, r.height, r.width, cs, alpha); return;
        }
        // Wrapped text: group words by line.
        const words: Array<{ s: string; r: DOMRect }> = [];
        const re = /[^\s ]+/g; let m: RegExpExecArray | null;
        while ((m = re.exec(raw))) { range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length); const rs = range.getClientRects(); if (rs.length) words.push({ s: m[0], r: rs[0] }); }
        let lineWords: typeof words = [];
        const flush = () => { if (!lineWords.length) return; const a = lineWords[0].r, b = lineWords[lineWords.length - 1].r; text(transformText(lineWords.map((w) => w.s).join(' '), tt), a.left, a.top, a.height, b.right - a.left, cs, alpha); lineWords = []; };
        for (const w of words) { if (lineWords.length && Math.abs(w.r.top - lineWords[0].r.top) > w.r.height / 2) flush(); lineWords.push(w); }
        flush();
      }
      function drawSvg(svg: SVGSVGElement, alpha: number) {
        svg.querySelectorAll<SVGGraphicsElement>('line,rect,polyline,polygon,circle,ellipse,text').forEach((shape) => {
          const m = shape.getScreenCTM(); if (!m) return;
          const cs = getComputedStyle(shape); if (cs.display === 'none' || cs.visibility === 'hidden') return;
          const a = alpha * (parseFloat(cs.opacity) || 1);
          const P = (x: number, y: number) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
          const lw = (parseFloat(cs.strokeWidth) || 1) * Math.sqrt(Math.abs(m.a * m.d));
          const stroke = parseColor(cs.stroke), fill = parseColor(cs.fill);
          const n = (attr: string) => parseFloat(shape.getAttribute(attr) || '0') || 0;
          const tag = shape.tagName.toLowerCase();
          if (tag === 'line') { if (stroke) { const p = P(n('x1'), n('y1')), q = P(n('x2'), n('y2')); line(p.x, p.y, q.x, q.y, stroke, lw, a); } }
          else if (tag === 'rect') {
            const p = P(n('x'), n('y')), q = P(n('x') + n('width'), n('y') + n('height'));
            const l = Math.min(p.x, q.x), t = Math.min(p.y, q.y), w = Math.abs(q.x - p.x), h = Math.abs(q.y - p.y);
            if (fill) fillRect(l, t, w, h, fill, a, n('rx') * Math.abs(m.a));
            if (stroke) { line(l, t, l + w, t, stroke, lw, a); line(l + w, t, l + w, t + h, stroke, lw, a); line(l + w, t + h, l, t + h, stroke, lw, a); line(l, t + h, l, t, stroke, lw, a); }
          } else if (tag === 'polyline' || tag === 'polygon') {
            const pts = (shape.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
            const xy: Array<{ x: number; y: number }> = []; for (let i = 0; i + 1 < pts.length; i += 2) xy.push(P(pts[i], pts[i + 1]));
            if (xy.length < 2) return;
            const d = xy.map((p, i) => `${i ? 'L' : 'M'}${X(p.x)},${(p.y - box.top) * k}`).join(' ') + (tag === 'polygon' ? ' Z' : '');
            page.drawSvgPath(d, { x: 0, y: size.h, color: tag === 'polygon' && fill ? color(fill) : undefined, borderColor: stroke ? color(stroke) : undefined, borderWidth: stroke ? lw * k : 0, borderOpacity: stroke ? stroke.a * a : undefined, opacity: fill ? fill.a * a : undefined, borderLineCap: LineCapStyle.Round });
          } else if (tag === 'circle' || tag === 'ellipse') {
            const c = P(n('cx'), n('cy')); const rx = (tag === 'circle' ? n('r') : n('rx')) * Math.abs(m.a), ry = (tag === 'circle' ? n('r') : n('ry')) * Math.abs(m.d);
            page.drawEllipse({ x: X(c.x), y: Y(c.y), xScale: rx * k, yScale: ry * k, color: fill ? color(fill) : undefined, opacity: fill ? fill.a * a : undefined, borderColor: stroke ? color(stroke) : undefined, borderWidth: stroke ? lw * k : 0 });
          } else if (tag === 'text') {
            const r = shape.getBoundingClientRect(); const s = shape.textContent || '';
            if (r.width && r.height) text(s, r.left, r.top, r.height, r.width, cs, a, parseFloat(cs.fontSize) * Math.abs(m.d), fill);
          }
        });
      }
      async function drawElement(node: Element, alpha: number, clip: DOMRect | null): Promise<void> {
        const cs = getComputedStyle(node);
        if (cs.display === 'none') return;
        const a = alpha * (parseFloat(cs.opacity) || (cs.opacity === '0' ? 0 : 1));
        if (a <= 0.01) return;
        if (node instanceof SVGSVGElement) { if (cs.visibility !== 'hidden') drawSvg(node, a); return; }
        const r = node.getBoundingClientRect();
        if (cs.visibility !== 'hidden' && r.width > 0 && r.height > 0) {
          const radius = parseFloat(cs.borderTopLeftRadius) || 0;
          const rad = cs.borderTopLeftRadius.endsWith('%') ? Math.min(r.width, r.height) / 2 : radius;
          const bg = parseColor(cs.backgroundColor) || gradientColor(cs.backgroundImage);
          let L = r.left, T = r.top, W = r.width, H = r.height;
          if (clip) { const R = Math.min(r.right, clip.right), B = Math.min(r.bottom, clip.bottom); L = Math.max(L, clip.left); T = Math.max(T, clip.top); W = R - L; H = B - T; }
          if (bg) fillRect(L, T, W, H, bg, a, rad);
          if (node instanceof HTMLImageElement) { const img = await imageFor(node.currentSrc || node.src); if (img) page.drawImage(img, { x: X(r.left), y: Y(r.bottom), width: r.width * k, height: r.height * k, opacity: a }); return; }
          const sides: Array<[string, number, number, number, number]> = [['Top', r.left, r.top, r.right, r.top], ['Right', r.right, r.top, r.right, r.bottom], ['Bottom', r.left, r.bottom, r.right, r.bottom], ['Left', r.left, r.top, r.left, r.bottom]];
          for (const [side, x1, y1, x2, y2] of sides) {
            const w = parseFloat((cs as any)[`border${side}Width`]) || 0; if (w <= 0 || (cs as any)[`border${side}Style`] === 'none') continue;
            const c = parseColor((cs as any)[`border${side}Color`]); if (!c) continue;
            const off = w / 2, horiz = side === 'Top' || side === 'Bottom', sign = side === 'Top' || side === 'Left' ? 1 : -1;
            if (rad > 0.3 && horiz) continue; // rounded cards: their outline is drawn below as one shape
            if (rad > 0.3) continue;
            line(horiz ? x1 : x1 + sign * off, horiz ? y1 + sign * off : y1, horiz ? x2 : x2 + sign * off, horiz ? y2 + sign * off : y2, c, w, a);
          }
          if (rad > 0.3) { // a rounded border all round
            const w = parseFloat(cs.borderTopWidth) || 0, c = parseColor(cs.borderTopColor);
            if (w > 0 && c && cs.borderTopStyle !== 'none') {
              const rr = Math.min(rad * k, (W * k) / 2, (H * k) / 2), x = X(L) + (w * k) / 2, y = (T - box.top) * k + (w * k) / 2, WW = (W - w) * k, HH = (H - w) * k;
              const d = `M${x + rr},${y} H${x + WW - rr} Q${x + WW},${y} ${x + WW},${y + rr} V${y + HH - rr} Q${x + WW},${y + HH} ${x + WW - rr},${y + HH} H${x + rr} Q${x},${y + HH} ${x},${y + HH - rr} V${y + rr} Q${x},${y} ${x + rr},${y} Z`;
              page.drawSvgPath(d, { x: 0, y: size.h, borderColor: color(c), borderWidth: w * k, borderOpacity: c.a * a });
            }
          }
        }
        const inner = clipOf(node, clip, cs);
        for (const child of node.childNodes) {
          if (child.nodeType === Node.TEXT_NODE) { if (cs.visibility !== 'hidden') drawTextNode(child as Text, cs, a, inner); }
          else if (child.nodeType === Node.ELEMENT_NODE && !(child instanceof HTMLStyleElement)) await drawElement(child as Element, a, inner);
        }
      }
    }
    const out = await pdf.save();
    const url = URL.createObjectURL(new Blob([out as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url; link.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return pages.length;
  } finally { stage.remove(); }
}

/** A file name from the report title: letters, digits and dashes only. */
export function pdfFileName(title: string) {
  const base = title.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return `${base || 'anunex-rapor'}.pdf`;
}
