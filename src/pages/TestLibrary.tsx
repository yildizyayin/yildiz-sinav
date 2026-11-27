import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ClipboardList, MoreHorizontal, Plus } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { StudioPreview } from '../components/StudioPreview';
import { StudioOpticalScan } from '../components/StudioOpticalScan';
import { StudioDownloads } from '../components/StudioDownloads';
import { StudioHomeworkAssign } from '../components/StudioHomeworkAssign';
import { TestCheckDialog } from '../components/TestCheckDialog';
import './my-tests.css';

/**
 * Testlerim inside Soru Havuzu (owner, 27 Nov 2026: "öğretmenlerimiz ... basit hızlı ve sonuç odaklı").
 * A teacher sees only their own tests, an institution manager every teacher's (with a teacher filter). Each card has
 * two big actions; the rest waits behind "⋯". A test that reached students is never edited in place.
 */
type Test = { checked?: boolean; id: string; title: string; type: string; gradeLevel: number | null; subject: string | null; kind: 'DRAFT' | 'HOMEWORK' | 'ONLINE' | 'PRINTED'; status: string; questionCount: number; booklets: string[]; updatedAt: string; homework: { total: number; done: number; dueAt: string | null } | null; opticalResults: number; locked: boolean; mine: boolean; teacher?: { id: string; name: string }; doc: any };
const KIND: Record<Test['kind'], string> = { DRAFT: 'Yarım kaldı', HOMEWORK: 'Ödev verildi', ONLINE: 'Online sınav', PRINTED: 'Yazdırıldı' };
const TABS: Array<[string, string]> = [['ALL', 'Tümü'], ['DRAFT', 'Yarım kalanlar'], ['SENT', 'Gönderilenler']];
const date = (s: string) => { const d = new Date(String(s).includes('T') ? s : `${String(s).replace(' ', 'T')}Z`); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }); };
const inTab = (t: Test, tab: string) => tab === 'ALL' || (tab === 'DRAFT' ? t.kind === 'DRAFT' : t.kind !== 'DRAFT');

