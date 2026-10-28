import { useEffect, useState } from 'react';
import { api } from '../api';

/**
 * D-S039: the exam trash. Every removed exam with the days left; "Geri al" brings it back, "Kalıcı sil" (typing the
 * exam's name) deletes it for good. After 30 days the schedule deletes it by itself.
 */
const left = (iso: string) => Math.max(0, Math.ceil((new Date(String(iso).replace(' ', 'T') + 'Z').getTime() - Date.now()) / 86400000));
export function ExamTrash({ onChanged }: { onChanged?: (m: string) => void }) {
  const [rows, setRows] = useState<any[]>([]); const [error, setError] = useState(''); const [busy, setBusy] = useState('');
  const [purging, setPurging] = useState<any>(null); const [typed, setTyped] = useState('');
  const load = () => api<any>('/api/admin/exam-trash').then((r) => setRows(r.exams || [])).catch((e: any) => setError(e.message));
  useEffect(() => { void load(); }, []);
  const restore = async (r: any) => { setBusy(r.id); setError(''); try { await api(`/api/admin/exams/${encodeURIComponent(r.id)}/restore`, { method: 'POST', body: '{}' }); onChanged?.(`${r.title} geri alındı. Yayınlamak için kanal yönetiminden yeniden yayınlayın.`); await load(); } catch (e: any) { setError(e.message); } finally { setBusy(''); } };
  const purge = async () => { if (!purging) return; setBusy(purging.id); setError(''); try { const r = await api<any>(`/api/admin/exams/${encodeURIComponent(purging.id)}/purge`, { method: 'POST', body: JSON.stringify({ confirmTitle: typed }) }); onChanged?.(`${r.title} kalıcı silindi${r.students ? `; ${r.students} öğrencinin sonucu kaldırıldı` : ''}.`); setPurging(null); setTyped(''); await load(); } catch (e: any) { setError(e.message); } finally { setBusy(''); } };
  if (!rows.length && !error) return null;
  return <section className="panel exam-trash" aria-labelledby="trash-h">
    <div className="panel-head"><div><h2 id="trash-h">Çöp kutusu</h2><p>Kaldırılan sınavlar 30 gün burada durur, sonra kendiliğinden kalıcı silinir.</p></div></div>
    {error && <div className="alert error" role="alert">{error}</div>}
    <ul className="exam-trash-list">{rows.map((r) => <li key={r.id}>
      <span><b>{r.title}</b><small>{[r.exam_type, r.academic_year].filter(Boolean).join(' · ')} · {Number(r.students || 0)} öğrenci · {left(r.purge_at)} gün sonra kalıcı silinecek</small></span>
      <span className="exam-trash-actions"><button type="button" className="secondary" disabled={!!busy} onClick={() => void restore(r)}>Geri al</button><button type="button" className="ghost" disabled={!!busy} onClick={() => { setPurging(r); setTyped(''); }}>Kalıcı sil</button></span>
      {purging?.id === r.id && <div className="exam-trash-confirm" role="group" aria-label="Kalıcı silme onayı"><p>Bu işlem geri alınamaz. Sınav, yüklemeleri ve {Number(r.students || 0)} öğrencinin sonucu silinir. Onaylamak için sınavın adını yazın: <b>{r.title}</b></p>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Sınavın adı" autoFocus />
        <span className="exam-trash-actions"><button type="button" className="danger" disabled={busy === r.id || typed.trim().toLocaleLowerCase('tr-TR') !== String(r.title).trim().toLocaleLowerCase('tr-TR')} onClick={() => void purge()}>{busy === r.id ? 'Siliniyor…' : 'Kalıcı olarak sil'}</button><button type="button" className="ghost" onClick={() => setPurging(null)}>Vazgeç</button></span></div>}
    </li>)}</ul>
  </section>;
}
