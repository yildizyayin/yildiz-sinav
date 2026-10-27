import { Fragment } from 'react';
import { avgOf, chunk, columnsOf, examLabel, f0, f1, f2, fScore, GroupedBars, HBars, instSub, Page, participationChips, pctOf, rank, short, valueOf, type Bundle, type Inst, type ScoreType } from './shared';

/**
 * S034 lists. NET = with the sub-tests the key named (Okul/Şube Net Listesi), TEST = per test (Test Bazlı Net Listesi).
 * Sorted by one score type (AYT: Sayısal / Sözel / Eşit Ağırlık each). Reference rows repeat on every page.
 */
const ROWS = { NET: 30, TEST: 32 };

function Head({ cols, t, withClass }: { cols: ReturnType<typeof columnsOf>; t: ScoreType; withClass: boolean }) {
  const groups: Array<{ name: string; span: number }> = [];
  for (const c of cols) { const g = groups[groups.length - 1]; if (g && g.name === c.group) g.span++; else groups.push({ name: c.group, span: 1 }); }
  const hasGroups = groups.some((g) => g.span > 1 || g.name !== cols.find((c) => c.group === g.name)?.name);
  return <thead>
    {hasGroups && <tr className="rx-g"><th colSpan={4} />{groups.map((g, i) => <th key={i} colSpan={g.span * 3} className="rx-gcell">{short(g.name)}</th>)}<th colSpan={3} /><th colSpan={withClass ? 6 : 5} /></tr>}
    <tr><th colSpan={4} />{cols.map((c, i) => <th key={c.key} colSpan={3} className={`rx-sep ${i % 2 ? '' : 'rx-band'}`}>{short(c.name)}<span className="rx-small"> {c.q}</span></th>)}<th colSpan={3} className="rx-sep">Toplam</th><th className="rx-sep">{t.label}</th><th colSpan={withClass ? 5 : 4} className="rx-sep">Sıralama</th></tr>
    <tr><th>Sıra</th><th>No</th><th className="rx-l">Ad Soyad</th><th>Şube</th>{cols.map((c, i) => <Fragment key={c.key}><th className={`rx-sep ${i % 2 ? '' : 'rx-band'}`}>D</th><th className={i % 2 ? '' : 'rx-band'}>Y</th><th className={`rx-n ${i % 2 ? '' : 'rx-band'}`}>N</th></Fragment>)}<th className="rx-sep">D</th><th>Y</th><th className="rx-n">N</th><th className="rx-sep">{t.isScore ? 'Puan' : 'Net'}</th>{withClass && <th className="rx-sep">Şube</th>}<th className={withClass ? '' : 'rx-sep'}>Okul</th><th>İlçe</th><th>İl</th><th>Genel</th></tr>
  </thead>;
}

