import { useEffect, useState } from 'react';
import { api } from '../api';

/**
 * D-S039: one upload's "Sil", "Geri al" and (bayi / Süper Admin) "Başka okula taşı", written for someone who has never
 * used the system: every step says what will happen before it happens, and nothing is lost for 7 days.
 */
type Row = { id: string; status: string; institution_name: string; institution_code: string; title: string; total: number; deleted_at?: string | null; purge_after?: string | null };
const daysLeft = (iso?: string | null) => { if (!iso) return 0; const ms = new Date(String(iso).replace(' ', 'T') + (String(iso).includes('Z') ? '' : 'Z')).getTime() - Date.now(); return Math.max(0, Math.ceil(ms / 86400000)); };

export function BatchActions({ row, mode, canMove, onChanged }: { row: Row; mode: 'INSTITUTION' | 'DEALER'; canMove: boolean; onChanged: (message: string) => void }) {
  const [open, setOpen] = useState<'' | 'DELETE' | 'MOVE'>('');
  const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [q, setQ] = useState(''); const [options, setOptions] = useState<any[]>([]); const [target, setTarget] = useState<any>(null);
  const evaluated = row.status === 'COMMITTED';
  useEffect(() => { if (open !== 'MOVE' || target || q.trim().length < 2) { setOptions([]); return; } const h = setTimeout(() => { void api<any>(`/api/admin/result-network/operations/institutions?mode=${mode}&q=${encodeURIComponent(q.trim())}`).then((r) => setOptions((r.institutions || []).filter((x: any) => x.code !== row.institution_code))).catch(() => setOptions([])); }, 250); return () => clearTimeout(h); }, [q, open, target]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => { setOpen(''); setReason(''); setError(''); setQ(''); setTarget(null); };
  const run = async (fn: () => Promise<any>, done: (r: any) => string) => { setBusy(true); setError(''); try { const r = await fn(); close(); onChanged(done(r)); } catch (e: any) { setError(e.message); } finally { setBusy(false); } };

  if (row.deleted_at) {
    const left = daysLeft(row.purge_after);
    return <div className="ba-deleted"><span className="ba-tag">Silindi · {left ? `${left} gün içinde geri alınabilir` : 'kalıcı silinecek'}</span>
      {left > 0 && <button type="button" className="secondary" disabled={busy} onClick={() => void run(() => api(`/api/admin/result-network/operations/scan-batches/${row.id}/restore`, { method: 'POST' }), () => 'Yükleme geri geldi. Sonuçlar için yüklemeyi açıp "Değerlendir"e basın.')}>Geri al</button>}
      {error && <span className="ba-error" role="alert">{error}</span>}</div>;
  }
  return <div className="ba">
    {!open && <div className="ba-buttons">
      <button type="button" className="ghost" onClick={() => setOpen('DELETE')}>Sil</button>
      {canMove && <button type="button" className="ghost" onClick={() => setOpen('MOVE')}>Başka okula taşı</button>}
    </div>}
    {open === 'DELETE' && <div className="ba-panel" role="group" aria-label="Yüklemeyi sil">
      <p><b>{row.institution_name}</b> okulunun <b>{row.title}</b> yüklemesi silinecek ({Number(row.total || 0)} satır).
        {evaluated ? ' Bu öğrencilerin sonuçları, raporlardan ve öğrenci ekranından hemen kalkar; sıralar yeniden hesaplanır.' : ' Henüz değerlendirilmediği için hiçbir sonuç etkilenmez.'} 7 gün içinde geri alabilirsiniz.</p>
      {evaluated && <label>Neden siliyorsunuz?<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Örn. Yanlış sınav dosyası yüklendi" autoFocus /></label>}
      {error && <div className="alert error" role="alert">{error}</div>}
      <div className="ba-buttons"><button type="button" className="danger" disabled={busy || (evaluated && reason.trim().length < 5)} onClick={() => void run(() => api<any>(`/api/admin/result-network/operations/scan-batches/${row.id}`, { method: 'DELETE', body: JSON.stringify({ reason }) }), (r) => `Yükleme silindi${r.removed ? `; ${r.removed} öğrencinin sonucu kaldırıldı` : ''}. 7 gün içinde "Geri al" ile geri getirebilirsiniz.`)}>{busy ? 'Siliniyor…' : 'Evet, sil'}</button><button type="button" className="ghost" onClick={close}>Vazgeç</button></div>
    </div>}
    {open === 'MOVE' && <div className="ba-panel" role="group" aria-label="Başka okula taşı">
      <p>Yükleme şu an <b>{row.institution_name}</b> ({row.institution_code}) okulunda. Doğru okulu seçin; {evaluated ? 'sonuçlar bu okuldan kalkar, yeni okulda yeniden değerlendirirsiniz.' : 'yükleme yeni okula geçer.'}</p>
      <label className="result-institution-picker">Doğru okul<input value={q} onChange={(e) => { setQ(e.target.value); setTarget(null); }} placeholder="Okul adı veya MEB kodu" autoFocus />
        {target && <small className="field-help">Seçildi: {target.name} · {target.code}</small>}
        {!target && options.length > 0 && <div className="institution-options">{options.map((x: any) => <button type="button" key={x.code} onClick={() => { setTarget(x); setQ(`${x.name} · ${x.code}`); setOptions([]); }}><strong>{x.name}</strong><span>{x.city} · {x.district} · {x.code}</span></button>)}</div>}</label>
      <label>Neden taşıyorsunuz?<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Örn. Dosya yanlış okula yüklenmiş" /></label>
      {error && <div className="alert error" role="alert">{error}</div>}
      <div className="ba-buttons"><button type="button" className="primary" disabled={busy || !target || reason.trim().length < 5} onClick={() => void run(() => api<any>(`/api/admin/result-network/operations/scan-batches/${row.id}/move`, { method: 'POST', body: JSON.stringify({ mebCode: target.code, reason }) }), (r) => `Yükleme ${r.institution?.name || target.name} okuluna taşındı. Sonuçlar için yüklemeyi açıp "Değerlendir"e basın.`)}>{busy ? 'Taşınıyor…' : 'Bu okula taşı'}</button><button type="button" className="ghost" onClick={close}>Vazgeç</button></div>
    </div>}
  </div>;
}
