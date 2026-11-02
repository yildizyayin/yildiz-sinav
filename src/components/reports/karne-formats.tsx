import { Fragment } from 'react';
import { columnsOf, f2, fScore, pctOf, short, type Bundle, type Inst } from './shared';

/**
 * Öğrenci karnesi biçimleri (owner, 2 Nov): "Tek sayfa" and "Analizli 2 sayfa", chosen when downloading.
 *
 * Maarif (owner-approved 2 Nov): in 2026–2027 grades 5–7 and 9–11 study the Türkiye Yüzyılı Maarif Modeli programme;
 * 8 and 12 stay on the previous programme until 2027–2028. MEB asks reports to show strengths, development areas and
 * suggestions in non-judgemental language and to support self-assessment (tymm.meb.gov.tr/olcme-degerlendirme). So on
 * Maarif grades: "öğrenme çıktısı", Güçlü yönlerim / Gelişim alanlarım, Kişisel gelişimim, ranks shown small, and a
 * paper self-assessment box on the analysis page. No competence level is inferred from multiple-choice nets.
 */
export type KarneFormat = 'ONE' | 'TWO' | 'BOTH';
export const KARNE_FORMATS: Array<[KarneFormat, string, string]> = [
  ['ONE', 'Tek sayfa', 'Özet, sıralar, önceki sınavlar ve soru soru kazanım listesi tek sayfada'],
  ['TWO', 'Analizli 2 sayfa', 'Sonuç sayfası ve kazanım analizi (en fazla 2 sayfa)'],
  ['BOTH', 'İkisi birden', 'Her öğrenci için önce tek sayfa, ardından analizli 2 sayfa'],
];
export const karnePagesPerStudent = (f: KarneFormat) => (f === 'ONE' ? 1 : f === 'TWO' ? 2 : 3);

/** First academic year (start year) each grade studies the Maarif programme. */
const MAARIF_FROM: Record<number, number> = { 1: 2024, 2: 2025, 3: 2026, 4: 2027, 5: 2024, 6: 2025, 7: 2026, 8: 2027, 9: 2024, 10: 2025, 11: 2026, 12: 2027 };
export function isMaarifExam(exam: any): boolean {
  const grade = Number(exam?.grade_level), start = Number(String(exam?.academic_year || '').slice(0, 4));
  return Number.isInteger(grade) && Number.isFinite(start) && MAARIF_FROM[grade] != null && start >= MAARIF_FROM[grade];
}
export const outcomeWord = (maarif: boolean) => (maarif ? 'öğrenme çıktısı' : 'kazanım');

const LEVELS = [['Şube', 'class'], ['Okul', 'school'], ['İlçe', 'district'], ['İl', 'city'], ['Genel', 'general']] as const;

/** Rank, participants and average side by side for each level (owner's sample, our layout). */
export function RankTable({ b, inst, s, compact = false }: { b: Bundle; inst: Inst; s: any; compact?: boolean }) {
  const t = b.scoreTypes[0], cls = (inst.classes as any[]).find((c) => c.name === s.className);
  const r = s.ranks?.[t?.key] || {}, k = s.counts?.[t?.key] || {};
  const avg: Record<string, any> = { class: cls?.avg, school: inst.avg, district: inst.refs?.district, city: inst.refs?.city, general: b.general.avg };
  const value = (a: any) => (a ? (t?.isScore ? fScore(t, a.scores?.[t.key]) : f2(a.total?.n)) : '—');
  return <table className={`rx-t rx-ranktab ${compact ? 'rx-compact' : ''}`}><thead><tr><th className="rx-l" /><th>Sıra</th><th>Katılım</th><th>Ortalama{t?.isScore ? ` (${t.label})` : ' (net)'}</th></tr></thead>
    <tbody>{LEVELS.map(([label, key]) => <tr key={key}><td className="rx-l">{label}</td><td className="rx-n">{r[key] ? Number(r[key]).toLocaleString('tr-TR') : '—'}</td><td>{k[key] ? Number(k[key]).toLocaleString('tr-TR') : '—'}</td><td>{value(avg[key])}</td></tr>)}</tbody></table>;
}

