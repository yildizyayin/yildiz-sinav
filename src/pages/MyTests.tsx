import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Copy, Eye, MonitorPlay, Plus, Printer, ScanLine, Search, Send, Trash2 } from 'lucide-react';
import { api } from '../api';
import { StudioPreview } from '../components/StudioPreview';
import { StudioOpticalScan } from '../components/StudioOpticalScan';
import { StudioDownloads } from '../components/StudioDownloads';
import { StudioHomeworkAssign } from '../components/StudioHomeworkAssign';
import './my-tests.css';

/**
 * Testlerim (owner, 26 Nov 2026; the approved "Test Hazırla" design): every test the teacher prepared, by what
 * happened to it. Drafts are continued, edited or deleted; a test that reached students is never changed in place —
 * "Kopyala ve düzenle" makes a new draft and the first test keeps its students' answers.
 */
type Test = { id: string; title: string; type: string; gradeLevel: number | null; subject: string | null; kind: 'DRAFT' | 'HOMEWORK' | 'ONLINE' | 'PRINTED'; status: string; questionCount: number; booklets: string[]; updatedAt: string; homework: { total: number; done: number; dueAt: string | null } | null; opticalResults: number; locked: boolean; doc: any };
const TYPE: Record<string, string> = { PRACTICE_EXAM: 'Deneme', WRITTEN_EXAM: 'Yazılı', WORKSHEET: 'Test', PERSONAL_BOOK: 'Kişisel kitap' };
const KIND: Record<Test['kind'], string> = { DRAFT: 'Taslak', HOMEWORK: 'Ödev verildi', ONLINE: 'Online sınav', PRINTED: 'Yazdırıldı' };
const TABS: Array<[string, string]> = [['ALL', 'Tümü'], ['DRAFT', 'Taslaklar'], ['HOMEWORK', 'Ödevler'], ['PRINTED', 'Yazdırılanlar']];
const date = (s: string) => { const d = new Date(String(s).includes('T') ? s : `${String(s).replace(' ', 'T')}Z`); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }); };

