import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { api } from '../api';
import './result-schedule-editor.css';

/**
 * Türkiye geneli takvim (owner, 3 Nov): application window, result release time and when uploads are evaluated again.
 * Between release and resume uploads are accepted and wait; ranks stay as released.
 */
type Row = { id: string; title: string; status: string; application_start_at?: string | null; application_end_at?: string | null; result_release_at?: string | null; upload_resume_at?: string | null; scheduled_release_done_at?: string | null };
const pad = (n: number) => String(n).padStart(2, '0');
/** ISO → value for <input type="datetime-local"> in the viewer's own clock. */
export const toLocalInput = (iso?: string | null) => { if (!iso) return ''; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const toIso = (v: string) => (v ? new Date(v).toISOString() : null);
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '');

export function scheduleState(row: Row, now = Date.now()): { label: string; tone: 'ok' | 'wait' | 'done' | 'none' } {
  const r = row.result_release_at ? Date.parse(row.result_release_at) : null, u = row.upload_resume_at ? Date.parse(row.upload_resume_at) : null;
  if (!r) return { label: 'Takvim yok', tone: 'none' };
  if (now < r) return { label: `Sonuç ${fmt(row.result_release_at)}`, tone: 'ok' };
  if (u && now < u) return { label: `Yükleme bekletiliyor · ${fmt(row.upload_resume_at)}'e kadar`, tone: 'wait' };
  return { label: 'Sonuçlar açıklandı', tone: 'done' };
}

export function ResultScheduleEditor({ row, onSaved }: { row: Row; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ applicationStartAt: toLocalInput(row.application_start_at), applicationEndAt: toLocalInput(row.application_end_at), releaseAt: toLocalInput(row.result_release_at), resumeAt: toLocalInput(row.upload_resume_at) });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [note, setNote] = useState('');
  const state = scheduleState(row);
  const set = (k: keyof typeof f, v: string) => setF((x) => {
    const next = { ...x, [k]: v };
    // the release evening defaults to four hours (17:00 → 21:00)
    if (k === 'releaseAt' && v && !x.resumeAt) { const d = new Date(v); d.setHours(d.getHours() + 4); next.resumeAt = toLocalInput(d.toISOString()); }
    return next;
  });
  const save = async () => {
    setBusy(true); setError(''); setNote('');
    try {
      await api(`/api/admin/result-network/administrations/${encodeURIComponent(row.id)}/schedule`, { method: 'PUT', body: JSON.stringify({ applicationStartAt: toIso(f.applicationStartAt), applicationEndAt: toIso(f.applicationEndAt), releaseAt: toIso(f.releaseAt), resumeAt: toIso(f.resumeAt) }) });
      setNote('Takvim kaydedildi.'); onSaved();
    } catch (e: any) { setError(e.message || 'Takvim kaydedilemedi.'); } finally { setBusy(false); }
  };
  const released = !!row.scheduled_release_done_at;
  return <div className="rse">
    <button type="button" className="ghost rse-toggle" aria-expanded={open} onClick={() => setOpen(!open)}><CalendarClock size={16} aria-hidden="true" /> Takvim <span className={`rse-badge rse-${state.tone}`}>{state.label}</span></button>
    {open && <div className="rse-panel">
      <div className="rse-grid">
        <label>Uygulama başlangıcı<input type="datetime-local" value={f.applicationStartAt} onChange={(e) => set('applicationStartAt', e.target.value)} /></label>
        <label>Uygulama bitişi<input type="datetime-local" value={f.applicationEndAt} onChange={(e) => set('applicationEndAt', e.target.value)} /></label>
        <label>Sonuç açıklama<input type="datetime-local" value={f.releaseAt} disabled={released} onChange={(e) => set('releaseAt', e.target.value)} /></label>
        <label>Yükleme yeniden açılır<input type="datetime-local" value={f.resumeAt} onChange={(e) => set('resumeAt', e.target.value)} /></label>
      </div>
      <div className="rse-bar" aria-hidden="true"><span className="rse-a">Uygulama</span><span className="rse-u">Veri yükleme</span><span className="rse-w">Sonuç gecesi</span><span className="rse-n">Normal</span></div>
      <p className="rse-help">Sonuç açıklama saatinde o ana kadar değerlendirilen sonuçlarla sıralar bir kez hesaplanır ve yayınlanır (en geç 15 dakika içinde). Yükleme yeniden açılana kadar yüklenen dosyalar alınır, değerlendirmeleri bekletilir ve sıralar sabit kalır. Ardından bekleyen yüklemeler otomatik değerlendirilir ve sıralama canlı olarak güncellenir.{released ? ' Sonuçlar bu takvimle açıklandı; açıklama zamanı artık değiştirilemez.' : ''}</p>
      {error && <div className="alert error" role="alert">{error}</div>}
      {note && <div className="alert success" role="status">{note}</div>}
      <div className="rse-actions"><button type="button" className="ghost" onClick={() => setOpen(false)}>Kapat</button><button type="button" className="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Kaydediliyor…' : 'Takvimi kaydet'}</button></div>
    </div>}
  </div>;
}