/** Earlier published exams of the same type, newest first, and this exam on top. */
export function HistoryTable({ b, s, maarif }: { b: Bundle; s: any; maarif: boolean }) {
  const exams: Array<{ id: string; title: string; date: string | null }> = (b as any).historyExams || [];
  const list: any[] = s.history || [];
  const t = b.scoreTypes[0];
  const tests = (b.tests as any[]).length <= 4 ? (b.tests as any[]) : []; // more tests do not fit half a page: totals only
  const title = maarif ? 'Kişisel gelişimim' : 'Önceki sınavlar';
  const rows = [{ id: b.exam.id, title: b.exam.title, date: String(b.exam.application_start_at || b.exam.exam_date || '').slice(0, 10) || null, net: s.total?.n, score: s.scores?.[t?.key], tests: Object.fromEntries((b.tests as any[]).map((x) => [x.id, s.tests?.[x.id]?.n])), me: true },
    ...exams.map((e) => { const p = list.find((x) => x.examId === e.id); return p ? { ...e, net: p.net, score: p.score, tests: p.tests, me: false } : null; }).filter(Boolean) as any[]];
  return <div className="rx-hist"><div className="rx-h">{title}{maarif && <small>kendi önceki sonuçlarınla</small>}</div>
    {rows.length < 2 ? <p className="rx-note">Bu sınav türünde yayımlanmış önceki sonucun yok.</p> :
      <table className="rx-t rx-compact"><thead><tr><th className="rx-l">Sınav</th>{tests.map((x) => <th key={x.id}>{short(x.name).slice(0, 10)}</th>)}<th>Net</th>{t?.isScore && <th>Puan</th>}</tr></thead>
        <tbody>{rows.map((e) => <tr key={e.id} className={e.me ? 'rx-me' : ''}><td className="rx-l rx-clip">{e.title}</td>{tests.map((x) => <td key={x.id}>{f2(e.tests?.[x.id])}</td>)}<td className="rx-n">{f2(e.net)}</td>{t?.isScore && <td>{e.score == null ? '—' : fScore(t, e.score)}</td>}</tr>)}</tbody></table>}
  </div>;
}

