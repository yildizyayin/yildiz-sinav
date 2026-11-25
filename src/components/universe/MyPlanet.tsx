import { useMemo } from 'react';
import './my-planet.css';

/**
 * Benim Gezegenim (owner, 25 Nov 2026). The student's planet as the server works it out from their own graded answers:
 * one region per subject, one growing thing per correct answer, a seed for each wrong answer still waiting for its
 * review. Every piece names its kazanım (hover / long-press title, and the "son filizlenenler" list), so the planet
 * always says what it was earned on. Drawn in SVG; it turns slowly unless the student prefers reduced motion.
 */
type Piece = { kind: string; outcomeCode: string | null; outcomeTitle: string };
type Region = { subjectId: string | null; name: string; pieces: Piece[]; total: number; seeds: number; outcomes: number };
export type PlanetData = { regions: Region[]; total: number; seeds: number };

const COLORS = ['#5aa8ff', '#3ee08f', '#ffb36b', '#b69cff', '#ff8fb1', '#7ee0f0'];
const C = 240, R = 140;
const NAMES: Record<string, string> = { tree: 'ağaç', mountain: 'dağ', wave: 'dalga', house: 'ev', flower: 'çiçek', crystal: 'kristal' };

function Shape({ kind }: { kind: string }) {
  if (kind === 'tree') return <g><rect x={-2} y={-10} width={4} height={10} fill="#6b4423" /><path d="M0 -34 L11 -10 L-11 -10 Z" fill="#2fb67a" /><path d="M0 -42 L8 -24 L-8 -24 Z" fill="#5fe0a3" /></g>;
  if (kind === 'mountain') return <g><path d="M-16 0 L-2 -30 L12 0 Z" fill="#c98a52" /><path d="M-6 -21 L-2 -30 L2 -21 L-2 -18 Z" fill="#fff" /><path d="M2 0 L12 -18 L20 0 Z" fill="#a86c3c" /></g>;
  if (kind === 'wave') return <g><path d="M-16 -4 q4 -10 8 0 t8 0 t8 0 t8 0" fill="none" stroke="#bfe6ff" strokeWidth={3} strokeLinecap="round" /><circle cx={4} cy={-14} r={3} fill="#fff" /></g>;
  if (kind === 'house') return <g><rect x={-9} y={-14} width={18} height={14} fill="#f3ead6" /><path d="M-12 -14 L0 -25 L12 -14 Z" fill="#ff6b7d" /><rect x={-2} y={-8} width={5} height={8} fill="#6b4423" /></g>;
  if (kind === 'crystal') return <g><path d="M0 -28 L7 -12 L0 0 L-7 -12 Z" fill="#b69cff" /><path d="M0 -28 L7 -12 L0 -10 Z" fill="#e2d6ff" /></g>;
  return <g><rect x={-1} y={-12} width={2} height={12} fill="#2fb67a" />{[0, 1, 2, 3, 4].map((k) => <circle key={k} cx={Math.cos(k * 1.256) * 4} cy={-14 + Math.sin(k * 1.256) * 4} r={3} fill="#ffd166" />)}<circle cx={0} cy={-14} r={2.5} fill="#ff8a3d" /></g>;
}
const at = (deg: number, r: number) => { const a = ((deg - 90) * Math.PI) / 180; return [C + Math.cos(a) * r, C + Math.sin(a) * r]; };

