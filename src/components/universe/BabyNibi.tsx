import { Link } from 'react-router-dom';
import './baby-nibi.css';

/**
 * Bebek Nibi (owner, 26 Nov 2026: bireysel ilerleme; 4–6. sınıf). A little companion that grows with the student's own
 * correct answers and asks for the reviews that are due. Nothing new is stored: everything comes from the map
 * (planet.total, starSummary.reviewDue, dailyGoal.done). It never dies, never gets sad for long, and never compares
 * the student with anyone; a skipped day only makes it sleepy.
 */
export type NibiStage = { key: 'egg' | 'baby' | 'small' | 'grown'; name: string; next: number | null };
export type NibiMood = 'hungry' | 'sleepy' | 'happy';

const STAGES: Array<NibiStage & { from: number }> = [
  { key: 'egg', name: 'Yumurta', from: 0, next: 1 },
  { key: 'baby', name: 'Bebek Nibi', from: 1, next: 10 },
  { key: 'small', name: 'Minik Nibi', from: 10, next: 30 },
  { key: 'grown', name: 'Büyüyen Nibi', from: 30, next: null },
];

export function nibiState(correct: number, reviewsDue: number, playsToday: number) {
  const n = Math.max(0, Math.floor(Number(correct) || 0));
  const { from, ...stage } = [...STAGES].reverse().find((s) => n >= s.from)!;
  const mood: NibiMood = reviewsDue > 0 ? 'hungry' : playsToday > 0 ? 'happy' : 'sleepy';
  const toNext = stage.next == null ? null : stage.next - n;
  const line = stage.key === 'egg' ? 'Yumurtanın içinde biri var! İlk doğru cevabınla çatlayacak.'
    : mood === 'hungry' ? `Karnım acıktı! ${reviewsDue} kazanımda tekrar zamanı geldi; tekrar beni besler.`
    : mood === 'happy' ? 'Bugün birlikte çalıştık, çok mutluyum!'
    : 'Biraz uykum var… Bir oyun oynarsan uyanırım.';
  return { stage, mood, toNext, line, correct: n };
}

function Creature({ stage, mood }: { stage: NibiStage['key']; mood: NibiMood }) {
  if (stage === 'egg') return <svg viewBox="0 0 120 120" aria-hidden="true" className="bn-art"><ellipse cx="60" cy="68" rx="34" ry="42" fill="#fff6e0" stroke="#e9c46a" strokeWidth="4" /><circle cx="46" cy="56" r="6" fill="#ffd8a8" /><circle cx="72" cy="80" r="8" fill="#ffd8a8" /><circle cx="70" cy="44" r="4" fill="#ffd8a8" /></svg>;
  const size = stage === 'baby' ? 26 : stage === 'small' ? 32 : 38;
  const eyes = mood === 'sleepy'
    ? <><path d="M46 58 q6 5 12 0" stroke="#1f2a5a" strokeWidth="3" fill="none" strokeLinecap="round" /><path d="M64 58 q6 5 12 0" stroke="#1f2a5a" strokeWidth="3" fill="none" strokeLinecap="round" /></>
    : <><circle cx="52" cy="58" r="5" fill="#1f2a5a" /><circle cx="70" cy="58" r="5" fill="#1f2a5a" /><circle cx="54" cy="56" r="1.6" fill="#fff" /><circle cx="72" cy="56" r="1.6" fill="#fff" /></>;
  const mouth = mood === 'hungry' ? <ellipse cx="61" cy="74" rx="6" ry="5" fill="#1f2a5a" /> : mood === 'happy' ? <path d="M52 70 q9 9 18 0" stroke="#1f2a5a" strokeWidth="3" fill="none" strokeLinecap="round" /> : <path d="M56 73 h10" stroke="#1f2a5a" strokeWidth="3" strokeLinecap="round" />;
  return <svg viewBox="0 0 120 120" aria-hidden="true" className="bn-art">
    {stage === 'grown' && <path d="M24 64 q-14 -10 -6 -26 q8 12 16 14 z M98 64 q14 -10 6 -26 q-8 12 -16 14 z" fill="#9fc4ff" />}
    <circle cx="61" cy="64" r={size} fill="url(#bn-body)" />
    <defs><radialGradient id="bn-body" cx=".38" cy=".32"><stop offset="0" stopColor="#c9dcff" /><stop offset="1" stopColor="#6f8cff" /></radialGradient></defs>
    {stage !== 'baby' && <><line x1="61" y1={64 - size} x2="61" y2={52 - size} stroke="#6f8cff" strokeWidth="3" /><circle cx="61" cy={50 - size} r="5" fill="#ffd166" /></>}
    {eyes}{mouth}
    <circle cx="44" cy="68" r="4" fill="#ff9fb2" opacity=".7" /><circle cx="78" cy="68" r="4" fill="#ff9fb2" opacity=".7" />
    {mood === 'sleepy' && <text x="90" y="34" fontSize="16" fill="#9fb0d8" fontWeight="700">z z</text>}
  </svg>;
}

export function BabyNibi({ correct, reviewDue, playsToday, feedTo }: { correct: number; reviewDue: any[]; playsToday: number; feedTo: string | null }) {
  const s = nibiState(correct, reviewDue.length, playsToday);
  return <section className={`panel bn bn-${s.mood}`} aria-label="Bebek Nibi">
    <div className={`bn-pet bn-${s.stage.key}`}><Creature stage={s.stage.key} mood={s.mood} /></div>
    <div className="bn-text">
      <span className="bn-kicker">{s.stage.name}</span>
      <p className="bn-line">{s.line}</p>
      <small className="bn-grow">{s.toNext == null ? `${s.correct} doğru cevapla kocaman oldu.` : `Büyümesine ${s.toNext} doğru cevap kaldı · şimdiye kadar ${s.correct} doğru`}</small>
    </div>
    {s.mood === 'hungry' && feedTo && <Link className="primary bn-feed" to={feedTo}>Tekrarla besle</Link>}
  </section>;
}