/** Maarif: strengths and development areas with one short, non-judgemental suggestion. */
export function StrengthCards({ b, s }: { b: Bundle; s: any }) {
  const topics: any[] = (s.topics || []).filter((t: any) => t.s >= 2);
  const strong = topics.filter((t) => t.p >= 75).sort((a, z) => z.p - a.p || z.s - a.s).slice(0, 4);
  const grow = topics.filter((t) => t.p < 50).sort((a, z) => a.p - z.p || z.s - a.s).slice(0, 4);
  const name = (t: any) => `${t.section || short((b.tests as any[]).find((x) => x.id === t.subjectId)?.name || '')} · ${t.topic}`;
  const blanks = grow.reduce((n, t) => n + (t.s - t.d - t.y), 0), wrongs = grow.reduce((n, t) => n + t.y, 0);
  const tip = !grow.length ? '' : blanks > wrongs ? 'Öneri: Bu çıktıların konu özetine dönüp 3–5 örnek soruyu adım adım çöz.' : 'Öneri: Yanlış yaptığın soruların çözümünü kendi çözümünle adım adım karşılaştır.';
  return <>
    <div className="rx-card rx-strong"><h4>Güçlü yönlerim</h4>{strong.length ? <ul className="rx-focus">{strong.map((t, i) => <li key={i}><span>{name(t)}</span><b className="rx-good">%{t.p}</b></li>)}</ul> : <p className="rx-note">Bu sınavda en az iki sorusu olan ve %75'in üzerinde yaptığın bir öğrenme çıktısı yok.</p>}</div>
    <div className="rx-card rx-grow"><h4>Gelişim alanlarım</h4>{grow.length ? <><ul className="rx-focus">{grow.map((t, i) => <li key={i}><span>{name(t)}</span><b>%{t.p}</b></li>)}</ul><p className="rx-note rx-tip">{tip}</p></> : <p className="rx-note">En az iki sorusu olan öğrenme çıktılarının hepsinde %50 ve üzerindesin.</p>}</div>
  </>;
}

/** Maarif paper self-assessment (filled in by hand, nothing is recorded). */
export function SelfAssessment() {
  return <div className="rx-card rx-self"><h4>Öz değerlendirmem <small>kendin doldur</small></h4>
    {['Bu sınavda en iyi yaptığım:', 'Zorlandığım ve nedeni:', 'Bir sonraki sınava kadar yapacağım:'].map((q) => <div key={q} className="rx-self-row"><span>{q}</span><i /></div>)}</div>;
}

/** Topics that fit one analysis page: weakest first when they do not all fit; shown back in test order. */
export function fitTopics(b: Bundle, topics: any[], budget: number) {
  const cost = (list: any[]) => list.length + 2 * new Set(list.map((t) => t.subjectId)).size + new Set(list.filter((t) => t.section).map((t) => `${t.subjectId}|${t.section}`)).size;
  if (cost(topics) <= budget) return { shown: topics, hidden: 0 };
  const order = topics.slice().sort((a, z) => a.p - z.p || z.s - a.s);
  const kept: any[] = [], subj = new Set<string>(), sec = new Set<string>();
  let used = 0;
  for (const t of order) {
    const add = 1 + (subj.has(t.subjectId) ? 0 : 2) + (t.section && !sec.has(`${t.subjectId}|${t.section}`) ? 1 : 0);
    if (used + add > budget) continue;
    kept.push(t); used += add; subj.add(t.subjectId); if (t.section) sec.add(`${t.subjectId}|${t.section}`);
  }
  const rank = new Map((b.tests as any[]).map((x, i) => [x.id, i]));
  const pos = new Map(topics.map((t, i) => [t, i]));
  kept.sort((a, z) => (rank.get(a.subjectId)! - rank.get(z.subjectId)!) || (pos.get(a)! - pos.get(z)!));
  return { shown: kept, hidden: topics.length - kept.length };
}

/** Every question: number, key, the student's answer, result and what it asks; split over 3–4 balanced columns. */
export function QuestionList({ b, s, maarif }: { b: Bundle; s: any; maarif: boolean }) {
  const qs: any[] = (b as any).questions || [];
  type Row = { head: string; cont?: boolean } | { r: any };
  const rows: Row[] = [];
  for (const t of b.tests as any[]) { const list = s.grid?.[t.id] || []; if (!list.length) continue; rows.push({ head: short(t.name) }); for (const r of list) rows.push({ r }); }
  const nCols = Math.max(3, Math.ceil(rows.length / 66));
  const per = Math.ceil(rows.length / nCols);
  const cols: Row[][] = [];
  let lastHead = '';
  for (let i = 0; i < rows.length;) {
    let end = cols.length === nCols - 1 ? rows.length : Math.min(rows.length, i + per); // the last column takes the rest
    if (end < rows.length && 'head' in rows[end - 1]) end--; // never leave a test title alone at the bottom of a column
    const part = rows.slice(i, end);
    if (part[0] && !('head' in part[0]) && lastHead) part.unshift({ head: lastHead, cont: true });
    for (const x of rows.slice(i, end)) if ('head' in x) lastHead = x.head;
    cols.push(part); i = end;
  }
  const mark = (st: string) => (st === 'CORRECT' ? '+' : st === 'WRONG' ? '–' : st === 'CANCELLED' ? '×' : '');
  return <div className="rx-ql"><div className="rx-h">Soru soru {maarif ? 'öğrenme çıktıları' : 'kazanımlar'}<small>sıra: soru no · doğru cevap · senin cevabın · + doğru, – yanlış, boşsa işaretsiz</small></div>
    <div className="rx-ql-cols" style={{ gridTemplateColumns: `repeat(${nCols}, minmax(0, 1fr))` }}>{cols.map((col, ci) => <div key={ci} className="rx-ql-col">
      {col.map((x, i) => 'head' in x ? <div key={`h${i}`} className="rx-ql-h">{x.head}{x.cont ? ' (devam)' : ''}</div> : (() => {
        const q = qs[x.r.t] || {}, st = x.r.status;
        return <Fragment key={i}><div className={`rx-ql-r rx-ql-${st === 'CORRECT' ? 'c' : st === 'WRONG' ? 'w' : st === 'CANCELLED' ? 'x' : 'b'}`}><b>{x.r.no}</b><span>{x.r.key}</span><span>{st === 'CANCELLED' ? '' : x.r.answer || ''}</span><span className="rx-ql-m">{mark(st)}</span><span className="rx-ql-t">{q.code ? <em>{q.code} </em> : null}{q.topic || 'Konu belirtilmemiş'}</span></div></Fragment>;
      })())}
    </div>)}</div></div>;
}

/** Compact test table for the one-page card, with the class / school / general averages beside the student
 * (idea from the owner's Okulizyon sample, 2 Nov): an average above the student's net is shown in red. */
export function TestTable({ b, inst, s }: { b: Bundle; inst: Inst; s: any }) {
  const cols = columnsOf(b, 'NET');
  const cls = (inst.classes as any[]).find((c) => c.name === s.className);
  const refs = [cls?.avg, inst.avg, b.general.avg];
  const ref = (a: any, key: string | null, mine: number | undefined) => { const v = key ? a?.cols?.[key]?.n : a?.total?.n; return <td className={`rx-avg ${v != null && mine != null && Number(v) > Number(mine) ? 'rx-bad' : ''}`}>{f2(v)}</td>; };
  const totalQ = cols.reduce((a, c) => a + c.q, 0);
  return <table className="rx-t rx-compact rx-ttab"><thead><tr><th className="rx-l">Test</th><th>Soru</th><th>D</th><th>Y</th><th>B</th><th>Net</th><th>%</th><th className="rx-sep">Şube</th><th>Okul</th><th>Genel</th></tr></thead>
    <tbody>{cols.map((c) => { const v = s.cols?.[c.key]; return <tr key={c.key}><td className="rx-l rx-clip">{short(c.name)}</td><td>{c.q}</td><td>{v?.d ?? '—'}</td><td>{v?.y ?? '—'}</td><td>{v?.b ?? '—'}</td><td className="rx-n">{f2(v?.n)}</td><td>{pctOf(v?.n || 0, c.q)}</td>
      {refs.map((a, i) => <Fragment key={i}>{ref(a, c.key, v?.n)}</Fragment>)}</tr>; })}
      <tr className="rx-total"><td className="rx-l">Toplam</td><td>{totalQ}</td><td>{s.total?.d}</td><td>{s.total?.y}</td><td>{s.total?.b}</td><td className="rx-n">{f2(s.total?.n)}</td><td>{pctOf(s.total?.n || 0, totalQ)}</td>{refs.map((a, i) => <Fragment key={i}>{ref(a, null, s.total?.n)}</Fragment>)}</tr></tbody></table>;
}
