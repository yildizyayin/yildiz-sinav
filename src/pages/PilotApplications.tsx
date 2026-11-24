import { useEffect, useState } from 'react';
import { api } from '../api';
import './pilot-applications.css';

/** Pilot Başvuruları (owner, 12 Nov 2026): applications from the anunex.com form, for the Super Admin. */
const TYPE: Record<string, string> = { DEVLET_OKULU: 'Devlet okulu', OZEL_OKUL: 'Özel okul', KURS: 'Kurs / dershane', ETUT_MERKEZI: 'Etüt merkezi', DIGER: 'Diğer' };
const STATUS: Record<string, string> = { NEW: 'Yeni', CONTACTED: 'Arandı', PILOT: 'Pilot oldu', DECLINED: 'Olmadı' };

export function PilotApplications() {
  const [status, setStatus] = useState(''); const [rows, setRows] = useState<any[] | null>(null); const [error, setError] = useState('');
  const load = async () => { try { setRows((await api<any>(`/api/pilot-applications${status ? `?status=${status}` : ''}`)).applications); setError(''); } catch (e: any) { setError(e.message); } };
  useEffect(() => { void load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  const patch = async (id: string, body: any) => { try { await api(`/api/pilot-applications/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }); await load(); } catch (e: any) { setError(e.message); } };
  return <div className="pa">
    <div className="page-head"><div><span className="eyebrow">Süper Admin</span><h1>Pilot Başvuruları</h1><p className="muted">anunex.com’daki “Pilot okul başvurusu” formundan gelenler. Kişisel veri: yalnız arama için; sonuçlanmayan başvuruyu 1 yıl içinde silin.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    <div className="pa-filter">{[['', 'Tümü'], ...Object.entries(STATUS)].map(([k, l]) => <button key={k} type="button" className={status === k ? 'active' : ''} onClick={() => setStatus(k)}>{l}</button>)}</div>
    {rows && !rows.length && <div className="empty">Başvuru yok.</div>}
    <ul className="pa-list">{rows?.map((r) => <li key={r.id} className="pa-item">
      <div className="pa-head"><strong>{r.institution_name}</strong><span className={`pa-chip s-${r.status}`}>{STATUS[r.status]}</span></div>
      <small>{[r.city, TYPE[r.institution_type], r.student_count ? `${r.student_count} öğrenci` : null, new Date(r.created_at.replace(' ', 'T') + 'Z').toLocaleString('tr-TR')].filter(Boolean).join(' · ')}</small>
      <div className="pa-contact"><span>{r.contact_name}</span><a href={`tel:${r.phone}`}>{r.phone}</a>{r.email && <a href={`mailto:${r.email}`}>{r.email}</a>}</div>
      {r.message && <p className="pa-msg">{r.message}</p>}
      <div className="pa-actions">
        <select value={r.status} onChange={(e) => void patch(r.id, { status: e.target.value })} aria-label="Durum">{Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <input defaultValue={r.note || ''} placeholder="Not" maxLength={600} onBlur={(e) => e.target.value !== (r.note || '') && void patch(r.id, { note: e.target.value })} aria-label="Not" />
      </div>
    </li>)}</ul>
  </div>;
}
