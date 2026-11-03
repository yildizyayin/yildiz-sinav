import { useEffect, useState } from 'react';
import { Lock, LockOpen } from 'lucide-react';
import { api } from '../api';
import './exam-correction-toggle.css';

/**
 * Tek "Düzeltme" anahtarı (owner, 3 Nov): one switch in the exam card. Opening asks for a reason and a confirmation;
 * closing re-evaluates the uploads that need it and asks before the results go back out with fresh ranks.
 */
type State = { open: boolean; canOpen: boolean; app: { state: string | null }; network: { status: string } | null; pending: Array<{ id: string; institution: string; total: number }> };

export function ExamCorrectionToggle({ examId, onChanged }: { examId: string; onChanged: () => void }) {
  const [s, setS] = useState<State | null>(null); const [error, setError] = useState(''); const [note, setNote] = useState('');
  const [ask, setAsk] = useState<'' | 'OPEN' | 'CLOSE'>(''); const [reason, setReason] = useState(''); const [busy, setBusy] = useState('');
  const url = `/api/exam-definitions/${encodeURIComponent(examId)}/correction`;
  const load = () => api<any>(url).then((r) => { setS(r); setError(''); }).catch((e) => setError(e.message));
  useEffect(() => { setS(null); setAsk(''); setNote(''); void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);
  if (!s) return error ? <div className="alert error" role="alert">{error}</div> : null;
  if (!s.open && !s.canOpen) return null; // nothing published yet: the exam is edited directly

  const open = async () => {
    setBusy('Açılıyor…'); setError('');
    try { await api(url, { method: 'POST', body: JSON.stringify({ action: 'OPEN', reason }) }); setAsk(''); setReason(''); setNote('Sınav düzeltmeye açıldı. Öğrenciler kapatana kadar sonucu göremez.'); await load(); onChanged(); }
    catch (e: any) { setError(e.message); } finally { setBusy(''); }
  };
  const close = async () => {
    setError('');
    try {
      for (let i = 0; i < s.pending.length; i++) { const b = s.pending[i]; setBusy(`Yeniden değerlendiriliyor: ${b.institution} (${i + 1}/${s.pending.length})`); await api(`/api/scan-batches/${encodeURIComponent(b.id)}/evaluate`, { method: 'POST' }); }
      setBusy('Sonuçlar yayına alınıyor…');
      await api(url, { method: 'POST', body: JSON.stringify({ action: 'CLOSE' }) });
      setAsk(''); setNote('Düzeltme kapatıldı; sonuçlar yeniden yayınlandı ve sıralar güncellendi.'); await load(); onChanged();
    } catch (e: any) { setError(e.message); await load(); } finally { setBusy(''); }
  };

  return <section className={`panel ect ${s.open ? 'ect-on' : ''}`} aria-labelledby="ect-title" style={{ marginBottom: 20 }}>
    <div className="ect-row">
      <div><h2 id="ect-title">Düzeltme</h2><p className="field-help">{s.open ? 'Açık: puanlama profili, cevap anahtarı ve yüklemeler değiştirilebilir. Öğrenciler sonucu şu an göremiyor.' : 'Kapalı: yayımlanmış sonuç kilitli.'}</p></div>
      <button type="button" role="switch" aria-checked={s.open} className={`ect-switch ${s.open ? 'on' : ''}`} disabled={!!busy} onClick={() => { setNote(''); setError(''); setAsk(s.open ? 'CLOSE' : 'OPEN'); }}>
        <span className="ect-knob" aria-hidden="true">{s.open ? <LockOpen size={14} /> : <Lock size={14} />}</span><span>{s.open ? 'Açık' : 'Kapalı'}</span>
      </button>
    </div>
    {ask === 'OPEN' && <div className="ect-confirm" role="alertdialog" aria-labelledby="ect-q1">
      <p id="ect-q1"><strong>Emin misiniz?</strong> Sınav düzeltmeye açılacak: yayımlanmış sonuç geri çekilir, yüklemeler yeniden değerlendirilebilir hale gelir. Düzeltmeyi kapatana kadar öğrenciler sonucu göremez.</p>
      <label>Gerekçe (10–500 karakter)<textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ör. Puanlama profili yanlış seçilmiş" rows={2} /></label>
      <div className="ect-actions"><button type="button" className="ghost" onClick={() => setAsk('')}>Vazgeç</button><button type="button" className="primary" disabled={!!busy || reason.trim().length < 10} onClick={() => void open()}>{busy || 'Evet, düzeltmeye aç'}</button></div>
    </div>}
    {ask === 'CLOSE' && <div className="ect-confirm" role="alertdialog" aria-labelledby="ect-q2">
      <p id="ect-q2"><strong>Emin misiniz?</strong> Düzeltmeler yayına alınacak ve sıralar yeniden hesaplanacak.{s.pending.length ? ` Önce ${s.pending.length} yükleme yeni ayarlarla yeniden değerlendirilecek.` : ''}</p>
      {!!s.pending.length && <ul className="ect-pending">{s.pending.map((b) => <li key={b.id}>{b.institution} · {b.total} optik</li>)}</ul>}
      <div className="ect-actions"><button type="button" className="ghost" disabled={!!busy} onClick={() => setAsk('')}>Vazgeç</button><button type="button" className="primary" disabled={!!busy} onClick={() => void close()}>{busy || 'Evet, kapat ve yayınla'}</button></div>
    </div>}
    {busy && <p className="muted" role="status">{busy}</p>}
    {error && <div className="alert error" role="alert">{error}</div>}
    {note && <div className="alert success" role="status">{note}</div>}
  </section>;
}
