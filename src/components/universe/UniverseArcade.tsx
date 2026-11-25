import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { readSoundSettings, writeSoundSettings } from '../../lib/glassSounds';
import './universe-arcade.css';

/**
 * Öğrenme Evreni animasyonlu oyunlar (owner, 24–25 Nov 2026: "çok güzel olmuş bunun gibi yapalım"; Aşama 0 of the
 * game roadmap). The approved prototype, now on real sessions:
 *  - Bilgi Görevi / Süreli Meydan Okuma → Meteor Avı (long options or a picture → cards, same feedback);
 *  - Kavram Eşleştirme → Takımyıldız;  Sırala → Roket Montajı.
 * Each answer goes to the server the moment it is given (/items/:seq/check) and the reply drives the animation; the
 * key never reaches the device before the answer, the first check locks the item, XP is paid once at the end by the
 * server. Look follows the grade: 4–6 big and playful, 7–8 game-like, 9–12 calm. Sound follows the student's own
 * setting and can be switched off here; reduced motion turns the animations into simple fades.
 */
type Item = { seq: number; kind: string; repeat: boolean; content: any };
type Session = { session: any; items: Item[] };
type Check = { correct: boolean; partial: number; key: any; explanation: string | null };

export const ARCADE_KINDS: Record<string, string> = { CHOICE: 'meteor', TIMED: 'meteor', MATCH: 'sky', ORDER: 'rocket' };
/** The play can run as an animated game when its kind has one and every item is of that game's content. */
export function arcadeGame(data: Session | null): string | null {
  const game = ARCADE_KINDS[data?.session?.template?.kind];
  if (!game || !data?.items?.length) return null;
  const need = game === 'meteor' ? 'QUESTION' : game === 'sky' ? 'PAIRS' : 'SEQUENCE';
  return data.items.every((it) => it.kind === need && !(game === 'sky' && it.content?.mode === 'MEMORY')) ? game : null;
}
const bandOf = (grade: number) => (grade && grade <= 6 ? 'a' : grade && grade <= 8 ? 'b' : 'c');
const shuffle = <T,>(a: T[]) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const PRAISE = ['Süpersin!', 'Tam isabet!', 'Harika gidiyorsun!', 'Bravo, aynen böyle!', 'Yıldız gibi parladın!'];
const CHEER = ['Olsun, birlikte bakalım.', 'Neredeyse! Doğrusu burada.', 'Hata yapmak öğrenmenin parçası.'];
const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ---------- sound: synthesised, follows the student's setting ---------- */
let ac: AudioContext | null = null;
function tone(f: number, t = 0, d = 0.15, type: OscillatorType = 'sine', v = 0.18) {
  const s = readSoundSettings(); if (!s.enabled) return;
  try {
    const C = (window as any).AudioContext || (window as any).webkitAudioContext; if (!C) return;
    ac = ac || new C(); const a = ac!; if (a.state === 'suspended') void a.resume();
    const o = a.createOscillator(), g = a.createGain(), vol = v * Math.max(0.2, s.volume / 0.35);
    o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0, a.currentTime + t); g.gain.linearRampToValueAtTime(Math.min(0.4, vol), a.currentTime + t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + t + d); o.connect(g).connect(a.destination); o.start(a.currentTime + t); o.stop(a.currentTime + t + d + 0.05);
  } catch { /* no audio on this device */ }
}
const sfx = {
  good: () => { tone(660, 0, 0.12, 'triangle'); tone(990, 0.09, 0.2, 'triangle'); },
  bad: () => { tone(220, 0, 0.22, 'sine', 0.14); tone(180, 0.12, 0.25, 'sine', 0.12); },
  tap: () => tone(520, 0, 0.06, 'square', 0.05),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.25, 'triangle')),
  launch: () => { for (let i = 0; i < 14; i++) tone(120 + i * 45, i * 0.07, 0.12, 'sawtooth', 0.05); },
};

