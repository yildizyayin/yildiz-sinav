import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Eraser, Eye, EyeOff, Lightbulb, Maximize, Minimize, Pen, Play, RotateCcw, Smartphone, Timer, Trash2, Undo2, Video, X } from 'lucide-react';
import qrcode from 'qrcode-generator';
import { useBoardSocket, type BoardMsg } from '../lib/boardSocket';
import { api } from '../api';
import { TestCheckDialog } from '../components/TestCheckDialog';
import './smart-board.css';

/**
 * Akıllı tahta (owner, 27 Nov 2026: "akıllı tahta kısmını aşırı profesyonel yapmamız gerekli … her yerden
 * açılabilmeli"). A whole lesson flow per question: the question big enough for the back row → optional thinking
 * time → the class's choice → the answer lights up → the written solution step by step → the solution video in the
 * board → the outcome's topic video when the class struggled. Pen with four colours, eraser and undo on top of
 * everything. Works by touch, mouse, keyboard and presenter clickers (←/→, PageUp/PageDown, space); no install.
 */
type Media = { id: string; url: string; alt: string };
type Item = { position: number; id: string; stem: string; answer: string; options: Array<{ label: string; text: string; image: Media | null }>; images: Media[]; solution: string | null; steps: string[]; solutionVideo: { kind: 'FILE' | 'LINK'; url: string } | null; outcome: { code: string; title: string } | null; topicVideo: { url: string; seconds: number | null } | null };
type Stroke = { color: string; width: number; points: Array<[number, number]> };
const PENS = [['#FF7A7A', 'Kırmızı'], ['#FFD166', 'Sarı'], ['#5EE0A8', 'Yeşil'], ['#FFFFFF', 'Beyaz']] as const;
const TIMES = [30, 60, 120];

