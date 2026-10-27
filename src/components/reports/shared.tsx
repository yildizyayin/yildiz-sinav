import type { ReactNode } from 'react';

/** S034 shared pieces of the ANUNEX report family. The bundle comes from /operations/toplu/bundle. */
export type Bundle = any;
export type Inst = any;
export type ScoreType = { key: string; label: string; isScore: boolean };
export type Col = { key: string; name: string; group: string; q: number };

const num = (x: unknown) => (x == null || x === '' || Number.isNaN(Number(x)) ? null : Number(x));
export const f2 = (x: unknown) => { const v = num(x); return v == null ? '—' : v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
export const f1 = (x: unknown) => { const v = num(x); return v == null ? '—' : v.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); };
export const f0 = (x: unknown) => { const v = num(x); return v == null ? '—' : Math.round(v).toLocaleString('tr-TR'); };
export const fScore = (t: ScoreType, x: unknown) => (t.isScore ? (num(x) == null ? '—' : Number(x).toLocaleString('tr-TR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })) : f2(x));
export const rank = (r?: number, c?: number) => (r ? `${r}/${c}` : '—');
export const pctOf = (net: number, q: number) => (q > 0 ? Math.max(0, Math.round((100 * Math.max(0, Number(net) || 0)) / q)) : 0);
export const cmp = (v: unknown, ref: unknown) => { const a = num(v), b = num(ref); if (a == null || b == null || Math.abs(a - b) < 0.005) return ''; return a > b ? 'rx-good' : 'rx-bad'; };
export const Arrow = ({ v, ref }: { v: unknown; ref: unknown }) => { const c = cmp(v, ref); return c ? <span className={`rx-arrow ${c}`}>{c === 'rx-good' ? '▲' : '▼'}</span> : null; };
export const short = (s: string) => String(s || '').replace(/^(TYT|AYT|LGS)\s+/i, '');
export function chunk<T>(list: T[], size: number): T[][] { const out: T[][] = []; for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size)); return out.length ? out : [[]]; }
export const examLabel = (e: any) => `${e.academic_year ? `${e.academic_year} · ` : ''}${e.publisher_name ? `${e.publisher_name} · ` : ''}${e.title}`;
export const heat = (p: number) => { const x = Math.max(0, Math.min(100, p)); if (x >= 75) return '#CDEBDC'; if (x >= 50) return '#E6F4EC'; if (x >= 35) return '#FFF1D6'; return '#FCDCD3'; };
export const heatBar = (p: number) => (p >= 75 ? '#2E9E6B' : p >= 50 ? '#7BC59E' : p >= 35 ? '#F2B44C' : '#E06A4F');

/** Columns of a list: sub-tests (NET) or whole tests (TEST). */
export function columnsOf(b: Bundle, mode: 'NET' | 'TEST'): Col[] {
  return mode === 'NET' ? b.columns.map((c: any) => ({ key: c.key, name: c.name, group: c.group, q: c.q })) : b.tests.map((t: any) => ({ key: t.id, name: t.name, group: t.name, q: t.questionCount }));
}
export const valueOf = (mode: 'NET' | 'TEST', s: any, key: string) => (mode === 'NET' ? s.cols?.[key] : s.tests?.[key]);
export const avgOf = (mode: 'NET' | 'TEST', a: any, key: string) => (mode === 'NET' ? a?.cols?.[key] : a?.tests?.[key]);

export function Page({ land = true, kicker, title, sub, chips, provisional, children }: { land?: boolean; kicker: string; title: string; sub: ReactNode; chips?: Array<[string, ReactNode]>; provisional?: boolean; children: ReactNode }) {
  return <section className={`rx-page ${land ? 'rx-land' : 'rx-port'}`}>
    <header className="rx-head"><div className="rx-head-l"><img className="rx-mark" src="/app-icon.svg" alt="" /><div><div className="rx-kicker">{kicker}</div><div className="rx-title">{title}</div><div className="rx-sub">{sub}</div></div></div>
      {chips && <div className="rx-chips">{chips.map(([k, v]) => <div className="rx-chip" key={k}><span>{k}</span><b>{v}</b></div>)}</div>}</header>
    <div className="rx-body">{children}</div>
    <footer className="rx-foot"><span>ANUNEX Sonuç Ağı · Bilginin yörüngesinde · {new Date().toLocaleDateString('tr-TR')}</span>{provisional && <span className="rx-warn">İlçe, il ve genel sıralar sonuçlar yayınlanana kadar geçicidir.</span>}<span className="rx-pn" /></footer>
  </section>;
}

export const instSub = (b: Bundle, inst: Inst, extra?: ReactNode) => <><b>{inst.name}</b> · {inst.city} / {inst.district} · {examLabel(b.exam)}{extra}</>;
export const participationChips = (inst: Inst): Array<[string, ReactNode]> => [['Okul', f0(inst.counts.school.students)], ['İlçe', f0(inst.counts.district.students)], ['İl', f0(inst.counts.city.students)], ['Genel', f0(inst.counts.general.students)]];

/** Grouped vertical bars (success % per test, a few series). */
export function GroupedBars({ groups, series, height = 46, unit = '%' }: { groups: string[]; series: Array<{ label: string; color: string; values: number[] }>; height?: number; unit?: string }) {
  const W = 1000, H = 300, padL = 34, padB = 34, max = unit === '%' ? 100 : Math.max(1, ...series.flatMap((s) => s.values)) * 1.1;
  const gw = (W - padL) / Math.max(1, groups.length), bw = Math.min(26, (gw * 0.8) / Math.max(1, series.length));
  const y = (v: number) => H - padB - ((H - padB - 8) * Math.max(0, v)) / max;
  return <div><svg className="rx-chart" viewBox={`0 0 ${W} ${H}`} style={{ height: `${height}mm` }} preserveAspectRatio="none">
    {[0, 0.25, 0.5, 0.75, 1].map((t) => <g key={t}><line x1={padL} x2={W} y1={y(max * t)} y2={y(max * t)} stroke="#DCE6F8" strokeWidth={1} /><text x={padL - 6} y={y(max * t) + 4} fontSize={12} textAnchor="end" fill="#5B6B8C">{Math.round(max * t)}</text></g>)}
    {groups.map((g, gi) => { const x0 = padL + gi * gw + (gw - bw * series.length) / 2; return <g key={g + gi}>
      {series.map((s, si) => <rect key={si} x={x0 + si * bw} y={y(s.values[gi] || 0)} width={bw - 2} height={Math.max(0, H - padB - y(s.values[gi] || 0))} rx={2} fill={s.color} />)}
      <text x={padL + gi * gw + gw / 2} y={H - padB + 16} fontSize={groups.length > 12 ? 10 : 12} textAnchor="middle" fill="#07143F">{g.length > 12 ? g.slice(0, 11) + '…' : g}</text></g>; })}
  </svg><div className="rx-legend">{series.map((s) => <span key={s.label}><i style={{ background: s.color }} />{s.label}</span>)}</div></div>;
}

/** Horizontal bars, sorted, with reference lines (ilçe / il / genel). */
export function HBars({ rows, refs = [], height }: { rows: Array<{ label: string; value: number | null; me?: boolean }>; refs?: Array<{ label: string; value: number | null; color: string }>; height?: number }) {
  const vals = [...rows.map((r) => r.value || 0), ...refs.map((r) => r.value || 0)];
  const max = Math.max(1, ...vals) * 1.05, W = 600, rowH = 20, padL = 150, H = rows.length * rowH + 18;
  const x = (v: number) => padL + ((W - padL - 60) * Math.max(0, v)) / max;
  return <div><svg className="rx-chart" viewBox={`0 0 ${W} ${H}`} style={{ height: height ? `${height}mm` : undefined }}>
    {rows.map((r, i) => <g key={r.label + i}><text x={padL - 8} y={i * rowH + 15} fontSize={12} textAnchor="end" fill="#07143F" fontWeight={r.me ? 800 : 500}>{r.label.length > 24 ? r.label.slice(0, 23) + '…' : r.label}</text>
      <rect x={padL} y={i * rowH + 4} width={Math.max(0, x(r.value || 0) - padL)} height={rowH - 8} rx={3} fill={r.me ? '#2563EB' : '#A9C4F5'} />
      <text x={x(r.value || 0) + 6} y={i * rowH + 15} fontSize={11} fill="#07143F">{r.value == null ? '—' : Number(r.value).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}</text></g>)}
    {refs.filter((r) => r.value != null).map((r, i) => <g key={r.label}><line x1={x(r.value!)} x2={x(r.value!)} y1={0} y2={H - 14} stroke={r.color} strokeWidth={2} strokeDasharray="5 4" /><text x={x(r.value!) + (i % 2 ? 4 : -4)} y={H - 2} fontSize={11} textAnchor={i % 2 ? 'start' : 'end'} fill={r.color}>{r.label}</text></g>)}
  </svg></div>;
}

export function TopicBar({ p, ref }: { p: number; ref?: number | null }) {
  return <><div className="rx-bar"><i style={{ width: `${Math.max(2, p)}%`, background: heatBar(p) }} />{ref != null && <em style={{ left: `${Math.min(99, ref)}%` }} />}</div><b className="rx-pc">%{p}</b></>;
}

/** Topic analysis in columns, grouped by test and sub-test, each with success bar and the general average mark. */
export function TopicColumns({ b, topics, general, maxRows = 999, counts = false }: { b: Bundle; topics: any[]; general?: any[]; maxRows?: number; counts?: boolean }) {
  const genBy = new Map((general || []).map((t: any) => [`${t.subjectId}|${t.section}|${t.topic}`, t.p]));
  const subjects = b.tests as any[];
  let rows = 0;
  return <div className="rx-topics">{subjects.map((s) => {
    const list = topics.filter((t) => t.subjectId === s.id); if (!list.length || rows > maxRows) return null;
    const sections = [...new Set(list.map((t) => t.section))];
    return <div key={s.id}><div className="rx-tg-h"><span>{s.name}</span><span className="rx-small">Soru · D · Y · Başarı</span></div>
      {sections.map((sec) => <div key={String(sec)}>{sec && <div className="rx-tg-s">{sec}</div>}{list.filter((t) => t.section === sec).map((t) => { rows++; return <div className="rx-tr" key={t.topic}><span className="rx-tt" style={{ textAlign: 'left' }} title={t.topic}>{t.topic}</span><span>{t.s}</span><span>{counts ? t.d : f1(t.d)}</span><span>{counts ? t.y : f1(t.y)}</span><TopicBar p={t.p} ref={genBy.get(`${t.subjectId}|${t.section}|${t.topic}`) as number | undefined} /></div>; })}</div>)}</div>;
  })}</div>;
}

export function Nibiru({ title, lines }: { title?: string; lines: string[] }) {
  if (!lines.length) return null;
  return <div className="rx-nibiru"><div className="rx-orb" /><div><h4>Nibiru önerisi<small>{title || 'yalnız bu sınavın kayıtlı sonuçlarından'}</small></h4><ul>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul></div></div>;
}
