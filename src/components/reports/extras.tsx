import { type ReactElement } from 'react';
import { chunk, examLabel, f0, f2, heat, instSub, Page, participationChips, short, type Bundle, type Inst } from './shared';

/** S034 extra reports chosen by the owner: madde (item) analysis, branş (subject teacher) report, konu eksik list, gelişim. */
const OPTS = ['A', 'B', 'C', 'D', 'E'];

export function MaddeAnalizi({ b, inst }: { b: Bundle; inst: Inst }) {
  const items = inst.items as any[];
  const testName = new Map((b.tests as any[]).map((t) => [t.id, short(t.name)]));
  const pages = chunk(items, 34);
  return <>{pages.map((rows, pi) => <Page key={pi} kicker={`Madde analizi${pages.length > 1 ? ` ${pi + 1}/${pages.length}` : ''}`} title="Soru Bazında Başarı" sub={instSub(b, inst)} chips={participationChips(inst)} provisional={b.provisional}>
    <table className="rx-t"><thead><tr><th className="rx-l">Test</th><th>Soru</th><th>Cevap</th><th className="rx-l">Kazanım / konu</th><th className="rx-sep">Okul</th><th>Genel</th><th>Fark</th>{OPTS.map((o) => <th key={o} className={o === 'A' ? 'rx-sep' : ''}>{o}</th>)}<th>Boş</th><th className="rx-sep rx-l">En çok seçilen yanlış</th></tr></thead>
      <tbody>{rows.map((q, i) => { const diff = q.school.p - q.general.p, n = q.school.n || 1; const prev = rows[i - 1];
        return <tr key={q.id} style={diff <= -15 ? { background: '#FFF4F1' } : undefined}>
          <td className="rx-l">{!prev || prev.subjectId !== q.subjectId || prev.section !== q.section ? <b>{q.section || testName.get(q.subjectId)}</b> : ''}</td><td>{q.no}</td><td><b>{q.key}</b></td><td className="rx-l rx-name" style={{ maxWidth: '80mm', fontWeight: 500 }} title={q.topic}>{q.topic}</td>
          <td className="rx-sep rx-n" style={{ background: heat(q.school.p) }}>%{q.school.p}</td><td>%{q.general.p}</td><td className={diff >= 5 ? 'rx-good' : diff <= -5 ? 'rx-bad' : ''}>{diff > 0 ? '+' : ''}{diff}</td>
          {OPTS.map((o) => { const share = Math.round((100 * (q.school.dist[o] || 0)) / n); const isKey = o === String(q.key).toUpperCase(); return <td key={o} className={o === 'A' ? 'rx-sep' : ''} style={isKey ? { background: '#E1F4EA', fontWeight: 700 } : q.topWrong?.answer === o ? { color: '#B4321C', fontWeight: 700 } : undefined}>{share ? `%${share}` : ''}</td>; })}
          <td>{q.school.dist['-'] ? `%${Math.round((100 * q.school.dist['-']) / n)}` : ''}</td>
          <td className="rx-sep rx-l">{q.topWrong ? <><b>{q.topWrong.answer}</b> · öğrencilerin %{q.topWrong.share}'i</> : '—'}</td></tr>; })}</tbody></table>
    {pi === pages.length - 1 && <p className="rx-note">Cevap anahtarındaki şık yeşil, okulda en çok seçilen yanlış şık kırmızıdır. Okul başarısı genelden 15 puan veya daha fazla düşük olan sorular açık kırmızı zeminlidir; bu soruların konusu sınıfta yeniden ele alınabilir. Şık yüzdeleri A kitapçığı sırasına göre değil, öğrencilerin işaretlediği harfe göredir.</p>}
  </Page>)}</>;
}

/** Subject teacher view: every topic's success in the school, each şube and in general (tests one after another). */
export function BransRaporu({ b, inst }: { b: Bundle; inst: Inst }) {
  const classes = inst.classes as any[];
  const genBy = new Map((b.general.topics as any[]).map((t) => [`${t.subjectId}|${t.section}|${t.topic}`, t.p]));
  const clsBy = classes.map((c) => new Map((c.topics as any[]).map((t) => [`${t.subjectId}|${t.section}|${t.topic}`, t.p])));
  type Row = { kind: 'test' | 'section' | 'topic'; label: string; t?: any };
  const rows: Row[] = [];
  for (const test of b.tests as any[]) {
    const topics = (inst.topics as any[]).filter((t) => t.subjectId === test.id); if (!topics.length) continue;
    rows.push({ kind: 'test', label: test.name });
    let sec: string | null = null;
    for (const t of topics) { if (t.section && t.section !== sec) { rows.push({ kind: 'section', label: t.section }); sec = t.section; } rows.push({ kind: 'topic', label: t.topic, t }); }
  }
  const pages: Row[][] = [[]];
  for (const r of rows) { const cur = pages[pages.length - 1]; if (cur.length >= 34) { const carry: Row[] = []; while (cur.length && cur[cur.length - 1].kind !== 'topic') carry.unshift(cur.pop()!); pages.push([...carry, r]); } else cur.push(r); }
  return <>{pages.map((list, pi) => <Page key={pi} kicker={`Branş raporu${pages.length > 1 ? ` ${pi + 1}/${pages.length}` : ''}`} title="Kazanım Başarısı · Okul ve Şubeler" sub={instSub(b, inst)} chips={participationChips(inst)} provisional={b.provisional}>
    <table className="rx-t"><thead><tr><th className="rx-l">Kazanım / konu</th><th>Soru</th><th className="rx-sep">Okul</th>{classes.map((c) => <th key={c.name}>{c.name || 'Şubesiz'}</th>)}<th className="rx-sep">Genel</th></tr></thead>
      <tbody>{list.map((r, i) => { if (r.kind !== 'topic') return <tr key={i} className="rx-ref"><td className="rx-l" colSpan={classes.length + 4} style={r.kind === 'section' ? { fontWeight: 600, color: '#2563EB', background: '#fff' } : undefined}>{r.label}</td></tr>;
        const t = r.t, k = `${t.subjectId}|${t.section}|${t.topic}`;
        return <tr key={i}><td className="rx-l rx-name" style={{ maxWidth: '110mm', fontWeight: 500 }} title={t.topic}>{t.topic}</td><td>{t.s}</td><td className="rx-sep rx-heat" style={{ background: heat(t.p) }}>%{t.p}</td>
          {clsBy.map((m, ci) => { const p = m.get(k) as number | undefined; return <td key={ci} className="rx-heat" style={{ background: p == null ? undefined : heat(p) }}>{p == null ? '—' : `%${p}`}</td>; })}
          <td className="rx-sep">{genBy.has(k) ? `%${genBy.get(k)}` : '—'}</td></tr>; })}</tbody></table>
    <div className="rx-legend-heat" style={{ marginTop: 'auto' }}>Başarı: <i style={{ background: heat(80) }} />%75+ <i style={{ background: heat(60) }} />%50–74 <i style={{ background: heat(40) }} />%35–49 <i style={{ background: heat(10) }} />%35 altı</div>
  </Page>)}</>;
}

/** Each student's five weakest topics (success under 50 %), by şube — for the class teacher and parents. */
export function KonuEksik({ b, inst }: { b: Bundle; inst: Inst }) {
  const testName = new Map((b.tests as any[]).map((t) => [t.id, short(t.name)]));
  const out: ReactElement[] = [];
  for (const c of inst.classes as any[]) {
    const students = (inst.students as any[]).filter((s) => s.className === c.name).sort((a, z) => a.name.localeCompare(z.name, 'tr'));
    chunk(students, 16).forEach((rows, pi, all) => out.push(<Page key={`${c.name}-${pi}`} kicker={`Konu eksik listesi${all.length > 1 ? ` ${pi + 1}/${all.length}` : ''}`} title={`${c.name || 'Şubesiz'} Şubesi · öncelikli kazanımlar`} sub={instSub(b, inst)} chips={[['Şube', f0(c.avg.count)]]} provisional={b.provisional}>
      <table className="rx-t"><thead><tr><th>No</th><th className="rx-l">Ad Soyad</th><th>Net</th><th className="rx-sep rx-l">En zayıf beş kazanım (başarı %50 altı, en düşükten)</th></tr></thead>
        <tbody>{rows.map((s) => { const weak = (s.topics as any[]).filter((t) => t.p < 50).sort((a, z) => a.p - z.p || z.s - a.s).slice(0, 5);
          return <tr key={s.id}><td>{s.number || ''}</td><td className="rx-l rx-name">{s.name}</td><td className="rx-n">{f2(s.total.n)}</td>
            <td className="rx-sep rx-l" style={{ whiteSpace: 'normal' }}>{weak.length ? weak.map((t, i) => <span key={i} style={{ display: 'inline-block', margin: '0 1.5mm .4mm 0', padding: '.2mm 1.2mm', borderRadius: '1mm', background: heat(t.p) }}>{t.section || testName.get(t.subjectId)}: {t.topic} <b>%{t.p}</b></span>) : <span className="rx-good">%50 altında kazanım yok</span>}</td></tr>; })}</tbody></table>
      <p className="rx-note" style={{ marginTop: 'auto' }}>Liste yalnız bu sınavın cevaplarından çıkar; tek soruluk kazanımlarda tek cevap belirleyicidir.</p>
    </Page>));
  }
  return <>{out}</>;
}

/** Gelişim: the same students across the selected exams (matched by school number, else name). */
export function Gelisim({ g }: { g: any }) {
  const exams = g.exams as any[];
  const val = (p: any) => (p ? (p.score ?? p.net) : null);
  const hasScore = (g.students as any[]).some((s) => exams.some((e) => s.points[e.id]?.score != null));
  const classes = Object.keys(g.classAvg).sort((a, z) => a.localeCompare(z, 'tr'));
  const pages = chunk(g.students as any[], 28);
  const colors = ['#07143F', '#2563EB', '#6CA8FF', '#8268FF', '#3154C5', '#A9C4F5', '#5B6B8C', '#0E7A4F'];
  const all = classes.flatMap((c) => exams.map((e) => g.classAvg[c][e.id]).filter((x: any) => x != null)) as number[];
  const min = Math.min(...all, Infinity), max = Math.max(...all, -Infinity), W = 1000, H = 220, x = (i: number) => 60 + (i * (W - 120)) / Math.max(1, exams.length - 1), y = (v: number) => H - 30 - ((H - 50) * (v - min)) / Math.max(1e-9, max - min);
  const spark = (vals: Array<number | null>) => { const v = vals.map((a, i) => [i, a] as const).filter(([, a]) => a != null) as Array<[number, number]>; if (v.length < 2) return null; const lo = Math.min(...v.map((a) => a[1])), hi = Math.max(...v.map((a) => a[1])); return <svg viewBox="0 0 60 14" style={{ width: '16mm', height: '3.6mm' }}><polyline fill="none" stroke="#2563EB" strokeWidth={1.6} points={v.map(([i, a]) => `${4 + (i * 52) / Math.max(1, exams.length - 1)},${12 - (10 * (a - lo)) / Math.max(1e-9, hi - lo)}`).join(' ')} /></svg>; };
  return <>{pages.map((rows, pi) => <Page key={pi} kicker={`Gelişim raporu${pages.length > 1 ? ` ${pi + 1}/${pages.length}` : ''}`} title="Denemeler Boyunca Gelişim" sub={<><b>{g.institution?.name}</b> · {g.institution?.city} / {g.institution?.district} · {exams.length} deneme</>}>
    {pi === 0 && classes.length > 0 && Number.isFinite(min) && <div className="rx-card"><h4>Şube ortalamaları · {hasScore ? 'puan' : 'net'}</h4>
      <svg className="rx-chart" viewBox={`0 0 ${W} ${H}`} style={{ height: '44mm' }}>{exams.map((e, i) => <text key={e.id} x={x(i)} y={H - 8} fontSize={12} textAnchor="middle" fill="#5B6B8C">{e.title.length > 24 ? e.title.slice(0, 23) + '…' : e.title}</text>)}
        {classes.slice(0, 8).map((c, ci) => { const pts = exams.map((e, i) => [i, g.classAvg[c][e.id]] as const).filter(([, v]) => v != null) as Array<[number, number]>; return <g key={c}><polyline fill="none" stroke={colors[ci]} strokeWidth={2.5} points={pts.map(([i, v]) => `${x(i)},${y(v)}`).join(' ')} />{pts.map(([i, v]) => <circle key={i} cx={x(i)} cy={y(v)} r={4} fill={colors[ci]} />)}</g>; })}</svg>
      <div className="rx-legend">{classes.slice(0, 8).map((c, i) => <span key={c}><i style={{ background: colors[i] }} />{c || 'Şubesiz'}</span>)}</div></div>}
    <table className="rx-t"><thead><tr><th className="rx-l">Ad Soyad</th><th>No</th><th>Şube</th>{exams.map((e) => <th key={e.id} className="rx-sep" title={examLabel(e)}>{e.title.length > 18 ? e.title.slice(0, 17) + '…' : e.title}</th>)}<th className="rx-sep">Değişim</th><th>Eğilim</th></tr></thead>
      <tbody>{rows.map((s, i) => { const vals = exams.map((e) => val(s.points[e.id])); const present = vals.filter((v): v is number => v != null); const delta = present.length >= 2 ? present[present.length - 1] - present[0] : null;
        return <tr key={i}><td className="rx-l rx-name">{s.name}</td><td>{s.number || ''}</td><td>{s.className}</td>{vals.map((v, k) => <td key={k} className="rx-sep">{v == null ? <span className="rx-small">girmedi</span> : f2(v)}</td>)}<td className={`rx-sep rx-n ${delta == null ? '' : delta > 0 ? 'rx-good' : delta < 0 ? 'rx-bad' : ''}`}>{delta == null ? '—' : `${delta > 0 ? '+' : ''}${f2(delta)}`}</td><td>{spark(vals)}</td></tr>; })}</tbody></table>
    <p className="rx-note" style={{ marginTop: 'auto' }}>Değerler {hasScore ? 'puan (yoksa net)' : 'nettir'}. Öğrenciler denemeler arasında okul numarasıyla, numara yoksa ad soyadla eşleştirilir; öğrenci kaydı gerekmez. Değişim, girdiği ilk ve son deneme arasındaki farktır.</p>
  </Page>)}</>;
}
