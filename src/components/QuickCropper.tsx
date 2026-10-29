import { useCallback, useEffect, useRef, useState } from 'react';
import { FileUp, MousePointerSquareDashed, ZoomIn, ZoomOut } from 'lucide-react';

/**
 * S044 Hızlı Test: crop questions from a PDF or photos, in the browser. The fastest path is one gesture per question:
 * drag a box around the question, then press (or tap) its answer letter — the crop is added with its answer at once.
 * Nothing leaves the device but the cropped question image.
 */
type Page = { canvas: HTMLCanvasElement; label: string };
type Box = { page: number; x: number; y: number; w: number; h: number };
export type CropResult = { blob: Blob; width: number; height: number; answer: string | null };

const MAX_OUT_W = 1400;

async function pdfPages(file: File, onProgress: (n: number, total: number) => void): Promise<Page[]> {
  const pdfjs: any = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: Page[] = [];
  const total = Math.min(doc.numPages, 60);
  for (let i = 1; i <= total; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
    pages.push({ canvas, label: `${file.name} · sayfa ${i}` });
    onProgress(i, total);
  }
  return pages;
}

async function imagePage(file: File): Promise<Page> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = url; });
    const scale = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { canvas, label: file.name };
  } finally { URL.revokeObjectURL(url); }
}

function cropToBlob(page: Page, box: Box): Promise<CropResult & { blob: Blob }> {
  const scale = Math.min(1, MAX_OUT_W / box.w);
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(box.w * scale)); out.height = Math.max(1, Math.round(box.h * scale));
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(page.canvas, box.x, box.y, box.w, box.h, 0, 0, out.width, out.height);
  return new Promise((ok, no) => out.toBlob((b) => (b ? ok({ blob: b, width: out.width, height: out.height, answer: null }) : no(new Error('Kırpma başarısız.'))), 'image/png'));
}

