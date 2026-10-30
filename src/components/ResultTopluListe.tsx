import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { downloadPagesAsPdf, pdfFileName, preloadPdfTools } from '../lib/downloadPdf';
import { BundlePages, exportWorkbook, GrowthPages, KIND_ORDER, PrintSetup, type ReportKind } from './reports/ReportFamily';
import './report-center.css';

/**
 * S036 Rapor Merkezi (owner decision 27 Oct, design "A+B karma"): steps on the left — exam, institution, reports —
 * finished steps fold into one line with "Değiştir"; on the right the real pages are previewed one by one and the
 * whole set downloads as one PDF (institutions in sequence) or Excel. Reports come only from saved results.
 */
type Exam = { id: string; title: string; academic_year: string; exam_type: string; grade_level: number | null; publisher_name: string; application_start_at: string | null; application_end_at: string | null; institutions: number; participants: number };
type Inst = { id: string; name: string; code: string; city: string; district: string; participants: number };
type Glyph = 'list' | 'card' | 'portrait' | 'heat' | 'line';
type Item = { kind: ReportKind; label: string; desc: string; glyph: Glyph; pages: (students: number, schools: number, exams: number, districts: number) => number };

const per = (n: number, size: number) => Math.max(1, Math.ceil(n / size));
const MAIN: Item[] = [
  { kind: 'OKUL_NET', label: 'Okul net listesi', desc: 'Alt testlerle, puana göre sıralı', glyph: 'list', pages: (s, k) => per(s, 30) * Math.max(1, k) },
  { kind: 'KURUM_KARNE', label: 'Kurum karnesi', desc: 'Özet, kıyaslar, kazanım analizi', glyph: 'card', pages: (_s, k) => 3 * k },
  { kind: 'SUBE_KARNE', label: 'Şube karnesi', desc: 'Her şube: kıyas ve kazanım', glyph: 'card', pages: (s) => 2 * per(s, 25) },
  { kind: 'OGRENCI_KARNE', label: 'Öğrenci karnesi', desc: 'Sonuç, cevaplar, kazanım, Nibiru notu', glyph: 'portrait', pages: (s) => 2 * s },
  { kind: 'MADDE', label: 'Madde analizi', desc: 'Soru başına başarı ve şık dağılımı', glyph: 'heat', pages: (_s, k) => 4 * k },
];
const MORE: Item[] = [
  { kind: 'OKUL_TEST', label: 'Okul test bazlı liste', desc: 'Ana testler ve sıralar', glyph: 'list', pages: (s, k) => per(s, 32) * Math.max(1, k) },
  { kind: 'SINIF_NET', label: 'Şube net listeleri', desc: 'Her şube ayrı sayfa, alt testlerle', glyph: 'list', pages: (s) => per(s, 25) },
  { kind: 'SINIF_TEST', label: 'Şube test bazlı listeler', desc: 'Sınıf raporu', glyph: 'list', pages: (s) => per(s, 25) },
  { kind: 'KURUM_ORT', label: 'İlçedeki kurum ortalamaları', desc: 'Bayi raporu: okullar ilçe ilçe', glyph: 'list', pages: (_s, _k, _e, d) => Math.max(1, d) },
  { kind: 'BRANS', label: 'Branş raporu', desc: 'Kazanım × şube başarı tablosu', glyph: 'heat', pages: (_s, k) => 2 * k },
  { kind: 'KONU_EKSIK', label: 'Konu eksik listesi', desc: 'Öğrenci başına en zayıf 5 kazanım', glyph: 'list', pages: (s) => per(s, 16) },
  { kind: 'GELISIM', label: 'Gelişim raporu', desc: 'En az iki sınav: denemeler boyunca', glyph: 'line', pages: (s, k, e) => (e >= 2 ? per(s, 28) * Math.max(1, k) : 0) },
];
const ALL = [...MAIN, ...MORE];
const AYT_TYPES = [['SAY', 'Sayısal'], ['SOZ', 'Sözel'], ['EA', 'Eşit Ağırlık']] as const;
const isAyt = (e?: Exam) => /^AYT/i.test(e?.exam_type || '');
const isTyt = (e?: Exam) => /^TYT/i.test(e?.exam_type || '');
const LEVELS: Array<[string, (e: Exam) => boolean]> = [
  ['Tümü', () => true],
  ['YKS', (e) => /^(TYT|AYT|YKS|YDT)/i.test(e.exam_type || '')],
  ['LGS', (e) => /^LGS/i.test(e.exam_type || '') || Number(e.grade_level) === 8],
  ['İlkokul', (e) => Number(e.grade_level) > 0 && Number(e.grade_level) <= 4],
];
const MEMORY = 'anunex_toplu_liste_v2';
const PENDING = 'anunex_toplu_open';
/** Opens Rapor Merkezi with an exam (and institution) already ticked: used by the evaluation screen and its history. */
export function openTopluListe(examId?: string, institutionId?: string) {
  const detail = { examId, institutionId };
  try { sessionStorage.setItem(PENDING, JSON.stringify(detail)); } catch { /* */ }
  window.dispatchEvent(new CustomEvent('anunex:toplu-open', { detail }));
  setTimeout(() => document.getElementById('result-toplu')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}
const fold = (s: string) => s.toLocaleLowerCase('tr-TR');

function GlyphIcon({ g }: { g: Glyph }) {
  if (g === 'portrait') return <span className="rm-glyph rm-glyph-p" aria-hidden="true"><i /><i /><i className="rm-g-box" /></span>;
  if (g === 'card') return <span className="rm-glyph rm-glyph-c" aria-hidden="true"><i /><i /><i /><i className="rm-g-bars" /></span>;
  if (g === 'heat') return <span className="rm-glyph rm-glyph-h" aria-hidden="true">{['#CDEBDC', '#FFF1D6', '#CDEBDC', '#FCDCD3', '#E6F4EC', '#CDEBDC', '#E6F4EC', '#FFF1D6', '#CDEBDC', '#FCDCD3'].map((c, i) => <i key={i} style={{ background: c }} />)}</span>;
  if (g === 'line') return <span className="rm-glyph" aria-hidden="true"><svg viewBox="0 0 40 24"><polyline points="2,20 12,14 22,16 32,6 38,8" fill="none" stroke="#2563EB" strokeWidth="2.4" /></svg></span>;
  return <span className="rm-glyph rm-glyph-l" aria-hidden="true"><i /><i /><i /><i /><i /></span>;
}

export function ResultTopluListe({ mode, level: initialLevel }: { mode: 'INSTITUTION' | 'DEALER'; level?: string }) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [examIds, setExamIds] = useState<string[]>([]);
  const [instByExam, setInstByExam] = useState<Record<string, Inst[]>>({});
  const [instIds, setInstIds] = useState<string[]>([]);
  const [kinds, setKinds] = useState<ReportKind[]>(['OKUL_NET']);
  const [aytMode, setAytMode] = useState<'COMBINED' | 'AYT_ONLY'>('COMBINED');
  const [pairExamId, setPairExamId] = useState('');
  const [aytTypes, setAytTypes] = useState<string[]>(['SAY', 'SOZ', 'EA']);
  const [level, setLevel] = useState(initialLevel && LEVELS.some(([l]) => l === initialLevel) ? initialLevel : 'Tümü');
  const [editExam, setEditExam] = useState(true);
  const [editInst, setEditInst] = useState(true);
  const [showMore, setShowMore] = useState(false);
  const [examQuery, setExamQuery] = useState('');
  const [instQuery, setInstQuery] = useState('');
  const [city, setCity] = useState('');
  const [packs, setPacks] = useState<any[]>([]);
  const [growth, setGrowth] = useState<any[]>([]);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);

  const loadExams = async () => { setError(''); try { setExams((await api<any>(`/api/admin/result-network/operations/toplu/exams?mode=${mode}`)).exams || []); } catch (e: any) { setError(e.message); } };
  useEffect(() => {
    void loadExams();
    try { const m = JSON.parse(localStorage.getItem(MEMORY) || '{}'); if (Array.isArray(m.kinds) && m.kinds.length) setKinds(m.kinds.filter((k: any) => KIND_ORDER.includes(k))); if (m.aytMode) setAytMode(m.aytMode); if (Array.isArray(m.aytTypes) && m.aytTypes.length) setAytTypes(m.aytTypes); } catch { /* storage may be blocked */ }
    const apply = (d: any) => { try { sessionStorage.removeItem(PENDING); } catch { /* */ } if (d?.examId) { setExamIds([d.examId]); setInstIds(d.institutionId ? [d.institutionId] : []); setEditExam(false); setEditInst(!d.institutionId); setPacks([]); } };
    try { apply(JSON.parse(sessionStorage.getItem(PENDING) || 'null')); } catch { /* */ }
    const onOpen = (ev: Event) => apply((ev as CustomEvent).detail);
    window.addEventListener('anunex:toplu-open', onOpen); return () => window.removeEventListener('anunex:toplu-open', onOpen);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { localStorage.setItem(MEMORY, JSON.stringify({ kinds, aytMode, aytTypes })); } catch { /* */ } }, [kinds, aytMode, aytTypes]);
  useEffect(() => { for (const id of examIds) if (!instByExam[id]) void api<any>(`/api/admin/result-network/operations/toplu/institutions?mode=${mode}&examId=${encodeURIComponent(id)}`).then((r) => setInstByExam((m) => ({ ...m, [id]: r.institutions || [] }))).catch((e: any) => setError(e.message)); }, [examIds]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPacks([]); setGrowth([]); }, [examIds, instIds, kinds, aytMode, pairExamId, aytTypes]);

  const match = LEVELS.find(([l]) => l === level)?.[1] || (() => true);
  const visibleExams = exams.filter(match).filter((e) => !examQuery.trim() || fold(`${e.title} ${e.publisher_name} ${e.academic_year} ${e.exam_type}`).includes(fold(examQuery.trim())));
  const institutions = useMemo(() => { const m = new Map<string, Inst>(); for (const id of examIds) for (const i of instByExam[id] || []) { const cur = m.get(i.id); m.set(i.id, cur ? { ...cur, participants: cur.participants + i.participants } : i); } return [...m.values()].sort((a, b) => a.city.localeCompare(b.city, 'tr') || a.district.localeCompare(b.district, 'tr') || a.name.localeCompare(b.name, 'tr')); }, [examIds, instByExam]);
  const cities = [...new Set(institutions.map((i) => i.city))];
  const visibleInst = institutions.filter((i) => (!city || i.city === city) && (!instQuery.trim() || fold(`${i.name} ${i.code} ${i.district}`).includes(fold(instQuery.trim()))));
  const toggle = (list: string[], id: string) => list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  const selectedExams = exams.filter((e) => examIds.includes(e.id));
  const selectedInst = institutions.filter((i) => instIds.includes(i.id));
  const students = selectedInst.reduce((n, i) => n + Number(i.participants || 0), 0);
  const districts = new Set(selectedInst.map((i) => `${i.city}|${i.district}`)).size;
  const anyAyt = selectedExams.some(isAyt);
  const tytChoices = exams.filter(isTyt);
  const typeMul = anyAyt ? Math.max(1, aytTypes.length) : 1;
  const estimate = ALL.filter((x) => kinds.includes(x.kind)).reduce((n, x) => n + x.pages(students, selectedInst.length, examIds.length, districts) * (['OKUL_NET', 'OKUL_TEST', 'SINIF_NET', 'SINIF_TEST', 'KURUM_ORT'].includes(x.kind) ? typeMul : 1), 0);
  const ready = packs.length > 0 || growth.length > 0;
  const ordered = KIND_ORDER.filter((k) => kinds.includes(k));

  const build = async () => {
    setBusy(true); setError(''); setPacks([]); setGrowth([]); setPage(0);
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
  // 30 Oct: a real PDF file, drawn in the browser page by page (no print dialog).
  const [pdfBusy, setPdfBusy] = useState('');
  const pdf = async () => {
    if (pdfBusy) return; setError(''); setPdfBusy('PDF hazırlanıyor…');
    try { const n = await downloadPagesAsPdf(ref.current, pdfFileName(`anunex ${selectedExams.map((e) => e.title).join(' ')}`), (d, t) => setPdfBusy(`PDF hazırlanıyor · ${d}/${t} sayfa`)); if (!n) setError('PDF için sayfa yok.'); }
    catch (e: any) { setError(`PDF oluşturulamadı: ${e?.message || 'bilinmeyen hata'}`); } finally { setPdfBusy(''); }
  };
  const [xlsBusy, setXlsBusy] = useState(false);
  const excel = async () => { if (xlsBusy) return; setXlsBusy(true); try { if (!(await exportWorkbook(packs, growth))) setError('Excel için veri yok.'); } catch (e: any) { setError(e.message || 'Excel oluşturulamadı.'); } finally { setXlsBusy(false); } };
  // As soon as the reports are ready, load the PDF and Excel tools in the background so a click downloads at once.
  useEffect(() => { if (packs.length || growth.length) { preloadPdfTools(); void import('xlsx'); } }, [packs, growth]);

  // Preview: one real page at a time, scaled to the stage; printing clones every page.
  useLayoutEffect(() => {
    const root = ref.current, box = stage.current; if (!root || !box) return;
    const pages = [...root.querySelectorAll<HTMLElement>('.rx-page')];
    setPageCount(pages.length);
    const current = Math.min(page, Math.max(0, pages.length - 1));
    pages.forEach((p, i) => p.classList.toggle('is-current', i === current));
    const fit = () => { const el = pages[current]; if (!el) return; const scale = Math.min(1, box.clientWidth / el.offsetWidth); root.style.setProperty('--rm-scale', String(scale)); box.style.height = `${Math.ceil(el.offsetHeight * scale)}px`; };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(box); return () => ro.disconnect();
  }, [packs, growth, page]);
  const pageTitle = (() => { const el = ref.current?.querySelectorAll<HTMLElement>('.rx-page')[page]; return el?.querySelector('.rx-kicker')?.textContent || ''; })();

  const examSummary = selectedExams.map((e) => e.title).join(', ');
  const instSummary = selectedInst.length === 1 ? `${selectedInst[0].name} · ${selectedInst[0].city} / ${selectedInst[0].district}` : `${selectedInst.length} kurum`;

  return <section className="rm" id="result-toplu" aria-labelledby="rm-title">
    <header className="rm-head">
      <div><div className="rm-kicker">SONUÇ AĞI · RAPORLAR</div><h1 id="rm-title" className="rm-title">Rapor Merkezi</h1><p className="rm-sub">Kayıtlı sonuçlardan üretilir; sınav yeniden değerlendirilmez.</p></div>
      <div className="rm-seg" role="group" aria-label="Seviye">{LEVELS.map(([l]) => <button key={l} type="button" aria-pressed={level === l} className={level === l ? 'on' : ''} onClick={() => setLevel(l)}>{l}</button>)}</div>
    </header>
    {error && <div className="rm-alert" role="alert">{error}</div>}

    <div className="rm-grid">
      <div className="rm-steps">
        <section className={`rm-card ${!editExam && examIds.length ? 'rm-done' : 'rm-active'}`} aria-labelledby="rm-s1">
          <div className="rm-card-head"><h2 id="rm-s1">{!editExam && examIds.length ? <span className="rm-check" aria-hidden="true">✓</span> : null}1 · Sınav</h2>
            {!editExam && examIds.length ? <button type="button" className="rm-link" onClick={() => setEditExam(true)}>Değiştir</button> : <button type="button" className="rm-link" onClick={() => void loadExams()}>Yenile</button>}</div>
          {!editExam && examIds.length ? <p className="rm-summary"><b>{examSummary}</b> <span>· {selectedExams.reduce((n, e) => n + Number(e.participants || 0), 0)} öğrenci</span></p> : <>
            <label className="rm-search"><span className="rm-visually-hidden">Sınav ara</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20 16 16" /></svg><input value={examQuery} onChange={(e) => setExamQuery(e.target.value)} placeholder="Sınav, yayınevi veya yıl ara" /></label>
            <div className="rm-list">
              {!visibleExams.length && <p className="rm-empty">{exams.length ? 'Bu seviyede sonucu olan sınav yok.' : 'Sonucu yüklenmiş sınav yok.'}</p>}
              {visibleExams.map((e) => <label key={e.id} className={`rm-row ${examIds.includes(e.id) ? 'sel' : ''}`}>
                <input type="checkbox" checked={examIds.includes(e.id)} onChange={() => setExamIds((c) => toggle(c, e.id))} />
                <span className="rm-row-main"><b>{e.title}</b><span>{e.publisher_name} · {e.academic_year} · {e.exam_type} · {e.participants} öğrenci · {e.institutions} kurum</span></span>
                <span className="rm-pill">Değerlendirildi</span>
              </label>)}
            </div>
            {examIds.length > 0 && <button type="button" className="rm-next" onClick={() => setEditExam(false)}>Devam · {examIds.length} sınav</button>}
          </>}
        </section>

        <section className={`rm-card ${!examIds.length ? 'rm-locked' : !editInst && instIds.length ? 'rm-done' : 'rm-active'}`} aria-labelledby="rm-s2">
          <div className="rm-card-head"><h2 id="rm-s2">{!editInst && instIds.length ? <span className="rm-check" aria-hidden="true">✓</span> : null}2 · Kurum</h2>
            {!editInst && instIds.length ? <button type="button" className="rm-link" onClick={() => setEditInst(true)}>Değiştir</button> : null}</div>
          {!examIds.length ? <p className="rm-summary"><span>Önce sınav seçin.</span></p> : !editInst && instIds.length ? <p className="rm-summary"><b>{instSummary}</b> <span>· {students} öğrenci</span></p> : <>
            <div className="rm-tools">
              <label className="rm-select"><span className="rm-visually-hidden">İl</span><select value={city} onChange={(e) => setCity(e.target.value)}><option value="">Bütün iller</option>{cities.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
              <label className="rm-search rm-grow"><span className="rm-visually-hidden">Kurum ara</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20 16 16" /></svg><input value={instQuery} onChange={(e) => setInstQuery(e.target.value)} placeholder="Kurum, kod veya ilçe ara" /></label>
              <button type="button" className="rm-soft" onClick={() => setInstIds((c) => { const ids = visibleInst.map((i) => i.id); return ids.every((id) => c.includes(id)) ? c.filter((x) => !ids.includes(x)) : [...new Set([...c, ...ids])]; })}>{visibleInst.length && visibleInst.every((i) => instIds.includes(i.id)) ? 'Seçimi kaldır' : `Tümünü seç (${visibleInst.length})`}</button>
            </div>
            <div className="rm-table" role="group" aria-label="Kurumlar">
              <div className="rm-thead"><span /><span>KURUM</span><span>İL / İLÇE</span><span className="r">ÖĞRENCİ</span></div>
              {visibleInst.map((i) => <label key={i.id} className={`rm-trow ${instIds.includes(i.id) ? 'sel' : ''}`}>
                <input type="checkbox" checked={instIds.includes(i.id)} onChange={() => setInstIds((c) => toggle(c, i.id))} />
                <b>{i.name}</b><span>{i.city} / {i.district}</span><span className="r num">{i.participants}</span>
              </label>)}
              {!visibleInst.length && <p className="rm-empty">Eşleşen kurum yok.</p>}
            </div>
            {instIds.length > 0 && <button type="button" className="rm-next" onClick={() => setEditInst(false)}>Devam · {instIds.length} kurum</button>}
          </>}
        </section>

        <section className={`rm-card ${instIds.length ? 'rm-active rm-focus' : 'rm-locked'}`} aria-labelledby="rm-s3">
          <div className="rm-card-head"><h2 id="rm-s3">3 · Raporlar <span className="rm-muted">· {kinds.length} seçili{instIds.length ? ` · ~${estimate} sayfa` : ''}</span></h2></div>
          <div className="rm-reports">
            {[...MAIN, ...(showMore ? MORE : MORE.filter((x) => kinds.includes(x.kind)))].map((it) => { const on = kinds.includes(it.kind); const n = it.pages(students, selectedInst.length, examIds.length, districts);
              return <label key={it.kind} className={`rm-rep ${on ? 'sel' : ''}`}>
                <input type="checkbox" checked={on} onChange={() => setKinds((c) => c.includes(it.kind) ? c.filter((x) => x !== it.kind) : [...c, it.kind])} />
                <GlyphIcon g={it.glyph} />
                <span className="rm-row-main"><b>{it.label}</b><span>{it.desc}</span></span>
                <span className="rm-pages">{instIds.length && n ? `${n} s.` : ''}</span>
              </label>; })}
            <button type="button" className="rm-link rm-more" aria-expanded={showMore} onClick={() => setShowMore((v) => !v)}>{showMore ? 'Daha az göster' : `+ Diğer raporlar: şube listeleri, branş, konu eksik, gelişim, kurum ortalamaları`}</button>
          </div>
          {anyAyt && <fieldset className="rm-ayt"><legend>AYT puanı</legend>
            <label className="rm-opt"><input type="radio" name="rm-ayt" checked={aytMode === 'COMBINED'} onChange={() => setAytMode('COMBINED')} /> TYT ile birleşik (SAY / SÖZ / EA puanı)</label>
            {aytMode === 'COMBINED' && <label className="rm-select rm-indent">TYT sınavı<select value={pairExamId} onChange={(e) => setPairExamId(e.target.value)}><option value="">Otomatik (aynı yıl, aynı yayın)</option>{tytChoices.map((e) => <option key={e.id} value={e.id}>{e.academic_year} · {e.publisher_name} · {e.title}</option>)}</select></label>}
            <label className="rm-opt"><input type="radio" name="rm-ayt" checked={aytMode === 'AYT_ONLY'} onChange={() => setAytMode('AYT_ONLY')} /> Yalnız AYT (puansız, alan netine göre)</label>
            <div className="rm-chips">{AYT_TYPES.map(([k, l]) => <label key={k} className={`rm-chip ${aytTypes.includes(k) ? 'sel' : ''}`}><input type="checkbox" checked={aytTypes.includes(k)} onChange={() => setAytTypes((c) => c.includes(k) ? c.filter((x) => x !== k) : [...c, k])} /> {l}</label>)}</div>
            <p className="rm-note">Birleşikte öğrencinin kendi TYT'si kullanılır; bulunamazsa okulun TYT ortalaması alınır ve karnede yazılır.</p>
          </fieldset>}
        </section>
      </div>

      <section className="rm-card rm-out" aria-labelledby="rm-s4">
        <div className="rm-card-head"><h2 id="rm-s4">4 · Önizleme ve çıktı</h2>
          {ready && pageCount > 0 && <div className="rm-pager"><button type="button" aria-label="Önceki sayfa" disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>‹</button><span className="num">{pageTitle ? `${pageTitle.split('·')[0].trim()} · ` : ''}{page + 1} / {pageCount}</span><button type="button" aria-label="Sonraki sayfa" disabled={page >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>›</button></div>}</div>
        <div className="rm-stage-wrap">
          {!ready && <div className="rm-placeholder">{busy ? <><span className="rm-spin" aria-hidden="true" /><b>Hazırlanıyor…</b><span>{progress}</span></> : <><b>{instIds.length && kinds.length ? `Seçiminiz hazır · ~${estimate} sayfa` : 'Sınav, kurum ve rapor seçin'}</b><span>Raporları hazırlayınca sayfalar burada tek tek görünür.</span></>}</div>}
          <div ref={stage} className="rm-stage" hidden={!ready}>
            <div className="rx-pages rm-preview" ref={ref}><PrintSetup />{packs.map((p, i) => <BundlePages key={i} b={p} kinds={ordered} types={p.family === 'AYT' ? aytTypes : undefined} />)}{growth.map((g, i) => <GrowthPages key={`g${i}`} g={g} />)}</div>
          </div>
        </div>
        <div className="rm-actions">
          {!ready ? <button type="button" className="rm-primary" disabled={busy || !examIds.length || !instIds.length || !kinds.length} onClick={() => void build()}>{busy ? 'Hazırlanıyor…' : 'Raporları hazırla'}</button>
            : <><button type="button" className="rm-primary" disabled={!!pdfBusy} aria-live="polite" onClick={() => void pdf()}>{pdfBusy || `Tümünü PDF indir · ${pageCount} sayfa`}</button><button type="button" className="rm-secondary" disabled={!!pdfBusy || xlsBusy} onClick={() => void excel()}>{xlsBusy ? 'Excel hazırlanıyor…' : 'Excel indir'}</button></>}
        </div>
        <p className="rm-note">Tek PDF dosyası iner, kurumlar sırayla. Listeler A4 yatay, öğrenci karnesi A4 dikey.</p>
      </section>
    </div>
  </section>;
}
