import { Fragment } from 'react';
import { classAdvice, schoolAdvice, studentAdvice } from './nibiru';
import { Arrow, cmp, columnsOf, examLabel, f0, f2, fScore, GroupedBars, HBars, instSub, Nibiru, Page, participationChips, pctOf, rank, short, TopicColumns, type Bundle, type Inst } from './shared';

/** S034 report cards: kurum (school), şube (class) and öğrenci (student). Same content as the owner's samples, new layout. */
const C = { me: '#2563EB', district: '#6CA8FF', city: '#A9C4F5', general: '#07143F', school: '#8FA3C7' };

/** Topic lists split over pages by an estimated row budget (test and sub-test headers count as rows). */
function topicPages(b: Bundle, topics: any[], perPage: number) {
  const pages: any[][] = [[]]; let used = 0, lastS = '', lastSec = '';
  for (const s of b.tests) for (const t of topics.filter((x) => x.subjectId === s.id)) {
    const cost = 1 + (t.subjectId !== lastS ? 2 : 0) + (t.section && t.section !== lastSec ? 1 : 0);
    if (used + cost > perPage && pages[pages.length - 1].length) { pages.push([]); used = 0; lastS = ''; lastSec = ''; }
    pages[pages.length - 1].push(t); used += cost; lastS = t.subjectId; lastSec = t.section || '';
  }
  return pages;
}

function AvgTable({ b, rows, own, ownLabel }: { b: Bundle; own: any; ownLabel: string; rows: Array<{ label: string; avg: any; ranks?: Record<string, number>; of?: number }> }) {
  const cols = columnsOf(b, 'NET');
  return <table className="rx-t"><thead>
    <tr><th />{cols.map((c, i) => <th key={c.key} className={i % 2 ? '' : 'rx-band'}>{short(c.name)}<div className="rx-small">{short(c.group) !== short(c.name) ? short(c.group) : `${c.q} soru`}</div></th>)}<th className="rx-sep">Toplam net</th>{b.scoreTypes.map((t: any) => <th key={t.key} className="rx-sep">{t.label}</th>)}</tr></thead>
    <tbody>
      <tr className="rx-me"><td className="rx-l">{ownLabel} <span className="rx-small">({f0(own.count)})</span></td>{cols.map((c) => <td key={c.key} className="rx-n">{f2(own.cols[c.key]?.n)}<Arrow v={own.cols[c.key]?.n} ref={b.general.avg.cols[c.key]?.n} /></td>)}<td className="rx-sep rx-n">{f2(own.total.n)}<Arrow v={own.total.n} ref={b.general.avg.total.n} /></td>{b.scoreTypes.map((t: any) => <td key={t.key} className="rx-sep rx-score">{fScore(t, own.scores[t.key])}</td>)}</tr>
      {rows.map((r) => <tr key={r.label} className="rx-ref"><td className="rx-l">{r.label} <span className="rx-small">({f0(r.avg.count)})</span></td>
        {cols.map((c) => <td key={c.key}><span className={cmp(own.cols[c.key]?.n, r.avg.cols[c.key]?.n)}>{f2(r.avg.cols[c.key]?.n)}</span>{r.ranks && <div className="rx-small">sıra {r.ranks[c.key] || '—'}/{r.of}</div>}</td>)}
        <td className="rx-sep"><span className={cmp(own.total.n, r.avg.total.n)}>{f2(r.avg.total.n)}</span></td>{b.scoreTypes.map((t: any) => <td key={t.key} className="rx-sep"><span className={cmp(own.scores[t.key], r.avg.scores[t.key])}>{fScore(t, r.avg.scores[t.key])}</span></td>)}</tr>)}
    </tbody></table>;
}

