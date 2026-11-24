import { useEffect, useState } from 'react';
import './universe-map.css';

/**
 * Öğrenme Evreni mola hatırlatması (owner, 12 Nov 2026 — dijital sağlık): ANUNEX should not add to screen time.
 * The time spent on Evren pages is counted in this browser only (per day). After 30 minutes in a row a short break is
 * suggested; after 60 minutes in a day a gentle note says it is a good moment to stop. Nothing is blocked or sent.
 */
const KEY = 'anunex-evren-time';
type Store = { day: string; total: number; streak: number; last: number };
const today = () => new Date().toLocaleDateString('en-CA');
function read(): Store { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && v.day === today()) return v; } catch { /* storage off */ } return { day: today(), total: 0, streak: 0, last: 0 }; }
function write(v: Store) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage off */ } }

export function BreakReminder() {
  const [state, setState] = useState<Store>(read);
  const [dismissed, setDismissed] = useState(0);
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now(); const s = read();
      // a gap of more than five minutes ends the streak (a break was taken)
      const streak = s.last && now - s.last < 5 * 60_000 ? s.streak + 1 : 1;
      const next = { ...s, total: s.total + 1, streak, last: now }; write(next); setState(next);
    };
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);
  const long = state.streak >= 30 && dismissed < state.streak - 29;
  const day = state.total >= 60;
  if (!long && !day) return null;
  return <div className="um-break" role="status">
    <strong>{long ? 'Mola zamanı!' : 'Bugün epey çalıştın.'}</strong>
    <span>{long ? `${state.streak} dakikadır Evren’desin. Kalk, biraz su iç, gözlerini uzağa dinlendir; 5 dakika sonra devam edebilirsin.` : `Bugün Evren’de ${state.total} dakika geçirdin. Kısa ve düzenli çalışmak daha kalıcı; yarın kaldığın yerden devam edebilirsin.`}</span>
    {long && <button type="button" onClick={() => setDismissed(state.streak)}>Tamam</button>}
  </div>;
}
