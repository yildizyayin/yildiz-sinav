import { useEffect, useState } from 'react';
import { api } from '../api';
import './app-uploads.css';

/**
 * Wrong uploads in the app (owner, 3 Nov): this exam's uploads for the institution, each with "Sil" — permanent: the
 * results, the read sheets and the file go at once. Every step says what will happen before it happens.
 */
type Upload = { id: string; status: string; created_at: string; created_by_name?: string; total: number; deleted_at?: string | null; purge_after?: string | null; deleted_reason?: string | null };
const STATUS: Record<string, string> = { PREVIEW: 'Önizleme', NEEDS_REVIEW: 'Kontrol bekliyor', READY: 'Değerlendirmeye hazır', COMMITTED: 'Değerlendirildi', FAILED: 'Hatalı' };
const when = (s: string) => new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z')).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function AppUploads({ examId, institutionId, refreshKey, onChanged }: { examId: string; institutionId: string; refreshKey?: unknown; onChanged?: () => void }) {
  const [rows, setRows] = useState<Upload[] | null>(null); const [error, setError] = useState(''); const [note, setNote] = useState('');
  const [open, setOpen] = useState(''); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false);
  // the list is read only when asked for, so opening the evaluation screen costs nothing extra
  const [shown, setShown] = useState(false);
  const load = () => api<any>(`/api/exams/${encodeURIComponent(examId)}/uploads?institutionId=${encodeURIComponent(institutionId)}`).then((r) => { setRows(r.uploads || []); setError(''); }).catch((e) => setError(e.message));
  useEffect(() => { setRows(null); if (shown) void load(); }, [examId, institutionId, refreshKey, shown]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn: () => Promise<any>, msg: (r: any) => string) => {
    setBusy(true); setError(''); setNote('');
    try { const r = await fn(); setOpen(''); setReason(''); setNote(msg(r)); await load(); onChanged?.(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  if (!shown) return <div className="app-uploads-open"><button type="button" className="ghost" onClick={() => setShown(true)}>Bu sınavın yüklemeleri (yanlış yüklemeyi sil)</button></div>;
  if (rows === null && !error) return <p className="muted" role="status">Yüklemeler okunuyor…</p>;
  return <section className="panel app-uploads" aria-labelledby="au-title">
    <div className="panel-head"><div><h2 id="au-title">Bu sınavın yüklemeleri</h2><p>Yanlış dosya veya yanlış sınav yüklendiyse silin; sonuçlar ve dosya hemen silinir, geri getirilemez.</p></div></div>
    {error && <div className="alert error" role="alert">{error}</div>}
    {note && <div className="alert success" role="status">{note}</div>}
    {!rows?.length ? <p className="muted">Henüz yükleme yok.</p> : <ul className="au-list">{rows.map((r) => {
      const evaluated = r.status === 'COMMITTED';
      return <li key={r.id} className={r.deleted_at ? 'au-deleted' : ''}>
        <div className="au-main"><strong>{when(r.created_at)}</strong><span>{Number(r.total || 0).toLocaleString('tr-TR')} satır · {r.deleted_at ? 'Silindi' : STATUS[r.status] || r.status}{r.created_by_name ? ` · ${r.created_by_name}` : ''}</span></div>
        <div className="au-actions">
          {!r.deleted_at && open !== r.id && <button type="button" className="ghost" onClick={() => { setOpen(r.id); setReason(''); setError(''); }}>Sil</button>}
        </div>
        {open === r.id && !r.deleted_at && <div className="au-confirm" role="alertdialog" aria-label="Yüklemeyi sil">
          <p><strong>Emin misiniz?</strong> Bu yükleme silinecek ({Number(r.total || 0)} satır).{evaluated ? ' Bu öğrencilerin sonuçları raporlardan ve öğrenci ekranından hemen kalkar; sıralar yeniden hesaplanır.' : ' Henüz değerlendirilmediği için hiçbir sonuç etkilenmez.'} Dosya da silinir; <strong>geri getirilemez</strong>.</p>
          {evaluated && <label>Neden siliyorsunuz?<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Örn. Yanlış sınav dosyası yüklendi" autoFocus /></label>}
          <div className="au-buttons"><button type="button" className="ghost" disabled={busy} onClick={() => setOpen('')}>Vazgeç</button>
            <button type="button" className="danger" disabled={busy || (evaluated && reason.trim().length < 5)} onClick={() => void act(() => api<any>(`/api/scan-batches/${encodeURIComponent(r.id)}`, { method: 'DELETE', body: JSON.stringify({ reason }) }), (x) => `Yükleme silindi${x.removed ? `; ${x.removed} öğrencinin sonucu kaldırıldı` : ''}.`)}>{busy ? 'Siliniyor…' : 'Evet, sil'}</button></div>
        </div>}
      </li>;
    })}</ul>}
  </section>;
}