function ClassTable({ b, inst, highlight }: { b: Bundle; inst: Inst; highlight?: string }) {
  const cols = columnsOf(b, 'NET'), t = b.scoreTypes[0];
  return <table className="rx-t"><thead><tr><th className="rx-l">Şube</th>{cols.map((c, i) => <th key={c.key} className={i % 2 ? '' : 'rx-band'}>{short(c.name)}</th>)}<th className="rx-sep">Toplam net</th>{b.scoreTypes.map((x: any) => <th key={x.key} className="rx-sep">{x.label}</th>)}<th className="rx-sep">Okulda</th><th>İlçede</th><th>Genelde</th></tr></thead>
    <tbody>{(inst.classes as any[]).map((c) => <tr key={c.name} className={highlight === c.name ? 'rx-me' : ''}><td className="rx-l"><b>{c.name || 'Şubesiz'}</b> <span className="rx-small">({c.avg.count})</span></td>
      {cols.map((k) => <td key={k.key} className={cmp(c.avg.cols[k.key]?.n, inst.avg.cols[k.key]?.n)}>{f2(c.avg.cols[k.key]?.n)}</td>)}
      <td className={`rx-sep rx-n ${cmp(c.avg.total.n, inst.avg.total.n)}`}>{f2(c.avg.total.n)}</td>{b.scoreTypes.map((x: any) => <td key={x.key} className={`rx-sep ${cmp(c.avg.scores[x.key], inst.avg.scores[x.key])}`}>{fScore(x, c.avg.scores[x.key])}</td>)}
      <td className="rx-sep">{rank(...c.rank.school)}</td><td className="rx-rank">{rank(...c.rank.district)}</td><td className="rx-rank">{rank(...c.rank.general)}</td></tr>)}</tbody>
    <tfoot><tr><td colSpan={cols.length + 4 + b.scoreTypes.length} className="rx-note rx-l">Şube değerleri okul ortalamasıyla kıyaslanır: yeşil üstünde, kırmızı altında. Şube sıraları {t.label} ortalamasına göredir.</td></tr></tfoot></table>;
}

function Participation({ inst }: { inst: Inst }) {
  const c = inst.counts;
  return <div className="rx-card"><h4>Katılım</h4><table className="rx-t"><thead><tr><th className="rx-l" /><th>Öğrenci</th><th>Şube</th><th>Okul</th><th>İlçe</th><th>İl</th></tr></thead><tbody>
    <tr className="rx-me"><td className="rx-l">Okulunuz</td><td>{f0(c.school.students)}</td><td>{f0(c.school.classes)}</td><td /><td /><td /></tr>
    <tr><td className="rx-l">{inst.district} ilçesi</td><td>{f0(c.district.students)}</td><td>{f0(c.district.classes)}</td><td>{f0(c.district.schools)}</td><td /><td /></tr>
    <tr><td className="rx-l">{inst.city} ili</td><td>{f0(c.city.students)}</td><td>{f0(c.city.classes)}</td><td>{f0(c.city.schools)}</td><td>{f0(c.city.districts)}</td><td /></tr>
    <tr><td className="rx-l">Genel</td><td>{f0(c.general.students)}</td><td>{f0(c.general.classes)}</td><td>{f0(c.general.schools)}</td><td>{f0(c.general.districts)}</td><td>{f0(c.general.cities)}</td></tr></tbody></table></div>;
}