/* ---------- particles on one fixed canvas, only while something is flying ---------- */
type P = { x: number; y: number; vx: number; vy: number; g: number; life: number; d: number; r: number; c: string; sq?: boolean; rot?: number; puff?: boolean };
let parts: P[] = [];
let fxCanvas: HTMLCanvasElement | null = null;
let raf = 0;
function frame() {
  const c = fxCanvas; if (!c) { raf = 0; return; }
  const x = c.getContext('2d'); if (!x) { raf = 0; return; }
  x.clearRect(0, 0, innerWidth, innerHeight);
  parts = parts.filter((p) => p.life > 0 && p.y < innerHeight + 40);
  for (const p of parts) {
    p.vy += p.g; p.x += p.vx; p.y += p.vy; p.life -= p.d; x.globalAlpha = Math.max(0, p.life); x.fillStyle = p.c;
    if (p.puff) { x.beginPath(); x.arc(p.x, p.y, p.r * (1.6 - p.life * 0.6), 0, 7); x.fill(); }
    else if (p.sq) { x.save(); x.translate(p.x, p.y); x.rotate((p.rot = (p.rot || 0) + 0.1)); x.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6); x.restore(); }
    else { x.beginPath(); x.arc(p.x, p.y, p.r, 0, 7); x.fill(); }
  }
  x.globalAlpha = 1;
  raf = parts.length ? requestAnimationFrame(frame) : 0;
}
const kick = () => { if (!raf && typeof requestAnimationFrame !== 'undefined') raf = requestAnimationFrame(frame); };
function burst(x: number, y: number, colors: string[], n = 28, speed = 6, grav = 0.12) {
  if (reduced()) n = Math.min(n, 6);
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = Math.random() * speed + 1; parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: grav, life: 1, d: Math.random() * 0.02 + 0.012, r: Math.random() * 4 + 2, c: colors[i % colors.length], sq: Math.random() < 0.4 }); }
  kick();
}
function confetti(n = 140) {
  const cols = ['#ffd166', '#5aa8ff', '#3ee08f', '#ff6b7d', '#b69cff'];
  for (let i = 0; i < (reduced() ? 20 : n); i++) parts.push({ x: Math.random() * innerWidth, y: -20 - Math.random() * 200, vx: (Math.random() - 0.5) * 2, vy: Math.random() * 3 + 2, g: 0.04, life: 1, d: 0.004, r: Math.random() * 5 + 3, c: cols[i % 5], sq: true, rot: Math.random() * 6 });
  kick();
}
const smoke = (x: number, y: number) => { parts.push({ x: x + (Math.random() - 0.5) * 30, y, vx: (Math.random() - 0.5) * 1.5, vy: Math.random() * 1.5 + 0.5, g: -0.01, life: 1, d: 0.012, r: Math.random() * 14 + 8, c: 'rgba(200,210,240,.35)', puff: true }); kick(); };
const center = (el: Element | null): [number, number] => { if (!el) return [innerWidth / 2, innerHeight / 2]; const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

function Nibiru({ mood, size = 64 }: { mood: '' | 'happy' | 'oops'; size?: number }) {
  return <div className={`ua-nb ${mood}`} style={{ ['--s' as any]: `${size}px` }} aria-hidden="true"><i className="ua-nb-ring" /><i className="ua-nb-body" /><i className="ua-nb-eyes"><b /><b /></i><i className="ua-nb-mouth" /></div>;
}

function StarField() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return; const x = c.getContext('2d'); if (!x) return;
    let stars: any[] = [], id = 0, alive = true;
    const size = () => { const r = devicePixelRatio || 1, b = c.getBoundingClientRect(); c.width = b.width * r; c.height = b.height * r; x.setTransform(r, 0, 0, r, 0, 0); stars = Array.from({ length: Math.round((b.width * b.height) / 4200) }, () => ({ x: Math.random() * b.width, y: Math.random() * b.height, r: Math.random() * 1.3 + 0.2, s: Math.random() * 0.2 + 0.03, p: Math.random() * 6 })); };
    size();
    const still = reduced();
    const draw = (t: number) => { if (!alive) return; const b = c.getBoundingClientRect(); x.clearRect(0, 0, b.width, b.height); for (const s of stars) { if (!still) { s.y += s.s; if (s.y > b.height) s.y = 0; } x.globalAlpha = 0.35 + (0.5 + 0.5 * Math.sin(t / 700 + s.p)) * 0.65; x.fillStyle = '#fff'; x.beginPath(); x.arc(s.x, s.y, s.r, 0, 7); x.fill(); } x.globalAlpha = 1; if (!still) id = requestAnimationFrame(draw); };
    id = requestAnimationFrame(draw);
    addEventListener('resize', size);
    return () => { alive = false; cancelAnimationFrame(id); removeEventListener('resize', size); };
  }, []);
  return <canvas ref={ref} className="ua-stars" aria-hidden="true" />;
}

