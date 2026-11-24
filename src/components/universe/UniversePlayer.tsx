import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, Clock, Ear, Eye, RotateCcw, Timer, TimerOff, XCircle } from 'lucide-react';
import { api } from '../../api';
import { soundCue } from '../../lib/glassSounds';
import './universe.css';

/**
 * Nibiru Öğrenme Evreni — one player for the ten game kinds (owner, 11 Nov 2026). The page receives a session
 * (content without the key), collects the student's responses and sends them once; the server grades and returns
 * the key with the results. Everything works by touch, mouse and keyboard; sound is optional, text always present;
 * a timer can always be switched off (speed is never success).
 */
type Item = { seq: number; kind: string; repeat: boolean; content: any; response?: any; correct?: boolean | null; partial?: number | null; key?: any };
type Session = { session: any; items: Item[] };

const isAnswered = (r: any) => r != null && Object.values(r).some((v) => v != null && v !== '' && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.values(v).some((x) => x != null && x !== '')));

export function UniversePlayer({ data, onDone }: { data: Session; onDone: (s: Session) => void }) {
  const items = data.items;
  const s = data.session;
  const [i, setI] = useState(0);
  const [resp, setResp] = useState<Record<number, any>>({});
  const [timed, setTimed] = useState<boolean>(!!s.timed);
  const [left, setLeft] = useState<number>(s.secondsPerItem || 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const item = items[i];
  const set = (r: any) => setResp((x) => ({ ...x, [item.seq]: r }));

  useEffect(() => { setLeft(s.secondsPerItem || 0); }, [i, s.secondsPerItem]);
  useEffect(() => {
    if (!timed || !s.secondsPerItem || busy) return;
    if (left <= 0) { next(); return; }
    const t = setTimeout(() => setLeft((x) => x - 1), 1000);
    return () => clearTimeout(t);
  });

  const submit = async (all = resp) => {
    setBusy(true); setError('');
    try {
      const out = await api<Session>(`/api/student-standard/universe/sessions/${encodeURIComponent(s.id)}/submit`, { method: 'POST', body: JSON.stringify({ answers: items.map((it) => ({ seq: it.seq, response: all[it.seq] ?? null })) }) });
      soundCue((out.session.correct || 0) / Math.max(1, out.session.itemCount) >= 0.8 ? 'success' : 'soft');
      onDone(out);
    } catch (e: any) { setError(e.message || 'Gönderilemedi; bağlantını kontrol edip yeniden dene. Cevapların bu sayfada duruyor.'); setBusy(false); }
  };
  function next() { if (i + 1 < items.length) setI(i + 1); else void submit(); }

  return <section className="uv-player" aria-live="polite">
    <div className="uv-top">
      <span className="uv-dots" aria-label={`${items.length} etkinlikten ${i + 1}.`}>{items.map((x, k) => <i key={x.seq} className={k < i ? 'done' : k === i ? 'now' : ''} />)}</span>
      {s.secondsPerItem ? <button type="button" className="ghost uv-timer-toggle" onClick={() => setTimed(!timed)} aria-pressed={timed}>
        {timed ? <><Timer size={16} aria-hidden="true" /> {left} sn · süreyi kapat</> : <><TimerOff size={16} aria-hidden="true" /> Süre kapalı</>}
      </button> : null}
    </div>
    {item.repeat && <p className="uv-note"><RotateCcw size={14} aria-hidden="true" /> Tekrar: bu içeriği daha önce gördün.</p>}
    <div className="uv-card">
      <ItemView key={item.seq} item={item} value={resp[item.seq]} onChange={set} />
    </div>
    {error && <div className="alert error" role="alert">{error}</div>}
    <div className="uv-actions">
      {i > 0 && <button type="button" className="ghost" disabled={busy} onClick={() => setI(i - 1)}>Geri</button>}
      <button type="button" className="primary" disabled={busy} onClick={next}>{i + 1 < items.length ? (isAnswered(resp[item.seq]) ? 'Devam' : 'Boş bırak, devam') : busy ? 'Gönderiliyor…' : 'Bitir ve gönder'}</button>
    </div>
  </section>;
}

function ItemView({ item, value, onChange, readOnly = false }: { item: Item; value: any; onChange: (v: any) => void; readOnly?: boolean }) {
  switch (item.kind) {
    case 'QUESTION': return <Choice content={item.content} value={value} onChange={onChange} readOnly={readOnly} />;
    case 'AUDIO_QUESTION': return <Listen content={item.content} value={value} onChange={onChange} readOnly={readOnly} />;
    case 'PAIRS': return item.content?.mode === 'MEMORY' ? <Memory content={item.content} value={value} onChange={onChange} readOnly={readOnly} /> : <Match content={item.content} value={value} onChange={onChange} readOnly={readOnly} />;
    case 'SEQUENCE': return <Order content={item.content} value={value} onChange={onChange} readOnly={readOnly} />;
    case 'CLOZE': return <Cloze content={item.content} value={value} onChange={onChange} readOnly={readOnly} />;
    case 'HOTSPOT': return <Hotspot content={item.content} value={value} onChange={onChange} readOnly={readOnly} />;
    case 'STEPS': return <Steps content={item.content} value={value} onChange={onChange} readOnly={readOnly} />;
    default: return <p>Bu etkinlik türü desteklenmiyor.</p>;
  }
}

function Choice({ content, value, onChange, readOnly }: any) {
  return <>
    <p className="uv-stem">{content.stem}</p>
    {(content.assets || []).map((a: any, k: number) => <img key={k} className="uv-img" src={a.url} alt={a.alt || 'Soru görseli'} />)}
    <div className="uv-options" role="radiogroup">{(content.options || []).map((o: any) =>
      <button key={o.key} type="button" role="radio" aria-checked={value?.answer === o.key} disabled={readOnly} className={`uv-opt${value?.answer === o.key ? ' on' : ''}`} onClick={() => onChange({ answer: o.key })}><b>{o.key}</b><span>{o.text}</span></button>)}</div>
  </>;
}

function Listen({ content, value, onChange, readOnly }: any) {
  const [showText, setShowText] = useState(false);
  const speak = () => {
    try { const u = new SpeechSynthesisUtterance(content.transcript); u.lang = content.lang || 'tr-TR'; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); } catch { setShowText(true); }
  };
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
  return <>
    <div className="uv-listen">
      {content.audioUrl ? <audio controls preload="none" src={content.audioUrl} /> : canSpeak ? <button type="button" className="secondary" onClick={speak}><Ear size={16} aria-hidden="true" /> Dinle</button> : null}
      <button type="button" className="ghost" aria-expanded={showText} onClick={() => setShowText(!showText)}><Eye size={16} aria-hidden="true" /> {showText ? 'Metni gizle' : 'Metni göster'}</button>
    </div>
    {(showText || (!content.audioUrl && !canSpeak)) && <p className="uv-transcript">{content.transcript}</p>}
    <p className="uv-stem">{content.question}</p>
    <div className="uv-options" role="radiogroup">{(content.options || []).map((o: any, k: number) => { const key = 'ABCDE'[k]; return <button key={key} type="button" role="radio" aria-checked={value?.answer === key} disabled={readOnly} className={`uv-opt${value?.answer === key ? ' on' : ''}`} onClick={() => onChange({ answer: key })}><b>{key}</b><span>{typeof o === 'string' ? o : o.text}</span></button>; })}</div>
  </>;
}

