import { BookHeart, TrendingDown, TrendingUp } from 'lucide-react';

/** Small cards inside Nibiru's answers (owner, 24 Nov 2026): parents read numbers from pictures more easily than prose. */
export type NibiruCard =
  | { type: 'RESULT'; title: string; date: string | null; net: number | null; percent: number | null; delta: number | null; trend: number[] }
  | { type: 'TOPICS'; items: { subject: string; title: string; percent: number }[] }
  | { type: 'GUIDE'; items: { id: string; title: string; body: string; url: string | null }[] };

const tr = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 120, h = 36, min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => [Math.round((i / (values.length - 1)) * (w - 8)) + 4, Math.round(h - 4 - ((v - min) / span) * (h - 8))]);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return <svg className="nbx-spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={`Son ${values.length} sınavın neti: ${values.map(tr).join(', ')}`}>
    <path d={d} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx={lx} cy={ly} r="4" fill="currentColor"/>
  </svg>;
}

export function NibiruCards({ cards }: { cards?: NibiruCard[] }) {
  if (!cards?.length) return null;
  return <div className="nbx-cards">{cards.map((c, k) => {
    if (c.type === 'RESULT') {
      const up = c.delta != null && c.delta >= 0;
      return <div key={k} className="nbx-card result">
        <div className="nbx-card-top"><span>{c.title}</span>{c.date && <small>{new Date(c.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}</small>}</div>
        <div className="nbx-card-row">
          <div><strong>{c.net != null ? tr(c.net) : '—'}</strong><small>net{c.percent != null ? ` · %${c.percent} başarı` : ''}</small></div>
          {c.delta != null && <span className={`nbx-delta ${up ? 'up' : 'down'}`}>{up ? <TrendingUp size={15}/> : <TrendingDown size={15}/>}{up ? '+' : ''}{tr(c.delta)}</span>}
          <Spark values={c.trend}/>
        </div>
      </div>;
    }
    if (c.type === 'TOPICS') return <div key={k} className="nbx-card topics">
      <div className="nbx-card-top"><span>Desteğe ihtiyaç duyulan konular</span></div>
      {c.items.map((t, i) => <div key={i} className="nbx-topic"><div><b>{t.subject}</b> · {t.title}</div><div className="nbx-bar-track" role="img" aria-label={`%${t.percent} başarı`}><i style={{ width: `${Math.max(4, Math.min(100, t.percent))}%` }} className={t.percent < 40 ? 'low' : t.percent < 70 ? 'mid' : 'ok'}/></div><small>%{t.percent}</small></div>)}
    </div>;
    return <div key={k} className="nbx-card guide">
      <div className="nbx-card-top"><span><BookHeart size={15}/> Rehber öğretmen onaylı</span></div>
      {c.items.map((g) => <details key={g.id}><summary>{g.title}</summary><p>{g.body}</p>{g.url && <a href={g.url} target="_blank" rel="noreferrer">Devamını oku</a>}</details>)}
    </div>;
  })}</div>;
}
