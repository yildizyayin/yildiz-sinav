import { useRef } from 'react';
import { Printer } from 'lucide-react';
import { printSection } from '../lib/printSection';
import './result-report-pack.css';

/**
 * S032: institution report pack in the owner's publisher layout (sample: school net list + comparison charts,
 * then two pages per student). Prints as A4 pages; on screen the same pages are shown one under another.
 */
type Pack = any;
const f2 = (x: unknown) => (x == null || x === '' ? '' : Number(x).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const f1 = (x: unknown) => (x == null ? '' : Number(x).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const f3 = (x: unknown) => (x == null ? '—' : Number(x).toLocaleString('tr-TR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }));
const pct = (n: number, s: number) => (s ? Math.round((n / s) * 100) : 0);
const short = (name: string) => name.replace(/^TYT |^AYT |^LGS /, '');

export function ResultReportPack({ data, mode, onClose }: { data: Pack; mode: 'LIST' | 'KARNES'; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const title = mode === 'LIST' ? 'Kurum sonuç listesi' : 'Öğrenci karneleri';
  return <section className="rp-wrap">
    <div className="rp-toolbar no-print"><strong>{title} · {data.institution?.name}</strong>{data.provisional && <span className="rp-provisional">Sıralamalar sonuçlar yayınlanana kadar geçicidir.</span>}<div><button className="secondary" onClick={() => printSection(ref.current)}><Printer size={16} /> Yazdır / PDF</button><button className="ghost" onClick={onClose}>Kapat</button></div></div>
    <div className="rp-pages" ref={ref}>
      <ReportPages data={data} kinds={mode === 'LIST' ? ['OKUL_LIST', 'OKUL_COMPARE'] : ['KARNE']} />
    </div>
  </section>;
}

function HeadTable({ data }: { data: Pack }) {
  const p = data.participation;
  return <table className="rp-head"><thead><tr><th>İL</th><th>İLÇE</th><th>OKUL</th><th>SINAV ADI</th><th colSpan={4} className="rp-small">KATILIMLAR</th></tr><tr><th /><th /><th /><th /><th>Okul</th><th>İlçe</th><th>İl</th><th>Genel</th></tr></thead>
    <tbody><tr><td>{data.institution.city || ''}</td><td>{data.institution.district || ''}</td><td className="rp-left">{data.institution.name}</td><td className="rp-left">{data.exam.academic_year} {data.exam.publisher_name ? `${data.exam.publisher_name} ` : ''}{data.exam.title}</td><td>{p.school}</td><td>{p.district}</td><td>{p.city}</td><td>{p.overall}</td></tr></tbody></table>;
}

const ROWS_PER_PAGE = 42;
/** S033: school or class list; long lists continue on the next A4 page with the same header (42 students per page). */
function SchoolList({ data, className }: { data: Pack; className?: string }) {
  const subjects = data.subjects as any[];
  const g = data.averages.general, sc = data.averages.school, cl = className !== undefined ? data.averages.byClass[className] : null;
  const students = (data.students as any[]).filter((s) => className === undefined || (s.className || '') === className);
  const avgRow = (label: string, a: any) => <tr className="rp-avg"><td colSpan={4} className="rp-right">{label}</td>{subjects.map((s) => { const v = a.subjects[s.id] || {}; return [<td key={s.id + 'd'}>{f1(v.d)}</td>, <td key={s.id + 'y'}>{f1(v.y)}</td>, <td key={s.id + 'n'}>{f2(v.n)}</td>]; })}<td>{f1(a.total.d)}</td><td>{f1(a.total.y)}</td><td>{f2(a.total.n)}</td><td>{f3(a.score)}</td><td colSpan={5} /></tr>;
  const sortLabel = data.exam.exam_type ? `${data.exam.exam_type} sıralı` : 'puan sıralı';
  const pages: any[][] = []; for (let i = 0; i < Math.max(1, students.length); i += ROWS_PER_PAGE) pages.push(students.slice(i, i + ROWS_PER_PAGE));
  return <>{pages.map((rows, pi) => <article className="rp-page" key={pi}>
    <h1 className="rp-title">{className !== undefined ? `SINIF TEST BAZLI NET LİSTESİ · ${className || 'Şubesiz'}` : 'OKUL TEST BAZLI NET LİSTESİ'} ({sortLabel})</h1>
    <HeadTable data={data} />
    <table className="rp-list"><thead>
      <tr><th rowSpan={2}>Sıra</th><th rowSpan={2}>Ö.No</th><th rowSpan={2}>İsim</th><th rowSpan={2}>Sınıf</th>{subjects.map((s) => <th key={s.id} colSpan={3}>{s.name}</th>)}<th colSpan={3}>Toplam</th><th colSpan={6}>{data.exam.exam_type || 'Puan'}</th></tr>
      <tr>{subjects.map((s) => [<th key={s.id + 'd'}>D</th>, <th key={s.id + 'y'}>Y</th>, <th key={s.id + 'n'}>N</th>])}<th>D</th><th>Y</th><th>N</th><th>Puan</th><th>Sn</th><th>Okul</th><th>İlçe</th><th>İl</th><th>Genel</th></tr>
    </thead><tbody>
      {pi === 0 && <>{avgRow('Genel Ortalama', g)}{avgRow('Okul Ortalaması', sc)}{cl && avgRow('Sınıf Ortalaması', cl)}</>}
      {rows.map((s: any, i: number) => { const n = pi * ROWS_PER_PAGE + i; return <tr key={s.id} className={n % 2 === 0 ? 'rp-zebra' : ''}><td>{n + 1}</td><td>{s.number || 0}</td><td className="rp-left">{s.name}</td><td>{s.className || ''}</td>
        {subjects.map((sub) => { const v = s.subjects[sub.id]; return v ? [<td key={sub.id + 'd'}>{v.d}</td>, <td key={sub.id + 'y'}>{v.y}</td>, <td key={sub.id + 'n'}>{f2(v.n)}</td>] : [<td key={sub.id + 'd'} />, <td key={sub.id + 'y'} />, <td key={sub.id + 'n'} />]; })}
        <td>{s.total.d}</td><td>{s.total.y}</td><td><b>{f2(s.total.n)}</b></td><td>{f3(s.score)}</td><td>{s.ranks.class}</td><td>{s.ranks.school}</td><td>{s.ranks.district}</td><td>{s.ranks.city}</td><td>{s.ranks.overall}</td></tr>; })}
    </tbody></table>
    {pages.length > 1 && <div className="rp-pageno">{pi + 1} / {pages.length}</div>}
  </article>)}</>;
}

export type ReportKind = 'OKUL_LIST' | 'OKUL_COMPARE' | 'SINIF_LIST' | 'KARNE';
/** S033: the pages of one exam × institution for the chosen list kinds, in a fixed order. */
export function ReportPages({ data, kinds }: { data: Pack; kinds: ReportKind[] }) {
  const classes = Object.keys(data.averages.byClass || {}).sort((a, b) => a.localeCompare(b, 'tr'));
  return <>
    {kinds.includes('OKUL_LIST') && <SchoolList data={data} />}
    {kinds.includes('OKUL_COMPARE') && <Comparison data={data} />}
    {kinds.includes('SINIF_LIST') && classes.map((c) => <SchoolList key={c} data={data} className={c} />)}
    {kinds.includes('KARNE') && data.students.map((s: any) => <StudentPages key={s.id} data={data} s={s} />)}
  </>;
}

const COLORS = ['#ff7f0e', '#7f7fff', '#ffef00', '#0000ff', '#ff6ff2', '#00e000', '#ff0000', '#00bcd4', '#795548'];
function Bars({ groups, series, max, height = 150 }: { groups: string[]; series: Array<{ label: string; values: number[] }>; max: number; height?: number }) {
  const w = 100 / Math.max(1, groups.length), bw = (w * 0.8) / Math.max(1, series.length);
  const top = Math.max(1, max);
  return <div className="rp-chart"><svg viewBox={`0 0 100 ${height / 3}`} preserveAspectRatio="none" role="img">
    {[0.25, 0.5, 0.75, 1].map((t) => <line key={t} x1="0" x2="100" y1={(height / 3) * (1 - t)} y2={(height / 3) * (1 - t)} stroke="#bbb" strokeDasharray="1 1" strokeWidth="0.15" />)}
    {groups.map((_, gi) => series.map((s, si) => { const v = Math.max(0, Number(s.values[gi] || 0)); const h = (v / top) * (height / 3); return <rect key={`${gi}-${si}`} x={gi * w + w * 0.1 + si * bw} y={height / 3 - h} width={bw * 0.95} height={h} fill={COLORS[si % COLORS.length]} />; }))}
  </svg><div className="rp-chart-x">{groups.map((g) => <span key={g} style={{ width: `${w}%` }}>{g}</span>)}</div><div className="rp-legend">{series.map((s, i) => <span key={s.label}><i style={{ background: COLORS[i % COLORS.length] }} />{s.label}</span>)}</div></div>;
}

function Comparison({ data }: { data: Pack }) {
  const subjects = data.subjects as any[];
  const a = data.averages;
  const levels = [['Okul Ort.', a.school], ['İlçe Ort.', a.district], ['İl Ort.', a.city], ['Genel Ort.', a.general]] as const;
  const maxNet = Math.max(...subjects.map((s) => s.questionCount || 0), 1);
  const classes = Object.keys(a.byClass);
  return <article className="rp-page">
    <h1 className="rp-title">OKUL TEST BAZLI NET LİSTESİ</h1>
    <HeadTable data={data} />
    <div className="rp-charts">
      <div><h3>TESTLERİ NET ORTALAMALARINA GÖRE KIYASLAMA</h3><Bars groups={subjects.map((s) => s.name)} series={levels.map(([label, v]) => ({ label, values: subjects.map((s) => v.subjects[s.id]?.n || 0) }))} max={maxNet} /></div>
      <div><h3>PUAN ORT. GÖRE KIYAS</h3><Bars groups={[data.exam.exam_type || 'Puan']} series={levels.map(([label, v]) => ({ label, values: [v.score || 0] }))} max={500} /></div>
      <div><h3>NET ORTALAMASINA GÖRE ŞUBE KARŞILAŞTIRMA</h3><Bars groups={subjects.map((s) => s.name)} series={classes.map((c) => ({ label: c || 'Şubesiz', values: subjects.map((s) => a.byClass[c].subjects[s.id]?.n || 0) }))} max={maxNet} /></div>
      <div><h3>PUANA GÖRE ŞUBE KIYAS</h3><Bars groups={[data.exam.exam_type || 'Puan']} series={classes.map((c) => ({ label: c || 'Şubesiz', values: [a.byClass[c].score || 0] }))} max={500} /></div>
    </div>
  </article>;
}

function StudentHeader({ data, s }: { data: Pack; s: any }) {
  return <div className="rp-band"><div className="rp-band-top"><strong>{data.institution.name}</strong><span>{[data.institution.city, data.institution.district].filter(Boolean).join(' / ')}</span></div><div className="rp-band-exam">{data.exam.academic_year} {data.exam.publisher_name ? `${data.exam.publisher_name} ` : ''}{data.exam.title}</div>
    <table className="rp-band-student"><tbody><tr><td>Öğrenci</td><td><b>{s.name}</b></td><td>Sınıf</td><td><b>{s.className || ''}</b></td><td>Öğr.No</td><td><b>{s.number || 0}</b></td></tr></tbody></table></div>;
}

function StudentPages({ data, s }: { data: Pack; s: any }) {
  const subjects = data.subjects as any[];
  const totalQ = subjects.reduce((n, x) => n + Number(x.questionCount || 0), 0);
  const a = data.averages, cls = a.byClass[s.className || ''] || a.school;
  const below = (mine: number, avg: unknown) => avg != null && Number(mine) < Number(avg);
  const div = (subjectId: string) => Number(subjects.find((x) => x.id === subjectId)?.wrongDivisor || 0);
  const sectionAvg = (subjectId: string, section: string, scope: 'class' | 'school') => {
    const pool = data.students.filter((x: any) => scope === 'school' || (x.className || '') === (s.className || ''));
    const nets = pool.map((x: any) => { const r = (x.sections[subjectId] || []).find((y: any) => y.name === section); return r ? r.d - (div(subjectId) ? r.y / div(subjectId) : 0) : null; }).filter((x: any) => x != null) as number[];
    return nets.length ? nets.reduce((m, x) => m + x, 0) / nets.length : null;
  };
  return <>
    <article className="rp-page rp-karne">
      <StudentHeader data={data} s={s} />
      <div className="rp-boxes">{[['Soru', totalQ], ['Doğru', s.total.d], ['Yanlış', s.total.y], ['Boş', s.total.b], ['Net', f2(s.total.n)]].map(([l, v]) => <div key={String(l)}><span>{l}</span><b>{v}</b></div>)}</div>
      <table className="rp-score"><thead><tr><th rowSpan={2}>Puan Türü</th><th rowSpan={2}>Puan</th><th rowSpan={2}>Genel Ortalama</th><th colSpan={5}>Sıralamalar</th></tr><tr><th>Sınıf</th><th>Kurum</th><th>İlçe</th><th>İl</th><th>Genel</th></tr></thead>
        <tbody><tr><td><b>{data.exam.exam_type || 'Puan'}</b></td><td className={below(s.score ?? 0, a.general.score) ? 'rp-red' : ''}><b>{f3(s.score)}</b></td><td>{f3(a.general.score)}</td><td><b>{s.ranks.class}</b></td><td><b>{s.ranks.school}</b></td><td><b>{s.ranks.district}</b></td><td><b>{s.ranks.city}</b></td><td><b>{s.ranks.overall}</b></td></tr>
          <tr className="rp-part"><td colSpan={3} className="rp-right"><b>Katılımlar</b></td><td>{s.counts.class}</td><td>{s.counts.school}</td><td>{s.counts.district}</td><td>{s.counts.city}</td><td>{s.counts.overall}</td></tr></tbody></table>
      <table className="rp-tests"><thead><tr><th rowSpan={2}>Ders / Test</th><th rowSpan={2}>Soru</th><th rowSpan={2}>Doğru</th><th rowSpan={2}>Yanlış</th><th rowSpan={2}>Net</th><th rowSpan={2}>Başarı %</th><th colSpan={3}>Ortalamalar</th></tr><tr><th>Sınıf</th><th>Kurum</th><th>Genel</th></tr></thead>
        <tbody>{subjects.map((sub) => { const v = s.subjects[sub.id] || { d: 0, y: 0, b: 0, n: 0 }; const sections = s.sections[sub.id] || []; return [
          ...sections.map((sec: any) => { const net = sec.d - (div(sub.id) ? sec.y / div(sub.id) : 0); const ca = sectionAvg(sub.id, sec.name, 'class'), sa = sectionAvg(sub.id, sec.name, 'school'); return <tr key={sub.id + sec.name}><td className="rp-left"><b>{sec.name}</b></td><td>{sec.s}</td><td>{sec.d}</td><td>{sec.y}</td><td>{f2(net)}</td><td>{pct(net, sec.s)}</td><td className={below(net, ca) ? 'rp-red' : ''}>{f2(ca)}</td><td className={below(net, sa) ? 'rp-red' : ''}>{f2(sa)}</td><td>—</td></tr>; }),
          <tr key={sub.id} className="rp-subject"><td className="rp-left"><b>{sub.name}</b></td><td>{sub.questionCount}</td><td>{v.d}</td><td>{v.y}</td><td>{f2(v.n)}</td><td>{pct(v.n, sub.questionCount)}</td><td className={below(v.n, cls.subjects[sub.id]?.n) ? 'rp-red' : ''}>{f2(cls.subjects[sub.id]?.n)}</td><td className={below(v.n, a.school.subjects[sub.id]?.n) ? 'rp-red' : ''}>{f2(a.school.subjects[sub.id]?.n)}</td><td className={below(v.n, a.general.subjects[sub.id]?.n) ? 'rp-red' : ''}>{f2(a.general.subjects[sub.id]?.n)}</td></tr>]; })}</tbody></table>
      {subjects.map((sub) => { const rows = s.grid[sub.id] || []; if (!rows.length) return null; return <table key={sub.id} className="rp-grid" style={{ width: `${28 + rows.length * 4.4}mm` }}><tbody>
        <tr className="rp-nums"><td /><td />{rows.map((r: any) => <td key={r.no}>{r.no}</td>)}</tr>
        <tr><td className="rp-left">{sub.name}</td><td />{rows.map((r: any) => <td key={r.no} className={r.status === 'WRONG' ? 'rp-wrong' : r.status === 'BLANK' ? 'rp-blank' : ''}>{r.status === 'WRONG' ? String(r.answer || '').toLowerCase() : r.answer}</td>)}</tr>
        <tr><td className="rp-left">Cevap Anahtarı</td><td><b>{s.booklet || ''}</b></td>{rows.map((r: any) => <td key={r.no} className={r.status === 'WRONG' ? 'rp-wrong' : ''}>{r.key}</td>)}</tr>
      </tbody></table>; })}
    </article>
    <article className="rp-page rp-karne">
      <StudentHeader data={data} s={s} />
      <div className="rp-topics">{subjects.map((sub) => { const rows = s.topics[sub.id] || []; if (!rows.length) return null; const groups: string[] = [...new Set<string>(rows.map((r: any) => String(r.section || '')))]; return <div key={sub.id} className="rp-topic-block"><div className="rp-topic-subject">{sub.name}</div>
        {groups.map((g) => <table key={g} className="rp-topic"><thead><tr><th className="rp-left">{g || short(sub.name)}</th><th>S</th><th>D</th><th>Y</th><th>B%</th></tr></thead><tbody>{rows.filter((r: any) => (r.section || '') === g).map((r: any, i: number) => <tr key={r.topic + i} className={i % 2 ? '' : 'rp-zebra-grey'}><td className="rp-left">{String(r.topic).toLocaleUpperCase('tr-TR')}</td><td>{r.s}</td><td>{r.d}</td><td>{r.y}</td><td>{pct(r.d, r.s)}</td></tr>)}</tbody></table>)}
      </div>; })}</div>
    </article>
  </>;
}