/** Tap a left card, then its partner on the right; tap again to undo. */
function Match({ content, value, onChange, readOnly }: any) {
  const pairs: [string, string][] = value?.pairs || [];
  const [pick, setPick] = useState<string | null>(null);
  const partnerOf = (l: string) => pairs.find((p) => p[0] === l)?.[1];
  const ownerOf = (r: string) => pairs.find((p) => p[1] === r)?.[0];
  const colour = (l?: string) => l ? `uv-c${(content.left || []).findIndex((x: any) => x.id === l) % 6}` : '';
  const choose = (r: string) => { if (!pick) return; onChange({ pairs: [...pairs.filter((p) => p[0] !== pick && p[1] !== r), [pick, r]] }); setPick(null); };
  return <>
    {content.prompt && <p className="uv-stem">{content.prompt}</p>}
    <div className="uv-match">
      <div>{(content.left || []).map((l: any) => <button key={l.id} type="button" disabled={readOnly} aria-pressed={pick === l.id} className={`uv-tile ${colour(partnerOf(l.id) ? l.id : undefined)}${pick === l.id ? ' picked' : ''}`} onClick={() => partnerOf(l.id) ? onChange({ pairs: pairs.filter((p) => p[0] !== l.id) }) : setPick(pick === l.id ? null : l.id)}>{l.text}</button>)}</div>
      <div>{(content.right || []).map((r: any) => <button key={r.id} type="button" disabled={readOnly} className={`uv-tile ${colour(ownerOf(r.id))}`} onClick={() => ownerOf(r.id) && !pick ? onChange({ pairs: pairs.filter((p) => p[1] !== r.id) }) : choose(r.id)}>{r.text}</button>)}</div>
    </div>
    <p className="uv-hint">{pick ? 'Şimdi sağdan eşini seç.' : 'Soldan bir kart seç, sonra eşini sağdan seç.'}</p>
  </>;
}

