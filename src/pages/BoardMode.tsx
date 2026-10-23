import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { embeddableVideo } from '../lib/physicalLink';

/**
 * A078: smart-board / z-book mode — the same question data as the printed booklet, one question at a time on
 * the full screen, with a pen, show/hide options and answer, the solution and its video.
 */
export function BoardMode() {
  const { documentId = '' } = useParams();
  const [items, setItems] = useState<any[]>([]); const [k, setK] = useState(0); const [error, setError] = useState('');
  const [showOptions, setShowOptions] = useState(true); const [showAnswer, setShowAnswer] = useState(false); const [showSolution, setShowSolution] = useState(false); const [pen, setPen] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null); const drawing = useRef(false); const shell = useRef<HTMLDivElement>(null);
  useEffect(() => { api<any>(`/api/platform/studio/${encodeURIComponent(documentId)}/items?booklet=A`).then((r) => setItems(r.items || [])).catch((e) => setError(e.message)); }, [documentId]);
  const clear = () => { const c = canvas.current; if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height); };
  useEffect(() => { setShowAnswer(false); setShowSolution(false); clear(); }, [k]);
  useEffect(() => { const c = canvas.current; if (!c) return; const fit = () => { c.width = c.offsetWidth; c.height = c.offsetHeight; }; fit(); window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit); }, [items.length]);
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => { if (!pen) return; drawing.current = true; const ctx = e.currentTarget.getContext('2d')!; const [x, y] = point(e); ctx.strokeStyle = '#c51f2e'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => { if (!pen || !drawing.current) return; const ctx = e.currentTarget.getContext('2d')!; const [x, y] = point(e); ctx.lineTo(x, y); ctx.stroke(); };
  const up = () => { drawing.current = false; };
  const fullscreen = () => { const el = shell.current; if (!el) return; if (document.fullscreenElement) void document.exitFullscreen(); else void el.requestFullscreen?.(); };
  if (error) return <div className="alert error">{error}</div>;
  if (!items.length) return <p>Yükleniyor…</p>;
  const q = items[k]; const video = embeddableVideo(q.solutionVideo);
  return <div ref={shell} className="board-mode" style={{ position: 'relative', minHeight: '80vh', background: 'var(--surface, #fff)', padding: 24 }}>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
      <button className="ghost" disabled={k === 0} onClick={() => setK(k - 1)}>‹ Önceki</button>
      <strong>{k + 1} / {items.length}</strong>
      <button className="ghost" disabled={k === items.length - 1} onClick={() => setK(k + 1)}>Sonraki ›</button>
      <button className="ghost" onClick={() => setShowOptions(!showOptions)}>{showOptions ? 'Şıkları gizle' : 'Şıkları göster'}</button>
      <button className="ghost" onClick={() => setShowAnswer(!showAnswer)}>{showAnswer ? 'Cevabı gizle' : 'Cevabı göster'}</button>
      {(q.solution || video || q.solutionVideo) && <button className="ghost" onClick={() => setShowSolution(!showSolution)}>{showSolution ? 'Çözümü gizle' : 'Çözüm'}</button>}
      <button className={pen ? 'primary' : 'ghost'} onClick={() => setPen(!pen)}>Kalem</button>
      <button className="ghost" onClick={clear}>Temizle</button>
      <button className="ghost" onClick={fullscreen}>Tam ekran</button>
    </div>
    <div style={{ fontSize: 'clamp(18px, 2.4vw, 34px)', lineHeight: 1.4 }}>
      <p style={{ whiteSpace: 'pre-wrap' }}><strong>{k + 1}.</strong> {q.stem}</p>
      {showOptions && <ol type="A" style={{ listStyle: 'none', padding: 0 }}>{q.options.map((o: any) => <li key={o.label} style={{ margin: '8px 0', fontWeight: showAnswer && o.label === q.correctAnswer ? 700 : 400, color: showAnswer && o.label === q.correctAnswer ? 'var(--success, #1b7f3b)' : undefined }}>{o.label}) {o.text}{showAnswer && o.label === q.correctAnswer ? ' ✓' : ''}</li>)}</ol>}
      {showAnswer && !showOptions && <p><strong>Cevap: {q.correctAnswer}</strong></p>}
      {showSolution && <div style={{ marginTop: 16 }}>{q.solution && <p style={{ whiteSpace: 'pre-wrap' }}>{q.solution}</p>}{video ? <iframe title="Video çözüm" src={video} style={{ width: '100%', aspectRatio: '16/9', border: 0 }} allow="encrypted-media; picture-in-picture" allowFullScreen /> : q.solutionVideo ? <a href={q.solutionVideo} target="_blank" rel="noreferrer">Video çözümü aç</a> : null}</div>}
    </div>
    <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: pen ? 'auto' : 'none', touchAction: 'none' }} />
  </div>;
}
