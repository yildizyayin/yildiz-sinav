import { KurumKarne, OgrenciKarne, SubeKarne } from './karnes';
import { BransRaporu, Gelisim, KonuEksik, MaddeAnalizi } from './extras';
import { NetList, SchoolAverages } from './lists';
import { columnsOf, type Bundle } from './shared';
import './reports.css';

/** S034: the report family rendered as A4 pages (lists landscape, student cards portrait). */
export type ReportKind = 'KURUM_ORT' | 'OKUL_NET' | 'OKUL_TEST' | 'SINIF_NET' | 'SINIF_TEST' | 'KURUM_KARNE' | 'SUBE_KARNE' | 'MADDE' | 'BRANS' | 'KONU_EKSIK' | 'OGRENCI_KARNE' | 'GELISIM';
export const KIND_ORDER: ReportKind[] = ['KURUM_ORT', 'OKUL_NET', 'OKUL_TEST', 'SINIF_NET', 'SINIF_TEST', 'KURUM_KARNE', 'SUBE_KARNE', 'MADDE', 'BRANS', 'KONU_EKSIK', 'OGRENCI_KARNE', 'GELISIM'];

export function BundlePages({ b, kinds, types }: { b: Bundle; kinds: ReportKind[]; types?: string[] }) {
  const has = (k: ReportKind) => kinds.includes(k);
  const scoreTypes = (b.scoreTypes as any[]).filter((t) => !types?.length || types.includes(t.key));
  const listTypes = scoreTypes.length ? scoreTypes : b.scoreTypes;
  return <>
    {has('KURUM_ORT') && (b.districtSchools as any[]).map((ds) => listTypes.map((t: any) => <SchoolAverages key={`${ds.key}-${t.key}`} b={b} ds={ds} t={t} />))}
    {(b.institutions as any[]).map((inst) => <div key={inst.id} style={{ display: 'contents' }}>
      {has('OKUL_NET') && listTypes.map((t: any) => <NetList key={`on-${t.key}`} b={b} inst={inst} t={t} mode="NET" />)}
      {has('OKUL_TEST') && listTypes.map((t: any) => <NetList key={`ot-${t.key}`} b={b} inst={inst} t={t} mode="TEST" />)}
      {has('SINIF_NET') && inst.classes.map((c: any) => listTypes.map((t: any) => <NetList key={`sn-${c.name}-${t.key}`} b={b} inst={inst} cls={c.name} t={t} mode="NET" />))}
      {has('SINIF_TEST') && inst.classes.map((c: any) => listTypes.map((t: any) => <NetList key={`st-${c.name}-${t.key}`} b={b} inst={inst} cls={c.name} t={t} mode="TEST" />))}
      {has('KURUM_KARNE') && <KurumKarne b={b} inst={inst} />}
      {has('SUBE_KARNE') && inst.classes.map((c: any) => <SubeKarne key={c.name} b={b} inst={inst} cls={c} />)}
      {has('MADDE') && <MaddeAnalizi b={b} inst={inst} />}
      {has('BRANS') && <BransRaporu b={b} inst={inst} />}
      {has('KONU_EKSIK') && <KonuEksik b={b} inst={inst} />}
      {has('OGRENCI_KARNE') && (inst.students as any[]).slice().sort((a, z) => a.className.localeCompare(z.className, 'tr') || a.name.localeCompare(z.name, 'tr')).map((s) => <OgrenciKarne key={s.id} b={b} inst={inst} s={s} />)}
    </div>)}
  </>;
}

/** Default page for report printing: A4 landscape (student cards use the named portrait page). Kept inside the printed
 * section so it comes after the app's own @page rules and wins the cascade. */
export const PrintSetup = () => <style>{'@media print{@page{size:A4 landscape;margin:0}@page rxland{size:A4 landscape;margin:0}@page rxport{size:A4 portrait;margin:0}}'}</style>;

export function GrowthPages({ g }: { g: any }) { return <Gelisim g={g} />; }

