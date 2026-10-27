import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { exportWorkbook } from './reports/ReportFamily';
import './report-center.css';

/**
 * S036 Veri Merkezi and Belge Merkezi (owner decisions 27 Oct). Veri: every upload with its original file (kept one
 * academic year), the data as read and the results, each as a download. Belge: the documents of the exams the
 * school took that the publisher made visible to schools, and the optic forms / FMT. Every download is audited.
 */
type Batch = { id: string; status: string; created_at: string; exam_id: string; institution_id: string; title: string; academic_year: string; exam_type: string; publisher_name: string; institution_name: string; institution_code: string; city: string; district: string; total: number; set_aside: number; has_original: boolean; original_name: string | null; retain_until: string | null };
const STATUS: Record<string, [string, string]> = { COMMITTED: ['Değerlendirildi', 'ok'], READY: ['Değerlendirmeye hazır', 'wait'], NEEDS_REVIEW: ['Kontrol bekliyor', 'wait'], PREVIEW: ['Önizleme', 'wait'], FAILED: ['Hatalı', 'bad'] };
const when = (s: string) => new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z')).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fileBase = (b: Batch) => `${b.institution_name}-${b.title}`.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 80);

export function DataCenter({ mode, tab: initialTab = 'DATA', embedded = false }: { mode: 'INSTITUTION' | 'DEALER'; tab?: 'DATA' | 'DOCS'; embedded?: boolean }) {
  const [tab, setTab] = useState<'DATA' | 'DOCS'>(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);
  return <section className="rm dc" aria-labelledby="dc-title">
    <header className="rm-head">
      <div>{!embedded && <div className="rm-kicker">ÇIKTILAR</div>}<h1 id="dc-title" className={embedded ? 'rm-visually-hidden' : 'rm-title'}>{tab === 'DATA' ? 'Veri Merkezi' : 'Belge Merkezi'}</h1>
        <p className="rm-sub">{tab === 'DATA' ? 'Yüklediğiniz optik verileri ve sonuçları indirin. Her indirme kayda geçer.' : 'Değerlendirdiğiniz sınavların belgeleri ve optik dosyaları. Her indirme kayda geçer.'}</p></div>
      <div className="rm-seg" role="tablist" aria-label="Bölüm"><button type="button" role="tab" aria-selected={tab === 'DATA'} className={tab === 'DATA' ? 'on' : ''} onClick={() => setTab('DATA')}>Veri Merkezi</button><button type="button" role="tab" aria-selected={tab === 'DOCS'} className={tab === 'DOCS' ? 'on' : ''} onClick={() => setTab('DOCS')}>Belge Merkezi</button></div>
    </header>
    {tab === 'DATA' ? <DataTab mode={mode} /> : <DocsTab mode={mode} />}
  </section>;
}