export function MyTests() {
  const [tests, setTests] = useState<Test[] | null>(null);
  const [tab, setTab] = useState('ALL');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fresh, setFresh] = useState('');
  const [confirm, setConfirm] = useState('');
  const [open, setOpen] = useState<{ id: string; panel: 'print' | 'homework' } | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [scan, setScan] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const load = () => api<{ tests: Test[] }>('/api/teacher-tests').then((r) => setTests(r.tests)).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, []);

  const shown = useMemo(() => (tests || []).filter((t) => (tab === 'ALL' || t.kind === tab || (tab === 'PRINTED' && t.kind === 'ONLINE')) && (!query.trim() || t.title.toLocaleLowerCase('tr').includes(query.trim().toLocaleLowerCase('tr')))), [tests, tab, query]);
  const count = (k: string) => (tests || []).filter((t) => k === 'ALL' || t.kind === k || (k === 'PRINTED' && t.kind === 'ONLINE')).length;

  const remove = async (t: Test) => {
    setBusy(t.id); setError('');
    try { const r = await api<any>(`/api/teacher-tests/${encodeURIComponent(t.id)}`, { method: 'DELETE' }); setNotice(r.message); setTests((x) => (x || []).filter((y) => y.id !== t.id)); }
    catch (e: any) { setError(e.message); }
    setBusy(''); setConfirm('');
  };
  const copy = async (t: Test) => {
    setBusy(t.id); setError('');
    try { const r = await api<any>(`/api/teacher-tests/${encodeURIComponent(t.id)}/copy`, { method: 'POST' }); setNotice(`“${r.title}” taslak olarak hazır; istediğin gibi düzenle. İlk testin öğrenci cevapları korunuyor.`); setFresh(r.id); setTab('ALL'); await load(); }
    catch (e: any) { setError(e.message); }
    setBusy('');
  };

  return <div className="mt">
    <header className="mt-head">
      <div><span className="mt-kicker">Test Hazırla</span><h1>Testlerim</h1></div>
      <Link className="mt-new" to="/content-center"><Plus size={18} aria-hidden="true" /> Yeni test</Link>
    </header>
    <div className="mt-bar">
      <div role="tablist" aria-label="Durum" className="mt-tabs">{TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l} <span>{tests ? count(k) : '…'}</span></button>)}</div>
      <label className="mt-search"><Search size={17} aria-hidden="true" /><input type="search" aria-label="Test ara" placeholder="Test ara" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
    </div>
    {error && <div className="alert error" role="alert">{error}</div>}
    {notice && <div className="alert success" role="status">{notice}</div>}
    {!tests && !error && <p className="mt-empty">Testlerin yükleniyor…</p>}
    {tests && !shown.length && <div className="mt-empty-card"><ClipboardList size={28} aria-hidden="true" /><strong>{tests.length ? 'Bu filtrede test yok.' : 'Henüz bir test hazırlamadın.'}</strong><Link className="mt-new" to="/content-center"><Plus size={18} aria-hidden="true" /> İlk testini hazırla</Link></div>}
    <div className="mt-grid">{shown.map((t) => {
      const pct = t.homework?.total ? Math.round((t.homework.done / t.homework.total) * 100) : null;
      const isOpen = (p: string) => open?.id === t.id && open.panel === p;
      return <article key={t.id} className={`mt-card${fresh === t.id ? ' fresh' : ''}`}>
        <div className="mt-card-top"><span className={`mt-badge ${t.kind.toLowerCase()}`}>{KIND[t.kind]}</span><span className="mt-date">{date(t.updatedAt)}</span></div>
        <div className="mt-card-main">
          <div className="mt-card-text">
            <h2>{t.title}</h2>
            <p>{[TYPE[t.type] || t.type, t.gradeLevel ? `${t.gradeLevel}. sınıf` : null, t.subject, `${t.questionCount} soru`, t.booklets.length > 1 ? `${t.booklets.join('/')} kitapçık` : null].filter(Boolean).join(' · ')}</p>
            {t.homework && <p className="mt-sub">{t.homework.done}/{t.homework.total} öğrenci çözdü{t.homework.dueAt ? ` · son gün ${date(t.homework.dueAt)}` : ''}</p>}
            {t.opticalResults > 0 && <p className="mt-sub">{t.opticalResults} optik sonuç</p>}
          </div>
          {pct !== null && <svg className="mt-ring" viewBox="0 0 36 36" role="img" aria-label={`${t.homework!.total} öğrenciden ${t.homework!.done} çözdü`}><circle cx="18" cy="18" r="15.5" className="track" /><circle cx="18" cy="18" r="15.5" className="fill" pathLength={100} strokeDasharray={`${pct} 100`} /><text x="18" y="21">%{pct}</text></svg>}
        </div>
        <div className="mt-actions">
          {!t.locked && <button type="button" className="mt-btn dark" onClick={() => setPreview(t.doc)}><Eye size={15} aria-hidden="true" /> Devam et</button>}
          {t.locked && <button type="button" className="mt-btn dark" disabled={busy === t.id} onClick={() => void copy(t)}><Copy size={15} aria-hidden="true" /> Kopyala ve düzenle</button>}
          <button type="button" className={`mt-btn${isOpen('print') ? ' on' : ''}`} aria-expanded={isOpen('print')} onClick={() => setOpen(isOpen('print') ? null : { id: t.id, panel: 'print' })}><Printer size={15} aria-hidden="true" /> Yazdır</button>
          {t.type === 'WORKSHEET' && t.status === 'READY' && <button type="button" className={`mt-btn${isOpen('homework') ? ' on' : ''}`} aria-expanded={isOpen('homework')} onClick={() => setOpen(isOpen('homework') ? null : { id: t.id, panel: 'homework' })}><Send size={15} aria-hidden="true" /> Ödev ver</button>}
          <a className="mt-btn" href={`/board/${encodeURIComponent(t.id)}`}><MonitorPlay size={15} aria-hidden="true" /> Tahtada aç</a>
          {!t.locked && <button type="button" className="mt-btn" disabled={busy === t.id} onClick={() => void copy(t)}><Copy size={15} aria-hidden="true" /> Kopyala</button>}
          <button type="button" className="mt-btn danger" onClick={() => setConfirm(confirm === t.id ? '' : t.id)}><Trash2 size={15} aria-hidden="true" /> {t.locked ? 'Listeden kaldır' : 'Sil'}</button>
        </div>
        {confirm === t.id && <div className="mt-confirm" role="alert">
          <span>{t.locked ? 'Test listeden kalkar; öğrenci sonuçları ve karneler korunur.' : 'Taslak kalıcı olarak silinir.'}</span>
          <button type="button" className="mt-btn danger" disabled={busy === t.id} onClick={() => void remove(t)}>{t.locked ? 'Kaldır' : 'Evet, sil'}</button>
          <button type="button" className="mt-btn" onClick={() => setConfirm('')}>Vazgeç</button>
        </div>}
        {isOpen('print') && <div className="mt-panel">
          <StudioDownloads document={t.doc} onError={setError} />
          <button type="button" className="mt-btn" onClick={() => setScan(t.doc)}><ScanLine size={15} aria-hidden="true" /> Optik okut</button>
        </div>}
        {isOpen('homework') && <div className="mt-panel"><StudioHomeworkAssign documentId={t.id} onError={setError} onDone={(m) => { setNotice(m); setOpen(null); void load(); }} /></div>}
        {t.locked && <p className="mt-note">Öğrencilere ulaştığı için doğrudan düzenlenmez; kopyalayıp düzenleyebilirsin.</p>}
      </article>;
    })}</div>
    {preview && <StudioPreview document={preview} onClose={() => setPreview(null)} onChanged={() => void load()} />}
    {scan && <StudioOpticalScan document={scan} onClose={() => setScan(null)} />}
  </div>;
}