/** Excel: one sheet per report type, every selected school and exam in it. */
export async function exportWorkbook(bundles: Bundle[], growth: any[], fileName = 'anunex-raporlar.xlsx') {
  const XLSX = await import('xlsx');
  const book = XLSX.utils.book_new();
  const add = (name: string, rows: any[][]) => { if (rows.length > 1) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name.slice(0, 31)); };
  // One set of sheets per exam (exams have different tests); numbered when several exams are exported together.
  const byExam = new Map<string, Bundle[]>();
  for (const b of bundles) { const l = byExam.get(b.exam.id) || []; l.push(b); byExam.set(b.exam.id, l); }
  let n = 0;
  for (const group of byExam.values()) {
    n++;
    const tag = byExam.size > 1 ? ` ${n}` : '';
    const lists: any[][] = [], schools: any[][] = [], classes: any[][] = [], topics: any[][] = [], items: any[][] = [];
    for (const b of group) {
      const cols = columnsOf(b, 'NET'), types = b.scoreTypes as any[];
      const exam = `${b.exam.academic_year} ${b.exam.publisher_name || ''} ${b.exam.title}`.replace(/\s+/g, ' ').trim();
      if (!lists.length) lists.push(['Sınav', 'Kurum', 'İl', 'İlçe', 'No', 'Ad Soyad', 'Şube', ...cols.flatMap((c) => [`${c.name} D`, `${c.name} Y`, `${c.name} N`]), 'Toplam D', 'Toplam Y', 'Toplam B', 'Toplam N', ...types.flatMap((t) => [t.label, `${t.label} şube sırası`, `${t.label} okul sırası`, `${t.label} ilçe sırası`, `${t.label} il sırası`, `${t.label} genel sırası`])]);
      if (!schools.length) schools.push(['Sınav', 'Kurum', 'İl', 'İlçe', 'Öğrenci', ...cols.map((c) => `${c.name} net`), 'Toplam net', ...types.map((t) => t.label), 'İlçe sırası', 'İl sırası', 'Genel sırası']);
      if (!classes.length) classes.push(['Sınav', 'Kurum', 'Şube', 'Öğrenci', ...cols.map((c) => `${c.name} net`), 'Toplam net', ...types.map((t) => t.label), 'Okulda', 'İlçede', 'Genelde']);
      if (!topics.length) topics.push(['Sınav', 'Kurum', 'Kapsam', 'Test', 'Alt test', 'Kazanım', 'Soru', 'Ort. doğru', 'Ort. yanlış', 'Başarı %']);
      if (!items.length) items.push(['Sınav', 'Kurum', 'Test', 'Alt test', 'Soru', 'Cevap', 'Kazanım', 'Okul %', 'Genel %', 'A %', 'B %', 'C %', 'D %', 'E %', 'Boş %']);
      const testName = new Map((b.tests as any[]).map((t) => [t.id, t.name]));
      for (const inst of b.institutions as any[]) {
        for (const s of inst.students) lists.push([exam, inst.name, inst.city, inst.district, s.number || '', s.name, s.className, ...cols.flatMap((c) => { const v = s.cols[c.key]; return v ? [v.d, v.y, v.n] : ['', '', '']; }), s.total.d, s.total.y, s.total.b, s.total.n, ...types.flatMap((t) => { const r = s.ranks[t.key] || {}; return [s.scores[t.key] ?? '', r.class || '', r.school || '', r.district || '', r.city || '', r.general || '']; })]);
        schools.push([exam, inst.name, inst.city, inst.district, inst.avg.count, ...cols.map((c) => inst.avg.cols[c.key]?.n ?? ''), inst.avg.total.n, ...types.map((t) => inst.avg.scores[t.key] ?? ''), `${inst.rank.district[0]}/${inst.rank.district[1]}`, `${inst.rank.city[0]}/${inst.rank.city[1]}`, `${inst.rank.general[0]}/${inst.rank.general[1]}`]);
        for (const c of inst.classes) classes.push([exam, inst.name, c.name, c.avg.count, ...cols.map((k) => c.avg.cols[k.key]?.n ?? ''), c.avg.total.n, ...types.map((t) => c.avg.scores[t.key] ?? ''), `${c.rank.school[0]}/${c.rank.school[1]}`, `${c.rank.district[0]}/${c.rank.district[1]}`, `${c.rank.general[0]}/${c.rank.general[1]}`]);
        const topicRows = (scope: string, list: any[]) => { for (const t of list) topics.push([exam, inst.name, scope, testName.get(t.subjectId), t.section || '', t.topic, t.s, t.d, t.y, t.p]); };
        topicRows('Okul', inst.topics); for (const c of inst.classes) topicRows(`Şube ${c.name}`, c.topics);
        for (const q of inst.items) { const n = q.school.n || 1; items.push([exam, inst.name, testName.get(q.subjectId), q.section || '', q.no, q.key, q.topic, q.school.p, q.general.p, ...['A', 'B', 'C', 'D', 'E', '-'].map((o) => Math.round((100 * (q.school.dist[o] || 0)) / n))]); }
      }
    }

    add(`Öğrenci Listesi${tag}`, lists); add(`Kurum Ortalamaları${tag}`, schools); add(`Şube Ortalamaları${tag}`, classes); add(`Kazanımlar${tag}`, topics); add(`Madde Analizi${tag}`, items);
  }
  for (const g of growth) {
    const exams = g.exams as any[];
    add(`Gelişim ${String(g.institution?.name || '').slice(0, 20)}`, [['Ad Soyad', 'No', 'Şube', ...exams.flatMap((e) => [`${e.title} net`, `${e.title} puan`])], ...(g.students as any[]).map((s) => [s.name, s.number || '', s.className, ...exams.flatMap((e) => [s.points[e.id]?.net ?? '', s.points[e.id]?.score ?? ''])])]);
  }
  if (!book.SheetNames.length) return false;
  XLSX.writeFile(book, fileName);
  return true;
}
