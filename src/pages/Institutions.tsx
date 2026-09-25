import { useEffect, useMemo, useState } from 'react';
import { Building2, KeyRound, PauseCircle, PlayCircle, Plus, RefreshCw, X } from 'lucide-react';
import { api, post } from '../api';

const FEATURE_OPTIONS = [
  ['EXAM_CENTER', 'Sınav Merkezi'],
  ['GUIDANCE_TESTS', 'Rehberlik Testleri'],
  ['QUESTION_BANK', 'Soru Havuzu'],
  ['GAMES', 'Öğrenci Oyunları'],
  ['MOBILE_API', 'Mobil erişim'],
] as const;

const initialForm = {
  sourceType: 'MANUAL', mebCode: '', code: '', name: '', city: '', district: '', institutionType: 'PRIVATE_SCHOOL', ownership: 'PRIVATE',
  educationLevel: '', officialUrl: '', address: '', contactName: '', contactPhone: '', contactEmail: '', academicYear: '2026-2027',
  studentLimit: '500', userLimit: '0', packageCode: 'STANDARD', features: ['EXAM_CENTER', 'GUIDANCE_TESTS'], startTrial: true,
  managerDisplayName: '', managerEmail: '', managerUsername: '', managerPhone: '', managerPassword: '',
};

type InstitutionForm = typeof initialForm;

