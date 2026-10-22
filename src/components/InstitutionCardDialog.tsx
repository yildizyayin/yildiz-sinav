import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../api';

/** A043: institution card — view and correct (Super Admin). The institution code never changes. */
const ROLE: Record<string, string> = { INSTITUTION_MANAGER: 'Yönetici', TEACHER: 'Öğretmen', GUIDANCE_TEACHER: 'Rehber', STUDENT: 'Öğrenci', PARENT: 'Veli' };
export function InstitutionCardDialog({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: () => void }) {
  const [c, setC] = useState<any>(null); const [f, setF] = useState<any>({}); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const load = async () => { try { const r = await api<any>(`/api/institutions/${id}`); setC(r.institution); setF({ name: r.institution.name, city: r.institution.city || '', district: r.institution.district || '', sourceType: r.institution.source_type, mebCode: r.institution.meb_code || '', ownership: r.institution.ownership || '', institutionType: r.institution.institution_type || 'OTHER', educationLevel: r.institution.education_level || '', officialUrl: r.institution.official_url || '', address: r.institution.address || '', contactName: r.institution.contact_name || '', contactPhone: r.institution.contact_phone || '', contactEmail: r.institution.contact_email || '' }); } catch (e: any) { setError(e.message); } };
  useEffect(() => { void load(); }, [id]);
  const save = async () => { setBusy(true); setError(''); try { await api(`/api/institutions/${id}`, { method: 'PATCH', body: JSON.stringify(f) }); await load(); onSaved(); } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
  const field = (k: string, label: string, extra: any = {}) => <label>{label}<input value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...extra} /></label>;
  return <div className="exam-review-overlay"><section className="exam-review-dialog" role="dialog" aria-modal="true" aria-label="Kurum kartı">
    <div className="section-head"><h2>Kurum kartı</h2><button className="icon-button" onClick={onClose} aria-label="Kapat"><X size={18} /></button></div>
    {error && <div className="alert error">{error}</div>}
    {c && <>
      <p><strong>Kurum kodu: {c.code}</strong> (değiştirilemez) · Durum: {c.lifecycle_status} · Öğrenci: {c.students?.active ?? 0} aktif, {c.students?.guest ?? 0} misafir · Sezonlar: {c.seasons.map((s: any) => s.academic_year).join(', ') || '—'}</p>
      <p>Hesaplar: {c.users.map((u: any) => `${ROLE[u.role] || u.role} ${u.n}`).join(' · ') || '—'}</p>
      <div className="form-grid">
        {field('name', 'Kurum adı *')}{field('city', 'İl *')}{field('district', 'İlçe *')}
        <label>Kaynak<select value={f.sourceType} onChange={(e) => setF({ ...f, sourceType: e.target.value })}><option value="MANUAL">Manuel</option><option value="MEB">MEB</option></select></label>
        <label>MEB kurum kodu{f.sourceType === 'MEB' ? ' *' : ''}<input inputMode="numeric" value={f.mebCode} onChange={(e) => setF({ ...f, mebCode: e.target.value.replace(/\D/g, '') })} /></label>
        <label>Mülkiyet<select value={f.ownership} onChange={(e) => setF({ ...f, ownership: e.target.value })}><option value="">—</option><option value="PUBLIC">Resmî</option><option value="PRIVATE">Özel</option></select></label>
        {field('educationLevel', 'Eğitim seviyesi')}{field('officialUrl', 'Resmî web adresi')}{field('address', 'Adres')}{field('contactName', 'İletişim sorumlusu')}{field('contactPhone', 'İletişim telefonu')}{field('contactEmail', 'İletişim e-postası')}
      </div>
      <p className="note">Düzeltme öğrencilere, kayıtlara ve sonuçlara dokunmaz. Pasifleştirme için listedeki "Askıya al" işlemini kullanın; veriler korunur.</p>
      <div className="form-actions"><button className="ghost" onClick={onClose}>Kapat</button><button className="primary" disabled={busy} onClick={() => void save()}>Kaydet</button></div>
      {c.events?.length > 0 && <details><summary>Yaşam döngüsü geçmişi</summary><ul>{c.events.map((e: any, k: number) => <li key={k}>{e.created_at}: {e.action} {e.previous_status || ''} → {e.next_status || ''}</li>)}</ul></details>}
    </>}
  </section></div>;
}
