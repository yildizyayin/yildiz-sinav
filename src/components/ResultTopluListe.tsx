import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileText, Printer, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { printSection } from '../lib/printSection';
import { ReportPages, type ReportKind } from './ResultReportPack';
import './result-report-pack.css';
import '../pages/result-network-admin.css';

/**
 * S033 Toplu Liste (owner decision 27 Oct): reports come only from results already saved — no re-evaluation.
 * Exams (publisher → year → exam) · Institutions (city → district → institution, with student counts) · Lists.
 * Only exams and institutions that have results are offered. One PDF, institutions one after another.
 */
type Exam = { id: string; title: string; academic_year: string; exam_type: string; grade_level: number | null; publisher_name: string; application_start_at: string | null; application_end_at: string | null; institutions: number; participants: number };
type Inst = { id: string; name: string; code: string; city: string; district: string; participants: number };

const LISTS: Array<{ group: string; items: Array<{ kind?: ReportKind; label: string; pending?: boolean }> }> = [
  { group: 'Okul ve sınıf listeleri', items: [
    { kind: 'OKUL_LIST', label: 'Okul Test Bazlı Net Listesi (TYT / sınav puanına göre sıralı)' },
    { kind: 'SINIF_LIST', label: 'Sınıf Test Bazlı Net Listesi (her şube ayrı sayfa)' },
    { kind: 'OKUL_COMPARE', label: 'Okul Kıyas Grafikleri (okul / ilçe / il / genel, şube karşılaştırma)' },
    { label: 'Okul ve sınıf listesi — Sayısal / Sözel / Eşit Ağırlık (AYT)', pending: true },
    { label: 'Net Listesi (test bazlı olmayan)', pending: true },
    { label: 'Kurum Şube Ortalamaları', pending: true },
  ] },
  { group: 'Karneler', items: [
    { kind: 'KARNE', label: 'Öğrenci Karnesi (2 sayfa: sonuç + konu analizi)' },
    { label: 'Okul Karnesi', pending: true },
    { label: 'Sınıf (Şube) Karnesi', pending: true },
  ] },
];
const LEVEL_MATCH: Record<string, (e: Exam) => boolean> = {
  YKS: (e) => /^(TYT|AYT|YKS|YDT)/i.test(e.exam_type || ''),
  LGS: (e) => /^LGS/i.test(e.exam_type || '') || Number(e.grade_level) === 8,
  'İlkokul': (e) => Number(e.grade_level) > 0 && Number(e.grade_level) <= 4,
};
const MEMORY = 'anunex_toplu_liste_v1';
const PENDING = 'anunex_toplu_open';
/** Opens Toplu Liste with an exam (and institution) already ticked: used by the evaluation screen and its history. */
export function openTopluListe(examId?: string, institutionId?: string) {
  const detail = { examId, institutionId };
  try { sessionStorage.setItem(PENDING, JSON.stringify(detail)); } catch { /* */ }
  window.dispatchEvent(new CustomEvent('anunex:toplu-open', { detail }));
  setTimeout(() => document.getElementById('result-toplu')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}
const dateRange = (e: Exam) => { const f = (x: string | null) => x ? new Date(x).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : ''; return e.application_start_at ? ` (${f(e.application_start_at)}${e.application_end_at ? `–${f(e.application_end_at)}` : ''})` : ''; };

export function ResultTopluListe({ mode, level }: { mode: 'INSTITUTION' | 'DEALER'; level?: string }) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [examIds, setExamIds] = useState<string[]>([]);
  const [instByExam, setInstByExam] = useState<Record<string, Inst[]>>({});
  const [instIds, setInstIds] = useState<string[]>([]);
  const [kinds, setKinds] = useState<ReportKind[]>(['OKUL_LIST']);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [packs, setPacks] = useState<any[]>([]);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const loadExams = async () => { setError(''); try { setExams((await api<any>(`/api/admin/result-network/operations/toplu/exams?mode=${mode}`)).exams || []); } catch (e: any) { setError(e.message); } };
  useEffect(() => {
    void loadExams();
    try { const m = JSON.parse(localStorage.getItem(MEMORY) || '{}'); if (Array.isArray(m.kinds) && m.kinds.length) setKinds(m.kinds); } catch { /* storage may be blocked */ }
    const apply = (d: any) => { try { sessionStorage.removeItem(PENDING); } catch { /* */ } if (d?.examId) { setExamIds([d.examId]); setInstIds(d.institutionId ? [d.institutionId] : []); setPacks([]); } };
    try { apply(JSON.parse(sessionStorage.getItem(PENDING) || 'null')); } catch { /* */ }
    const onOpen = (ev: Event) => apply((ev as CustomEvent).detail);
    window.addEventListener('anunex:toplu-open', onOpen); return () => window.removeEventListener('anunex:toplu-open', onOpen);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { localStorage.setItem(MEMORY, JSON.stringify({ kinds })); } catch { /* */ } }, [kinds]);
  useEffect(() => { for (const id of examIds) if (!instByExam[id]) void api<any>(`/api/admin/result-network/operations/toplu/institutions?mode=${mode}&examId=${encodeURIComponent(id)}`).then((r) => setInstByExam((m) => ({ ...m, [id]: r.institutions || [] }))).catch((e: any) => setError(e.message)); }, [examIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleExams = exams.filter((e) => !level || !LEVEL_MATCH[level] || LEVEL_MATCH[level](e));
  const examTree = useMemo(() => { const t = new Map<string, Map<string, Exam[]>>(); for (const e of visibleExams) { const p = t.get(e.publisher_name) || new Map(); const y = p.get(e.academic_year) || []; y.push(e); p.set(e.academic_year, y); t.set(e.publisher_name, p); } return t; }, [visibleExams]);
  const institutions = useMemo(() => { const m = new Map<string, Inst>(); for (const id of examIds) for (const i of instByExam[id] || []) { const cur = m.get(i.id); m.set(i.id, cur ? { ...cur, participants: cur.participants + i.participants } : i); } return [...m.values()]; }, [examIds, instByExam]);
  const instTree = useMemo(() => { const t = new Map<string, Map<string, Inst[]>>(); for (const i of institutions) { const c = t.get(i.city) || new Map(); const d = c.get(i.district) || []; d.push(i); c.set(i.district, d); t.set(i.city, c); } return t; }, [institutions]);
  const toggle = (list: string[], id: string) => list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  const setMany = (ids: string[], on: boolean) => setInstIds((cur) => on ? [...new Set([...cur, ...ids])] : cur.filter((x) => !ids.includes(x)));
  const flip = (key: string) => setOpen((o) => ({ ...o, [key]: !o[key] }));

  const build = async () => {
    setBusy(true); setError(''); setPacks([]);
    const jobs = examIds.flatMap((e) => (instByExam[e] || []).filter((i) => instIds.includes(i.id)).map((i) => ({ examId: e, inst: i })));
    if (!jobs.length) { setError('Seçilen sınavlarda sonucu olan bir kurum seçin.'); setBusy(false); return; }
    const out: any[] = [];
    try {
      for (const [n, job] of jobs.entries()) { setProgress(`${n + 1} / ${jobs.length} · ${job.inst.name}`); out.push(await api<any>(`/api/admin/result-network/operations/toplu/pack?examId=${encodeURIComponent(job.examId)}&institutionId=${encodeURIComponent(job.inst.id)}`)); }
      setPacks(out);
    } catch (e: any) { setError(e.message); setPacks(out); } finally { setBusy(false); setProgress(''); }
  };
  const excel = () => {
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines: string[] = [];
    for (const p of packs) {
      lines.push([cell(p.institution.name), cell(`${p.exam.academic_year} ${p.exam.title}`)].join(';'));
      lines.push(['Sıra', 'Ö.No', 'İsim', 'Sınıf', ...p.subjects.flatMap((s: any) => [`${s.name} D`, `${s.name} Y`, `${s.name} N`]), 'Toplam D', 'Toplam Y', 'Toplam N', 'Puan', 'Sınıf', 'Okul', 'İlçe', 'İl', 'Genel'].map(cell).join(';'));
      p.students.forEach((s: any, i: number) => lines.push([i + 1, s.number, s.name, s.className, ...p.subjects.flatMap((sub: any) => { const v = s.subjects[sub.id] || {}; return [v.d, v.y, v.n]; }), s.total.d, s.total.y, s.total.n, s.score, s.ranks.class, s.ranks.school, s.ranks.district, s.ranks.city, s.ranks.overall].map(cell).join(';')));
      lines.push('');
    }
    const href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = href; a.download = 'anunex-toplu-liste.csv'; a.click(); URL.revokeObjectURL(href);
  };

  return <section className="panel result-toplu" id="result-toplu">
    <div className="panel-head"><div><span className="eyebrow">TOPLU LİSTE</span><h2>Raporlar ve karneler</h2><p>Yalnız kayıtlı sonuçlardan üretilir; sınav yeniden değerlendirilmez. Sınav, kurum ve listeleri seçip "Listeyi oluştur"a basın.</p></div><button className="ghost" onClick={() => void loadExams()}><RefreshCw size={16} /> Yenile</button></div>
    {error && <div className="alert error">{error}</div>}
    <div className="toplu-actions"><button className="primary" disabled={busy || !examIds.length || !instIds.length || !kinds.length} onClick={() => void build()}><FileText size={16} /> {busy ? `Hazırlanıyor… ${progress}` : 'Listeyi oluştur'}</button>{packs.length > 0 && <><button className="secondary" onClick={() => printSection(ref.current)}><Printer size={16} /> Yazdır / PDF</button><button className="ghost" onClick={excel}><Download size={16} /> Excel</button></>}</div>
    <div className="toplu-columns">
      <div className="toplu-col"><h3>Sınavlar {examIds.length ? `(${examIds.length})` : ''}</h3><div className="toplu-tree">
        {!visibleExams.length && <p className="empty">Sonucu yüklenmiş sınav yok.</p>}
        {[...examTree.entries()].map(([pub, years]) => <div key={pub}><button className="toplu-node" onClick={() => flip('p:' + pub)}>{open['p:' + pub] === false ? '⊞' : '⊟'} 📁 {pub}</button>
          {open['p:' + pub] !== false && [...years.entries()].map(([year, list]) => <div key={year} className="toplu-indent"><button className="toplu-node" onClick={() => flip(`y:${pub}:${year}`)}>{open[`y:${pub}:${year}`] === false ? '⊞' : '⊟'} 📁 {year}</button>
            {open[`y:${pub}:${year}`] !== false && list.map((e) => <label key={e.id} className="toplu-indent toplu-leaf"><input type="checkbox" checked={examIds.includes(e.id)} onChange={() => { setExamIds((c) => toggle(c, e.id)); setPacks([]); }} /> {e.title}{dateRange(e)} <small>{e.participants} öğrenci · {e.institutions} kurum</small></label>)}</div>)}</div>)}
      </div></div>
      <div className="toplu-col"><h3>Kurumlar {instIds.length ? `(${instIds.length})` : ''}</h3><div className="toplu-tree">
        {!examIds.length && <p className="empty">Önce sınav seçin.</p>}
        {[...instTree.entries()].map(([city, districts]) => { const cityIds = [...districts.values()].flat().map((i) => i.id); return <div key={city}><label className="toplu-node"><input type="checkbox" checked={cityIds.every((id) => instIds.includes(id))} onChange={(e) => setMany(cityIds, e.target.checked)} /> <button type="button" className="link-button" onClick={() => flip('c:' + city)}>{city}</button></label>
          {open['c:' + city] !== false && [...districts.entries()].map(([d, list]) => <div key={d} className="toplu-indent"><label className="toplu-node"><input type="checkbox" checked={list.every((i) => instIds.includes(i.id))} onChange={(e) => setMany(list.map((i) => i.id), e.target.checked)} /> <button type="button" className="link-button" onClick={() => flip(`d:${city}:${d}`)}>{d}</button></label>
            {open[`d:${city}:${d}`] !== false && list.map((i) => <label key={i.id} className="toplu-indent toplu-leaf"><input type="checkbox" checked={instIds.includes(i.id)} onChange={() => setInstIds((c) => toggle(c, i.id))} /> {i.name} <small>{i.participants} öğrenci</small></label>)}</div>)}</div>; })}
      </div></div>
      <div className="toplu-col"><h3>Listeler</h3><div className="toplu-tree">
        {LISTS.map((g) => <div key={g.group}><div className="toplu-node">📁 {g.group}</div>{g.items.map((it) => <label key={it.label} className={`toplu-indent toplu-leaf${it.pending ? ' toplu-pending' : ''}`} title={it.pending ? 'Bu raporun örneği bekleniyor; tasarım uydurulmadı.' : ''}><input type="checkbox" disabled={it.pending} checked={!!it.kind && kinds.includes(it.kind)} onChange={() => it.kind && setKinds((c) => c.includes(it.kind!) ? c.filter((x) => x !== it.kind) : [...c, it.kind!])} /> {it.label}{it.pending && <small> · örnek bekleniyor</small>}</label>)}</div>)}
      </div></div>
    </div>
    {packs.length > 0 && <div className="rp-pages" ref={ref}>{packs.map((p, i) => <ReportPages key={i} data={p} kinds={(['OKUL_LIST', 'OKUL_COMPARE', 'SINIF_LIST', 'KARNE'] as ReportKind[]).filter((k) => kinds.includes(k))} />)}</div>}
  </section>;
}