export function KurumKarne({ b, inst }: { b: Bundle; inst: Inst }) {
  const t = b.scoreTypes[0], cols = columnsOf(b, 'NET'), r = inst.rank;
  const testRanks = (lvl: 'district' | 'city' | 'general') => Object.fromEntries(cols.map((c) => [c.key, r.tests[c.key]?.[lvl]]));
  const many = inst.classes.length > 7;
  const head = { kicker: 'Kurum karnesi', title: inst.name, sub: <>{inst.city} / {inst.district} · {examLabel(b.exam)}</>, chips: participationChips(inst), provisional: b.provisional };
  return <>
    <Page {...head}>
      <div className="rx-kpis">
        <div className="rx-kpi rx-hi"><span>{t.label} ortalaması</span><b>{fScore(t, inst.avg.scores[t.key])}</b><small>genel {fScore(t, b.general.avg.scores[t.key])}</small></div>
        {b.scoreTypes.slice(1).map((x: any) => <div className="rx-kpi" key={x.key}><span>{x.label}</span><b>{fScore(x, inst.avg.scores[x.key])}</b><small>genel {fScore(x, b.general.avg.scores[x.key])}</small></div>)}
        <div className="rx-kpi"><span>Ortalama net</span><b>{f2(inst.avg.total.n)}</b><small>genel {f2(b.general.avg.total.n)}</small></div>
        <div className="rx-kpi"><span>İlçede</span><b>{rank(...r.district)}</b><small>okullar arasında</small></div>
        <div className="rx-kpi"><span>İlde</span><b>{rank(...r.city)}</b><small>okullar arasında</small></div>
        <div className="rx-kpi"><span>Genelde</span><b>{rank(...r.general)}</b><small>okullar arasında</small></div>
      </div>
      <div><div className="rx-h">Test ortalamaları <small>▲▼ genel ortalamaya göre · renk: okulunuz bu kapsamın üstünde (yeşil) / altında (kırmızı) · sıra: okulunuzun o kapsamdaki yeri</small></div>
        <AvgTable b={b} own={inst.avg} ownLabel="Okulunuz" rows={[{ label: 'İlçe', avg: inst.refs.district, ranks: testRanks('district'), of: inst.counts.district.schools }, { label: 'İl', avg: inst.refs.city, ranks: testRanks('city'), of: inst.counts.city.schools }, { label: 'Genel', avg: b.general.avg, ranks: testRanks('general'), of: inst.counts.general.schools }]} /></div>
      {!many && <div><div className="rx-h">Şube ortalamaları</div><ClassTable b={b} inst={inst} /></div>}
      <div style={{ marginTop: 'auto', display: 'grid', gap: '3mm' }}><div className="rx-grid2">
                <Participation inst={inst} />
                <div className="rx-card"><h4>Dereceler</h4><ul>
                  <li>Genelde sınava {f0(inst.counts.general.schools)} okul katıldı; okulunuz {t.label} ortalamasında <b>{r.general[0]}.</b> oldu.</li>
                  <li>{inst.city} ilinde {f0(inst.counts.city.schools)} okul arasında <b>{r.city[0]}.</b></li>
                  <li>{inst.district} ilçesinde {f0(inst.counts.district.schools)} okul arasında <b>{r.district[0]}.</b></li>
                </ul></div>
              </div>
        <Nibiru lines={schoolAdvice(b, inst)} /></div>
    </Page>
    <Page {...head} kicker="Kurum karnesi · kıyaslar">
      {many && <div><div className="rx-h">Şube ortalamaları</div><ClassTable b={b} inst={inst} /></div>}
      <div className="rx-card"><h4>Test başarısı (% net) · okul, ilçe, il, genel</h4><GroupedBars groups={cols.map((c) => short(c.name))} series={[{ label: 'Okulunuz', color: C.me, values: cols.map((c) => pctOf(inst.avg.cols[c.key]?.n, c.q)) }, { label: 'İlçe', color: C.district, values: cols.map((c) => pctOf(inst.refs.district.cols[c.key]?.n, c.q)) }, { label: 'İl', color: C.city, values: cols.map((c) => pctOf(inst.refs.city.cols[c.key]?.n, c.q)) }, { label: 'Genel', color: C.general, values: cols.map((c) => pctOf(b.general.avg.cols[c.key]?.n, c.q)) }]} height={70} /></div>
      <div className="rx-grid2">
        <div className="rx-card"><h4>Şubeler · {t.label} ortalaması</h4><HBars rows={inst.classes.map((c: any) => ({ label: c.name || 'Şubesiz', value: c.avg.scores[t.key] }))} refs={[{ label: 'Okul', value: inst.avg.scores[t.key], color: C.me }, { label: 'Genel', value: b.general.avg.scores[t.key], color: C.general }]} /></div>
        <div className="rx-card"><h4>{b.scoreTypes.map((x: any) => x.label).join(' · ')} · okul ve kapsamlar</h4><HBars rows={b.scoreTypes.flatMap((x: any) => [{ label: `${x.label} · Okulunuz`, value: inst.avg.scores[x.key], me: true }, { label: `${x.label} · İlçe`, value: inst.refs.district.scores[x.key] }, { label: `${x.label} · İl`, value: inst.refs.city.scores[x.key] }, { label: `${x.label} · Genel`, value: b.general.avg.scores[x.key] }])} /></div>
      </div>
    </Page>
    {topicPages(b, inst.topics, 130).map((list, i, all) => <Page key={i} {...head} kicker={`Kurum karnesi · kazanım analizi${all.length > 1 ? ` ${i + 1}/${all.length}` : ''}`}>
      <p className="rx-note">Her kazanımda soru sayısı, öğrenci başına ortalama doğru (D) ve yanlış (Y), başarı yüzdesi gösterilir. Çubuktaki koyu çizgi genel başarıdır. %75 ve üstü koyu yeşil, %50–74 yeşil, %35–49 sarı, altı kırmızı.</p>
      <TopicColumns b={b} topics={list} general={b.general.topics} /></Page>)}
  </>;
}