export function MyPlanet({ data, group = 'B' }: { data?: PlanetData | null; group?: string }) {
  const regions = data?.regions || [];
  const span = 360 / Math.max(1, regions.length);
  const placed = useMemo(() => regions.map((g, i) => {
    const from = i * span, n = g.pieces.length;
    return { g, i, from, color: COLORS[i % COLORS.length], pieces: g.pieces.map((p, k) => ({ p, deg: from + ((k + 0.5) * span) / Math.max(n, 1) })) };
  }), [regions, span]);
  const total = data?.total || 0;
  const level = 1 + Math.floor(total / 6);
  const recent = regions.flatMap((g) => g.pieces.slice(-2).map((p) => ({ ...p, region: g.name }))).slice(-4).reverse();
  return <section className="mp" data-group={group} aria-labelledby="mp-title">
    <div className="mp-stage">
      <svg viewBox="0 0 480 480" role="img" aria-label={total ? `Gezegenin: ${total} parça, ${regions.length} bölge` : 'Gezegenin henüz boş'}>
        <defs>
          <radialGradient id="mp-pl" cx=".38" cy=".32" r=".75"><stop offset="0" stopColor="#9fe7ff" /><stop offset=".35" stopColor="#3b7be0" /><stop offset=".8" stopColor="#1a2e7a" /><stop offset="1" stopColor="#0c1440" /></radialGradient>
          <radialGradient id="mp-atm" cx=".5" cy=".5" r=".5"><stop offset=".78" stopColor="rgba(120,190,255,0)" /><stop offset=".9" stopColor="rgba(120,190,255,.35)" /><stop offset="1" stopColor="rgba(120,190,255,0)" /></radialGradient>
          <radialGradient id="mp-shade" cx=".7" cy=".72" r=".7"><stop offset=".45" stopColor="rgba(0,0,20,0)" /><stop offset="1" stopColor="rgba(0,0,20,.55)" /></radialGradient>
        </defs>
        <circle cx={C} cy={C} r={190} fill="url(#mp-atm)" />
        <g className="mp-spin">
          <circle cx={C} cy={C} r={R} fill="url(#mp-pl)" />
          {placed.map(({ g, i, from, color }) => { const [x0, y0] = at(from, R), [x1, y1] = at(from + span, R), [a0, b0] = at(from, R - 6), [a1, b1] = at(from + span, R - 6), big = span > 180 ? 1 : 0;
            return <g key={g.name}>{regions.length > 1 && <path d={`M${C} ${C} L${x0} ${y0} A${R} ${R} 0 ${big} 1 ${x1} ${y1} Z`} fill={color} opacity={0.14} />}
              <path d={regions.length > 1 ? `M${a0} ${b0} A${R - 6} ${R - 6} 0 ${big} 1 ${a1} ${b1}` : `M${C} ${C - R + 6} A${R - 6} ${R - 6} 0 1 1 ${C - 0.1} ${C - R + 6}`} fill="none" stroke={color} strokeWidth={6} opacity={0.55} strokeLinecap="round" data-region={i} /></g>; })}
          {placed.map(({ g, pieces }) => pieces.map(({ p, deg }, k) => { const [x, y] = at(deg, R); return <g key={`${g.name}-${k}`} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${deg.toFixed(1)})`}><g className="mp-grow" style={{ animationDelay: `${Math.min(k, 20) * 40}ms` }}><title>{`${p.outcomeCode ? `${p.outcomeCode} · ` : ''}${p.outcomeTitle}`}</title><Shape kind={p.kind} /></g></g>; }))}
          {placed.map(({ g, from }) => Array.from({ length: Math.min(g.seeds, 8) }, (_, k) => { const [x, y] = at(from + 6 + k * 5, R - 16); return <circle key={`${g.name}-s${k}`} cx={x} cy={y} r={3.2} fill="#8a5a2b" stroke="#d9b07a" strokeWidth={1}><title>Tohum: tekrarını bekleyen bir soru</title></circle>; }))}
        </g>
        <circle cx={C} cy={C} r={R} fill="url(#mp-shade)" pointerEvents="none" />
        <ellipse cx={C} cy={248} rx={215} ry={44} fill="none" stroke="rgba(255,209,102,.55)" strokeWidth={3} transform="rotate(-12 240 248)" />
        {total >= 6 && <circle cx={420} cy={90} r={18} fill="#e8ecf8" />}
      </svg>
    </div>
    <div className="mp-side">
      <h2 id="mp-title">Benim Gezegenim</h2>
      <p className="mp-lead">{total ? `Seviye ${level} · ${total} parça. Her doğru cevap, kazanımının dersine bir şey ekler.` : 'Gezegenin seni bekliyor. İlk doğru cevabınla dersinin bölgesinde bir şey filizlenecek.'}</p>
      {data && data.seeds > 0 && <p className="mp-seeds">{data.seeds} tohum toprakta: yanlış yaptığın sorular tekrarda doğru olunca filizlenecek.</p>}
      {regions.length > 0 && <ul className="mp-regions">{placed.map(({ g, color }) => <li key={g.name}><i style={{ background: color }} /><b>{g.name}</b><span>{g.total} parça · {g.outcomes} kazanım{g.seeds ? ` · ${g.seeds} tohum` : ''}</span></li>)}</ul>}
      {recent.length > 0 && <div className="mp-recent"><span>Son filizlenenler</span><ul>{recent.map((p, k) => <li key={k}><b>{NAMES[p.kind] || 'parça'}</b> · {p.outcomeCode ? `${p.outcomeCode} ` : ''}{p.outcomeTitle}</li>)}</ul></div>}
    </div>
  </section>;
}
