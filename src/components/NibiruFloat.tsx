import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { NibiruMark } from './NibiruMark';
import './NibiruFloat.css';

/**
 * Nibiru gezegeni (owner, 13 Nov 2026): "sayfada sabit kalmasın; öğrenci tablet/telefonda gezegeni sağa sola yukarı
 * aşağı hareket ettirebilsin, döndürebilsin". A small planet that follows the learner across pages:
 *  - drag it anywhere with a finger or the mouse; it spins with the movement and settles on the nearest side;
 *  - tap it to talk to Nibiru; a quick double tap makes it spin;
 *  - its place is remembered on this device (browser storage, best effort).
 */
const KEY = 'anunex.nibiruFloat.v1';
const SIZE = 64, MARGIN = 10;

type Pos = { x: number; y: number };
function load(): Pos | null { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? v : null; } catch { return null; } }
function save(p: Pos) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode */ } }
function clamp(p: Pos): Pos {
  const w = window.innerWidth, h = window.innerHeight;
  return { x: Math.min(Math.max(MARGIN, p.x), w - SIZE - MARGIN), y: Math.min(Math.max(MARGIN + 56, p.y), h - SIZE - MARGIN - 84) };
}

export function NibiruFloat() {
  const navigate = useNavigate(); const { pathname } = useLocation();
  const [pos, setPos] = useState<Pos>(() => clamp(load() || { x: (typeof window !== 'undefined' ? window.innerWidth : 400) - SIZE - 14, y: (typeof window !== 'undefined' ? window.innerHeight : 800) - SIZE - 120 }));
  const [angle, setAngle] = useState(0); const [dragging, setDragging] = useState(false); const [settling, setSettling] = useState(false);
  const drag = useRef<{ id: number; dx: number; dy: number; sx: number; sy: number; lx: number; moved: boolean; t: number } | null>(null);
  const lastTap = useRef(0);

  useEffect(() => { const on = () => setPos((p) => clamp(p)); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, []);
  if (pathname.startsWith('/nibiru')) return null;

  const down = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, dx: e.clientX - pos.x, dy: e.clientY - pos.y, sx: e.clientX, sy: e.clientY, lx: e.clientX, moved: false, t: Date.now() };
    setSettling(false);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6) return;
    d.moved = true; setDragging(true);
    setAngle((a) => a + (e.clientX - d.lx) * 1.6); d.lx = e.clientX; // it rolls with the finger
    setPos(clamp({ x: e.clientX - d.dx, y: e.clientY - d.dy }));
  };
  const up = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null; setDragging(false);
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved) {
      const now = Date.now();
      if (now - lastTap.current < 320) { lastTap.current = 0; setAngle((a) => a + 360); return; }
      lastTap.current = now;
      window.setTimeout(() => { if (lastTap.current === now) navigate('/nibiru'); }, 330);
      return;
    }
    // settle on the nearest side, as phone chat heads do
    const side = pos.x + SIZE / 2 < window.innerWidth / 2 ? MARGIN : window.innerWidth - SIZE - MARGIN;
    const next = clamp({ x: side, y: pos.y }); setSettling(true); setPos(next); save(next);
  };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/nibiru'); return; }
    const step = e.shiftKey ? 40 : 12; const by: Record<string, Pos> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
    if (by[e.key]) { e.preventDefault(); const next = clamp({ x: pos.x + by[e.key].x, y: pos.y + by[e.key].y }); setPos(next); save(next); setAngle((a) => a + by[e.key].x * 2); }
  };

  return <button type="button" className={`nibiru-float${dragging ? ' dragging' : ''}${settling ? ' settling' : ''}`} style={{ transform: `translate3d(${pos.x}px,${pos.y}px,0)` }}
    aria-label="Nibiru ile konuş (gezegeni sürükleyerek taşıyabilirsin)" title="Nibiru · dokun: konuş · sürükle: taşı · iki kez dokun: döndür"
    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}>
    <span className="nibiru-float-planet" style={{ transform: `rotate(${angle}deg)` }}><NibiruMark size={SIZE - 8} state={dragging ? 'active' : 'idle'} /></span>
  </button>;
}
