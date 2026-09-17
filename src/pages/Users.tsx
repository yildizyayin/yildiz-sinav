import { useEffect, useMemo, useState } from 'react';
import { api, post, qs } from '../api';
import { useAuth, type Role } from '../auth';

const roleLabels: Record<string, string> = {
  INSTITUTION_MANAGER: 'Kurum Yöneticisi',
  TEACHER: 'Branş Öğretmeni',
  GUIDANCE_TEACHER: 'Rehber Öğretmeni',
};

export function UsersPage() {
  const { user } = useAuth();
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [institutionId, setInstitutionId] = useState(user?.institution_id || '');
  const [rows, setRows] = useState<any[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ displayName: '', email: '', username: '', phone: '', password: '', role: 'TEACHER' as Role });

  useEffect(() => {
    if (user?.role !== 'SUPER_ADMIN') return;
    void api<any>('/api/institutions').then((r) => {
      const list = r.institutions || [];
      setInstitutions(list);
      if (!institutionId && list[0]?.id) setInstitutionId(list[0].id);
    }).catch((e) => setError(e.message));
  }, [user?.role]);

  const reload = async () => {
    if (!institutionId) return;
    setLoading(true); setError('');
    try {
      const r = await api<any>(`/api/users${qs({ institutionId })}`);
      setRows(r.users || []);
      setRoles(r.manageableRoles || []);
      if (r.manageableRoles?.length && !r.manageableRoles.includes(form.role)) setForm((f) => ({ ...f, role: r.manageableRoles[0] }));
    } catch (e: any) { setError(e.message || 'Kullanıcılar yüklenemedi.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void reload(); }, [institutionId]);

  const canCreate = useMemo(() => institutionId && form.displayName.trim() && form.password.length >= 8 && (form.email.trim() || form.username.trim()), [institutionId, form]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); if (!canCreate) return;
    setError(''); setSuccess('');
    try {
      await post('/api/users', { institutionId, ...form });
      setSuccess('Kullanıcı oluşturuldu.');
      setForm((f) => ({ ...f, displayName: '', email: '', username: '', phone: '', password: '' }));
      await reload();
    } catch (e: any) { setError(e.message || 'Kullanıcı oluşturulamadı.'); }
  };

  const changeStatus = async (id: string, active: boolean) => {
    setError(''); setSuccess('');
    try {
      await api(`/api/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ active }) });
      setSuccess(active ? 'Kullanıcı yeniden aktif edildi.' : 'Kullanıcı pasife alındı.');
      await reload();
    } catch (e: any) { setError(e.message || 'Durum değiştirilemedi.'); }
  };

  return <>
    <div className="page-head"><div><span className="eyebrow">Yetki ve erişim</span><h1>Kullanıcılar</h1><p>Kurum yöneticisi, branş öğretmeni ve rehber öğretmeni hesaplarını buradan yönetin.</p></div></div>
    {user?.role === 'SUPER_ADMIN' && <div className="card"><label>Kurum<select value={institutionId} onChange={(e) => setInstitutionId(e.target.value)}><option value="">Kurum seçin</option>{institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label></div>}
    {error && <div className="alert error">{error}</div>}{success && <div className="alert success">{success}</div>}
    <div className="grid-2">
      <form className="card" onSubmit={create}>
        <div className="section-head"><div><span className="eyebrow">Yeni kullanıcı</span><h2>Personel hesabı oluştur</h2></div></div>
        <label>Rol<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>{roles.map((r) => <option key={r} value={r}>{roleLabels[r] || r}</option>)}</select></label>
        <label>Ad Soyad<input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required /></label>
        <label>E-posta<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Kullanıcı adı<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
        <label>Telefon<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label>Geçici şifre<input type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
        <p className="muted">En az e-posta veya kullanıcı adı girilmelidir. Şifre en az 8 karakter olmalıdır.</p>
        <button className="primary" disabled={!canCreate}>Kullanıcı Oluştur</button>
      </form>
      <div className="table-card">
        <div className="section-head"><div><span className="eyebrow">Kurum kullanıcıları</span><h2>Mevcut hesaplar</h2></div></div>
        <table><thead><tr><th>Kullanıcı</th><th>Rol</th><th>Giriş</th><th>Durum</th><th></th></tr></thead><tbody>
          {rows.map((r) => <tr key={r.id}><td><strong>{r.display_name}</strong></td><td>{roleLabels[r.role] || r.role}</td><td>{r.email || r.username || '—'}</td><td>{r.active ? 'Aktif' : 'Pasif'}</td><td>{r.id !== user?.id && <button className="ghost" onClick={() => void changeStatus(r.id, !r.active)}>{r.active ? 'Pasife Al' : 'Aktif Et'}</button>}</td></tr>)}
        </tbody></table>{!rows.length && <div className="empty">{loading ? 'Yükleniyor…' : 'Bu kurumda yönetilebilir kullanıcı bulunmuyor.'}</div>}
      </div>
    </div>
  </>;
}