export function UniverseArcade({ data, onDone }: { data: Session; onDone: (s: Session) => void }) {
  const s = data.session, items = data.items, game = arcadeGame(data) || 'meteor';
  const band = bandOf(Number(s.gradeLevel));
  const [i, setI] = useState(0);
  const [responses, setResponses] = useState<Record<number, any>>({});
  const [stats, setStats] = useState({ correct: 0, combo: 0, best: 0 });
  const [mood, setMood] = useState<{ m: '' | 'happy' | 'oops'; text: string; n: number }>({ m: '', text: game === 'meteor' ? 'Meteorlar geliyor! Doğru cevabı taşıyana dokun.' : game === 'sky' ? 'Soldaki yıldızı sağdaki eşine sürükle ya da ikisine sırayla dokun.' : 'Parçaları alttan başlayarak yerleştir, sonra roketi kontrol et.', n: 0 });
  const [result, setResult] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sound, setSound] = useState(() => readSoundSettings().enabled);
  const fx = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = fx.current; if (!c) return; fxCanvas = c;
    const size = () => { const r = devicePixelRatio || 1; c.width = innerWidth * r; c.height = innerHeight * r; c.getContext('2d')?.setTransform(r, 0, 0, r, 0, 0); };
    size(); addEventListener('resize', size);
    return () => { removeEventListener('resize', size); if (fxCanvas === c) fxCanvas = null; parts = []; };
  }, []);

  const say = (m: '' | 'happy' | 'oops', text: string) => setMood((x) => ({ m, text, n: x.n + 1 }));
  const scored = (ok: boolean, el?: Element | null, gentle = false) => {
    setStats((x) => { const combo = ok ? x.combo + 1 : 0; return { correct: x.correct + (ok ? 1 : 0), combo, best: Math.max(x.best, combo) }; });
    if (ok) { sfx.good(); if (el && !gentle) { const [x, y] = center(el); const f = document.createElement('div'); f.className = 'ua-float'; f.textContent = '+★'; f.style.left = `${x - 16}px`; f.style.top = `${y - 20}px`; document.body.append(f); setTimeout(() => f.remove(), 1000); } say('happy', pick(PRAISE)); }
    else { sfx.bad(); say('oops', pick(CHEER)); }
  };
  const check = useCallback(async (seq: number, response: any): Promise<Check | null> => {
    setError(''); setResponses((r) => ({ ...r, [seq]: response }));
    try { return await api<Check>(`/api/student-standard/universe/sessions/${encodeURIComponent(s.id)}/items/${seq}/check`, { method: 'POST', body: JSON.stringify({ response }) }); }
    catch (e: any) { setError(e.message || 'Cevap kontrol edilemedi; bağlantını kontrol edip yeniden dene.'); return null; }
  }, [s.id]);

  const finish = async () => {
    setBusy(true); setError('');
    try {
      const out = await api<Session>(`/api/student-standard/universe/sessions/${encodeURIComponent(s.id)}/submit`, { method: 'POST', body: JSON.stringify({ answers: items.map((it) => ({ seq: it.seq, response: responses[it.seq] ?? null })) }) });
      setResult(out); sfx.win(); confetti();
    } catch (e: any) { setError(e.message || 'Gönderilemedi; bağlantını kontrol edip yeniden dene. Cevapların kayıtlı.'); }
    setBusy(false);
  };
  const next = () => { sfx.tap(); if (i + 1 < items.length) setI(i + 1); else void finish(); };
  const toggleSound = () => { const cur = readSoundSettings(); writeSoundSettings({ ...cur, enabled: !sound }); setSound(!sound); };

  const progress = Math.round(((result ? items.length : i) / items.length) * 100);
  const item = items[i];
  return <section className="ua" data-band={band} data-game={game} aria-label={`${s.template?.title || 'Oyun'}: ${s.outcome?.code || ''}`}>
    <canvas ref={fx} className="ua-fx" aria-hidden="true" />
    <StarField />
    <div className="ua-top">
      <div className="ua-progress" role="progressbar" aria-label="İlerleme" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{ width: `${progress}%` }} /></div>
      <span className="ua-chip" aria-label={`${stats.correct} doğru`}>★ {stats.correct}</span>
      {stats.combo >= 2 && !result && <span key={stats.combo} className="ua-combo" aria-live="polite">🔥 {stats.combo} üst üste</span>}
      <button type="button" className="ua-icon" onClick={toggleSound} aria-pressed={sound}>{sound ? '🔊' : '🔇'}<span className="sr-only">{sound ? 'Sesi kapat' : 'Sesi aç'}</span></button>
    </div>
    <p className="ua-outcome"><span>Kazanım</span><b>{s.outcome?.code}</b>{s.outcome?.title}</p>
    {item.repeat && !result && <p className="ua-note">Tekrar: bu içeriği daha önce gördün.</p>}
    {!result && <div className="ua-stage">
      {game === 'meteor' && <Meteor key={item.seq} item={item} band={band} timed={s.timed ? s.secondsPerItem : null} check={check} scored={scored} next={next} last={i + 1 === items.length} busy={busy} />}
      {game === 'sky' && <Sky key={item.seq} item={item} check={check} scored={scored} say={say} next={next} last={i + 1 === items.length} busy={busy} />}
      {game === 'rocket' && <Rocket key={item.seq} item={item} check={check} scored={scored} say={say} next={next} last={i + 1 === items.length} busy={busy} />}
    </div>}
    {result && <End result={result} best={stats.best} title={s.template?.title} outcome={s.outcome} onDetails={() => onDone(result)} />}
    {error && <div className="ua-error" role="alert">{error}{!result && i + 1 === items.length && <button type="button" className="ua-ghost" onClick={() => void finish()} disabled={busy}>Yeniden gönder</button>}</div>}
    {!result && <div className="ua-talk"><Nibiru mood={mood.m} size={band === 'c' ? 48 : 64} /><p key={mood.n} className="ua-bubble" aria-live="polite">{mood.text}</p></div>}
  </section>;
}