export function QuickCropper({ optionCount, onCrop, busy }: { optionCount: number; onCrop: (c: CropResult) => Promise<void>; busy: boolean }) {
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(''); const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [box, setBox] = useState<Box | null>(null);
  const [drag, setDrag] = useState<{ page: number; x0: number; y0: number } | null>(null);
  const [done, setDone] = useState<Box[]>([]);
  const letters = ['A', 'B', 'C', 'D', 'E'].slice(0, optionCount);
  const hosts = useRef<Array<HTMLDivElement | null>>([]);

  const load = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(''); setBox(null);
    const next: Page[] = [];
    try {
      for (const f of Array.from(files)) {
        if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) next.push(...await pdfPages(f, (n, t) => setLoading(`PDF hazırlanıyor: sayfa ${n}/${t}`)));
        else if (f.type.startsWith('image/')) { setLoading('Fotoğraf hazırlanıyor…'); next.push(await imagePage(f)); }
      }
      if (!next.length) setError('PDF ya da fotoğraf (JPG, PNG) seçin.');
      setPages((p) => [...p, ...next]);
    } catch { setError('Dosya açılamadı. PDF şifreli ya da bozuk olabilir; başka bir dosya deneyin.'); }
    finally { setLoading(''); }
  };

  // Mount the rendered canvases into their page frames (display size follows zoom; crop uses full resolution).
  useEffect(() => { pages.forEach((p, i) => { const host = hosts.current[i]; if (host && !host.contains(p.canvas)) { p.canvas.className = 'qc-canvas'; host.prepend(p.canvas); } }); }, [pages]);

  const pos = (e: React.PointerEvent, i: number) => {
    const c = pages[i].canvas, r = c.getBoundingClientRect();
    return { x: Math.max(0, Math.min(c.width, ((e.clientX - r.left) / r.width) * c.width)), y: Math.max(0, Math.min(c.height, ((e.clientY - r.top) / r.height) * c.height)) };
  };
  const down = (e: React.PointerEvent, i: number) => { if (busy) return; (e.target as Element).setPointerCapture?.(e.pointerId); const p = pos(e, i); setDrag({ page: i, x0: p.x, y0: p.y }); setBox({ page: i, x: p.x, y: p.y, w: 0, h: 0 }); };
  const move = (e: React.PointerEvent, i: number) => { if (!drag || drag.page !== i) return; const p = pos(e, i); setBox({ page: i, x: Math.min(drag.x0, p.x), y: Math.min(drag.y0, p.y), w: Math.abs(p.x - drag.x0), h: Math.abs(p.y - drag.y0) }); };
  const up = () => { setDrag(null); setBox((b) => (b && b.w > 24 && b.h > 24 ? b : null)); };

  const add = useCallback(async (answer: string | null) => {
    if (!box || busy) return;
    const crop = await cropToBlob(pages[box.page], box);
    await onCrop({ ...crop, answer });
    setDone((d) => [...d, box]); setBox(null);
  }, [box, busy, pages, onCrop]);

  // Keyboard: A–E adds with that answer, X as cancelled, Enter adds without an answer, Esc clears the box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!box || drag) return;
      const tag = (e.target as HTMLElement)?.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const k = e.key.toUpperCase();
      if (letters.includes(k) || k === 'X') { e.preventDefault(); void add(k); }
      else if (e.key === 'Enter') { e.preventDefault(); void add(null); }
      else if (e.key === 'Escape') setBox(null);
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [box, drag, add, letters]);

  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return <div className="qc">
    <div className="qc-toolbar">
      <label className="qc-upload"><FileUp size={18} /> {pages.length ? 'Başka dosya ekle' : 'PDF ya da fotoğraf seç'}
        <input type="file" accept="application/pdf,image/*" multiple onChange={(e) => { void load(e.target.files); e.target.value = ''; }} /></label>
      {pages.length > 0 && <div className="qc-zoom" role="group" aria-label="Yakınlaştır"><button type="button" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} aria-label="Uzaklaştır"><ZoomOut size={16} /></button><span>%{Math.round(zoom * 100)}</span><button type="button" onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)))} aria-label="Yakınlaştır"><ZoomIn size={16} /></button></div>}
    </div>
    {loading && <div className="alert info" role="status">{loading}</div>}
    {error && <div className="alert error" role="alert">{error}</div>}
    {!pages.length && !loading && <div className="qc-empty"><MousePointerSquareDashed size={36} /><strong>Soruları kendi PDF'inizden ya da fotoğraftan kırpın</strong><span>Dosyayı seçin, sorunun çevresine fareyle (telefonda parmakla) bir kutu çizin, sonra doğru cevabın harfine basın. Soru cevabıyla birlikte teste eklenir.</span></div>}
    {pages.length > 0 && <p className="qc-tip">Sorunun çevresine kutu çizin → doğru cevabın harfine basın (klavyede <kbd>A</kbd>–<kbd>{letters[letters.length - 1]}</kbd>, iptal için <kbd>X</kbd>). Cevabı sonra seçmek için <kbd>Enter</kbd>.</p>}
    <div className="qc-pages" style={{ ['--qc-zoom' as any]: zoom }}>
      {pages.map((p, i) => <div key={i} className="qc-page">
        <small>{p.label}</small>
        <div className="qc-frame" ref={(el) => { hosts.current[i] = el; }} onPointerDown={(e) => down(e, i)} onPointerMove={(e) => move(e, i)} onPointerUp={up} onPointerCancel={up} style={{ aspectRatio: `${p.canvas.width} / ${p.canvas.height}` }}>
          {done.filter((d) => d.page === i).map((d, j) => <span key={j} className="qc-done" style={{ left: pct(d.x, p.canvas.width), top: pct(d.y, p.canvas.height), width: pct(d.w, p.canvas.width), height: pct(d.h, p.canvas.height) }} />)}
          {box?.page === i && <span className="qc-box" style={{ left: pct(box.x, p.canvas.width), top: pct(box.y, p.canvas.height), width: pct(box.w, p.canvas.width), height: pct(box.h, p.canvas.height) }} />}
          {box?.page === i && !drag && box.w > 24 && <div className="qc-pick" style={{ left: pct(box.x, p.canvas.width), top: `calc(${pct(box.y + box.h, p.canvas.height)} + 6px)` }} onPointerDown={(e) => e.stopPropagation()}>
            <span>Doğru cevap</span>
            {letters.map((l) => <button type="button" key={l} disabled={busy} onClick={() => void add(l)}>{l}</button>)}
            <button type="button" className="muted" disabled={busy} onClick={() => void add('X')} title="İptal edilen soru">X</button>
            <button type="button" className="later" disabled={busy} onClick={() => void add(null)}>Sonra</button>
          </div>}
        </div>
      </div>)}
    </div>
  </div>;
}
