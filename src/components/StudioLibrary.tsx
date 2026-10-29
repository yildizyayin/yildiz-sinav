import { useMemo, useState } from 'react';
import { Eye, ScanLine, Search, Star, Timer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { StudioDownloads } from './StudioDownloads';
import { StudioHomeworkAssign } from './StudioHomeworkAssign';

/** A083.4: Studio documents as a card library with Tümü / Testlerim / Favoriler, subject filter and search. */
const TYPE: Record<string, string> = { PRACTICE_EXAM: 'Deneme', WRITTEN_EXAM: 'Yazılı', WORKSHEET: 'Föy', PERSONAL_BOOK: 'Kişisel kitap' };
const STATUS: Record<string, string> = { DRAFT: 'Taslak', READY: 'Hazır', PUBLISHED: 'Yayında', ARCHIVED: 'Arşiv' };
const cfg = (d: any) => { try { return JSON.parse(d.config_json || '{}'); } catch { return {}; } };

export function StudioLibrary({ docs, onPreview, onScan, onError, onChanged }: { docs: any[]; onPreview: (d: any) => void; onScan: (d: any) => void; onError: (m: string) => void; onChanged: () => void }) {
  const [view, setView] = useState<'ALL' | 'MINE' | 'FAV'>('ALL');
  const [subject, setSubject] = useState('');
  const [query, setQuery] = useState('');
  const [fav, setFav] = useState<Record<string, boolean>>({});
  const [assigning, setAssigning] = useState(''); const [notice, setNotice] = useState('');
  const navigate = useNavigate(); const [converting, setConverting] = useState('');
  // S044: a pool test becomes a timed online exam (Hızlı Test) in one click; only approved text questions qualify.
  const toOnline = async (d: any) => { setConverting(d.id); try { const r = await api<any>(`/api/quick-tests/from-studio/${encodeURIComponent(d.id)}`, { method: 'POST' }); navigate(`/quick-tests/${r.id}`); } catch (e: any) { onError(e?.message || 'Online sınava dönüştürülemedi.'); } finally { setConverting(''); } };
  const isFav = (d: any) => fav[d.id] ?? !!d.is_favorite;
  const subjects = useMemo(() => [...new Map(docs.filter(d => d.subject_id).map(d => [d.subject_id, d.subject_name || d.subject_id])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'tr')), [docs]);
  const shown = docs.filter(d => (view === 'ALL' || (view === 'MINE' ? !!d.is_mine : isFav(d))) && (!subject || d.subject_id === subject) && (!query.trim() || String(d.title || '').toLocaleLowerCase('tr').includes(query.trim().toLocaleLowerCase('tr'))));
  const toggle = async (d: any) => {
    const next = !isFav(d); setFav(f => ({ ...f, [d.id]: next }));
    try { await api(`/api/platform/studio/${encodeURIComponent(d.id)}/favorite`, { method: next ? 'POST' : 'DELETE' }); onChanged(); }
    catch (e: any) { setFav(f => ({ ...f, [d.id]: !next })); onError(e?.message || 'Favori kaydedilemedi.'); }
  };
  const count = (v: 'ALL' | 'MINE' | 'FAV') => docs.filter(d => v === 'ALL' || (v === 'MINE' ? !!d.is_mine : isFav(d))).length;
  return <div className="studio-library">
    <div className="studio-library-bar">
      <div className="studio-preview-tabs" role="tablist">{([['ALL', 'Tümü'], ['MINE', 'Testlerim'], ['FAV', 'Favoriler']] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={view === k} className={view === k ? 'active' : ''} onClick={() => setView(k)}>{l} <span>{count(k)}</span></button>)}</div>
      <select aria-label="Ders filtresi" value={subject} onChange={e => setSubject(e.target.value)}><option value="">Tüm dersler</option>{subjects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
      <label className="studio-library-search"><Search size={14} /><input aria-label="Test ara" placeholder="Test ara" value={query} onChange={e => setQuery(e.target.value)} /></label>
    </div>
    {notice && <div className="alert success">{notice}</div>}
    {!shown.length && <p className="empty">{view === 'FAV' ? 'Henüz favori test yok. Kartlardaki yıldızla ekleyin.' : view === 'MINE' ? 'Henüz sizin oluşturduğunuz test yok.' : 'Bu filtreye uyan test yok.'}</p>}
    <div className="studio-cards">{shown.map(d => { const c = cfg(d); const optical = String(c.deliveryMode || 'PDF_OPTICAL') === 'PDF_OPTICAL';
      return <article key={d.id} className="studio-card">
        <header><span className="studio-card-type">{TYPE[d.document_type] || d.document_type}</span><button type="button" className={`studio-star${isFav(d) ? ' on' : ''}`} aria-pressed={isFav(d)} aria-label={isFav(d) ? 'Favorilerden çıkar' : 'Favorilere ekle'} onClick={() => void toggle(d)}><Star size={16} /></button></header>
        <h3>{d.title}</h3>
        <p className="studio-card-meta">{[d.grade_level ? `${d.grade_level}. sınıf` : null, d.subject_name || null, `${d.question_count || 0} soru`, (Array.isArray(c.bookletCodes) ? c.bookletCodes : ['A']).join(' / ') + ' kitapçık'].filter(Boolean).join(' · ')}</p>
        <p className="studio-card-meta"><span className={`status ${d.status === 'READY' ? 'ok' : 'neutral'}`}>{STATUS[d.status] || d.status}</span>{c.academicYear ? <span>{c.academicYear}</span> : null}{d.created_at ? <span>{String(d.created_at).slice(0, 10)}</span> : null}{d.is_mine ? <span>Benim</span> : null}</p>
        <footer><button type="button" className="secondary subtle" onClick={() => onPreview(d)}><Eye size={13} /> Önizle</button><button type="button" className="secondary subtle" disabled={converting === d.id} onClick={() => void toOnline(d)}><Timer size={13} /> {converting === d.id ? 'Hazırlanıyor…' : 'Online sınav yap'}</button>{optical && <button type="button" className="secondary subtle" onClick={() => onScan(d)}><ScanLine size={13} /> Optik okut</button>}<StudioDownloads document={d} onError={onError} /><a className="secondary subtle" href={`/board/${encodeURIComponent(d.id)}`}>Tahtada aç</a>{d.document_type === 'WORKSHEET' && d.status === 'READY' && <button type="button" className="secondary subtle" onClick={() => setAssigning(assigning === d.id ? '' : d.id)}>Ödev olarak ata</button>}</footer>
        {assigning === d.id && <StudioHomeworkAssign documentId={d.id} onError={onError} onDone={(m) => { setNotice(m); setAssigning(''); onChanged(); }} />}
      </article>; })}</div>
  </div>;
}