type GameProps = { item: Item; check: (seq: number, r: any) => Promise<Check | null>; scored: (ok: boolean, el?: Element | null, gentle?: boolean) => void; next: () => void; last: boolean; busy: boolean };

function NextButton({ last, busy, onClick, label }: { last: boolean; busy: boolean; onClick: () => void; label?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
  return <button ref={ref} type="button" className="ua-next" disabled={busy} onClick={onClick}>{busy ? 'Gönderiliyor…' : last ? 'Bitir' : label || 'Devam'}</button>;
}

/* ---------- Meteor Avı ---------- */
function Meteor({ item, band, timed, check, scored, next, last, busy }: GameProps & { band: string; timed: number | null }) {
  const c = item.content || {};
  const options: any[] = c.options || [];
  const cards = band === 'c' || (c.assets || []).length > 0 || options.some((o) => String(o.text).length > 26) || options.length > 4;
  const spots = useMemo(() => shuffle([[4, 6], [52, 2], [8, 52], [56, 50], [30, 26]]), [item.seq]);
  const motion = useMemo(() => options.map(() => ({ d: (4 + Math.random() * 3).toFixed(1), x: Math.round(Math.random() * 24 - 12), y: Math.round(Math.random() * 24 - 16), delay: (-Math.random() * 4).toFixed(1) })), [item.seq]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [res, setRes] = useState<Check | null>(null);
  const [left, setLeft] = useState<number | null>(timed);
  const [timerOn, setTimerOn] = useState(!!timed);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    if (!timerOn || res || chosen || left == null) return;
    if (left <= 0) { scored(false, null, true); setRes({ correct: false, partial: 0, key: null, explanation: null }); return; }
    const t = setTimeout(() => setLeft((x) => (x == null ? x : x - 1)), 1000); return () => clearTimeout(t);
  });
  const answer = async (key: string) => {
    if (chosen || res) return; setChosen(key);
    const r = await check(item.seq, { answer: key });
    if (!r) { setChosen(null); return; }
    setRes(r);
    const el = refs.current[key];
    if (r.correct && el) { const [x, y] = center(el); burst(x, y, ['#ffd166', '#fff', '#ff8a3d', '#5aa8ff'], 40, 7); }
    scored(r.correct, el);
  };
  const right = res?.key?.correct as string | undefined;
  const timedOut = !!res && !chosen;
  return <>
    <p className="ua-q">{c.stem}</p>
    {(c.assets || []).map((a: any, k: number) => <img key={k} className="ua-img" src={a.url} alt={a.alt || 'Soru görseli'} />)}
    {timed ? <div className="ua-timer"><button type="button" className="ua-ghost" aria-pressed={timerOn} onClick={() => setTimerOn(!timerOn)}>{timerOn ? `⏱ ${left} sn · süreyi kapat` : 'Süre kapalı'}</button></div> : null}
    <div className={cards ? 'ua-cards' : 'ua-arena'}>
      {options.map((o, k) => {
        const state = res ? (o.key === chosen ? (res.correct ? 'hit' : 'wrong') : o.key === right ? 'reveal' : 'dim') : '';
        const style = cards ? undefined : { left: `${spots.at(k)?.[0] ?? 10}%`, top: `${spots.at(k)?.[1] ?? 10}%`, ['--d' as any]: `${motion.at(k)?.d}s`, ['--x' as any]: `${motion.at(k)?.x}px`, ['--y' as any]: `${motion.at(k)?.y}px`, animationDelay: `${motion.at(k)?.delay}s` };
        return <button key={o.key} ref={(el) => { refs.current[o.key] = el; }} type="button" className={`${cards ? 'ua-card' : 'ua-meteor'} ${state}`} style={style} disabled={!!chosen || !!res} onClick={() => void answer(o.key)} aria-label={`${o.key}) ${o.text}`}>
          {cards ? <><b>{o.key}</b><span>{o.text}</span></> : <><i className="tail" /><i className="rock" /><span>{o.text}</span></>}
        </button>;
      })}
    </div>
    <div className="ua-feedback" aria-live="polite">
      {res && (res.correct ? <span className="good">✓ Doğru!</span> : timedOut ? <span className="bad">Süre doldu; bu soru boş sayılır.</span> : <span className="bad">Doğru cevap {right ? `${right} seçeneği; parlıyor` : 'işaretlendi'}.</span>)}
      {res?.explanation && <span className="why">{res.explanation}</span>}
      {res ? <NextButton last={last} busy={busy} onClick={next} /> : !chosen && <button type="button" className="ua-ghost" onClick={next} disabled={busy}>{last ? 'Boş bırak, bitir' : 'Boş bırak, geç'}</button>}
    </div>
  </>;
}

