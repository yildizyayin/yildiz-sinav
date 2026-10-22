import { useState } from 'react';
import { api } from '../api';

/** A044: chain view for upper management — member schools, chain exams and the school-by-school comparison; membership and roles for the Super Admin. */
export function NetworkPanel({ networks, institutions, isAdmin }: { networks: any[]; institutions: any[]; isAdmin: boolean }) {
  const [id, setId] = useState(''); const [d, setD] = useState<any>(null); const [cmp, setCmp] = useState<any>(null);
  const [member, setMember] = useState(''); const [role, setRole] = useState({ userId: '', role: 'NETWORK_VIEWER' }); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const open = async (nid: string) => { setId(nid); setCmp(null); setError(''); setD(null); if (!nid) return; try { setD(await api<any>(`/api/platform/networks/${nid}/dashboard`)); } catch (e: any) { setError(e.message); } };
  const act = async (fn: () => Promise<any>, ok: string) => { setError(''); setNotice(''); try { await fn(); setNotice(ok); await open(id); } catch (e: any) { setError(e.message); } };
  return <div className="panel" style={{ marginTop: 16 }}>
    <h3>Zincir görünümü</h3>
    <p className="note">Zincir görünümünü yalnız Süper Admin ve zincir yetkisi verilmiş merkez/üye kurum yöneticileri açar. Üye okulların öğretmen, öğrenci ve velileri diğer okulları görmez.</p>
    {error && <div className="alert error">{error}</div>}{notice && <div className="alert success">{notice}</div>}
    <select value={id} onChange={(e) => void open(e.target.value)}><option value="">Zincir seçin</option>{networks.map((n) => <option key={n.id} value={n.id}>{n.name} ({n.institution_count} kurum)</option>)}</select>
    {d && <>
      <table style={{ marginTop: 8 }}><thead><tr><th>Kurum</th><th>İl / ilçe</th><th>Bölge</th>{isAdmin && <th></th>}</tr></thead><tbody>
        {d.institutions.map((i: any) => <tr key={i.id}><td>{i.name}</td><td>{i.city || '—'} / {i.district || '—'}</td><td>{i.region_label || '—'}</td>{isAdmin && <td><button className="ghost" onClick={() => void act(() => api(`/api/platform/networks/${id}/members/${i.id}/remove`, { method: 'POST', body: '{}' }), 'Kurum zincirden çıkarıldı.')}>Çıkar</button></td>}</tr>)}
      </tbody></table>
      {isAdmin && <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <select value={member} onChange={(e) => setMember(e.target.value)}><option value="">Kurum ekle…</option>{institutions.filter((i) => !d.institutions.some((x: any) => x.id === i.id)).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
        <button className="ghost" disabled={!member} onClick={() => void act(() => api(`/api/platform/networks/${id}/members`, { method: 'POST', body: JSON.stringify({ institutionId: member }) }), 'Kurum zincire eklendi.')}>Ekle</button>
        <input placeholder="Yönetici kullanıcı kimliği" value={role.userId} onChange={(e) => setRole({ ...role, userId: e.target.value })} />
        <select value={role.role} onChange={(e) => setRole({ ...role, role: e.target.value })}><option value="NETWORK_VIEWER">Zincir izleyici</option><option value="NETWORK_ADMIN">Zincir yöneticisi</option></select>
        <button className="ghost" disabled={!role.userId} onClick={() => void act(() => api(`/api/platform/networks/${id}/roles`, { method: 'POST', body: JSON.stringify(role) }), 'Zincir yetkisi verildi.')}>Yetki ver</button>
        <button className="ghost" disabled={!role.userId} onClick={() => void act(() => api(`/api/platform/networks/${id}/roles`, { method: 'POST', body: JSON.stringify({ ...role, active: false }) }), 'Zincir yetkisi kaldırıldı.')}>Yetkiyi kaldır</button>
      </div>}
      <h4>Zincir sınavları</h4>
      <ul>{d.exams.map((e: any) => <li key={e.id}>{e.title} · {e.participant_count} katılımcı <button className="ghost" onClick={async () => { try { setCmp(await api<any>(`/api/platform/networks/${id}/comparison?examId=${e.id}`)); } catch (err: any) { setError(err.message); } }}>Karşılaştır</button></li>)}</ul>
      {cmp && <table><thead><tr><th>Kurum</th><th>Katılımcı</th><th>Ortalama puan</th><th>Ortalama net</th></tr></thead><tbody>
        {cmp.institutions.map((i: any) => <tr key={i.id}><td>{i.name}</td><td>{i.participants}</td><td>{i.average_score ?? '—'}</td><td>{i.average_net ?? '—'}</td></tr>)}
        <tr><td><strong>Zincir</strong></td><td>{cmp.network.participants}</td><td>{cmp.network.averageScore ?? '—'}</td><td>{cmp.network.averageNet ?? '—'}</td></tr>
      </tbody></table>}
    </>}
  </div>;
}