/** Memory: cards face down; open two to pair them. The server checks the pairs at the end (no key on the device). */
function Memory({ content, value, onChange, readOnly }: any) {
  const cards = useMemo(() => [...(content.left || []).map((x: any) => ({ ...x, side: 'L' })), ...(content.right || []).map((x: any) => ({ ...x, side: 'R' }))].sort(() => Math.random() - 0.5), [content]);
  const pairs: [string, string][] = value?.pairs || [];
  const [open, setOpen] = useState<any[]>([]);
  const used = (c: any) => pairs.some((p) => (c.side === 'L' ? p[0] : p[1]) === c.id);
  const flip = (c: any) => {
    if (readOnly || used(c) || open.some((o) => o.id === c.id && o.side === c.side)) return;
    const now = [...open, c];
    if (now.length === 2) {
      const [a, b] = now;
      if (a.side !== b.side) { const l = a.side === 'L' ? a : b, r = a.side === 'L' ? b : a; onChange({ pairs: [...pairs, [l.id, r.id]] }); setOpen([]); }
      else { setOpen(now); setTimeout(() => setOpen([]), 700); }
    } else setOpen(now);
  };
  return <>
    {content.prompt && <p className="uv-stem">{content.prompt}</p>}
    <div className="uv-memory">{cards.map((c: any) => { const shown = used(c) || open.some((o) => o.id === c.id && o.side === c.side); return <button key={`${c.side}${c.id}`} type="button" className={`uv-mcard${shown ? ' up' : ''}${used(c) ? ' paired' : ''}`} onClick={() => flip(c)} aria-label={shown ? c.text : 'Kapalı kart'}>{shown ? c.text : '?'}</button>; })}</div>
    <div className="uv-hint">{pairs.length} çift seçildi{pairs.length ? <> · <button type="button" className="link-button" onClick={() => onChange({ pairs: [] })} disabled={readOnly}>baştan</button></> : null}</div>
  </>;
}

/** Ordering: move with the arrow buttons (keyboard, touch) or drag on a mouse. */
function Order({ content, value, onChange, readOnly }: any) {
  const order: string[] = value?.order || (content.items || []).map((x: any) => x.id);
  const byId = (id: string) => (content.items || []).find((x: any) => x.id === id);
  const move = (k: number, d: number) => { const j = k + d; if (j < 0 || j >= order.length) return; const a = [...order]; [a[k], a[j]] = [a[j], a[k]]; onChange({ order: a }); };
  const drag = useRef<number | null>(null);
  return <>
    {content.prompt && <p className="uv-stem">{content.prompt}</p>}
    <ol className="uv-order">{order.map((id, k) => <li key={id} draggable={!readOnly} onDragStart={() => { drag.current = k; }} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag.current == null) return; const a = [...order]; const [x] = a.splice(drag.current, 1); a.splice(k, 0, x); drag.current = null; onChange({ order: a }); }}>
      <span className="uv-ord-no">{k + 1}</span><span className="uv-ord-text">{byId(id)?.text}</span>
      <span className="uv-ord-move"><button type="button" className="ghost" disabled={readOnly || k === 0} aria-label="Yukarı taşı" onClick={() => move(k, -1)}><ArrowUp size={16} /></button><button type="button" className="ghost" disabled={readOnly || k === order.length - 1} aria-label="Aşağı taşı" onClick={() => move(k, 1)}><ArrowDown size={16} /></button></span>
    </li>)}</ol>
  </>;
}

/** Fill-in: [id] marks in the text become fields. */
function Cloze({ content, value, onChange, readOnly }: any) {
  const blanks: Record<string, string> = value?.blanks || {};
  const parts = String(content.text || '').split(/(\[[A-Za-z0-9_-]+\])/g);
  return <>
    {content.prompt && <p className="uv-stem">{content.prompt}</p>}
    <p className="uv-cloze">{parts.map((p, k) => { const m = p.match(/^\[([A-Za-z0-9_-]+)\]$/); return m ? <input key={k} aria-label={`Boşluk ${m[1]}`} disabled={readOnly} value={blanks[m[1]] || ''} onChange={(e) => onChange({ blanks: { ...blanks, [m[1]]: e.target.value } })} autoComplete="off" spellCheck={false} /> : <span key={k}>{p}</span>; })}</p>
  </>;
}