function DataTab({ mode }: { mode: 'INSTITUTION' | 'DEALER' }) {
  const [rows, setRows] = useState<Batch[]>([]);
  const [year, setYear] = useState(''); const [exam, setExam] = useState(''); const [q, setQ] = useState('');
  const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [loaded, setLoaded] = useState(false);
  const load = async () => { setError(''); try { setRows((await api<any>(`/api/admin/result-network/operations/data/batches?mode=${mode}`)).batches || []); } catch (e: any) { setError(e.message); } finally { setLoaded(true); } };
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const years = [...new Set(rows.map((r) => r.academic_year))];
  const exams = useMemo(() => { const m = new Map<string, string>(); for (const r of rows) m.set(r.exam_id, r.title); return [...m.entries()]; }, [rows]);
  const shown = rows.filter((r) => (!year || r.academic_year === year) && (!exam || r.exam_id === exam) && (!q.trim() || `${r.institution_name} ${r.title} ${r.city} ${r.district}`.toLocaleLowerCase('tr-TR').includes(q.trim().toLocaleLowerCase('tr-TR'))));

  const readExcel = async (b: Batch) => {
    setBusy(`${b.id}:read`); setError('');
    try {
      const data = await api<any>(`/api/admin/result-network/operations/data/batches/${b.id}/read`);
      const XLSX = await import('xlsx'); const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([data.headers, ...data.rows]), 'Okunan veri');
      XLSX.writeFile(book, `${fileBase(b)}-okunan-veri.xlsx`);
    } catch (e: any) { setError(e.message); } finally { setBusy(''); }
  };
  const resultsExcel = async (b: Batch) => {
    setBusy(`${b.id}:results`); setError('');
    try {
      await api(`/api/admin/result-network/operations/data/batches/${b.id}/results-downloaded`, { method: 'POST' });
      const bundle = await api<any>(`/api/admin/result-network/operations/toplu/bundle?${new URLSearchParams({ examId: b.exam_id, institutionIds: b.institution_id })}`);
      if (!(await exportWorkbook([bundle], [], `${fileBase(b)}-sonuclar.xlsx`))) setError('Bu yüklemede indirilecek sonuç yok.');
    } catch (e: any) { setError(e.message); } finally { setBusy(''); }
  };

  return <>
    <div className="rm-tools">
      <label className="rm-select"><span className="rm-visually-hidden">Yıl</span><select value={year} onChange={(e) => setYear(e.target.value)}><option value="">Bütün yıllar</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
      <label className="rm-select"><span className="rm-visually-hidden">Sınav</span><select value={exam} onChange={(e) => setExam(e.target.value)}><option value="">Bütün sınavlar</option>{exams.map(([id, t]) => <option key={id} value={id}>{t}</option>)}</select></label>
      <label className="rm-search rm-grow"><span className="rm-visually-hidden">Ara</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20 16 16" /></svg><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kurum veya sınav ara" /></label>
      <button type="button" className="rm-soft" onClick={() => void load()}>Yenile</button>
    </div>
    {error && <div className="rm-alert" role="alert">{error}</div>}
    <section className="rm-card" aria-labelledby="dc-up">
      <div className="rm-card-head"><h2 id="dc-up">Yüklemeler <span className="rm-muted">· {shown.length}</span></h2></div>
      <div className="dc-table-wrap">
        <table className="dc-table">
          <thead><tr><th>Tarih</th><th>Sınav</th><th>Kurum</th><th className="r">Satır</th><th>Durum</th><th className="r">İndir</th></tr></thead>
          <tbody>
            {shown.map((b) => { const [label, tone] = STATUS[b.status] || [b.status, 'wait'];
              return <tr key={b.id}>
                <td className="dc-muted num">{when(b.created_at)}</td>
                <td><b>{b.title}</b><small>{[b.publisher_name, b.academic_year, b.exam_type].filter(Boolean).join(' · ')}</small></td>
                <td>{b.institution_name}{(b.city || b.district) && <small>{[b.city, b.district].filter(Boolean).join(' / ')}</small>}</td>
                <td className="r num">{b.total}{b.set_aside ? <small className="dc-warn">{b.set_aside} dışarıda</small> : null}</td>
                <td><span className={`dc-pill ${tone}`}>{label}</span></td>
                <td className="r"><div className="dc-actions">
                  {b.has_original ? <a className="dc-btn" href={`/api/admin/result-network/operations/data/batches/${b.id}/original`} download title={`Saklama sonu: ${b.retain_until ? new Date(b.retain_until).toLocaleDateString('tr-TR') : '—'}`}>Orijinal dosya</a>
                    : <span className="dc-btn dc-off" title="Bu yükleme özellikten önce yapıldı ya da saklama süresi doldu; orijinal dosya yok.">Orijinal yok</span>}
                  <button type="button" className="dc-btn" disabled={busy === `${b.id}:read`} onClick={() => void readExcel(b)}>{busy === `${b.id}:read` ? 'Hazırlanıyor…' : 'Okunan veri · Excel'}</button>
                  <button type="button" className="dc-btn dc-main" disabled={b.status !== 'COMMITTED' || busy === `${b.id}:results`} title={b.status !== 'COMMITTED' ? 'Önce değerlendirin.' : ''} onClick={() => void resultsExcel(b)}>{busy === `${b.id}:results` ? 'Hazırlanıyor…' : 'Sonuçlar · Excel'}</button>
                </div></td>
              </tr>; })}
          </tbody>
        </table>
        {loaded && !shown.length && <p className="rm-empty">{rows.length ? 'Bu filtrede yükleme yok.' : 'Henüz yükleme yok.'}</p>}
      </div>
    </section>
    <div className="dc-explain">
      <div className="rm-card"><b>Orijinal dosya</b><p className="rm-note">Yüklenen TXT/DAT olduğu gibi. Bir eğitim yılı saklanır; bu özellikten önceki yüklemelerde yoktur.</p></div>
      <div className="rm-card"><b>Okunan veri</b><p className="rm-note">Satır satır ad, no, şube, kitapçık ve her testin cevap dizisi; değerlendirme dışı kalan satırlar nedeniyle.</p></div>
      <div className="rm-card"><b>Sonuçlar</b><p className="rm-note">Net, puan, sıralar, kazanımlar ve madde analizi; Rapor Merkezi'ndeki Excel ile aynı içerik.</p></div>
    </div>
  </>;
}

function DocsTab({ mode }: { mode: 'INSTITUTION' | 'DEALER' }) {
  const [exams, setExams] = useState<any[]>([]); const [error, setError] = useState(''); const [loaded, setLoaded] = useState(false);
  useEffect(() => { void api<any>(`/api/admin/result-network/operations/documents?mode=${mode}`).then((r) => setExams(r.exams || [])).catch((e: any) => setError(e.message)).finally(() => setLoaded(true)); }, [mode]);
  return <>
    {error && <div className="rm-alert" role="alert">{error}</div>}
    {loaded && !exams.length && <div className="rm-card"><p className="rm-empty">Değerlendirilmiş sınav yok. Belgeler, sınavı değerlendirdikten sonra burada görünür.</p></div>}
    <div className="dc-docs">
      {exams.map((e) => <section key={e.id} className="rm-card" aria-label={e.title}>
        <div className="rm-card-head"><h2>{e.title} <span className="rm-muted">· {[e.publisher_name, e.academic_year, e.exam_type].filter(Boolean).join(' · ')}</span></h2></div>
        {e.documents.length ? <ul className="dc-doclist">{e.documents.map((d: any) => <li key={d.kind + d.id}>
          <span className="dc-doc-ic" aria-hidden="true">{d.kind === 'OPTIC' ? 'FMT' : 'PDF'}</span>
          <span className="rm-row-main"><b>{d.label}</b><span>{d.fileName}</span></span>
          <a className="dc-btn" href={`/api/admin/result-network/operations/documents/${d.kind}/${encodeURIComponent(d.id)}?mode=${mode}`} download>İndir</a>
        </li>)}</ul> : <p className="rm-note">Bu sınav için yayınevinin kurumlara açtığı belge yok.</p>}
      </section>)}
    </div>
    <p className="rm-note">Sınav kitapçığı ve cevap anahtarı yalnız yayınevinin kurumlara açtığı durumda görünür; telif kısıtlı dosyalar paylaşılmaz.</p>
  </>;
}
