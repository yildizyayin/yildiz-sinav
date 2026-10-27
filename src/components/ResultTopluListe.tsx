import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileText, Printer, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { printSection } from '../lib/printSection';
import { BundlePages, exportWorkbook, GrowthPages, KIND_ORDER, PrintSetup, type ReportKind } from './reports/ReportFamily';
import '../pages/result-network-admin.css';

/**
 * S033 Toplu Liste (owner decision 27 Oct): reports come only from results already saved — no re-evaluation.
 * Exams (publisher → year → exam) · Institutions (city → district → institution, with student counts) · Lists.
 * Only exams and institutions that have results are offered. One PDF, institutions one after another.
 */
type Exam = { id: string; title: string; academic_year: string; exam_type: string; grade_level: number | null; publisher_name: string; application_start_at: string | null; application_end_at: string | null; institutions: number; participants: number };
type Inst = { id: string; name: string; code: string; city: string; district: string; participants: number };

const LISTS: Array<{ group: string; items: Array<{ kind: ReportKind; label: string; hint?: string }> }> = [
  { group: 'Okul ve şube listeleri', items: [
    { kind: 'OKUL_NET', label: 'Okul Net Listesi (alt testlerle)', hint: 'Tarih-1, Coğrafya-1 gibi alt testler cevap anahtarında DERS sütunu varsa ayrı gösterilir.' },
    { kind: 'OKUL_TEST', label: 'Okul Test Bazlı Net Listesi (sıralarla)' },
    { kind: 'SINIF_NET', label: 'Şube Net Listesi (her şube ayrı sayfa)' },
    { kind: 'SINIF_TEST', label: 'Şube Test Bazlı Net Listesi (sınıf raporu)' },
    { kind: 'KURUM_ORT', label: 'İlçedeki Kurum Ortalamaları (bayi raporu)', hint: 'Seçilen kurumlar ilçe ilçe, ilçe/il/genel ortalamasıyla.' },
  ] },
  { group: 'Karneler', items: [
    { kind: 'KURUM_KARNE', label: 'Kurum Karnesi (özet, kıyaslar, kazanım analizi)' },
    { kind: 'SUBE_KARNE', label: 'Şube Karnesi (her şube)' },
    { kind: 'OGRENCI_KARNE', label: 'Öğrenci Karnesi (sonuç + kazanım analizi)' },
  ] },
  { group: 'Analizler', items: [
    { kind: 'MADDE', label: 'Madde Analizi (soru başına başarı ve şık dağılımı)' },
    { kind: 'BRANS', label: 'Branş Raporu (kazanım × şube başarı tablosu)' },
    { kind: 'KONU_EKSIK', label: 'Konu Eksik Listesi (öğrenci başına en zayıf 5 kazanım)' },
    { kind: 'GELISIM', label: 'Gelişim Raporu (seçilen denemeler boyunca)', hint: 'En az iki sınav seçin; öğrenciler okul no, yoksa ad soyadla eşleşir.' },
  ] },
];
const AYT_TYPES = [['SAY', 'Sayısal'], ['SOZ', 'Sözel'], ['EA', 'Eşit Ağırlık']] as const;
const isAyt = (e?: Exam) => /^AYT/i.test(e?.exam_type || '');
const isTyt = (e?: Exam) => /^TYT/i.test(e?.exam_type || '');
const LEVEL_MATCH: Record<string, (e: Exam) => boolean> = {
  YKS: (e) => /^(TYT|AYT|YKS|YDT)/i.test(e.exam_type || ''),
  LGS: (e) => /^LGS/i.test(e.exam_type || '') || Number(e.grade_level) === 8,
  'İlkokul': (e) => Number(e.grade_level) > 0 && Number(e.grade_level) <= 4,
};
const MEMORY = 'anunex_toplu_liste_v2';
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
  const [kinds, setKinds] = useState<ReportKind[]>(['OKUL_NET']);
  const [aytMode, setAytMode] = useState<'COMBINED' | 'AYT_ONLY'>('COMBINED');
  const [pairExamId, setPairExamId] = useState('');
  const [aytTypes, setAytTypes] = useState<string[]>(['SAY', 'SOZ', 'EA']);
  const [growth, setGrowth] = useState<any[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [packs, setPacks] = useState<any[]>([]);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const loadExams = async () => { setError(''); try { setExams((await api<any>(`/api/admin/result-network/operations/toplu/exams?mode=${mode}`)).exams || []); } catch (e: any) { setError(e.message); } };
  useEffect(() => {
    void loadExams();
    try { const m = JSON.parse(localStorage.getItem(MEMORY) || '{}'); if (Array.isArray(m.kinds) && m.kinds.length) setKinds(m.kinds.filter((k: any) => KIND_ORDER.includes(k))); if (m.aytMode) setAytMode(m.aytMode); if (Array.isArray(m.aytTypes) && m.aytTypes.length) setAytTypes(m.aytTypes); } catch { /* storage may be blocked */ }
    const apply = (d: any) => { try { sessionStorage.removeItem(PENDING); } catch { /* */ } if (d?.examId) { setExamIds([d.examId]); setInstIds(d.institutionId ? [d.institutionId] : []); setPacks([]); } };
    try { apply(JSON.parse(sessionStorage.getItem(PENDING) || 'null')); } catch { /* */ }
    const onOpen = (ev: Event) => apply((ev as CustomEvent).detail);
    window.addEventListener('anunex:toplu-open', onOpen); return () => window.removeEventListener('anunex:toplu-open', onOpen);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { localStorage.setItem(MEMORY, JSON.stringify({ kinds, aytMode, aytTypes })); } catch { /* */ } }, [kinds, aytMode, aytTypes]);
  useEffect(() => { for (const id of examIds) if (!instByExam[id]) void api<any>(`/api/admin/result-network/operations/toplu/institutions?mode=${mode}&examId=${encodeURIComponent(id)}`).then((r) => setInstByExam((m) => ({ ...m, [id]: r.institutions || [] }))).catch((e: any) => setError(e.message)); }, [examIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleExams = exams.filter((e) => !level || !LEVEL_MATCH[level] || LEVEL_MATCH[level](e));
  const examTree = useMemo(() => { const t = new Map<string, Map<string, Exam[]>>(); for (const e of visibleExams) { const p = t.get(e.publisher_name) || new Map(); const y = p.get(e.academic_year) || []; y.push(e); p.set(e.academic_year, y); t.set(e.publisher_name, p); } return t; }, [visibleExams]);
  const institutions = useMemo(() => { const m = new Map<string, Inst>(); for (const id of examIds) for (const i of instByExam[id] || []) { const cur = m.get(i.id); m.set(i.id, cur ? { ...cur, participants: cur.participants + i.participants } : i); } return [...m.values()]; }, [examIds, instByExam]);
  const instTree = useMemo(() => { const t = new Map<string, Map<string, Inst[]>>(); for (const i of institutions) { const c = t.get(i.city) || new Map(); const d = c.get(i.district) || []; d.push(i); c.set(i.district, d); t.set(i.city, c); } return t; }, [institutions]);
  const toggle = (list: string[], id: string) => list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  const setMany = (ids: string[], on: boolean) => setInstIds((cur) => on ? [...new Set([...cur, ...ids])] : cur.filter((x) => !ids.includes(x)));
  const flip = (key: string) => setOpen((o) => ({ ...o, [key]: !o[key] }));

  const selectedExams = exams.filter((e) => examIds.includes(e.id));
  const anyAyt = selectedExams.some(isAyt);
  const tytChoices = exams.filter(isTyt);
  const build = async () => {
    setBusy(true); setError(''); setPacks([]); setGrowth([]);
    const out: any[] = [], grown: any[] = [];
    try {
      const reportKinds = kinds.filter((k) => k !== 'GELISIM');
      if (reportKinds.length) for (const [n, e] of selectedExams.entries()) {
        const ids = (instByExam[e.id] || []).filter((i) => instIds.includes(i.id)).map((i) => i.id);
        for (let k = 0; k < ids.length; k += 25) {
          setProgress(`${n + 1}/${selectedExams.length} sınav · ${Math.min(k + 25, ids.length)}/${ids.length} kurum`);
          const q = new URLSearchParams({ examId: e.id, institutionIds: ids.slice(k, k + 25).join(','), ayt: aytMode, ...(pairExamId ? { pairExamId } : {}) });
          out.push(await api<any>(`/api/admin/result-network/operations/toplu/bundle?${q}`));
        }
      }
      if (kinds.includes('GELISIM')) {
        if (examIds.length < 2) setError('Gelişim raporu için en az iki sınav seçin.');
        else for (const id of instIds) {
          const taken = examIds.filter((e) => (instByExam[e] || []).some((i) => i.id === id));
          if (taken.length < 2) continue;
          setProgress(`Gelişim · ${institutions.find((i) => i.id === id)?.name || ''}`);
          grown.push(await api<any>(`/api/admin/result-network/operations/toplu/growth?institutionId=${encodeURIComponent(id)}&examIds=${taken.map(encodeURIComponent).join(',')}`));
        }
      }
      if (!out.length && !grown.length) setError((e) => e || 'Seçilen sınavlarda sonucu olan bir kurum seçin.');
    } catch (e: any) { setError(e.message); } finally { setPacks(out); setGrowth(grown); setBusy(false); setProgress(''); }
  };
  const excel = async () => { try { if (!(await exportWorkbook(packs, growth))) setError('Excel için veri yok.'); } catch (e: any) { setError(e.message || 'Excel oluşturulamadı.'); } };
  const ordered = KIND_ORDER.filter((k) => kinds.includes(k));

  return <section className="panel result-toplu" id="result-toplu">
    <div className="panel-head"><div><span className="eyebrow">TOPLU LİSTE</span><h2>Raporlar ve karneler</h2><p>Yalnız kayıtlı sonuçlardan üretilir; sınav yeniden değerlendirilmez. Sınav, kurum ve listeleri seçip "Listeyi oluştur"a basın.</p></div><button className="ghost" onClick={() => void loadExams()}><RefreshCw size={16} /> Yenile</button></div>
    {error && <div className="alert error">{error}</div>}
    <div className="toplu-actions"><button className="primary" disabled={busy || !examIds.length || !instIds.length || !kinds.length} onClick={() => void build()}><FileText size={16} /> {busy ? `Hazırlanıyor… ${progress}` : 'Listeyi oluştur'}</button>{(packs.length > 0 || growth.length > 0) && <><button className="secondary" onClick={() => printSection(ref.current)}><Printer size={16} /> Yazdır / PDF</button><button className="ghost" onClick={() => void excel()}><Download size={16} /> Excel</button></>}</div>
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
        {LISTS.map((g) => <div key={g.group}><div className="toplu-node">📁 {g.group}</div>{g.items.map((it) => <label key={it.kind} className="toplu-indent toplu-leaf" title={it.hint || ''}><input type="checkbox" checked={kinds.includes(it.kind)} onChange={() => setKinds((c) => c.includes(it.kind) ? c.filter((x) => x !== it.kind) : [...c, it.kind])} /> {it.label}</label>)}</div>)}
        {anyAyt && <div className="toplu-ayt"><div className="toplu-node">AYT puanı</div>
          <label className="toplu-indent toplu-leaf"><input type="radio" name="ayt" checked={aytMode === 'COMBINED'} onChange={() => setAytMode('COMBINED')} /> TYT ile birleşik (SAY / SÖZ / EA puanı)</label>
          {aytMode === 'COMBINED' && <label className="toplu-indent toplu-leaf toplu-select">TYT sınavı <select value={pairExamId} onChange={(e) => setPairExamId(e.target.value)}><option value="">Otomatik (aynı yıl, aynı yayın)</option>{tytChoices.map((e) => <option key={e.id} value={e.id}>{e.academic_year} · {e.publisher_name} · {e.title}</option>)}</select></label>}
          <label className="toplu-indent toplu-leaf"><input type="radio" name="ayt" checked={aytMode === 'AYT_ONLY'} onChange={() => setAytMode('AYT_ONLY')} /> Yalnız AYT (puansız, alan netine göre)</label>
          <div className="toplu-indent toplu-leaf">{AYT_TYPES.map(([k, l]) => <label key={k} style={{ marginRight: 10 }}><input type="checkbox" checked={aytTypes.includes(k)} onChange={() => setAytTypes((c) => c.includes(k) ? c.filter((x) => x !== k) : [...c, k])} /> {l}</label>)}</div>
          <small className="toplu-indent">Birleşikte öğrencinin kendi TYT'si kullanılır; bulunamazsa okulun TYT ortalaması alınır ve karnede yazılır.</small></div>}
      </div></div>
    </div>
    {(packs.length > 0 || growth.length > 0) && <div className="rx-pages" ref={ref}><PrintSetup />{packs.map((p, i) => <BundlePages key={i} b={p} kinds={ordered} types={p.family === 'AYT' ? aytTypes : undefined} />)}{growth.map((g, i) => <GrowthPages key={`g${i}`} g={g} />)}</div>}
  </section>;
}