export function Institutions() {
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState<InstitutionForm>(initialForm);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<any | null>(null);

  const load = async () => {
    setLoading(true);
    try { const response = await api<any>('/api/institutions'); setRows(response.institutions || []); }
    catch (e: any) { setError(e.message || 'Kurumlar yüklenemedi.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const update = <K extends keyof InstitutionForm>(key: K, value: InstitutionForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const toggleFeature = (feature: string) => update('features', form.features.includes(feature) ? form.features.filter((item) => item !== feature) : [...form.features, feature]);
  const canSubmit = useMemo(() => Boolean(
    form.name.trim() && form.city.trim() && form.district.trim() && form.managerDisplayName.trim() && form.managerPassword.length >= 8 &&
    (form.managerEmail.trim() || form.managerUsername.trim()) && (form.sourceType === 'MANUAL' || form.mebCode.trim()),
  ), [form]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy('create'); setError(''); setSuccess(null);
    try {
      const response = await post<any>('/api/institutions', {
        sourceType: form.sourceType, mebCode: form.mebCode, code: form.code, name: form.name, city: form.city, district: form.district,
        institutionType: form.institutionType, ownership: form.ownership, educationLevel: form.educationLevel, officialUrl: form.officialUrl,
        address: form.address, contactName: form.contactName, contactPhone: form.contactPhone, contactEmail: form.contactEmail,
        academicYear: form.academicYear, studentLimit: Number(form.studentLimit), userLimit: Number(form.userLimit), packageCode: form.packageCode,
        features: form.features, startTrial: form.startTrial,
        manager: { displayName: form.managerDisplayName, email: form.managerEmail, username: form.managerUsername, phone: form.managerPhone, password: form.managerPassword },
      });
      setSuccess(response);
      setForm(initialForm);
      setShowForm(false);
      await load();
    } catch (e: any) { setError(e.message || 'Kurum açılamadı.'); }
    finally { setBusy(''); }
  };

  const toggle = async (row: any) => {
    setBusy(row.id); setError('');
    try { await post(`/api/institutions/${row.id}/status`, { status: row.status === 'ACTIVE' ? 'PASSIVE' : 'ACTIVE' }); await load(); }
    catch (e: any) { setError(e.message || 'Kurum durumu değiştirilemedi.'); }
    finally { setBusy(''); }
  };

  return <>
    <div className="page-head">
      <div><span className="eyebrow">Süper Admin · Kurum yaşam döngüsü</span><h1>Kurumlar</h1><p>Kurum açın, ilk kurum yöneticisini tanımlayın ve lisans başlangıcını denetleyin.</p></div>
      <div className="page-actions"><button className="ghost" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Yenile</button><button className="primary" onClick={() => { setShowForm(true); setError(''); setSuccess(null); }}><Plus size={17} /> Kurum Ekle</button></div>
    </div>

    {error && <div className="alert error">{error}</div>}
    {success && <div className="alert success"><strong>Kurum açıldı.</strong> {success.institution?.name} · <b>{success.institution?.code}</b> · İlk yönetici: {success.manager?.email || success.manager?.username}. {success.license?.daysRemaining ? `Deneme lisansı ${success.license.daysRemaining} gün aktif.` : ''}</div>}

    {showForm && <div className="panel institution-create-card">
      <div className="section-head"><div><span className="eyebrow">Yeni kurum</span><h2>Kurum açma kaydı</h2><p>Bu işlem kurum, aktif eğitim sezonu, lisans limiti ve ilk kurum yöneticisini birlikte oluşturur.</p></div><button className="icon-button" onClick={() => setShowForm(false)} aria-label="Kapat"><X size={18} /></button></div>
      <form onSubmit={create}>
        <div className="form-grid">
          <label>Kurum kaynağı<select value={form.sourceType} onChange={(e) => update('sourceType', e.target.value)}><option value="MANUAL">Manuel kurum</option><option value="MEB">MEB kurum dizini</option></select></label>
          <label>Kurum türü<select value={form.institutionType} onChange={(e) => update('institutionType', e.target.value)}><option value="MEB_SCHOOL">MEB okulu</option><option value="PRIVATE_SCHOOL">Özel okul</option><option value="COURSE">Kurs</option><option value="COLLEGE">Kolej</option><option value="DERSHANE">Dershane</option><option value="DEALER">Bayi</option><option value="OTHER">Diğer</option></select></label>
          <label>Kurum adı *<input value={form.name} onChange={(e) => update('name', e.target.value)} required /></label>
          <label>{form.sourceType === 'MEB' ? 'MEB kurum kodu *' : 'MEB kurum kodu'}<input inputMode="numeric" value={form.mebCode} onChange={(e) => update('mebCode', e.target.value.replace(/\D/g, ''))} placeholder="5–12 hane" required={form.sourceType === 'MEB'} /></label>
          {form.sourceType === 'MANUAL' && <label>Manuel kurum kodu <input value={form.code} onChange={(e) => update('code', e.target.value.toUpperCase())} placeholder="Boş bırakılırsa ANX-..." /></label>}
          <label>Mülkiyet<select value={form.ownership} onChange={(e) => update('ownership', e.target.value)}><option value="PUBLIC">Resmî</option><option value="PRIVATE">Özel</option></select></label>
          <label>İl *<input value={form.city} onChange={(e) => update('city', e.target.value)} required /></label>
          <label>İlçe *<input value={form.district} onChange={(e) => update('district', e.target.value)} required /></label>
          <label>Eğitim seviyesi<input value={form.educationLevel} onChange={(e) => update('educationLevel', e.target.value)} placeholder="İlkokul, ortaokul, lise..." /></label>
          <label>Akademik yıl *<input value={form.academicYear} onChange={(e) => update('academicYear', e.target.value)} placeholder="2026-2027" required /></label>
          <label>Resmî web adresi<input type="url" value={form.officialUrl} onChange={(e) => update('officialUrl', e.target.value)} placeholder="https://..." /></label>
          <label className="span-2">Adres<input value={form.address} onChange={(e) => update('address', e.target.value)} /></label>
        </div>

        <div className="split-section"><div><span className="eyebrow">Lisans ve modüller</span><h3>Kurumun çalışma kapsamı</h3></div></div>
        <div className="form-grid">
          <label>Paket<select value={form.packageCode} onChange={(e) => update('packageCode', e.target.value)}><option value="STANDARD">Standard</option><option value="PREMIUM">Premium</option><option value="CUSTOM">Özel paket</option></select></label>
          <label>Öğrenci lisans limiti *<input type="number" min="1" value={form.studentLimit} onChange={(e) => update('studentLimit', e.target.value)} required /></label>
          <label>Kullanıcı limiti<input type="number" min="0" value={form.userLimit} onChange={(e) => update('userLimit', e.target.value)} /><small className="field-help">0: ayrıca sınır uygulanmaz.</small></label>
          <label className="check"><input type="checkbox" checked={form.startTrial} onChange={(e) => update('startTrial', e.target.checked)} /> 7 günlük denemeyi başlat</label>
        </div>
        <div className="feature-checks">{FEATURE_OPTIONS.map(([key, label]) => <label className="check" key={key}><input type="checkbox" checked={form.features.includes(key)} onChange={() => toggleFeature(key)} /> {label}</label>)}</div>

        <div className="split-section"><div><span className="eyebrow">İlk erişim hesabı</span><h3>Kurum yöneticisi</h3><p>Şifre yalnız bu işlem sırasında kullanılır; sistemde geri okunmaz.</p></div><KeyRound size={20} /></div>
        <div className="form-grid">
          <label>Ad soyad *<input value={form.managerDisplayName} onChange={(e) => update('managerDisplayName', e.target.value)} required /></label>
          <label>E-posta<input type="email" value={form.managerEmail} onChange={(e) => update('managerEmail', e.target.value)} /></label>
          <label>Kullanıcı adı<input value={form.managerUsername} onChange={(e) => update('managerUsername', e.target.value)} /></label>
          <label>Telefon<input value={form.managerPhone} onChange={(e) => update('managerPhone', e.target.value)} /></label>
          <label>Geçici şifre *<input type="password" minLength={8} value={form.managerPassword} onChange={(e) => update('managerPassword', e.target.value)} required /><small className="field-help">En az 8 karakter. E-posta veya kullanıcı adı zorunludur.</small></label>
          <label>İletişim sorumlusu<input value={form.contactName} onChange={(e) => update('contactName', e.target.value)} placeholder="Boşsa yönetici adı kullanılır" /></label>
          <label>İletişim telefonu<input value={form.contactPhone} onChange={(e) => update('contactPhone', e.target.value)} /></label>
          <label>İletişim e-postası<input type="email" value={form.contactEmail} onChange={(e) => update('contactEmail', e.target.value)} /></label>
        </div>
        <div className="form-actions"><button type="button" className="ghost" onClick={() => setShowForm(false)}>Vazgeç</button><button className="primary" disabled={!canSubmit || busy === 'create'}><Building2 size={16} /> {busy === 'create' ? 'Kurum açılıyor…' : 'Kurumu aç'}</button></div>
      </form>
    </div>}

    <div className="table-card"><div className="section-head"><div><span className="eyebrow">Kurum kayıtları</span><h2>Aktif kurumlar ve yaşam durumu</h2></div></div><table><thead><tr><th>Kurum</th><th>Kod / kaynak</th><th>Sezon</th><th>Öğrenci</th><th>Yönetici</th><th>Lisans</th><th>Durum</th><th></th></tr></thead><tbody>
      {rows.map((row) => <tr key={row.id}><td><strong>{row.name}</strong><small>{row.city || '—'} / {row.district || '—'}</small></td><td><strong>{row.code}</strong><small>{row.source_type === 'MEB' ? `MEB · ${row.meb_code || row.code}` : 'Manuel kurum'}</small></td><td>{row.academic_year || '—'}</td><td>{row.active_students || 0} <small>aktif · {row.guest_students || 0} misafir</small></td><td>{row.manager_count || 0}</td><td><span className="status ok">{row.license_plan === 'TRIAL_7_DAY' ? '7 gün demo' : row.license_plan || 'Legacy'}</span></td><td><span className={`status ${row.status === 'ACTIVE' ? 'ok' : 'off'}`}>{row.status === 'ACTIVE' ? 'Aktif' : 'Pasif'}</span></td><td><button className={row.status === 'ACTIVE' ? 'danger subtle' : 'primary subtle'} disabled={busy === row.id} onClick={() => void toggle(row)}>{row.status === 'ACTIVE' ? <><PauseCircle size={16} /> Pasife Al</> : <><PlayCircle size={16} /> Aktif Et</>}</button></td></tr>)}
    </tbody></table>{!rows.length && <div className="empty">{loading ? 'Kurumlar yükleniyor…' : 'Henüz kurum kaydı yok.'}</div>}</div>
  </>;
}

