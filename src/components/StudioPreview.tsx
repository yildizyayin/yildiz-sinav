import { useEffect, useState } from 'react';
import { Eye, RefreshCw, X } from 'lucide-react';
import { api } from '../api';

/** A083.3: see the booklet before printing; replace a question with another approved one from the same outcome. */
const BAND = { EASY: 'Kolay', MEDIUM: 'Orta', HARD: 'Zor' } as Record<string, string>;
export function StudioPreview({ document, onClose, onChanged }: { document: any; onClose: () => void; onChanged?: () => void }) {
  const booklets: string[] = (() => { try { const c = JSON.parse(document.config_json || '{}'); return Array.isArray(c.bookletCodes) && c.bookletCodes.length ? c.bookletCodes : ['A']; } catch { return ['A']; } })();
  const [booklet, setBooklet] = useState(booklets[0]);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [sameDifficulty, setSameDifficulty] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: string; kind: 'ok' | 'error'; text: string } | null>(null);
  const load = () => api<any>(`/api/platform/studio/${encodeURIComponent(document.id)}/items?booklet=${booklet}`).then(r => { setData(r); setError(''); }).catch(e => setError(e?.message || 'Önizleme alınamadı.'));
  useEffect(() => { setData(null); void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document.id, booklet]);
  const swap = async (item: any) => {
    setBusy(item.id); setNotice(null);
    try {
      const r = await api<any>(`/api/platform/studio/${encodeURIComponent(document.id)}/swap`, { method: 'POST', body: JSON.stringify({ questionId: item.id, sameDifficulty }) });
      await load(); onChanged?.();
      setNotice({ id: r.to, kind: 'ok', text: `${item.position}. soru değiştirildi${r.sameOutcome ? ' (aynı kazanım' + (r.sameDifficulty ? ', aynı zorluk)' : ')') : ''}.${r.invalidatedPdfs ? ' Daha önce indirilen PDF ve optikler geçersiz; yeniden indirip basın.' : ''}` });
    } catch (e: any) { setNotice({ id: item.id, kind: 'error', text: e?.message || 'Soru değiştirilemedi.' }); }
    finally { setBusy(null); }
  };
  return <div className="studio-preview" role="dialog" aria-label="Önizleme">
    <div className="studio-optical-head"><strong><Eye size={16} /> Önizleme · {document.title}</strong><button type="button" onClick={onClose} aria-label="Kapat"><X size={16} /></button></div>
    <div className="studio-preview-bar">
      {booklets.length > 1 && <div className="studio-preview-tabs">{booklets.map(b => <button key={b} type="button" className={b === booklet ? 'active' : ''} onClick={() => setBooklet(b)}>Kitapçık {b}</button>)}</div>}
      <label className="check"><input type="checkbox" checked={sameDifficulty} onChange={e => setSameDifficulty(e.target.checked)} /> Değiştirirken aynı zorlukta kal</label>
    </div>
    {error && <div className="alert error" role="alert">{error}</div>}
    {data?.locked && <div className="alert warning" role="status">Bu sınavın {data.results} öğrenci sonucu var; sorular artık değiştirilemez.</div>}
    {data && !data.locked && data.printed && <div className="alert info" role="status">Bu belgenin PDF'i indirilmiş. Soru değiştirirseniz eski PDF ve optikler geçersiz olur.</div>}
    {!data && !error && <p className="muted">Yükleniyor…</p>}
    <ol className="studio-preview-list">{data?.items?.map((item: any) => <li key={`${item.position}-${item.id}`} className={notice && notice.id === item.id ? `flash ${notice.kind}` : ''}>
      <div className="studio-preview-meta"><b>{item.position}.</b>{item.outcomes && <span className="chip">{item.outcomes}</span>}<span className={`chip band-${item.band}`}>{BAND[item.band] || item.band}</span>
        {!data.locked && <button type="button" className="secondary subtle" disabled={!!busy} onClick={() => void swap(item)}><RefreshCw size={13} /> {busy === item.id ? 'Değiştiriliyor…' : 'Değiştir'}</button>}</div>
      <p className="studio-preview-stem">{item.stem}</p>
      <ul className="studio-preview-options">{item.options.map((o: any) => <li key={o.label} className={o.label === item.correctAnswer ? 'correct' : ''}><b>{o.label})</b> {o.text}</li>)}</ul>
      {notice && notice.id === item.id && <div className={`alert ${notice.kind === 'ok' ? 'success' : 'error'}`} role={notice.kind === 'ok' ? 'status' : 'alert'}>{notice.text}</div>}
    </li>)}</ol>
  </div>;
}
