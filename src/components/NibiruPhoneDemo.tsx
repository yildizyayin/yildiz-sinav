import { useEffect, useRef, useState } from 'react';
import { BookHeart, CheckCheck, LayoutGrid, Mic, Play, ThumbsUp, TrendingUp } from 'lucide-react';
import { NibiruMark } from './NibiruMark';
import './NibiruPhoneDemo.css';

/**
 * anunex.com · Nibiru veli uygulaması, canlı (owner, 24 Nov 2026: "WhatsApp gibi gerçekçi değil … canlı bir görsel
 * olmalı"). A looping, self-playing phone that shows the real app as it is: the lock screen gets a name-free
 * notification, Nibiru opens with its first message and the result card (the net counts up, the line draws itself),
 * the parent types, Nibiru answers with topic bars and the guidance teacher's note. Invented names; plays only while
 * on screen; a still picture for people who prefer reduced motion.
 */
const STEPS = [
  { at: 0 },      // 0 lock screen
  { at: 1300 },   // 1 notification drops in
  { at: 3000 },   // 2 tap → app opens
  { at: 3700 },   // 3 Nibiru typing
  { at: 4800 },   // 4 first message + result card
  { at: 7400 },   // 5 parent types question 1
  { at: 9000 },   // 6 sent, Nibiru typing
  { at: 10200 },  // 7 topics answer
  { at: 13000 },  // 8 parent types question 2
  { at: 14600 },  // 9 sent, typing
  { at: 15800 },  // 10 guide answer
  { at: 17600 },  // 11 thumbs up
  { at: 21500 },  // 12 end → loop
];
const Q1 = 'Hangi konularda zorlanıyor?';
const Q2 = 'Evde nasıl destek olabilirim?';

function useStep(active: boolean, still: boolean) {
  const [step, setStep] = useState(still ? 11 : 0);
  useEffect(() => {
    if (still || !active) return;
    let timers: number[] = [];
    const run = () => { timers.forEach(clearTimeout); timers = STEPS.map((s, i) => window.setTimeout(() => (i === STEPS.length - 1 ? run() : setStep(i)), s.at)); };
    run();
    return () => timers.forEach(clearTimeout);
  }, [active, still]);
  return step;
}

function Typed({ text, on, ms = 1300 }: { text: string; on: boolean; ms?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => { if (!on) { setN(0); return; } const start = performance.now(); let raf = 0; const tick = () => { const k = Math.min(text.length, Math.round(((performance.now() - start) / ms) * text.length)); setN(k); if (k < text.length) raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf); }, [on, text, ms]);
  return <>{text.slice(0, n)}</>;
}