export function SmartBoard() {
  const { documentId = '' } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState<{ title: string } | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  const [k, setK] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [steps, setSteps] = useState(0);
  const [hideOptions, setHideOptions] = useState(false);
  const [video, setVideo] = useState<null | { url: string; title: string; link?: boolean }>(null);
  const [zoom, setZoom] = useState<Media | null>(null);
  const [tool, setTool] = useState<'none' | 'pen' | 'erase'>('none');
  const [color, setColor] = useState<string>(PENS[0][0]);
  const [ink, setInk] = useState<Record<string, Stroke[]>>({});
  const [timer, setTimer] = useState<{ total: number; left: number; on: boolean } | null>(null);
  const [full, setFull] = useState(false);
  const [needsCheck, setNeedsCheck] = useState(false);
  const [remote, setRemote] = useState<{ code: string; path: string } | null>(null);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [remoteError, setRemoteError] = useState('');
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const stage = useRef<HTMLDivElement | null>(null);
  const drawing = useRef<Stroke | null>(null);

  useEffect(() => {
    api<{ test: any; items: Item[]; checked?: boolean }>(`/api/board/${encodeURIComponent(documentId)}`).then((r) => {
      setTest(r.test); setItems(r.items); setNeedsCheck(r.checked === false);
      // weak school internet: fetch every image and video once now, so the lesson does not wait later
      for (const q of r.items) {
        for (const m of [...q.images, ...q.options.map((o) => o.image).filter(Boolean) as Media[]]) { const im = new Image(); im.src = m.url; }
        for (const v of [q.solutionVideo?.kind === 'FILE' ? q.solutionVideo.url : null, q.topicVideo?.url || null]) if (v) fetch(v, { credentials: 'same-origin' }).catch(() => undefined);
      }
    }).catch((e) => setError(e.message || 'Test açılamadı.'));
  }, [documentId]);

  const q = items[k];
  const go = useCallback((n: number) => {
    if (!items.length) return;
    const next = Math.max(0, Math.min(items.length - 1, n));
    setK(next); setPicked(null); setRevealed(false); setSteps(0); setVideo(null); setZoom(null); setTimer(null);
  }, [items.length]);

  // keyboard and presenter clickers
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'VIDEO')) return;
      if (e.key === 'Escape') { if (video) setVideo(null); else if (zoom) setZoom(null); return; }
      if (video || zoom) return;
      if (['ArrowRight', 'PageDown'].includes(e.key) || (e.key === ' ' && !(t && t.tagName === 'BUTTON'))) { e.preventDefault(); go(k + 1); }
      else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); go(k - 1); }
      else if (e.key.toLowerCase() === 'c') setRevealed(true);
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [go, k, video, zoom]);

  // thinking time
  useEffect(() => {
    if (!timer?.on || timer.left <= 0) return;
    const id = window.setTimeout(() => setTimer((t) => (t ? { ...t, left: t.left - 1, on: t.left - 1 > 0 } : t)), 1000);
    return () => window.clearTimeout(id);
  }, [timer]);

  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on); return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFull = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { /* not every board browser allows it */ } };

  // pen: strokes are kept per question, drawn in relative coordinates so they survive resizing and rotation
  const strokes = useMemo(() => (q ? ink[q.id] || [] : []), [ink, q]);
  const paint = useCallback(() => {
    const c = canvas.current, s = stage.current; if (!c || !s) return;
    const r = s.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
    const g = c.getContext('2d'); if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height); g.lineCap = 'round'; g.lineJoin = 'round';
    for (const st of [...strokes, ...(drawing.current ? [drawing.current] : [])]) {
      g.strokeStyle = st.color; g.lineWidth = st.width; g.beginPath();
      st.points.forEach(([x, y], i) => (i ? g.lineTo(x * r.width, y * r.height) : g.moveTo(x * r.width, y * r.height)));
      if (st.points.length === 1) g.lineTo(st.points[0][0] * r.width + 0.1, st.points[0][1] * r.height);
      g.stroke();
    }
  }, [strokes]);
  useEffect(() => { paint(); const on = () => paint(); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, [paint, k, revealed, steps, hideOptions]);
  const rel = (e: React.PointerEvent): [number, number] => { const r = stage.current!.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  const down = (e: React.PointerEvent) => {
    if (tool === 'none' || !q) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (tool === 'erase') { eraseAt(rel(e)); return; }
    drawing.current = { color, width: 5, points: [rel(e)] }; paint();
  };
  const move = (e: React.PointerEvent) => {
    if (tool === 'erase' && e.buttons) { eraseAt(rel(e)); return; }
    if (!drawing.current) return; drawing.current.points.push(rel(e)); paint();
  };
  const up = () => { if (!drawing.current || !q) return; const st = drawing.current; drawing.current = null; setInk((m) => ({ ...m, [q.id]: [...(m[q.id] || []), st] })); };
  const eraseAt = ([x, y]: [number, number]) => { if (!q) return; setInk((m) => ({ ...m, [q.id]: (m[q.id] || []).filter((s) => !s.points.some(([a, b]) => Math.hypot(a - x, b - y) < 0.025)) })); };
  const undo = () => q && setInk((m) => ({ ...m, [q.id]: (m[q.id] || []).slice(0, -1) }));
  const clear = () => q && setInk((m) => ({ ...m, [q.id]: [] }));

  // Tahta kumandası: the phone sends commands, the board answers with where the lesson stands.
  const onRemote = (m: BoardMsg) => {
    if (m.type === 'presence' && m.remotes > 0) setRemoteOpen(false);
    if (m.type !== 'cmd' || !q) return;
    const v = m.value;
    switch (m.action) {
      case 'next': go(k + 1); break;
      case 'prev': go(k - 1); break;
      case 'goto': if (Number.isInteger(v)) go(Number(v)); break;
      case 'reveal': setRevealed(true); break;
      case 'step': setRevealed(true); setSteps(Math.min(q.steps.length, steps + 1)); break;
      case 'reset': setRevealed(false); setPicked(null); setSteps(0); break;
      case 'video': if (q.solutionVideo) { setRevealed(true); setVideo({ url: q.solutionVideo.url, title: 'Çözüm videosu', link: q.solutionVideo.kind === 'LINK' }); } break;
      case 'topic': if (q.topicVideo) setVideo({ url: q.topicVideo.url, title: `Konu anlatımı · ${q.outcome?.title || ''}` }); break;
      case 'closeVideo': setVideo(null); break;
      case 'options': setHideOptions((h) => !h); break;
      case 'timer': if ([30, 60, 120].includes(Number(v))) setTimer({ total: Number(v), left: Number(v), on: true }); else setTimer(null); break;
    }
  };
  const board = useBoardSocket(remote?.code || null, 'board', onRemote);
  useEffect(() => {
    if (!remote || !q) return;
    board.send({ type: 'state', index: k, total: items.length, title: test?.title || '', stem: q.stem.slice(0, 280), options: q.options.map((o) => ({ label: o.label, text: o.text.slice(0, 120) })), answer: q.answer,
      revealed, steps, stepsTotal: q.steps.length, hideOptions, hasVideo: !!q.solutionVideo, hasTopic: !!q.topicVideo, videoOpen: !!video, timer: timer ? { left: timer.left, on: timer.on } : null });
  }, [remote, board.status, k, revealed, steps, hideOptions, video, timer?.left, timer?.on, items.length]);
  const pair = async () => {
    setRemoteOpen(true); setRemoteError('');
    if (remote) return;
    try { const r = await api<any>('/api/board-remote', { method: 'POST', body: JSON.stringify({ documentId }) }); setRemote({ code: r.code, path: r.path }); }
    catch (e: any) { setRemoteError(e?.message || 'Kod oluşturulamadı.'); }
  };
  const remoteUrl = remote ? `${location.origin}${remote.path}` : '';
  const qr = useMemo(() => { if (!remoteUrl) return ''; const x = qrcode(0, 'M'); x.addData(remoteUrl); x.make(); return x.createDataURL(6, 2); }, [remoteUrl]);

  const close = () => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); if (window.history.length > 1) navigate(-1); else navigate('/soru-havuzu/testlerim'); };

  if (error) return <div className="sb sb-center" role="alert"><p>{error}</p><button type="button" className="sb-btn" onClick={close}>Geri dön</button></div>;
  if (!q) return <div className="sb sb-center"><p>Tahta hazırlanıyor…</p></div>;
  const allSteps = steps >= q.steps.length;
  const timeTxt = timer ? `${Math.floor(timer.left / 60)}:${String(timer.left % 60).padStart(2, '0')}` : '';

  return <div className={`sb${tool !== 'none' ? ' inking' : ''}`}>
    <header className="sb-top">
      <div className="sb-title"><strong>ANUNEX</strong><span>{test?.title}</span></div>
      <nav className="sb-dots" aria-label="Sorular">{items.map((x, n) => <button key={x.id} type="button" aria-label={`${n + 1}. soru`} aria-current={n === k ? 'step' : undefined} className={n === k ? 'on' : ''} onClick={() => go(n)}>{n + 1}</button>)}</nav>
      <div className="sb-top-right">
        {timer ? <button type="button" className={`sb-timer${timer.left <= 10 ? ' hot' : ''}${timer.left === 0 ? ' done' : ''}`} onClick={() => setTimer(timer.left === 0 ? null : { ...timer, on: !timer.on })} aria-live="polite" aria-label={`Süre ${timeTxt}`}>{timer.left === 0 ? 'Süre doldu' : timeTxt}</button>
          : <div className="sb-times" role="group" aria-label="Düşünme süresi"><Timer size={18} aria-hidden="true" />{TIMES.map((s) => <button key={s} type="button" onClick={() => setTimer({ total: s, left: s, on: true })}>{s < 60 ? `${s} sn` : `${s / 60} dk`}</button>)}</div>}
        <button type="button" className={`sb-remote${board.presence.remotes > 0 ? ' on' : ''}`} onClick={() => void pair()} aria-label="Telefondan yönet"><Smartphone size={20} aria-hidden="true" />{board.presence.remotes > 0 ? 'Telefon bağlı' : 'Telefondan yönet'}</button>
        <button type="button" className="sb-icon" aria-label={full ? 'Tam ekrandan çık' : 'Tam ekran'} onClick={() => void toggleFull()}>{full ? <Minimize size={22} /> : <Maximize size={22} />}</button>
        <button type="button" className="sb-icon" aria-label="Tahtayı kapat" onClick={close}><X size={24} /></button>
      </div>
    </header>

    <main className="sb-main">
      <section className="sb-stage" ref={stage}>
        <div className="sb-q">
          <div className="sb-q-head"><span className="sb-no">{k + 1}</span>{q.outcome && <span className="sb-outcome">{q.outcome.title}</span>}</div>
          <p className="sb-stem">{q.stem}</p>
          {q.images.length > 0 && <div className="sb-images">{q.images.map((m) => <button key={m.id} type="button" className="sb-img" onClick={() => setZoom(m)} aria-label={`${m.alt} — büyüt`}><img src={m.url} alt={m.alt} /></button>)}</div>}
          {!hideOptions && <div className="sb-options">{q.options.map((o) => {
            const right = revealed && o.label === q.answer, wrong = revealed && picked === o.label && o.label !== q.answer, sel = !revealed && picked === o.label;
            return <button key={o.label} type="button" className={`sb-opt${right ? ' right' : ''}${wrong ? ' wrong' : ''}${sel ? ' sel' : ''}`} aria-pressed={picked === o.label} onClick={() => !revealed && setPicked(picked === o.label ? null : o.label)}>
              <b>{o.label}</b><span>{o.text}{o.image && <img src={o.image.url} alt={o.image.alt} />}</span>
            </button>;
          })}</div>}
          {revealed && q.steps.length > 0 && <div className="sb-solution" aria-live="polite">
            <strong><Lightbulb size={20} aria-hidden="true" /> Çözüm</strong>
            <ol>{q.steps.slice(0, steps).map((s, n) => <li key={n}>{s}</li>)}</ol>
            {!allSteps && <button type="button" className="sb-btn soft" onClick={() => setSteps(steps + 1)}>{steps === 0 ? 'Çözümü başlat' : 'Sonraki adım'} <span>{steps}/{q.steps.length}</span></button>}
          </div>}
        </div>
        <canvas ref={canvas} className="sb-ink" aria-hidden="true" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
      </section>

      <aside className="sb-tools" aria-label="Tahta araçları">
        <div className="sb-group">
          <button type="button" className={`sb-tool${revealed ? ' on' : ''}`} onClick={() => { setRevealed(true); }}><Eye size={22} aria-hidden="true" />Cevabı göster</button>
          {q.steps.length > 0 && <button type="button" className="sb-tool" onClick={() => { setRevealed(true); setSteps(Math.min(q.steps.length, steps + 1)); }}><Lightbulb size={22} aria-hidden="true" />{revealed && steps > 0 ? 'Sonraki adım' : 'Çözüm'}</button>}
          {q.solutionVideo && <button type="button" className="sb-tool accent" onClick={() => { setRevealed(true); setVideo({ url: q.solutionVideo!.url, title: 'Çözüm videosu', link: q.solutionVideo!.kind === 'LINK' }); }}><Play size={22} aria-hidden="true" />Çözüm videosu</button>}
          {q.topicVideo && <button type="button" className="sb-tool" onClick={() => setVideo({ url: q.topicVideo!.url, title: `Konu anlatımı · ${q.outcome?.title || ''}` })}><Video size={22} aria-hidden="true" />Konuyu hatırlat</button>}
          <button type="button" className="sb-tool" onClick={() => setHideOptions(!hideOptions)}>{hideOptions ? <Eye size={22} aria-hidden="true" /> : <EyeOff size={22} aria-hidden="true" />}{hideOptions ? 'Şıkları göster' : 'Şıkları gizle'}</button>
          {(revealed || picked) && <button type="button" className="sb-tool" onClick={() => { setRevealed(false); setPicked(null); setSteps(0); }}><RotateCcw size={22} aria-hidden="true" />Baştan</button>}
        </div>
        <div className="sb-group">
          <span className="sb-label">Kalem</span>
          <div className="sb-pens">{PENS.map(([c, name]) => <button key={c} type="button" aria-label={`${name} kalem`} aria-pressed={tool === 'pen' && color === c} className={tool === 'pen' && color === c ? 'on' : ''} style={{ background: c }} onClick={() => { setColor(c); setTool(tool === 'pen' && color === c ? 'none' : 'pen'); }} />)}</div>
          <div className="sb-row">
            <button type="button" className={`sb-mini${tool === 'erase' ? ' on' : ''}`} aria-pressed={tool === 'erase'} onClick={() => setTool(tool === 'erase' ? 'none' : 'erase')}><Eraser size={18} aria-hidden="true" />Silgi</button>
            <button type="button" className="sb-mini" disabled={!strokes.length} onClick={undo}><Undo2 size={18} aria-hidden="true" />Geri al</button>
            <button type="button" className="sb-mini" disabled={!strokes.length} onClick={clear}><Trash2 size={18} aria-hidden="true" />Temizle</button>
          </div>
          {tool !== 'none' && <button type="button" className="sb-mini wide" onClick={() => setTool('none')}><Pen size={18} aria-hidden="true" />Kalemi bırak</button>}
        </div>
        <div className="sb-nav">
          <button type="button" className="sb-big" disabled={k === 0} onClick={() => go(k - 1)}><ChevronLeft size={26} aria-hidden="true" />Önceki</button>
          <button type="button" className="sb-big primary" disabled={k === items.length - 1} onClick={() => go(k + 1)}>Sonraki<ChevronRight size={26} aria-hidden="true" /></button>
        </div>
      </aside>
    </main>

    {remoteOpen && <div className="sb-layer" role="dialog" aria-modal="true" aria-label="Telefondan yönet" onClick={(e) => { if (e.target === e.currentTarget) setRemoteOpen(false); }}>
      <div className="sb-pair">
        <button type="button" className="sb-icon sb-pair-x" aria-label="Kapat" onClick={() => setRemoteOpen(false)}><X size={24} /></button>
        <h2><Smartphone size={26} aria-hidden="true" /> Telefondan yönet</h2>
        {remoteError ? <p className="sb-pair-err" role="alert">{remoteError}</p> : !remote ? <p>Kod hazırlanıyor…</p> : <>
          <div className="sb-pair-body">
            {qr && <img src={qr} alt="Kumanda için QR kod" className="sb-pair-qr" />}
            <div className="sb-pair-text">
              <span>Tahta kodu</span>
              <strong className="sb-pair-code" aria-label={`Tahta kodu ${remote.code.split('').join(' ')}`}>{remote.code}</strong>
              <ol><li>Telefonunla QR’ı okut ya da <b>{location.host}/kumanda</b> adresine girip kodu yaz.</li><li>Telefonda kendi ANUNEX hesabınla giriş yapmış ol; kod tek başına bir şey açmaz.</li></ol>
            </div>
          </div>
          <p className="sb-pair-status">{board.status === 'open' ? (board.presence.remotes > 0 ? 'Telefon bağlandı.' : 'Telefon bekleniyor…') : 'Bağlanıyor…'}</p>
        </>}
      </div>
    </div>}
    {needsCheck && <TestCheckDialog testId={documentId} onCancel={close} onConfirmed={() => setNeedsCheck(false)} />}
    {zoom && <div className="sb-layer" role="dialog" aria-modal="true" aria-label="Görsel" onClick={() => setZoom(null)}><img src={zoom.url} alt={zoom.alt} className="sb-zoom" /><button type="button" className="sb-icon sb-layer-close" aria-label="Kapat" onClick={() => setZoom(null)}><X size={26} /></button></div>}
    {video && <div className="sb-layer" role="dialog" aria-modal="true" aria-label={video.title}>
      <div className="sb-video">
        <div className="sb-video-head"><strong>{video.title}</strong><button type="button" className="sb-icon" aria-label="Videoyu kapat" onClick={() => setVideo(null)}><X size={26} /></button></div>
        {video.link ? <a className="sb-btn" href={video.url} target="_blank" rel="noreferrer">Videoyu yeni sekmede aç</a>
          : <video key={video.url} src={video.url} controls autoPlay playsInline preload="auto" onError={() => setError('Video bu tarayıcıda oynatılamadı. Lütfen ANUNEX’e bildirin.')} />}
      </div>
    </div>}
  </div>;
}