/** Visual discovery: tap the right place; arrow keys move a marker for keyboard users. */
function Hotspot({ content, value, onChange, readOnly }: any) {
  const img = content.image || {};
  const at = value && Number.isFinite(value.x) ? value : null;
  const ref = useRef<HTMLDivElement>(null);
  const place = (e: React.MouseEvent) => { if (readOnly || !ref.current) return; const r = ref.current.getBoundingClientRect(); onChange({ x: Math.round(((e.clientX - r.left) / r.width) * 1000) / 1000, y: Math.round(((e.clientY - r.top) / r.height) * 1000) / 1000 }); };
  const key = (e: React.KeyboardEvent) => { if (readOnly) return; const p = at || { x: 0.5, y: 0.5 }, d = 0.02; const m: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }; if (m[e.key]) { e.preventDefault(); onChange({ x: Math.min(1, Math.max(0, p.x + m[e.key][0])), y: Math.min(1, Math.max(0, p.y + m[e.key][1])) }); } };
  return <>
    {content.prompt && <p className="uv-stem">{content.prompt}</p>}
    <div ref={ref} className="uv-hotspot" role="application" tabIndex={0} aria-label={`${img.alt || 'Görsel'}. Seçmek için dokun ya da ok tuşlarıyla işaretçiyi taşı.`} onClick={place} onKeyDown={key} style={{ aspectRatio: `${img.width || 4} / ${img.height || 3}` }}>
      <img src={img.url} alt={img.alt || ''} draggable={false} />
      {at && <span className="uv-marker" style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }} aria-hidden="true" />}
    </div>
  </>;
}

/** Math journey: each step answered in turn; the server checks every step, not only the result. */
function Steps({ content, value, onChange, readOnly }: any) {
  const steps: Record<string, string> = value?.steps || {};
  return <>
    <p className="uv-stem">{content.problem}</p>
    <ol className="uv-steps">{(content.steps || []).map((st: any, k: number) => <li key={st.id}>
      <label><span>{k + 1}. {st.prompt}</span><input inputMode="decimal" disabled={readOnly || (k > 0 && !steps[(content.steps[k - 1] || {}).id])} value={steps[st.id] || ''} onChange={(e) => onChange({ steps: { ...steps, [st.id]: e.target.value } })} autoComplete="off" /></label>
    </li>)}</ol>
  </>;
}

/** Results after the server has graded: what was right, the key, and the XP (kept apart from accuracy). */
export function UniverseResults({ data }: { data: Session }) {
  const s = data.session;
  return <section className="uv-player">
    <div className="uv-card uv-summary"><strong>{s.correct}/{s.itemCount} doğru</strong><span>+{s.xp} XP</span><small className="muted">XP bir ödüldür; karnende yalnız doğru, yanlış ve boşların sayılır.</small></div>
    {data.items.map((it) => <div key={it.seq} className={`uv-card uv-result ${it.correct ? 'ok' : it.correct === false ? 'no' : 'blank'}`}>
      <div className="uv-result-head">{it.correct ? <CheckCircle2 size={18} aria-hidden="true" /> : it.correct === false ? <XCircle size={18} aria-hidden="true" /> : <Clock size={18} aria-hidden="true" />}
        <span>{it.seq}. {it.correct ? 'Doğru' : it.correct === false ? (it.partial ? `Kısmen (%${Math.round((it.partial || 0) * 100)})` : 'Yanlış') : 'Boş'}</span></div>
      <KeyLine item={it} />
    </div>)}
  </section>;
}

function KeyLine({ item }: { item: Item }) {
  const k = item.key || {}, c = item.content || {};
  if (item.kind === 'QUESTION' || item.kind === 'AUDIO_QUESTION') return <p className="uv-key">Doğru cevap: <b>{k.correct}</b></p>;
  if (item.kind === 'PAIRS') return <ul className="uv-key">{(k.pairs || []).map((p: string[]) => <li key={p[0]}>{c.left?.find((x: any) => x.id === p[0])?.text} → {c.right?.find((x: any) => x.id === p[1])?.text}</li>)}</ul>;
  if (item.kind === 'SEQUENCE') return <ol className="uv-key">{(k.order || []).map((id: string) => <li key={id}>{c.items?.find((x: any) => x.id === id)?.text}</li>)}</ol>;
  if (item.kind === 'CLOZE' || item.kind === 'STEPS') { const rules = (item.kind === 'CLOZE' ? k.blanks : k.steps) || {}; return <ul className="uv-key">{Object.entries(rules).map(([id, r]: any) => <li key={id}>{item.kind === 'STEPS' ? (c.steps?.find((x: any) => x.id === id)?.prompt || id) : id}: <b>{r.accept?.[0] ?? r.numeric?.value}</b></li>)}</ul>; }
  if (item.kind === 'HOTSPOT') return <p className="uv-key">Doğru bölge işaretlendi.</p>;
  return null;
}