/* ---------- Takımyıldız ---------- */
function Sky({ item, check, scored, say, next, last, busy }: GameProps & { say: (m: '' | 'happy' | 'oops', t: string) => void }) {
  const c = item.content || {};
  const L: any[] = c.left || [], R: any[] = c.right || [];
  const [links, setLinks] = useState<[string, string][]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [res, setRes] = useState<Check | null>(null);
  const [temp, setTemp] = useState<[number, number, number, number] | null>(null);
  const [, redraw] = useState(0);
  const sky = useRef<HTMLDivElement>(null);
  const el = (side: 'L' | 'R', id: string) => sky.current?.querySelector(`[data-side="${side}"][data-id="${id.replace(/["\\]/g, '\\$&')}"] .dot`) as HTMLElement | null;
  const pt = (side: 'L' | 'R', id: string): [number, number] => { const s = sky.current?.getBoundingClientRect(), d = el(side, id)?.getBoundingClientRect(); return s && d ? [d.left + d.width / 2 - s.left, d.top + d.height / 2 - s.top] : [0, 0]; };
  useEffect(() => { const f = () => redraw((x) => x + 1); addEventListener('resize', f); const t = setTimeout(f, 60); return () => { removeEventListener('resize', f); clearTimeout(t); }; }, []);
  const partnerOf = (l: string) => links.find((p) => p[0] === l)?.[1];
  const ownerOf = (r: string) => links.find((p) => p[1] === r)?.[0];
  const chooseLeft = (id: string) => { if (res) return; if (partnerOf(id)) { setLinks(links.filter((p) => p[0] !== id)); setPicked(null); sfx.tap(); return; } setPicked(id); sfx.tap(); };
  const chooseRight = (id: string) => {
    if (res) return;
    if (!picked) { const o = ownerOf(id); if (o) { setLinks(links.filter((p) => p[1] !== id)); sfx.tap(); } return; }
    const nextLinks = [...links.filter((p) => p[0] !== picked && p[1] !== id), [picked, id] as [string, string]];
    setLinks(nextLinks); setPicked(null); sfx.tap();
    const [x, y] = center(el('R', id)); burst(x, y, ['#cfe0ff', '#fff'], 8, 2, 0.05);
    if (nextLinks.length === L.length) say('', 'Hepsi bağlandı. Hazırsan kontrol et!');
  };
  const onDown = (e: React.PointerEvent) => {
    const s = (e.target as HTMLElement).closest('.ua-star') as HTMLElement | null; if (!s || res) return;
    if (s.dataset.side === 'L') { chooseLeft(s.dataset.id!); if (!partnerOf(s.dataset.id!)) { const p = pt('L', s.dataset.id!); setTemp([p[0], p[1], p[0], p[1]]); } }
    else chooseRight(s.dataset.id!);
  };
  const onMove = (e: React.PointerEvent) => { if (!temp || !sky.current) return; const b = sky.current.getBoundingClientRect(); setTemp([temp[0], temp[1], e.clientX - b.left, e.clientY - b.top]); };
  const onUp = (e: React.PointerEvent) => {
    if (!temp) return; setTemp(null);
    const t = (document.elementFromPoint?.(e.clientX, e.clientY) as HTMLElement | null)?.closest('.ua-star') as HTMLElement | null;
    if (t && t.dataset.side === 'R') chooseRight(t.dataset.id!);
  };
  const submit = async () => {
    const r = await check(item.seq, { pairs: links }); if (!r) return; setRes(r);
    const key: [string, string][] = r.key?.pairs || [];
    let good = 0; for (const [l, rr] of links) if (key.some((k) => k[0] === l && k[1] === rr)) { good++; const [x, y] = center(el('R', rr)); burst(x, y, ['#3ee08f', '#fff', '#b69cff'], 16, 4, 0.05); }
    scored(r.correct, sky.current, true);
    say(r.correct ? 'happy' : 'oops', r.correct ? 'Takımyıldız tamam! Hiç hata yapmadın.' : `${good}/${L.length} bağlantı doğru. Yeşil kesikli çizgiler doğru eşleri gösteriyor.`);
  };
  const key: [string, string][] = res?.key?.pairs || [];
  const ok = (l: string, r: string) => key.some((k) => k[0] === l && k[1] === r);
  return <>
    <p className="ua-q">{c.prompt || 'Kavramları eşleriyle birleştir'}</p>
    <div ref={sky} className={`ua-sky${res?.correct ? ' glow' : ''}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setTemp(null)}>
      <svg aria-hidden="true">
        {links.map(([l, r]) => { const a = pt('L', l), b = pt('R', r); return <line key={`${l}-${r}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className={res ? (ok(l, r) ? 'ok' : 'no') : 'set'} />; })}
        {res && !res.correct && key.filter(([l, r]) => !links.some((p) => p[0] === l && p[1] === r)).map(([l, r]) => { const a = pt('L', l), b = pt('R', r); return <line key={`k-${l}-${r}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="key" />; })}
        {temp && <line x1={temp[0]} y1={temp[1]} x2={temp[2]} y2={temp[3]} className="temp" />}
      </svg>
      <div className="ua-col">{L.map((x) => <button key={x.id} type="button" className={`ua-star${picked === x.id ? ' picked' : ''}${partnerOf(x.id) ? ' linked' : ''}`} data-side="L" data-id={x.id} onClick={(e) => { if (e.detail === 0) chooseLeft(x.id); }} aria-pressed={picked === x.id} disabled={!!res}><i className="dot" /><span>{x.text}</span></button>)}</div>
      <div className="ua-col right">{R.map((x) => <button key={x.id} type="button" className={`ua-star${ownerOf(x.id) ? ' linked' : ''}`} data-side="R" data-id={x.id} onClick={(e) => { if (e.detail === 0) chooseRight(x.id); }} disabled={!!res}><i className="dot" /><span>{x.text}</span></button>)}</div>
    </div>
    <p className="ua-hint">{res ? '' : picked ? 'Şimdi sağdan eşini seç.' : 'Soldan bir yıldız seç, sonra sağdaki eşine dokun ya da sürükle. Bağlı yıldıza dokunursan bağ çözülür.'}</p>
    <div className="ua-feedback" aria-live="polite">
      {res ? <><span className={res.correct ? 'good' : 'bad'}>{res.correct ? '✓ Takımyıldız tamam!' : `Kısmen doğru: %${Math.round((res.partial || 0) * 100)}`}</span>{res.explanation && <span className="why">{res.explanation}</span>}<NextButton last={last} busy={busy} onClick={next} label="Sonraki takımyıldız" /></>
        : links.length === L.length && L.length > 0 ? <NextButton last={false} busy={busy} onClick={() => void submit()} label="✨ Kontrol et" />
          : <button type="button" className="ua-ghost" onClick={next} disabled={busy}>{last ? 'Boş bırak, bitir' : 'Boş bırak, geç'}</button>}
    </div>
  </>;
}

/* ---------- Roket Montajı ---------- */
function Rocket({ item, check, scored, say, next, last, busy }: GameProps & { say: (m: '' | 'happy' | 'oops', t: string) => void }) {
  const c = item.content || {};
  const parts0: any[] = c.items || [];
  const n = parts0.length;
  const [placed, setPlaced] = useState<(string | null)[]>(() => Array(n).fill(null));
  const [res, setRes] = useState<Check | null>(null);
  const [phase, setPhase] = useState<'' | 'bad' | 'ignite' | 'launch'>('');
  const rocket = useRef<HTMLDivElement>(null);
  const slots = useRef<HTMLDivElement>(null);
  const textOf = (id: string | null) => parts0.find((p) => p.id === id)?.text ?? '';
  const put = (id: string) => { if (res) return; const k = placed.indexOf(null); if (k < 0) return; const a = [...placed]; a[k] = id; setPlaced(a); sfx.tap(); const [x, y] = center(slots.current?.children[k] || null); burst(x, y, ['#cfe0ff', '#fff'], 8, 2, 0.05); };
  const takeBack = (k: number) => { if (res || placed[k] == null) return; const a = [...placed]; a[k] = null; setPlaced(a); sfx.tap(); };
  const full = placed.every((x) => x != null);
  const launch = () => {
    setPhase('ignite'); sfx.launch();
    let t = 0; const puff = setInterval(() => { const f = rocket.current?.querySelector('.flame')?.getBoundingClientRect(); if (f) for (let k = 0; k < 3; k++) smoke(f.left + f.width / 2, f.bottom); if (++t > 40) clearInterval(puff); }, 45);
    setTimeout(() => { setPhase('launch'); const [x, y] = center(rocket.current); burst(x, y + 80, ['#ffd166', '#ff8a3d', '#fff'], 30, 5); }, 600);
  };
  const submit = async () => {
    const r = await check(item.seq, { order: placed }); if (!r) return;
    setRes(r); scored(r.correct, rocket.current, true);
    if (r.correct) { say('happy', 'Sistemler hazır… 3, 2, 1, ateşle!'); launch(); }
    else { setPhase('bad'); say('oops', 'Bazı parçalar yanlış yerdeydi. Yeşil gösterilen doğru sıra; bir dahakine roket senin!'); setTimeout(() => setPhase(''), 600); }
  };
  const keyOrder: string[] = res?.key?.order || [];
  const shown = res && !res.correct ? keyOrder : placed;
  return <>
    <p className="ua-q">{c.prompt || 'Doğru sıraya diz (ilk adım en alta)'}</p>
    <div className="ua-hangar">
      <div className="ua-parts">{parts0.map((p) => <button key={p.id} type="button" className={`ua-part${placed.includes(p.id) ? ' used' : ''}`} onClick={() => put(p.id)} disabled={!!res || placed.includes(p.id)}>{p.text}</button>)}</div>
      <div>
        <div ref={rocket} className={`ua-rocket ${phase === 'ignite' || phase === 'launch' ? 'ignite' : ''} ${phase === 'launch' ? 'launch' : ''}`}>
          <div className="nose" />
          <div ref={slots} className="slots">{shown.map((id, k) => {
            const good = res ? (res.correct || placed.at(k) === keyOrder.at(k)) : false;
            return <button key={k} type="button" className={`slot${id != null ? ' filled' : ''}${res ? (good ? ' lock' : ' fixed') : ''}${phase === 'bad' && !good ? ' bad' : ''}`} onClick={() => takeBack(k)} disabled={!!res} aria-label={`${k + 1}. kat: ${id != null ? textOf(id) : 'boş'}`}>
              <b>{k + 1}</b><span>{id != null ? textOf(id) : k === placed.indexOf(null) ? 'Sıradaki parça' : ''}</span>
            </button>;
          })}</div>
          <div className="fins" /><div className="flame" />
        </div>
        <div className="ua-pad" />
      </div>
    </div>
    <div className="ua-feedback" aria-live="polite">
      {res ? <><span className={res.correct ? 'good' : 'bad'}>{res.correct ? '🚀 Roket yörüngede!' : `Kısmen doğru: %${Math.round((res.partial || 0) * 100)} · doğru sıra roketin üzerinde`}</span>{res.explanation && <span className="why">{res.explanation}</span>}<NextButton last={last} busy={busy} onClick={next} label="Yeni roket" /></>
        : full ? <NextButton last={false} busy={busy} onClick={() => void submit()} label="🚀 Kontrol et ve fırlat" />
          : <button type="button" className="ua-ghost" onClick={next} disabled={busy}>{last ? 'Boş bırak, bitir' : 'Boş bırak, geç'}</button>}
    </div>
  </>;
}

/* ---------- celebration with the server's own result ---------- */
function End({ result, best, title, outcome, onDetails }: { result: Session; best: number; title?: string; outcome?: any; onDetails: () => void }) {
  const r = result.session, total = r.itemCount || result.items.length, correct = r.correct || 0, xp = r.xp || 0;
  const [shownXp, setShownXp] = useState(0);
  useEffect(() => { const t0 = performance.now(); let id = 0; const tick = (t: number) => { const k = Math.min(1, (t - t0) / 1100); setShownXp(Math.round(xp * (1 - Math.pow(1 - k, 3)))); if (k < 1) id = requestAnimationFrame(tick); }; id = requestAnimationFrame(tick); return () => cancelAnimationFrame(id); }, [xp]);
  const pct = total ? correct / total : 0;
  return <div className="ua-end">
    <div className="ua-medal">★<small>ROZET</small></div>
    <h2>{pct >= 0.8 ? 'Muhteşem!' : pct >= 0.5 ? 'Çok iyi!' : 'Güzel başlangıç!'}</h2>
    <div className="ua-stats">
      <div><strong>{correct}/{total}</strong><span>doğru</span></div>
      <div><strong>{shownXp}</strong><span>XP kazandın</span></div>
      <div><strong>{best}</strong><span>en uzun seri</span></div>
    </div>
    <div className="ua-talk"><Nibiru mood="happy" /><p className="ua-bubble">{pct >= 0.8 ? `${title || 'Oyun'} rozetin hazır! Yarın yeni görevlerle buradayım.` : 'Kaçırdıklarını aralıklı tekrarla sana yeniden getireceğim.'}</p></div>
    {correct > 0 && <p className="ua-small">Gezegenine {correct} yeni parça eklendi; Öğrenme Evreni ana sayfasında görebilirsin.</p>}
    {outcome?.code && <p className="ua-earned">Bu oyunla çalıştığın kazanım: <b>{outcome.code}</b> {outcome.title}. Cevapların bu kazanımın kanıtı olarak karnene işlendi.</p>}
    <p className="ua-small">XP bir ödüldür; karnende yalnız doğru, yanlış ve boşların sayılır.</p>
    <div className="ua-row"><Link className="ua-next" to="/evren">Haritaya dön</Link><button type="button" className="ua-ghost" onClick={onDetails}>Cevapları gör</button></div>
  </div>;
}