export function NetList({ b, inst, cls, t, mode }: { b: Bundle; inst: Inst; cls?: string; t: ScoreType; mode: 'NET' | 'TEST' }) {
  const cols = columnsOf(b, mode);
  const students = (inst.students as any[]).filter((s) => cls === undefined || s.className === cls)
    .slice().sort((a, z) => ((z.scores[t.key] ?? -1e9) - (a.scores[t.key] ?? -1e9)) || (z.total.d - a.total.d) || a.name.localeCompare(z.name, 'tr'));
  const klass = cls !== undefined ? inst.classes.find((c: any) => c.name === cls) : null;
  const refs: Array<[string, any, boolean?]> = [['Genel ortalama', b.general.avg], ['İl ortalaması', inst.refs.city], ['İlçe ortalaması', inst.refs.district], ['Okul ortalaması', inst.avg, !klass], ...(klass ? [[`${cls} şube ortalaması`, klass.avg, true] as [string, any, boolean]] : [])];
  const pages = chunk(students, ROWS[mode]);
  const what = mode === 'NET' ? 'Net Listesi' : 'Test Bazlı Net Listesi';
  const title = cls !== undefined ? `${cls || 'Şubesiz'} Şubesi ${what}` : `Okul ${what}`;
  return <>{pages.map((rows, pi) => <Page key={pi} kicker={`${t.label} sıralı · ${pages.length > 1 ? `${pi + 1}/${pages.length}` : 'liste'}`} title={title} sub={instSub(b, inst)} chips={participationChips(inst)} provisional={b.provisional}>
    <table className={`rx-t ${cols.length > 6 ? 'rx-dense' : ''}`}><Head cols={cols} t={t} withClass />
      <tbody>
        {refs.map(([label, a, me]) => <tr key={label} className={`rx-ref ${me ? 'rx-me' : ''}`}><td colSpan={4} className="rx-l">{label} <span className="rx-small">({f0(a?.count)})</span></td>
          {cols.map((c) => { const v = avgOf(mode, a, c.key) || {}; return <Fragment key={c.key}><td className="rx-sep">{f1(v.d)}</td><td>{f1(v.y)}</td><td className="rx-n">{f2(v.n)}</td></Fragment>; })}
          <td className="rx-sep">{f1(a?.total?.d)}</td><td>{f1(a?.total?.y)}</td><td className="rx-n">{f2(a?.total?.n)}</td><td className="rx-sep rx-score">{fScore(t, a?.scores?.[t.key])}</td><td colSpan={5} /></tr>)}
        {rows.map((s, i) => { const r = s.ranks[t.key] || {}, k = s.counts[t.key] || {}; return <tr key={s.id}>
          <td>{pi * ROWS[mode] + i + 1}</td><td>{s.number || ''}</td><td className="rx-l rx-name" title={s.name}>{s.name}</td><td>{s.className}</td>
          {cols.map((c, ci) => { const v = valueOf(mode, s, c.key); return <Fragment key={c.key}><td className={`rx-sep ${ci % 2 ? '' : 'rx-band'}`}>{v ? v.d : ''}</td><td className={ci % 2 ? '' : 'rx-band'}>{v ? v.y : ''}</td><td className={`rx-n ${ci % 2 ? '' : 'rx-band'}`}>{v ? f2(v.n) : ''}</td></Fragment>; })}
          <td className="rx-sep">{s.total.d}</td><td>{s.total.y}</td><td className="rx-n">{f2(s.total.n)}</td><td className="rx-sep rx-score">{fScore(t, s.scores[t.key])}</td>
          <td className="rx-sep">{r.class || '—'}</td><td>{r.school || '—'}</td><td className="rx-rank">{r.district || '—'}</td><td className="rx-rank">{r.city || '—'}</td><td className="rx-rank" title={`${r.general}/${k.general}`}>{r.general || '—'}</td></tr>; })}
      </tbody></table>
    {pi === pages.length - 1 && <p className="rx-note">D: doğru, Y: yanlış, N: net. Sütun başlığındaki küçük sayı soru sayısıdır. Sıralar: şube, okul, ilçe, il ve sınava giren tüm öğrenciler (genel) içindedir.{b.family === 'AYT' && b.aytMode === 'COMBINED' ? ' Alan puanları ÖSYM test ağırlıklarından türetilmiş tahmindir (OBP yok); TYT öğrencinin kendi sonucundan, yoksa okul TYT ortalamasından alınır.' : ''}{b.family === 'AYT' && b.aytMode === 'AYT_ONLY' ? ' Yalnız AYT: puan hesaplanmaz; sıralama alan netine göredir.' : ''}</p>}
  </Page>)}</>;
}

