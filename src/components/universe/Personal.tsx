import { useState } from 'react';
import { api } from '../../api';
import './mastery.css';

/**
 * Kendi hedefin ve "Ne öğrendim?" (owner, 26 Nov 2026: bireysel ilerleme). The student picks their own daily goal and
 * says, with one tap, how a play went for them; both only ever change the student's own plan.
 */
export type Goal = { plays: number | null; done: number; reached: boolean };
const GOALS: Array<[number, string]> = [[1, '1 oyun · ~5 dk'], [2, '2 oyun · ~10 dk'], [3, '3 oyun · ~15 dk']];

export function DailyGoalCard({ goal: initial }: { goal?: Goal | null }) {
  const [goal, setGoal] = useState<Goal | null>(initial || null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  if (!goal) return null;
  const choose = async (plays: number) => {
    setError('');
    try { const r = await api<any>('/api/student-standard/universe/goal', { method: 'POST', body: JSON.stringify({ plays }) }); setGoal({ plays: r.plays, done: r.done, reached: r.reached }); setEditing(false); }
    catch (e: any) { setError(e.message); }
  };
  const pct = goal.plays ? Math.min(100, Math.round((goal.done / goal.plays) * 100)) : 0;
  return <section className="panel ms-goal" aria-labelledby="ms-goal-title">
    <div className="ms-head"><h2 id="ms-goal-title">Bugünkü hedefin</h2>{goal.plays && !editing && <button type="button" className="ghost" onClick={() => setEditing(true)}>Hedefini değiştir</button>}</div>
    {(!goal.plays || editing) ? <>
      <p className="muted" style={{ margin: 0 }}>Bugün ne kadar çalışmak istersin? Hedefini sen seç; tutturamadığın gün hiçbir şey kaybetmezsin.</p>
      <div className="ms-goal-pick" role="group" aria-label="Günlük hedef">{GOALS.map(([n, label]) => <button key={n} type="button" className={goal.plays === n ? 'on' : ''} aria-pressed={goal.plays === n} onClick={() => void choose(n)}>{label}</button>)}</div>
    </> : <div className="ms-goal-row">
      <span className="ms-ring" style={{ ['--p' as any]: pct }} aria-hidden="true"><b>{Math.min(goal.done, goal.plays)}/{goal.plays}</b></span>
      <span>{goal.reached ? 'Bugünkü hedefini tamamladın! İstersen devam edebilirsin, istersen dinlen.' : `${goal.plays - goal.done} oyun daha. Kendi hızında.`}</span>
    </div>}
    {error && <div className="alert error">{error}</div>}
  </section>;
}

const REFLECT: Array<[string, string, string]> = [
  ['EASY', 'Kolaydı', 'Harika! Bir dahaki sefere bu kazanımda biraz daha zor sorular getireceğim.'],
  ['HARD', 'Biraz zorlandım', 'Anladım. Bir dahakine biraz daha kolay başlayıp adım adım ilerleyeceğiz.'],
  ['AGAIN', 'Tekrar etmeliyim', 'Tamam, bu kazanımı yakında tekrar olarak önereceğim.'],
];
export function Reflection({ sessionId, initial }: { sessionId: string; initial?: string | null }) {
  const [value, setValue] = useState<string | null>(initial || null);
  const [error, setError] = useState('');
  const pick = async (v: string) => {
    setError('');
    try { await api(`/api/student-standard/universe/sessions/${encodeURIComponent(sessionId)}/reflection`, { method: 'POST', body: JSON.stringify({ value: v }) }); setValue(v); }
    catch (e: any) { setError(e.message); }
  };
  const said = REFLECT.find((r) => r[0] === value);
  return <div className="ms-reflect">
    <span className="ms-tag">Ne öğrendim?</span>
    <span>Bu oyun senin için nasıldı?</span>
    <div className="ms-reflect-pick" role="group" aria-label="Bu oyun senin için nasıldı?">{REFLECT.map(([k, label]) => <button key={k} type="button" className={value === k ? 'on' : ''} aria-pressed={value === k} onClick={() => void pick(k)}>{label}</button>)}</div>
    {said && <span className="ms-reflect-said" aria-live="polite">{said[2]}</span>}
    {error && <span className="ms-reflect-err" role="alert">{error}</span>}
  </div>;
}

export function GoalLine({ goal }: { goal?: Goal | null }) {
  if (!goal?.plays) return null;
  return <span className="ms-goal-line">{goal.reached ? `Bugünkü hedefin tamam: ${goal.done}/${goal.plays} oyun.` : `Bugünkü hedefin: ${goal.done}/${goal.plays} oyun.`}</span>;
}