export function TestLibrary() {
  const { user } = useAuth();
  const manager = !!user && user.role !== 'TEACHER';
  const [tests, setTests] = useState<Test[] | null>(null);
  const [tab, setTab] = useState('ALL');
  const [teacher, setTeacher] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fresh, setFresh] = useState('');
  const [menu, setMenu] = useState('');
  const [confirm, setConfirm] = useState('');
  const [panel, setPanel] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [scan, setScan] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [ask, setAsk] = useState('');
  const menuRef = useRef<HTMLDivElement | null>(null);
  const load = () => api<{ tests: Test[] }>('/api/teacher-tests').then((r) => setTests(r.tests)).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(''); };
    document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  const teachers = useMemo(() => [...new Map((tests || []).filter((t) => t.teacher).map((t) => [t.teacher!.id, t.teacher!.name])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'tr')), [tests]);
  const scoped = (tests || []).filter((t) => !teacher || t.teacher?.id === teacher);
  const shown = scoped.filter((t) => inTab(t, tab));

  const remove = async (t: Test) => {
    setBusy(t.id); setError('');
    try { const r = await api<any>(`/api/teacher-tests/${encodeURIComponent(t.id)}`, { method: 'DELETE' }); setNotice(r.message); setTests((x) => (x || []).filter((y) => y.id !== t.id)); }
    catch (e: any) { setError(e.message); }
    setBusy(''); setConfirm('');
  };
  const copy = async (t: Test) => {
    setBusy(t.id); setError(''); setMenu('');
    try { const r = await api<any>(`/api/teacher-tests/${encodeURIComponent(t.id)}/copy`, { method: 'POST' }); setNotice(`“${r.title}” hazır; istediğin gibi düzenleyebilirsin. İlk testin öğrenci cevapları korunuyor.`); setFresh(r.id); setTab('ALL'); setTeacher(''); await load(); }
    catch (e: any) { setError(e.message); }
    setBusy('');
  };

  return <div className="mt">
    <Link className="mt-back" to="/soru-havuzu"><ArrowLeft size={18} aria-hidden="true" /> Soru Havuzu</Link>
    <header className="mt-head">
      <div><h1>{manager ? 'Kurumun testleri' : 'Testlerim'}</h1><p className="mt-lead">{manager ? 'Bütün öğretmenlerin hazırladığı testler' : 'Hazırladığın testler ve sonuçları'}</p></div>
      <div className="mt-head-actions">
        {manager && teachers.length > 0 && <label className="mt-filter">Öğretmen<select value={teacher} onChange={(e) => setTeacher(e.target.value)}><option value="">Tüm öğretmenler</option>{teachers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}
        <Link className="mt-new" to="/soru-havuzu/hazirla"><Plus size={18} aria-hidden="true" /> Test Hazırla</Link>
      </div>
    </header>
    <div role="tablist" aria-label="Durum" className="mt-tabs">{TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l} <span>{tests ? scoped.filter((t) => inTab(t, k)).length : '…'}</span></button>)}</div>
    {error && <div className="alert error" role="alert">{error}</div>}
    {notice && <div className="alert success" role="status">{notice}</div>}
    {!tests && !error && <p className="mt-empty">Testler yükleniyor…</p>}
    {tests && !shown.length && <div className="mt-empty-card"><ClipboardList size={28} aria-hidden="true" /><strong>{tests.length ? 'Burada test yok.' : 'Henüz bir test hazırlanmadı.'}</strong><Link className="mt-new" to="/soru-havuzu/hazirla"><Plus size={18} aria-hidden="true" /> Test Hazırla</Link></div>}
    <div className="mt-grid">{shown.map((t) => {
      const pct = t.homework?.total ? Math.round((t.homework.done / t.homework.total) * 100) : null;
      const draft = !t.locked;
      const canEdit = t.mine || user?.role === 'SUPER_ADMIN' || user?.role === 'INSTITUTION_MANAGER';
      return <article key={t.id} className={`mt-card${fresh === t.id ? ' fresh' : ''}`}>
        <div className="mt-card-top">
          <span className={`mt-badge ${t.kind.toLowerCase()}`}>{KIND[t.kind]}</span>
          <div className="mt-more" ref={menu === t.id ? menuRef : undefined}>
            <button type="button" className="mt-dots" aria-label={`${t.title}: diğer işlemler`} aria-haspopup="menu" aria-expanded={menu === t.id} onClick={() => setMenu(menu === t.id ? '' : t.id)}><MoreHorizontal size={20} aria-hidden="true" /></button>
            {menu === t.id && <div role="menu" className="mt-menu">
              <a role="menuitem" href={`/board/${encodeURIComponent(t.id)}`}>Tahtada aç</a>
              {canEdit && <button role="menuitem" type="button" disabled={busy === t.id} onClick={() => void copy(t)}>{draft ? 'Kopyala' : 'Kopyala ve düzenle'}</button>}
              <button role="menuitem" type="button" onClick={() => { setScan(t.doc); setMenu(''); }}>Optik okut</button>
              {canEdit && <button role="menuitem" type="button" className="danger" onClick={() => { setConfirm(t.id); setMenu(''); }}>{draft ? 'Sil' : 'Listeden kaldır'}</button>}
            </div>}
          </div>
        </div>
        <div className="mt-card-main">
          <div className="mt-card-text">
            <h2><Link className="mt-title" to={`/soru-havuzu/testlerim/${encodeURIComponent(t.id)}`}>{t.title}</Link></h2>
            <p>{[manager ? t.teacher?.name : null, t.gradeLevel ? `${t.gradeLevel}. sınıf` : null, t.subject, `${t.questionCount} soru`, date(t.updatedAt)].filter(Boolean).join(' · ')}</p>
            {t.homework && <p className="mt-sub">{t.homework.done}/{t.homework.total} öğrenci çözdü{t.homework.dueAt ? ` · son gün ${date(t.homework.dueAt)}` : ''}</p>}
            {t.opticalResults > 0 && <p className="mt-sub">{t.opticalResults} optik sonuç</p>}
            {t.locked && <Link className="mt-results" to={`/soru-havuzu/testlerim/${encodeURIComponent(t.id)}`}>Sonuçları gör ›</Link>}
          </div>
          {pct !== null && <svg className="mt-ring" viewBox="0 0 36 36" role="img" aria-label={`${t.homework!.total} öğrenciden ${t.homework!.done} çözdü`}><circle cx="18" cy="18" r="15.5" className="track" /><circle cx="18" cy="18" r="15.5" className="fill" pathLength={100} strokeDasharray={`${pct} 100`} /><text x="18" y="21">%{pct}</text></svg>}
        </div>
        <div className="mt-main-actions">
          {draft ? <button type="button" className="mt-big dark" onClick={() => setPreview(t.doc)}>Devam et</button>
            : <button type="button" className="mt-big dark" disabled={busy === t.id} onClick={() => void copy(t)}>Kopyala ve düzenle</button>}
          <button type="button" className={`mt-big${panel === t.id ? ' on' : ''}`} aria-expanded={panel === t.id} onClick={() => (panel !== t.id && t.checked === false ? setAsk(t.id) : setPanel(panel === t.id ? '' : t.id))}>{draft ? 'Ödev ver / Yazdır' : 'Tekrar kullan'}</button>
        </div>
        {confirm === t.id && <div className="mt-confirm" role="alert">
          <span>{draft ? 'Bu test kalıcı olarak silinir.' : 'Test listeden kalkar; öğrenci sonuçları ve karneler korunur.'}</span>
          <button type="button" className="mt-btn danger" disabled={busy === t.id} onClick={() => void remove(t)}>{draft ? 'Evet, sil' : 'Kaldır'}</button>
          <button type="button" className="mt-btn" onClick={() => setConfirm('')}>Vazgeç</button>
        </div>}
        {panel === t.id && <div className="mt-reuse">
          <div><strong>Yazdır</strong><div className="mt-panel"><StudioDownloads document={t.doc} onError={setError} /></div></div>
          {t.type === 'WORKSHEET' && t.status === 'READY' && <div><strong>Ödev ver</strong><StudioHomeworkAssign documentId={t.id} round={t.locked && t.homework ? 'NEXT' : undefined} onError={setError} onDone={(m) => { setNotice(m); setPanel(''); void load(); }} /></div>}
        </div>}
      </article>;
    })}</div>
    {ask && <TestCheckDialog testId={ask} onCancel={() => setAsk('')} onConfirmed={() => { const id = ask; setAsk(''); setTests((x) => (x || []).map((y) => (y.id === id ? { ...y, checked: true } : y))); setPanel(id); }} />}
    {preview && <StudioPreview document={preview} onClose={() => setPreview(null)} onChanged={() => void load()} />}
    {scan && <StudioOpticalScan document={scan} onClose={() => setScan(null)} />}
  </div>;
}