export function SubeKarne({ b, inst, cls }: { b: Bundle; inst: Inst; cls: any }) {
  const t = b.scoreTypes[0], cols = columnsOf(b, 'NET');
  const head = { kicker: 'Şube karnesi', title: `${cls.name || 'Şubesiz'} Şubesi`, sub: instSub(b, inst), chips: [['Şube', f0(cls.avg.count)], ...participationChips(inst)] as Array<[string, string]>, provisional: b.provisional };
  return <>
    <Page {...head}>
      <div className="rx-kpis">
        <div className="rx-kpi rx-hi"><span>{t.label} ortalaması</span><b>{fScore(t, cls.avg.scores[t.key])}</b><small>okul {fScore(t, inst.avg.scores[t.key])}</small></div>
        <div className="rx-kpi"><span>Ortalama net</span><b>{f2(cls.avg.total.n)}</b><small>okul {f2(inst.avg.total.n)}</small></div>
        <div className="rx-kpi"><span>Okulda</span><b>{rank(...cls.rank.school)}</b><small>şubeler arasında</small></div>
        <div className="rx-kpi"><span>İlçede</span><b>{rank(...cls.rank.district)}</b><small>şubeler arasında</small></div>
        <div className="rx-kpi"><span>İlde</span><b>{rank(...cls.rank.city)}</b><small>şubeler arasında</small></div>
        <div className="rx-kpi"><span>Genelde</span><b>{rank(...cls.rank.general)}</b><small>şubeler arasında</small></div>
      </div>
      <div><div className="rx-h">Test ortalamaları <small>şube satırındaki ▲▼ genel ortalamaya göre</small></div>
        <AvgTable b={b} own={cls.avg} ownLabel={`${cls.name || 'Şubesiz'} şubesi`} rows={[{ label: 'Okul', avg: inst.avg }, { label: 'İlçe', avg: inst.refs.district }, { label: 'İl', avg: inst.refs.city }, { label: 'Genel', avg: b.general.avg }]} /></div>
      <div className="rx-card"><h4>Test başarısı (% net) · şube, okul, ilçe, genel</h4><GroupedBars groups={cols.map((c) => short(c.name))} series={[{ label: 'Şube', color: C.me, values: cols.map((c) => pctOf(cls.avg.cols[c.key]?.n, c.q)) }, { label: 'Okul', color: C.school, values: cols.map((c) => pctOf(inst.avg.cols[c.key]?.n, c.q)) }, { label: 'İlçe', color: C.district, values: cols.map((c) => pctOf(inst.refs.district.cols[c.key]?.n, c.q)) }, { label: 'Genel', color: C.general, values: cols.map((c) => pctOf(b.general.avg.cols[c.key]?.n, c.q)) }]} height={46} /></div>
      <div style={{ marginTop: 'auto' }}><Nibiru lines={classAdvice(b, inst, cls)} /></div>
    </Page>
    {topicPages(b, cls.topics, 130).map((list, i, all) => <Page key={i} {...head} kicker={`Şube karnesi · kazanım analizi${all.length > 1 ? ` ${i + 1}/${all.length}` : ''}`}>
      <p className="rx-note">Çubuktaki koyu çizgi okulun başarısıdır.</p><TopicColumns b={b} topics={list} general={inst.topics} /></Page>)}
  </>;
}

function AnswerGrid({ b, s }: { b: Bundle; s: any }) {
  return <div>{b.tests.map((t: any) => { const rows = s.grid?.[t.id] || []; if (!rows.length) return null;
    return <table className="rx-ans" key={t.id}><tbody>
      <tr><td className="rx-al">{short(t.name)}</td>{rows.map((r: any, i: number) => <td key={i} className={r.status === 'CANCELLED' ? 'rx-x' : r.status === 'WRONG' ? 'rx-w' : r.status === 'CORRECT' ? 'rx-c' : 'rx-b'}>{r.status === 'CANCELLED' ? '×' : (r.answer || '·')}</td>)}</tr>
      <tr className="rx-key"><td className="rx-al">Anahtar {s.booklet || ''}</td>{rows.map((r: any, i: number) => <td key={i}>{r.key}</td>)}</tr></tbody></table>; })}
    <div className="rx-legend"><span><i style={{ background: '#E1F4EA' }} />doğru</span><span><i style={{ background: '#FDE2DC' }} />yanlış</span><span><i style={{ background: '#FFF6D6' }} />boş</span><span><i style={{ background: '#EEF0F4' }} />iptal</span></div></div>;
}