/** Dealer report: the schools of one district with their averages, ranked by the score (owner sample "İlçedeki kurum ortalamaları"). */
export function SchoolAverages({ b, ds, t }: { b: Bundle; ds: any; t: ScoreType }) {
  const cols = columnsOf(b, 'NET');
  const schools = (ds.schools as any[]).slice().sort((a, z) => ((z.avg.scores[t.key] ?? -1e9) - (a.avg.scores[t.key] ?? -1e9)));
  const refs: Array<[string, any]> = [['Genel ortalama', b.general.avg], ['İl ortalaması', ds.cityAvg], ['İlçe ortalaması', ds.avg]];
  const pages = chunk(schools, 22);
  const sub = <><b>{ds.city} / {ds.district}</b> · {examLabel(b.exam)}</>;
  const chips: Array<[string, string]> = [['İlçe', f0(ds.avg.count)], ['İl', f0(ds.cityAvg.count)], ['Genel', f0(b.general.avg.count)]];
  return <>{pages.map((rows, pi) => <Page key={pi} kicker={`${t.label} sıralı · kurum ortalamaları`} title="İlçedeki Kurum Ortalamaları" sub={sub} chips={chips} provisional={b.provisional}>
    <table className={`rx-t ${cols.length > 6 ? 'rx-dense' : ''}`}><thead>
      <tr><th colSpan={3} />{cols.map((c, i) => <th key={c.key} colSpan={3} className={`rx-sep ${i % 2 ? '' : 'rx-band'}`}>{short(c.name)}</th>)}<th colSpan={3} className="rx-sep">Toplam</th><th className="rx-sep">{t.label}</th><th colSpan={3} className="rx-sep">Okulun sırası</th></tr>
      <tr><th>Sıra</th><th className="rx-l">Okul</th><th>Kat.</th>{cols.map((c, i) => <Fragment key={c.key}><th className={`rx-sep ${i % 2 ? '' : 'rx-band'}`}>D</th><th className={i % 2 ? '' : 'rx-band'}>Y</th><th className={`rx-n ${i % 2 ? '' : 'rx-band'}`}>N</th></Fragment>)}<th className="rx-sep">D</th><th>Y</th><th className="rx-n">N</th><th className="rx-sep">{t.isScore ? 'Puan' : 'Net'}</th><th className="rx-sep">İlçe</th><th>İl</th><th>Genel</th></tr></thead>
      <tbody>
        {refs.map(([label, a]) => <tr key={label} className="rx-ref"><td colSpan={2} className="rx-l">{label}</td><td>{f0(a.count)}</td>{cols.map((c) => <Fragment key={c.key}><td className="rx-sep">{f1(a.cols[c.key]?.d)}</td><td>{f1(a.cols[c.key]?.y)}</td><td className="rx-n">{f2(a.cols[c.key]?.n)}</td></Fragment>)}<td className="rx-sep">{f2(a.total.d)}</td><td>{f2(a.total.y)}</td><td className="rx-n">{f2(a.total.n)}</td><td className="rx-sep rx-score">{fScore(t, a.scores[t.key])}</td><td colSpan={3} /></tr>)}
        {rows.map((s, i) => <tr key={s.id}><td>{pi * 22 + i + 1}</td><td className="rx-l rx-name" style={{ maxWidth: '46mm' }} title={s.name}>{s.name}</td><td>{s.count}</td>
          {cols.map((c, ci) => { const v = s.avg.cols[c.key] || {}; return <Fragment key={c.key}><td className={`rx-sep ${ci % 2 ? '' : 'rx-band'}`}>{f1(v.d)}</td><td className={ci % 2 ? '' : 'rx-band'}>{f1(v.y)}</td><td className={`rx-n ${ci % 2 ? '' : 'rx-band'}`}>{f2(v.n)}</td></Fragment>; })}
          <td className="rx-sep">{f2(s.avg.total.d)}</td><td>{f2(s.avg.total.y)}</td><td className="rx-n">{f2(s.avg.total.n)}</td><td className="rx-sep rx-score">{fScore(t, s.avg.scores[t.key])}</td><td className="rx-sep">{rank(...s.rank.district)}</td><td className="rx-rank">{rank(...s.rank.city)}</td><td className="rx-rank">{rank(...s.rank.general)}</td></tr>)}
      </tbody></table>
    {pi === pages.length - 1 && <div className="rx-grid2" style={{ marginTop: 'auto' }}>
      <div className="rx-card"><h4>{t.label} ortalaması · okullar</h4><HBars rows={schools.slice(0, 14).map((s) => ({ label: s.name, value: s.avg.scores[t.key] ?? null }))} refs={[{ label: 'İlçe', value: ds.avg.scores[t.key], color: '#2563EB' }, { label: 'Genel', value: b.general.avg.scores[t.key], color: '#07143F' }]} height={52} /></div>
      <div className="rx-card"><h4>Test başarısı (% net) · ilk {Math.min(5, schools.length)} okul ve ilçe</h4><GroupedBars groups={cols.map((c) => short(c.name))} series={[...schools.slice(0, 5).map((s, i) => ({ label: `${i + 1}. ${s.name.slice(0, 18)}`, color: ['#07143F', '#2563EB', '#6CA8FF', '#A9C4F5', '#8268FF'][i], values: cols.map((c) => pctOf(s.avg.cols[c.key]?.n || 0, c.q)) })), { label: 'İlçe', color: '#C9D3E6', values: cols.map((c) => pctOf(ds.avg.cols[c.key]?.n || 0, c.q)) }]} height={44} /></div>
    </div>}
  </Page>)}</>;
}
