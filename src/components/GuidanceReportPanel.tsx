import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { api } from '../api';

/** A053: guidance report — development and support plans of the guidance teacher's students; private records kept apart. */
export function GuidanceReportPanel() {
  const [rows, setRows] = useState<any[]>([]); const [open, setOpen] = useState('');
  const [plan, setPlan] = useState<any>(null); const [records, setRecords] = useState<any[] | null>(null); const [draft, setDraft] = useState('');
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const load = async () => { try { setRows((await api<any>('/api/guidance-report')).students || []); } catch (e: any) { setError(e.message); } };
  useEffect(() => { void load(); }, []);
  const base = (id: string) => `/api/guidance-report/students/${encodeURIComponent(id)}`;
  const select = async (id: string) => { setOpen(id); setRecords(null); setDraft(''); setError(''); setNotice('');
    try { const p = (await api<any>(`${base(id)}/support-plan`)).plan; setPlan(p ? { ...p } : { goals: '', actions: '', reviewDate: '', status: 'ACTIVE', sharedWithStudent: false, sharedWithParent: false }); } catch (e: any) { setError(e.message); } };
  const act = async (fn: () => Promise<any>, ok: string) => { setBusy(true); setError(''); setNotice(''); try { await fn(); setNotice(ok); await load(); } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
  const current = rows.find((r) => r.id === open);
  return <div className="panel" style={{ marginTop: 20 }}>
    <h2>Rehberlik karnesi</h2>
    <p>Rehber öğretmeni olduğunuz sınıfların öğrencileri: incelediğiniz rehberlik sinyalleri, yayımlanmış deneme sonuçları ve destek planı. Özel görüşme kayıtları ayrı tutulur; bu tabloda yalnız sayısı görünür.</p>
    {error && <div className="alert error">{error}</div>}{notice && <div className="alert success">{notice}</div>}
    <table><thead><tr><th>Sınıf</th><th>No</th><th>Öğrenci</th><th>Rehberlik sinyalleri</th><th>Son denemeler (net)</th><th>Destek planı</th><th>Özel kayıt</th><th></th></tr></thead><tbody>
      {rows.map((s) => <tr key={s.id}><td>{s.class_name || '—'}</td><td>{s.student_number}</td><td>{s.first_name} {s.last_name}</td>
        <td>{s.signals.length ? s.signals.slice(0, 4).map((g: any) => `${g.signal_key.replaceAll('_', ' ')} ${Math.round(g.score)}`).join(' · ') : '—'}</td>
        <td>{s.recentExams.length ? s.recentExams.map((e: any) => e.net).join(' · ') : '—'}</td>
        <td>{s.plan ? `${s.plan.status === 'CLOSED' ? 'Kapandı' : 'Etkin'}${s.plan.review_date ? ` · ${s.plan.review_date}` : ''}` : 'Yok'}</td>
        <td>{s.privateRecordCount}</td><td><button className="ghost" onClick={() => void select(s.id)}>Aç</button></td></tr>)}
      {!rows.length && <tr><td colSpan={8}>Rehber öğretmeni olarak atandığınız sınıf yok.</td></tr>}
    </tbody></table>
    {current && plan && <div style={{ marginTop: 16 }}>
      <h3>{current.first_name} {current.last_name} · destek planı</h3>
      <label>Hedefler<textarea value={plan.goals} onChange={(e) => setPlan({ ...plan, goals: e.target.value })} /></label>
      <label>Yapılacaklar<textarea value={plan.actions} onChange={(e) => setPlan({ ...plan, actions: e.target.value })} /></label>
      <label>Gözden geçirme tarihi<input type="date" value={plan.reviewDate || ''} onChange={(e) => setPlan({ ...plan, reviewDate: e.target.value })} /></label>
      <label>Durum<select value={plan.status} onChange={(e) => setPlan({ ...plan, status: e.target.value })}><option value="ACTIVE">Etkin</option><option value="CLOSED">Kapandı</option></select></label>
      <label><input type="checkbox" checked={!!plan.sharedWithStudent} onChange={(e) => setPlan({ ...plan, sharedWithStudent: e.target.checked })} /> Öğrenciyle paylaş</label>
      <label><input type="checkbox" checked={!!plan.sharedWithParent} onChange={(e) => setPlan({ ...plan, sharedWithParent: e.target.checked })} /> Veliyle paylaş</label>
      <button className="primary" disabled={busy} onClick={() => void act(() => api(`${base(open)}/support-plan`, { method: 'PUT', body: JSON.stringify(plan) }), 'Destek planı kaydedildi.')}>Planı kaydet</button>
      <div className="panel" style={{ marginTop: 16 }}>
        <h3><Lock size={16} /> Özel rehberlik kayıtları</h3>
        <p>Yalnız sizin görebildiğiniz görüşme notları. Öğrenci, veli, branş öğretmeni ve okul yönetimi görmez. Kayıtlar silinmez ve değiştirilmez; her okuma kayda geçer.</p>
        {records === null ? <button className="ghost" onClick={() => void api<any>(`${base(open)}/private-records`).then((r) => setRecords(r.records)).catch((e) => setError(e.message))}>Kayıtları göster</button>
          : <ul>{records.map((r) => <li key={r.id}><small>{r.created_at} · {r.author}</small><div style={{ whiteSpace: 'pre-wrap' }}>{r.body}</div></li>)}{!records.length && <li>Kayıt yok.</li>}</ul>}
        <textarea placeholder="Yeni özel kayıt" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="primary" disabled={busy || !draft.trim()} onClick={() => void act(async () => { await api(`${base(open)}/private-records`, { method: 'POST', body: JSON.stringify({ body: draft }) }); setDraft(''); if (records !== null) setRecords((await api<any>(`${base(open)}/private-records`)).records); }, 'Özel kayıt eklendi.')}>Kaydı ekle</button>
      </div>
    </div>}
  </div>;
}

/** The plan shared with the student (A053). Nothing is shown when it was not shared. */
export function SharedSupportPlan({ studentId }: { studentId: string }) {
  const [plan, setPlan] = useState<any>(null);
  useEffect(() => { api<any>(`/api/guidance-report/students/${encodeURIComponent(studentId)}/support-plan`).then((r) => setPlan(r.plan)).catch(() => setPlan(null)); }, [studentId]);
  if (!plan) return null;
  return <div className="panel" style={{ marginBottom: 16 }}><h2>Destek planım</h2><p><strong>Hedefler:</strong> {plan.goals}</p><p><strong>Yapılacaklar:</strong> {plan.actions}</p>{plan.reviewDate && <p>Gözden geçirme: {plan.reviewDate}</p>}</div>;
}
