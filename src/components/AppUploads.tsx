import { useEffect, useState } from 'react';
import { api } from '../api';
import './app-uploads.css';

/**
 * Wrong uploads in the app (owner, 3 Nov): this exam's uploads for the institution, each with "Sil" and, for 7 days
 * after deleting, "Geri al". Every step says what will happen before it happens.
 */
type Upload = { id: string; status: string; created_at: string; created_by_name?: string; total: number; deleted_at?: string | null; purge_after?: string | null; deleted_reason?: string | null };
const STATUS: Record<string, string> = { PREVIEW: 'Önizleme', NEEDS_REVIEW: 'Kontrol bekliyor', READY: 'Değerlendirmeye hazır', COMMITTED: 'Değerlendirildi', FAILED: 'Hatalı' };
const when = (s: string) => new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z')).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const daysLeft = (iso?: string | null) => { if (!iso) return 0; const ms = new Date(String(iso).replace(' ', 'T') + (String(iso).includes('Z') ? '' : 'Z')).getTime() - Date.now(); return Math.max(0, Math.ceil(ms / 86400000)); };

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
  if (!shown) return <div className="app-uploads-open"><button type="button" className="ghost" onClick={() => setShown(true)}>Bu sınavın yüklemeleri (sil / geri al)</button></div>;
  if (rows === null && !error) return <p className="muted" role="status">Yüklemeler okunuyor…</p>;
  return <section className="panel app-uploads" aria-labelledby="au-title">
    <div className="panel-head"><div><h2 id="au-title">Bu sınavın yüklemeleri</h2><p>Yanlış dosya veya yanlış sınav yüklendiyse silin; sonuçlar hemen kalkar, yükleme 7 gün içinde geri alınabilir.</p></div></div>
    {error && <div className="alert error" role="alert">{error}</div>}
    {note && <div className="alert success" role="status">{note}</div>}
    {!rows?.length ? <p className="muted">Henüz yükleme yok.</p> : <ul className="au-list">{rows.map((r) => {
      const evaluated = r.status === 'COMMITTED', left = daysLeft(r.purge_after);
      return <li key={r.id} className={r.deleted_at ? 'au-deleted' : ''}>
        <div className="au-main"><strong>{when(r.created_at)}</strong><span>{Number(r.total || 0).toLocaleString('tr-TR')} satır · {r.deleted_at ? 'Silindi' : STATUS[r.status] || r.status}{r.created_by_name ? ` · ${r.created_by_name}` : ''}</span>
          {r.deleted_at && <small>{left ? `${left} gün içinde geri alınabilir` : 'Kalıcı silinecek'}{r.deleted_reason ? ` · Neden: ${r.deleted_reason}` : ''}</small>}</div>
        <div className="au-actions">
          {r.deleted_at ? (left > 0 && <button type="button" className="secondary" disabled={busy} onClick={() => void act(() => api(`/api/scan-batches/${encodeURIComponent(r.id)}/restore`, { method: 'POST' }), () => 'Yükleme geri geldi. Sonuçlar için dosyayı yeniden açıp "Değerlendir"e basın.')}>Geri al</button>)
            : open !== r.id && <button type="button" className="ghost" onClick={() => { setOpen(r.id); setReason(''); setError(''); }}>Sil</button>}
        </div>
        {open === r.id && !r.deleted_at && <div className="au-confirm" role="alertdialog" aria-label="Yüklemeyi sil">
          <p><strong>Emin misiniz?</strong> Bu yükleme silinecek ({Number(r.total || 0)} satır).{evaluated ? ' Bu öğrencilerin sonuçları raporlardan ve öğrenci ekranından hemen kalkar; sıralar yeniden hesaplanır.' : ' Henüz değerlendirilmediği için hiçbir sonuç etkilenmez.'} 7 gün içinde geri alabilirsiniz.</p>
          {evaluated && <label>Neden siliyorsunuz?<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Örn. Yanlış sınav dosyası yüklendi" autoFocus /></label>}
          <div className="au-buttons"><button type="button" className="ghost" disabled={busy} onClick={() => setOpen('')}>Vazgeç</button>
            <button type="button" className="danger" disabled={busy || (evaluated && reason.trim().length < 5)} onClick={() => void act(() => api<any>(`/api/scan-batches/${encodeURIComponent(r.id)}`, { method: 'DELETE', body: JSON.stringify({ reason }) }), (x) => `Yükleme silindi${x.removed ? `; ${x.removed} öğrencinin sonucu kaldırıldı` : ''}. 7 gün içinde geri alabilirsiniz.`)}>{busy ? 'Siliniyor…' : 'Evet, sil'}</button></div>
        </div>}
      </li>;
    })}</ul>}
  </section>;
}
