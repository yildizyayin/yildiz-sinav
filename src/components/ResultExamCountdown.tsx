import { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';

/**
 * LGS/YKS sayacı (owner, 30 Oct): only 8th graders (LGS) and 12th graders (YKS) see it, on the sonuc student panel.
 * The date comes from the Super Admin's record with its source; an unannounced date is said plainly, never guessed.
 * Turkey is UTC+3 all year, so the exam moment is fixed in that offset. Without a session time the count runs to the
 * start of the exam day and says so.
 */
export type Countdown = { code: 'LGS' | 'YKS'; title: string; date: string | null; time: string | null; status: 'PENDING' | 'OFFICIAL'; sourceLabel: string | null; sourceUrl: string | null };

export function targetOf(c: Pick<Countdown, 'date' | 'time'>): number | null {
  if (!c.date) return null;
  const t = Date.parse(`${c.date}T${c.time || '00:00'}:00+03:00`);
  return Number.isFinite(t) ? t : null;
}
export function partsUntil(target: number, now: number) {
  const ms = Math.max(0, target - now), s = Math.floor(ms / 1000);
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60, done: ms === 0 };
}
const longDate = (date: string) => new Date(`${date}T12:00:00+03:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long', timeZone: 'Europe/Istanbul' });
const pad = (n: number) => String(n).padStart(2, '0');

export function ResultExamCountdown({ countdown }: { countdown: Countdown | null | undefined }) {
  const target = countdown ? targetOf(countdown) : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!target) return; const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, [target]);
  if (!countdown) return null;
  const name = countdown.code === 'LGS' ? 'LGS' : 'YKS';
  if (!target) return <section className="sr-countdown sr-countdown-pending" aria-labelledby="sr-cd-title">
    <div className="sr-cd-head"><CalendarClock aria-hidden="true" /><div><span className="sr-cd-kicker">{countdown.title}</span><h3 id="sr-cd-title">{name} tarihi henüz açıklanmadı</h3></div></div>
    <p className="sr-cd-note">{countdown.code === 'LGS' ? 'MEB' : 'ÖSYM'} sınav tarihini açıkladığında geri sayım burada başlayacak.</p>
  </section>;
  const p = partsUntil(target, now);
  if (p.done && now - target > 2 * 86400_000) return null;
  const units: Array<[number, string]> = [[p.days, 'gün'], [p.hours, 'saat'], [p.minutes, 'dakika'], [p.seconds, 'saniye']];
  return <section className="sr-countdown" aria-labelledby="sr-cd-title" data-exam={countdown.code}>
    <div className="sr-cd-head"><CalendarClock aria-hidden="true" /><div><span className="sr-cd-kicker">{countdown.title}</span><h3 id="sr-cd-title">{p.done ? `${name} günü geldi. Başarılar!` : `${name}'ye kalan süre`}</h3></div></div>
    {!p.done && <>
      {/* screen readers get one sentence that changes once a day, not every second */}
      <p className="sr-only">{`${name} için ${p.days} gün kaldı.`}</p>
      <div className="sr-cd-units" aria-hidden="true">{units.map(([v, label], i) => <div key={label} className={`sr-cd-unit ${i === 0 ? 'is-days' : ''}`}><strong>{i === 0 ? v.toLocaleString('tr-TR') : pad(v)}</strong><small>{label}</small></div>)}</div>
    </>}
    <p className="sr-cd-meta"><span>{longDate(countdown.date!)}{countdown.time ? ` · ${countdown.time}` : ''}</span>{!countdown.time && !p.done && <span className="sr-cd-dim">Oturum saati açıklanınca eklenecek; sayaç sınav gününün başlangıcına göre.</span>}
      {countdown.sourceLabel && <span className="sr-cd-dim">Kaynak: {countdown.sourceUrl ? <a href={countdown.sourceUrl} target="_blank" rel="noreferrer">{countdown.sourceLabel}</a> : countdown.sourceLabel}</span>}</p>
  </section>;
}