export function OgrenciKarne({ b, inst, s }: { b: Bundle; inst: Inst; s: any }) {
  const cols = columnsOf(b, 'NET');
  const cls = inst.classes.find((c: any) => c.name === s.className);
  const head = { land: false, kicker: 'Öğrenci karnesi', title: s.name, sub: <>{s.number ? <>No <b>{s.number}</b> · </> : null}Şube <b>{s.className || '—'}</b> · {inst.name} · {inst.city}/{inst.district}<br />{examLabel(b.exam)}</>, provisional: b.provisional };
  return <>
    <Page {...head}>
      <div className="rx-kpis">
        {b.scoreTypes.map((t: any) => <div className="rx-kpi rx-hi" key={t.key}><span>{t.label}</span><b>{fScore(t, s.scores[t.key])}</b><small>okul {fScore(t, inst.avg.scores[t.key])}</small></div>)}
        <div className="rx-kpi"><span>Doğru</span><b>{s.total.d}</b></div><div className="rx-kpi"><span>Yanlış</span><b>{s.total.y}</b></div><div className="rx-kpi"><span>Boş</span><b>{s.total.b}</b></div><div className="rx-kpi"><span>Net</span><b>{f2(s.total.n)}</b></div>
      </div>
      <table className="rx-t"><thead><tr><th className="rx-l">Sıralama</th><th>Puan</th><th>Şube</th><th>Okul</th><th>İlçe</th><th>İl</th><th>Genel</th></tr></thead><tbody>
        {b.scoreTypes.map((t: any) => { const r = s.ranks[t.key] || {}, k = s.counts[t.key] || {}; return <tr key={t.key}><td className="rx-l"><b>{t.label}</b></td><td className="rx-score">{fScore(t, s.scores[t.key])}</td><td>{rank(r.class, k.class)}</td><td>{rank(r.school, k.school)}</td><td>{rank(r.district, k.district)}</td><td>{rank(r.city, k.city)}</td><td>{rank(r.general, k.general)}</td></tr>; })}
      </tbody></table>
      <table className="rx-t"><thead><tr><th className="rx-l">Test</th><th>Soru</th><th>D</th><th>Y</th><th>B</th><th className="rx-n">Net</th><th>Başarı</th><th className="rx-sep">Şube ort.</th><th>Okul ort.</th><th>Genel ort.</th></tr></thead><tbody>
        {cols.map((c, i) => { const v = s.cols[c.key]; const first = i === 0 || cols[i - 1].group !== c.group;
          return <Fragment key={c.key}>{first && (c.group !== c.name || cols.filter((x) => x.group === c.group).length > 1) && <tr className="rx-ref"><td className="rx-l" colSpan={10}>{short(c.group)}</td></tr>}
            <tr><td className="rx-l">{short(c.name)}</td><td>{c.q}</td><td>{v?.d ?? '—'}</td><td>{v?.y ?? '—'}</td><td>{v?.b ?? '—'}</td><td className="rx-n">{f2(v?.n)}<Arrow v={v?.n} ref={inst.avg.cols[c.key]?.n} /></td><td>%{pctOf(v?.n || 0, c.q)}</td>
              <td className="rx-sep">{f2(cls?.avg.cols[c.key]?.n)}</td><td>{f2(inst.avg.cols[c.key]?.n)}</td><td>{f2(b.general.avg.cols[c.key]?.n)}</td></tr></Fragment>; })}
        <tr className="rx-me"><td className="rx-l">Toplam</td><td>{cols.reduce((a, c) => a + c.q, 0)}</td><td>{s.total.d}</td><td>{s.total.y}</td><td>{s.total.b}</td><td className="rx-n">{f2(s.total.n)}</td><td /><td className="rx-sep">{f2(cls?.avg.total.n)}</td><td>{f2(inst.avg.total.n)}</td><td>{f2(b.general.avg.total.n)}</td></tr>
      </tbody></table>
      <div className="rx-card"><h4>Test başarısı (% net)</h4><GroupedBars groups={cols.map((c) => short(c.name))} series={[{ label: 'Öğrenci', color: C.me, values: cols.map((c) => pctOf(s.cols[c.key]?.n, c.q)) }, { label: 'Şube', color: C.district, values: cols.map((c) => pctOf(cls?.avg.cols[c.key]?.n, c.q)) }, { label: 'Okul', color: C.school, values: cols.map((c) => pctOf(inst.avg.cols[c.key]?.n, c.q)) }, { label: 'Genel', color: C.general, values: cols.map((c) => pctOf(b.general.avg.cols[c.key]?.n, c.q)) }]} height={34} /></div>
      <AnswerGrid b={b} s={s} />
      <div style={{ marginTop: 'auto' }}><Nibiru title="bu sınavdaki cevaplarından" lines={studentAdvice(b, inst, s)} /></div>
    </Page>
    {topicPages(b, s.topics || [], 150).map((list, i, all) => <Page key={i} {...head} kicker={`Öğrenci karnesi · kazanım analizi${all.length > 1 ? ` ${i + 1}/${all.length}` : ''}`}>
      <p className="rx-note">Her kazanımda soru sayısı, doğru (D), yanlış (Y) ve başarı yüzdesi. Çubuktaki koyu çizgi okulunun başarısıdır.</p>
      <TopicColumns b={b} topics={list} general={inst.topics} counts /></Page>)}
  </>;
}


