import { useEffect, useRef, useState } from 'react';
import './eval-timer.css';

/** S037: seconds counter for an evaluation. start() when the first request goes out, stop() when the last returns. */
export function useStopwatch() {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [final, setFinal] = useState<number | null>(null);
  const timer = useRef<number | null>(null); const t0 = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);
  const start = () => { const t = performance.now(); t0.current = t; setStartedAt(t); setElapsed(0); setFinal(null); if (timer.current) window.clearInterval(timer.current); timer.current = window.setInterval(() => setElapsed(performance.now() - t), 100); };
  const stop = () => { if (timer.current) window.clearInterval(timer.current); timer.current = null; const ms = t0.current === null ? 0 : performance.now() - t0.current; t0.current = null; setFinal(ms); setStartedAt(null); return ms; };
  const reset = () => { if (timer.current) window.clearInterval(timer.current); timer.current = null; t0.current = null; setStartedAt(null); setElapsed(0); setFinal(null); };
  return { running: startedAt !== null, elapsed, final, start, stop, reset };
}

export const seconds = (ms: number) => `${(ms / 1000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} sn`;

/** Live while running ("Değerlendiriliyor · 3,4 sn · 120 / 240 öğrenci"), then "Değerlendirildi · 2,4 sn". */
export function EvalTimer({ watch, done, total, unit = 'öğrenci' }: { watch: ReturnType<typeof useStopwatch>; done?: number; total?: number; unit?: string }) {
  if (!watch.running && watch.final === null) return null;
  const pct = total && done !== undefined ? Math.min(100, Math.round(100 * Number(done || 0) / total)) : null;
  return <div className={`eval-timer ${watch.running ? 'is-running' : 'is-done'}`} role="status" aria-live="polite">
    <span className="et-clock" aria-hidden="true">{watch.running ? <svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 2h6" /></svg> : '✓'}</span>
    <span className="et-text"><b>{watch.running ? 'Değerlendiriliyor' : 'Değerlendirildi'}</b>
      <span className="et-time">{seconds(watch.running ? watch.elapsed : watch.final || 0)}</span>
      {total && done !== undefined ? <span className="et-count">{Number(done || 0).toLocaleString('tr-TR')} / {Number(total).toLocaleString('tr-TR')} {unit}</span> : null}</span>
    {watch.running && <span className="et-bar" aria-hidden="true"><i style={{ width: pct === null ? '35%' : `${pct}%` }} className={pct === null ? 'et-indef' : ''} /></span>}
  </div>;
}