function CountUp({ to, on }: { to: number; on: boolean }) {
  const [v, setV] = useState(0);
  useEffect(() => { if (!on) { setV(0); return; } const start = performance.now(); let raf = 0; const tick = () => { const t = Math.min(1, (performance.now() - start) / 1100); setV(to * (1 - Math.pow(1 - t, 3))); if (t < 1) raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf); }, [on, to]);
  return <>{v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>;
}

export function NibiruPhoneDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    const el = ref.current; if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.25 }); io.observe(el); return () => io.disconnect();
  }, []);
  const s = useStep(visible, Boolean(still));
  const thread = useRef<HTMLDivElement>(null);
  useEffect(() => { const t = thread.current; if (t) t.scrollTo({ top: t.scrollHeight, behavior: still ? 'auto' : 'smooth' }); }, [s, still]);
  const show = (k: number) => (s >= k ? ' on' : '');
  const typing = s === 3 || s === 6 || s === 9;
  const composing = s === 5 ? Q1 : s === 8 ? Q2 : '';

  return <div className="npd" ref={ref} aria-label="Nibiru veli uygulaması canlı örnek: telefona bildirim gelir, Nibiru sonucu kartla anlatır, veli soru sorar." role="img">
    <div className="npd-phone">
      <div className="npd-island"/>
      {/* lock screen */}
      <div className={`npd-lock${s >= 2 ? ' gone' : ''}`}>
        <div className="npd-lock-time"><b>09:41</b><span>24 Kasım Salı</span></div>
        <div className={`npd-notif${show(1)}${s === 2 ? ' tap' : ''}`}>
          <div className="npd-notif-icon"><NibiruMark size={26} state="active" title=""/></div>
          <div><strong>Nibiru <small>şimdi</small></strong><span>Yeni bir mesajınız var.</span></div>
        </div>
        <div className="npd-lock-hint">Bildirimde ad ya da not yok — ayrıntı Nibiru’da.</div>
      </div>
      {/* the app */}
      <div className={`npd-app${s >= 2 ? ' open' : ''}`}>
        <header className="npd-head">
          <NibiruMark size={34} state={typing ? 'thinking' : s >= 4 ? 'active' : 'idle'} title=""/>
          <div><strong>Nibiru</strong><small>{typing ? 'yazıyor…' : 'akademik asistanınız'}</small></div>
          <span className="npd-anunex"><LayoutGrid size={12}/> ANUNEX</span>
        </header>
        <div className="npd-kids"><span className="on">Aras · 8. sınıf</span><span>Defne · 5. sınıf</span></div>
        <div className="npd-thread" ref={thread}>
          <span className="npd-day">Bugün</span>
          <div className={`npd-msg nb first${show(4)}`}>
            <p>Günaydın Seval Hanım 👋 Aras’ın <b>LGS Deneme 4</b> sonucu açıklandı.</p>
            <div className="npd-card">
              <div className="npd-card-top"><span>LGS Deneme 4</span><small>23 Kasım</small></div>
              <div className="npd-card-row">
                <div><strong><CountUp to={71.25} on={s >= 4}/></strong><small>net · %79 başarı</small></div>
                <span className={`npd-delta${show(4)}`}><TrendingUp size={12}/>+6,5</span>
                <svg viewBox="0 0 100 34" className={`npd-spark${show(4)}`}><path d="M4 28 L26 24 L48 22 L70 16 L94 6" pathLength={1}/><circle cx="94" cy="6" r="3.5"/></svg>
              </div>
            </div>
            <span className="npd-time">09:41</span>
          </div>
          <div className={`npd-msg me${show(6)}`}><p>{Q1}</p><span className="npd-time">09:42 <CheckCheck size={11}/></span></div>
          <div className={`npd-msg nb${show(7)}`}>
            <p>En çok desteğe ihtiyaç duyduğu konular:</p>
            <div className="npd-card">
              {[['Matematik', 'Çarpanlar ve katlar', 42], ['Fen', 'Basınç', 55], ['Türkçe', 'Söz sanatları', 78]].map(([a, b, p]) => <div key={String(b)} className="npd-topic"><span><b>{a}</b> · {b}</span><i><em className={Number(p) < 50 ? 'low' : Number(p) < 70 ? 'mid' : 'ok'} style={{ width: s >= 7 ? `${p}%` : '0%' }}/></i><small>%{p}</small></div>)}
            </div>
            <span className="npd-chip"><Play size={11}/> Konu videosu · 4 dk</span>
            <span className="npd-time">09:42</span>
          </div>
          <div className={`npd-msg me${show(9)}`}><p>{Q2}</p><span className="npd-time">09:43 <CheckCheck size={11}/></span></div>
          <div className={`npd-msg nb${show(10)}`}>
            <p>Her gün aynı saatte 20 dakika yeterli. Rehber öğretmeninizin önerisi:</p>
            <div className="npd-card guide"><div className="npd-card-top"><span><BookHeart size={12}/> Rehber öğretmen onaylı</span></div><b>Evde çalışma düzeni</b><small>Masada telefon olmasın; 25 dk çalışma, 5 dk mola.</small></div>
            <span className="npd-foot"><span className={`npd-like${show(11)}`}><ThumbsUp size={12}/></span><span className="npd-time">09:43</span></span>
          </div>
          {typing && <div className="npd-msg nb typing on"><i/><i/><i/></div>}
        </div>
        <div className="npd-bar"><div className="npd-input">{composing ? <Typed text={composing} on={Boolean(composing)}/> : <span>Mesaj yazın…</span>}{composing && <i className="npd-caret"/>}</div><span className="npd-mic"><Mic size={15}/></span></div>
      </div>
    </div>
  </div>;
}
