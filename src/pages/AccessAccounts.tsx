import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Link2, Power, UserPlus, UsersRound } from 'lucide-react';
import { api, qs } from '../api';
import { useAuth } from '../auth';

export function AccessAccounts() {
  const { user } = useAuth();
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [institutionId, setInstitutionId] = useState(user?.institution_id || '');
  const [students, setStudents] = useState<any[]>([]);
  const [parents, setParents] = useState<any[]>([]);
  const [tab, setTab] = useState<'STUDENTS'|'PARENTS'|'BULK'>('STUDENTS');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [studentForm, setStudentForm] = useState({ studentId:'', username:'', email:'', phone:'', password:'Demo123!' });
  const [parentForm, setParentForm] = useState({ displayName:'', username:'', email:'', phone:'', password:'Demo123!', relationship:'Veli' });
  const [parentStudentIds, setParentStudentIds] = useState<string[]>([]);
  const [notifyChannels, setNotifyChannels] = useState<string[]>(['EMAIL', 'SMS']);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [provider, setProvider] = useState<any>({ email: false, sms: false });
  const [bulkStudents, setBulkStudents] = useState('studentId,email,username,phone,password\nSTUDENT_ID,ogrenci@example.com,ogrenci.001,05550000000,Geçici123!');
  const [bulkParents, setBulkParents] = useState('displayName,email,username,phone,password,studentIds\nÖrnek Veli,veli@example.com,veli.001,05550000000,Geçici123!,STUDENT_ID');

  const parseRows = (value: string, parent = false) => {
    const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    const delimiter = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(delimiter).map((header) => header.trim().toLowerCase());
    return lines.slice(1).map((line) => {
      const values = line.split(delimiter).map((item) => item.trim().replace(/^"|"$/g, ''));
      const row: Record<string, string> = {}; headers.forEach((header, index) => { row[header] = values[index] || ''; });
      if (parent) return { displayName: row.displayname || row.adsoyad || row['ad soyad'], email: row.email, username: row.username || row.kullaniciadi, phone: row.phone || row.telefon, password: row.password || row.sifre, relationship: row.relationship || row.yakinlik || 'Veli', studentIds: (row.studentids || row.studentid || '').split('|').map((id) => id.trim()).filter(Boolean) };
      return { studentId: row.studentid || row.student_id, email: row.email, username: row.username || row.kullaniciadi, phone: row.phone || row.telefon, password: row.password || row.sifre };
    });
  };

  useEffect(() => {
    if (user?.role === 'SUPER_ADMIN') {
      void api<any>('/api/institutions').then(r => {
        setInstitutions(r.institutions || []);
        if (!institutionId && r.institutions?.length) setInstitutionId(r.institutions[0].id);
      }).catch(e => setError(e.message));
    }
  }, [user?.role]);

  const load = async () => {
    if (!institutionId) return;
    setError('');
    try {
      const [r, n] = await Promise.all([api<any>(`/api/access-accounts${qs({ institutionId: user?.role === 'SUPER_ADMIN' ? institutionId : null })}`), api<any>(`/api/account-notifications${qs({ institutionId })}`)]);
      setStudents(r.students || []);
      setParents(r.parents || []);
      setDeliveries(n.deliveries || []); setProvider(n.provider || { email: false, sms: false });
    } catch (e:any) { setError(e.message || 'Erişim hesapları yüklenemedi.'); }
  };

  useEffect(() => { void load(); }, [institutionId, user?.role]);

  const accountlessStudents = useMemo(() => students.filter(s => !s.student_user_id), [students]);

  const createStudentAccount = async (e:React.FormEvent) => {
    e.preventDefault();
    if (!studentForm.studentId) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/students/${studentForm.studentId}/access-account`, {
        method:'POST',
        body: JSON.stringify({ institutionId: user?.role === 'SUPER_ADMIN' ? institutionId : undefined, username: studentForm.username || undefined, email: studentForm.email || undefined, phone: studentForm.phone || undefined, password: studentForm.password, notifyChannels }),
      });
      setNotice('Öğrenci giriş hesabı oluşturuldu.');
      setStudentForm({ studentId:'', username:'', email:'', phone:'', password:'Demo123!' });
      await load();
    } catch (e:any) { setError(e.message || 'Öğrenci hesabı oluşturulamadı.'); }
    finally { setBusy(false); }
  };

  const createParentAccount = async (e:React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      await api('/api/parent-access', {
        method:'POST',
        body: JSON.stringify({
          institutionId: user?.role === 'SUPER_ADMIN' ? institutionId : undefined,
          ...parentForm,
          studentIds: parentStudentIds,
          notifyChannels,
        }),
      });
      setNotice('Veli hesabı oluşturuldu ve seçilen öğrencilere bağlandı.');
      setParentForm({ displayName:'', username:'', email:'', phone:'', password:'Demo123!', relationship:'Veli' });
      setParentStudentIds([]);
      await load();
    } catch (e:any) { setError(e.message || 'Veli hesabı oluşturulamadı.'); }
    finally { setBusy(false); }
  };

  const createBulk = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const students = parseRows(bulkStudents); const parents = parseRows(bulkParents, true);
      if (!students.length && !parents.length) throw new Error('Toplu kayıt için en az bir öğrenci veya veli satırı gereklidir.');
      const result: any = {};
      if (students.length) result.students = await api<any>('/api/students/access-accounts/bulk', { method: 'POST', body: JSON.stringify({ institutionId: user?.role === 'SUPER_ADMIN' ? institutionId : undefined, students, notifyChannels }) });
      if (parents.length) result.parents = await api<any>('/api/parent-access/bulk', { method: 'POST', body: JSON.stringify({ institutionId: user?.role === 'SUPER_ADMIN' ? institutionId : undefined, parents, notifyChannels }) });
      setNotice(`${(result.students?.created || 0) + (result.parents?.created || 0)} erişim hesabı oluşturuldu.`); await load();
    } catch (e:any) { setError(e.message || 'Toplu erişim hesabı oluşturulamadı.'); }
    finally { setBusy(false); }
  };

  const toggleChannel = (channel: string) => setNotifyChannels((current) => current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel]);
  const retry = async (batchId: string) => { try { await api(`/api/account-notifications/${batchId}/retry`, { method: 'POST', body: '{}' }); setNotice('Başarısız bildirimler yeniden denendi.'); await load(); } catch (e:any) { setError(e.message || 'Bildirimler yeniden gönderilemedi.'); } };

  const toggleAccessUser = async (id:string, active:boolean) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/access-users/${id}/status`, { method:'PATCH', body: JSON.stringify({ active }) });
      setNotice(active ? 'Hesap yeniden aktif edildi.' : 'Hesap pasife alındı ve açık oturumları kapatıldı.');
      await load();
    } catch (e:any) { setError(e.message || 'Hesap durumu değiştirilemedi.'); }
    finally { setBusy(false); }
  };

  return <>
    <div className="page-head">
      <div><span className="eyebrow">Lisanslı öğrenci erişimi</span><h1>Öğrenci & Veli Erişimi</h1><p>Yalnız aktif/lisanslı öğrencilere hesap açılır. Misafir öğrenciler bu alana dahil edilmez.</p></div>
      {user?.role === 'SUPER_ADMIN' && <label className="compact-field">Kurum<select value={institutionId} onChange={e=>setInstitutionId(e.target.value)}><option value="">Kurum seç</option>{institutions.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label>}
    </div>

    {error && <div className="alert error">{error}</div>}
    {notice && <div className="alert success">{notice}</div>}

    <div className="tabs"><button className={tab==='STUDENTS'?'active':''} onClick={()=>setTab('STUDENTS')}>Öğrenci Hesapları</button><button className={tab==='PARENTS'?'active':''} onClick={()=>setTab('PARENTS')}>Veli Hesapları</button><button className={tab==='BULK'?'active':''} onClick={()=>setTab('BULK')}>Toplu Kayıt</button></div>

    {tab === 'STUDENTS' ? <>
      <div className="panel-grid two">
        <form className="panel-card" onSubmit={createStudentAccount}>
          <div className="card-title"><UserPlus size={19}/><div><strong>Öğrenci Giriş Hesabı Aç</strong><small>Aktif öğrenciler için kullanıcı adı/e-posta ve şifre oluşturun.</small></div></div>
          <label>Öğrenci<select required value={studentForm.studentId} onChange={e=>setStudentForm(v=>({...v,studentId:e.target.value}))}><option value="">Öğrenci seç</option>{accountlessStudents.map(s=><option key={s.id} value={s.id}>{s.grade_level}/{s.section} · {s.student_number || 'No yok'} · {s.first_name} {s.last_name}</option>)}</select></label>
          <label>Kullanıcı adı<input value={studentForm.username} onChange={e=>setStudentForm(v=>({...v,username:e.target.value}))} placeholder="örn. ahmet.123"/></label>
          <label>E-posta (opsiyonel)<input type="email" value={studentForm.email} onChange={e=>setStudentForm(v=>({...v,email:e.target.value}))}/></label>
          <label>Telefon (opsiyonel)<input value={studentForm.phone} onChange={e=>setStudentForm(v=>({...v,phone:e.target.value}))} placeholder="05xx xxx xx xx"/></label>
          <label>Geçici şifre<input value={studentForm.password} onChange={e=>setStudentForm(v=>({...v,password:e.target.value}))} minLength={8} required/></label>
          <DeliveryChoices channels={notifyChannels} provider={provider} onToggle={toggleChannel} />
          <button className="primary" disabled={busy || !studentForm.studentId}>Hesabı Oluştur</button>
        </form>
        <div className="panel-card"><div className="card-title"><CheckCircle2 size={19}/><div><strong>Erişim Kuralı</strong><small>Misafir öğrenci için hesap oluşturulamaz.</small></div></div><p className="muted">Öğrenci aktif hale getirildiğinde geçmiş sınavları aynı öğrenci kimliğinde kalır. Giriş hesabı yalnız bu aktif kimliğe bağlanır.</p></div>
      </div>

      <div className="table-card"><table><thead><tr><th>Öğrenci</th><th>No / Sınıf</th><th>Giriş</th><th>Veli</th><th>Durum</th><th></th></tr></thead><tbody>{students.map(s=><tr key={s.id}><td><strong>{s.first_name} {s.last_name}</strong></td><td>{s.student_number || '—'} · {s.grade_level}/{s.section || '—'}</td><td>{s.student_user_id ? (s.student_username || s.student_email || 'Tanımlı') : 'Hesap yok'}</td><td>{s.parent_count || 0}</td><td>{s.student_user_id ? <span className={`status ${s.student_user_active ? 'ok':'neutral'}`}>{s.student_user_active ? 'Aktif':'Pasif'}</span> : <span className="status neutral">Açılmadı</span>}</td><td>{s.student_user_id && <button className="ghost" disabled={busy} onClick={()=>void toggleAccessUser(s.student_user_id, !s.student_user_active)}><Power size={15}/>{s.student_user_active ? 'Pasife Al':'Aktif Et'}</button>}</td></tr>)}</tbody></table>{!students.length&&<div className="empty">Aktif öğrenci bulunamadı.</div>}</div>
    </> : tab === 'PARENTS' ? <>
      <form className="panel-card" onSubmit={createParentAccount}>
        <div className="card-title"><UsersRound size={19}/><div><strong>Veli Hesabı Oluştur</strong><small>Aynı veli birden fazla aktif öğrenciye bağlanabilir.</small></div></div>
        <div className="form-grid"><label>Ad Soyad<input required value={parentForm.displayName} onChange={e=>setParentForm(v=>({...v,displayName:e.target.value}))}/></label><label>Kullanıcı adı<input value={parentForm.username} onChange={e=>setParentForm(v=>({...v,username:e.target.value}))}/></label><label>E-posta<input type="email" value={parentForm.email} onChange={e=>setParentForm(v=>({...v,email:e.target.value}))}/></label><label>Telefon<input value={parentForm.phone} onChange={e=>setParentForm(v=>({...v,phone:e.target.value}))}/></label><label>Yakınlık<input value={parentForm.relationship} onChange={e=>setParentForm(v=>({...v,relationship:e.target.value}))}/></label><label>Geçici şifre<input minLength={8} required value={parentForm.password} onChange={e=>setParentForm(v=>({...v,password:e.target.value}))}/></label></div>
        <div><strong>Bağlanacak öğrenciler</strong><div className="choice-grid">{students.map(s=><label key={s.id} className="check"><input type="checkbox" checked={parentStudentIds.includes(s.id)} onChange={e=>setParentStudentIds(v=>e.target.checked?[...v,s.id]:v.filter(id=>id!==s.id))}/>{s.grade_level}/{s.section} · {s.first_name} {s.last_name}</label>)}</div></div>
        <DeliveryChoices channels={notifyChannels} provider={provider} onToggle={toggleChannel} />
        <button className="primary" disabled={busy || parentStudentIds.length===0}><Link2 size={16}/> Veli Hesabını Oluştur</button>
      </form>

      <div className="table-card"><table><thead><tr><th>Veli</th><th>Giriş</th><th>Bağlı Öğrenci</th><th>Durum</th><th></th></tr></thead><tbody>{parents.map(p=><tr key={p.id}><td><strong>{p.display_name}</strong><small className="table-sub">{p.phone || ''}</small></td><td>{p.username || p.email || '—'}</td><td>{p.children || '—'} <span className="muted">({p.linked_student_count || 0})</span></td><td><span className={`status ${p.active?'ok':'neutral'}`}>{p.active?'Aktif':'Pasif'}</span></td><td><button className="ghost" disabled={busy} onClick={()=>void toggleAccessUser(p.id,!p.active)}><Power size={15}/>{p.active?'Pasife Al':'Aktif Et'}</button></td></tr>)}</tbody></table>{!parents.length&&<div className="empty">Veli hesabı bulunamadı.</div>}</div>
    </> : <>
      <form className="panel-card" onSubmit={createBulk}>
        <div className="card-title"><UsersRound size={19}/><div><strong>Toplu öğrenci ve veli hesabı</strong><small>CSV satırlarını tek seferde aktarın. Şifre boş bırakılırsa güvenli geçici şifre üretilir.</small></div></div>
        <div className="form-grid">
          <label className="bulk-field">Öğrenci CSV<textarea rows={10} value={bulkStudents} onChange={e=>setBulkStudents(e.target.value)} /></label>
          <label className="bulk-field">Veli CSV<textarea rows={10} value={bulkParents} onChange={e=>setBulkParents(e.target.value)} /></label>
        </div>
        <p className="muted">Öğrenci başlıkları: studentId,email,username,phone,password. Veli başlıkları: displayName,email,username,phone,password,studentIds. Birden fazla öğrenci ID’sini <code>|</code> ile ayırın.</p>
        <DeliveryChoices channels={notifyChannels} provider={provider} onToggle={toggleChannel} />
        <button className="primary" disabled={busy || !institutionId}>Toplu Hesapları Oluştur</button>
      </form>
    </>}
    <NotificationDeliveryTable deliveries={deliveries} onRetry={retry} />
  </>;
}

