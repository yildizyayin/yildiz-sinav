import { useEffect, useMemo, useState } from 'react';
import { api, post, qs } from '../api';
import { useAuth, type Role } from '../auth';

const roleLabels: Record<string, string> = {
  INSTITUTION_MANAGER: 'Kurum Yöneticisi',
  TEACHER: 'Branş Öğretmeni',
  GUIDANCE_TEACHER: 'Rehber Öğretmeni',
};

function parseBulkUsers(value: string): any[] {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const delimiter = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(delimiter).map((header) => header.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = line.split(delimiter).map((item) => item.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((header, index) => { row[header] = values[index] || ''; });
    return { role: row.role || row.rol, displayName: row.displayname || row.adsoyad || row['ad soyad'], email: row.email, username: row.username || row.kullaniciadi || row['kullanıcı adı'], phone: row.phone || row.telefon, password: row.password || row.sifre || row['geçici şifre'] };
  });
}

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
  const [mode, setMode] = useState<'MANUAL' | 'BULK'>('MANUAL');
  const [bulkText, setBulkText] = useState('role,displayName,email,username,phone,password\nTEACHER,Örnek Öğretmen,ogretmen@example.com,ornek.ogretmen,05550000000,Geçici123!');
  const [notifyChannels, setNotifyChannels] = useState<string[]>(['EMAIL', 'SMS']);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [provider, setProvider] = useState<any>({ email: false, sms: false });
  const [bulkResult, setBulkResult] = useState<any | null>(null);

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
      const [r, n] = await Promise.all([api<any>(`/api/users${qs({ institutionId })}`), api<any>(`/api/account-notifications${qs({ institutionId })}`)]);
      setRows(r.users || []);
      setRoles(r.manageableRoles || []);
      setDeliveries(n.deliveries || []); setProvider(n.provider || { email: false, sms: false });
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
      await post('/api/users', { institutionId, ...form, notifyChannels });
      setSuccess('Kullanıcı oluşturuldu.');
      setForm((f) => ({ ...f, displayName: '', email: '', username: '', phone: '', password: '' }));
      await reload();
    } catch (e: any) { setError(e.message || 'Kullanıcı oluşturulamadı.'); }
  };

  const createBulk = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setSuccess(''); setBulkResult(null);
    const users = parseBulkUsers(bulkText);
    if (!users.length) { setError('CSV içinde başlık ve en az bir kullanıcı satırı bulunmalıdır.'); return; }
    setLoading(true);
    try { const result = await post<any>('/api/users/bulk', { institutionId, users, notifyChannels }); setBulkResult(result); setSuccess(`${result.created || 0} kullanıcı oluşturuldu.`); await reload(); }
    catch (e: any) { setError(e.message || 'Toplu kullanıcı kaydı oluşturulamadı.'); }
    finally { setLoading(false); }
  };

  const retry = async (batchId: string) => {
    setError('');
    try { await post(`/api/account-notifications/${batchId}/retry`, {}); setSuccess('Başarısız bildirimler yeniden denendi.'); await reload(); }
    catch (e: any) { setError(e.message || 'Bildirimler yeniden gönderilemedi.'); }
  };

  const toggleChannel = (channel: string) => setNotifyChannels((current) => current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel]);

  const changeStatus = async (id: string, active: boolean) => {
    setError(''); setSuccess('');
    try {
      await api(`/api/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ active }) });
      setSuccess(active ? 'Kullanıcı yeniden aktif edildi.' : 'Kullanıcı pasife alındı.');
      await reload();
    } catch (e: any) { setError(e.message || 'Durum değiştirilemedi.'); }
  };

  return <>
    <div className="page-head"><div><span className="eyebrow">Yetki ve erişim</span><h1>Kullanıcılar</h1><p>Kurum yöneticisi, branş öğretmeni ve rehber öğretmeni hesaplarını manuel veya toplu oluşturun.</p></div></div>
    {user?.role === 'SUPER_ADMIN' && <div className="card"><label>Kurum<select value={institutionId} onChange={(e) => setInstitutionId(e.target.value)}><option value="">Kurum seçin</option>{institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label></div>}
    {error && <div className="alert error">{error}</div>}{success && <div className="alert success">{success}</div>}
    <div className="tabs"><button className={mode === 'MANUAL' ? 'active' : ''} onClick={() => setMode('MANUAL')}>Tek tek kayıt</button><button className={mode === 'BULK' ? 'active' : ''} onClick={() => setMode('BULK')}>Toplu CSV</button></div>
    <div className="grid-2">
      {mode === 'MANUAL' ? <form className="card" onSubmit={create}>
        <div className="section-head"><div><span className="eyebrow">Yeni kullanıcı</span><h2>Personel hesabı oluştur</h2></div></div>
        <label>Rol<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>{roles.map((r) => <option key={r} value={r}>{roleLabels[r] || r}</option>)}</select></label>
        <label>Ad Soyad<input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required /></label>
        <label>E-posta<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Kullanıcı adı<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
        <label>Telefon<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label>Geçici şifre<input type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
        <p className="muted">En az e-posta veya kullanıcı adı girilmelidir. Şifre en az 8 karakter olmalıdır.</p>
        <DeliveryChoices channels={notifyChannels} provider={provider} onToggle={toggleChannel} />
        <button className="primary" disabled={!canCreate}>Kullanıcı Oluştur</button>
      </form> : <form className="card" onSubmit={createBulk}>
        <div className="section-head"><div><span className="eyebrow">Toplu hesap açma</span><h2>CSV satırlarını aktar</h2></div></div>
        <p className="muted">Başlıklar: role, displayName, email, username, phone, password. Şifre boşsa sistem geçici şifre üretir.</p>
        <textarea rows={12} value={bulkText} onChange={(e) => setBulkText(e.target.value)} />
        <DeliveryChoices channels={notifyChannels} provider={provider} onToggle={toggleChannel} />
        <button className="primary" disabled={loading || !institutionId}>Toplu Kullanıcı Oluştur</button>
        {bulkResult?.errors?.length > 0 && <div className="alert error">{bulkResult.errors.length} satır oluşturulamadı. İlk hata: {bulkResult.errors[0].message}</div>}
      </form>}
      <div className="table-card">
        <div className="section-head"><div><span className="eyebrow">Kurum kullanıcıları</span><h2>Mevcut hesaplar</h2></div></div>
        <table><thead><tr><th>Kullanıcı</th><th>Rol</th><th>Giriş</th><th>Durum</th><th></th></tr></thead><tbody>
          {rows.map((r) => <tr key={r.id}><td><strong>{r.display_name}</strong></td><td>{roleLabels[r.role] || r.role}</td><td>{r.email || r.username || '—'}</td><td>{r.active ? 'Aktif' : 'Pasif'}</td><td>{r.id !== user?.id && <button className="ghost" onClick={() => void changeStatus(r.id, !r.active)}>{r.active ? 'Pasife Al' : 'Aktif Et'}</button>}</td></tr>)}
        </tbody></table>{!rows.length && <div className="empty">{loading ? 'Yükleniyor…' : 'Bu kurumda yönetilebilir kullanıcı bulunmuyor.'}</div>}
      </div>
    </div>
    <NotificationDeliveryTable deliveries={deliveries} onRetry={retry} />
  </>;
}

function DeliveryChoices({ channels, provider, onToggle }: { channels: string[]; provider: any; onToggle: (channel: string) => void }) {
  return <div className="notification-choice"><strong>Giriş bilgilerini gönder</strong><label className="check"><input type="checkbox" checked={channels.includes('EMAIL')} onChange={() => onToggle('EMAIL')} /> E-posta {provider.email ? '· hazır' : '· sağlayıcı bekliyor'}</label><label className="check"><input type="checkbox" checked={channels.includes('SMS')} onChange={() => onToggle('SMS')} /> SMS {provider.sms ? '· hazır' : '· sağlayıcı bekliyor'}</label></div>;
}

function NotificationDeliveryTable({ deliveries, onRetry }: { deliveries: any[]; onRetry: (batchId: string) => void }) {
  return <div className="table-card notification-delivery-card"><div className="section-head"><div><span className="eyebrow">Giriş bildirimi geçmişi</span><h2>SMS ve e-posta gönderimleri</h2></div></div><table><thead><tr><th>Kullanıcı</th><th>Kanal</th><th>Adres</th><th>Durum</th><th>Tarih</th><th></th></tr></thead><tbody>{deliveries.map((row) => <tr key={row.id}><td><strong>{row.display_name}</strong><small>{row.role}</small></td><td>{row.channel}</td><td>{row.destination || '—'}</td><td><span className={`status ${row.status === 'SENT' ? 'ok' : row.status === 'FAILED' ? 'off' : 'neutral'}`}>{row.status === 'SENT' ? 'Gönderildi' : row.status === 'FAILED' ? `Başarısız · ${row.failure_code || ''}` : row.status === 'SKIPPED' ? 'Atlandı' : 'Bekliyor'}</span></td><td>{row.created_at ? new Date(row.created_at).toLocaleString('tr-TR') : '—'}</td><td>{row.status === 'FAILED' && <button className="ghost" onClick={() => onRetry(row.batch_id)}>Yeniden gönder</button>}</td></tr>)}</tbody></table>{!deliveries.length && <div className="empty">Henüz giriş bildirimi gönderilmedi.</div>}</div>;
}