function DeliveryChoices({ channels, provider, onToggle }: { channels: string[]; provider: any; onToggle: (channel: string) => void }) {
  return <div className="notification-choice"><strong>Giriş bilgilerini gönder</strong><label className="check"><input type="checkbox" checked={channels.includes('EMAIL')} onChange={() => onToggle('EMAIL')} /> E-posta {provider.email ? '· hazır' : '· sağlayıcı bekliyor'}</label><label className="check"><input type="checkbox" checked={channels.includes('SMS')} onChange={() => onToggle('SMS')} /> SMS {provider.sms ? '· hazır' : '· sağlayıcı bekliyor'}</label></div>;
}

function NotificationDeliveryTable({ deliveries, onRetry }: { deliveries: any[]; onRetry: (batchId: string) => void }) {
  return <div className="table-card notification-delivery-card"><div className="section-head"><div><span className="eyebrow">Giriş bildirimi geçmişi</span><h2>SMS ve e-posta gönderimleri</h2></div></div><table><thead><tr><th>Kullanıcı</th><th>Kanal</th><th>Adres</th><th>Durum</th><th>Tarih</th><th></th></tr></thead><tbody>{deliveries.map((row) => <tr key={row.id}><td><strong>{row.display_name}</strong><small>{row.role}</small></td><td>{row.channel}</td><td>{row.destination || '—'}</td><td><span className={`status ${row.status === 'SENT' ? 'ok' : row.status === 'FAILED' ? 'off' : 'neutral'}`}>{row.status === 'SENT' ? 'Gönderildi' : row.status === 'FAILED' ? `Başarısız · ${row.failure_code || ''}` : row.status === 'SKIPPED' ? 'Atlandı' : 'Bekliyor'}</span></td><td>{row.created_at ? new Date(row.created_at).toLocaleString('tr-TR') : '—'}</td><td>{row.status === 'FAILED' && <button className="ghost" onClick={() => onRetry(row.batch_id)}>Yeniden gönder</button>}</td></tr>)}</tbody></table>{!deliveries.length && <div className="empty">Henüz giriş bildirimi gönderilmedi.</div>}</div>;
}

