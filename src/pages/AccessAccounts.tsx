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
  const [tab, setTab] = useState<'STUDENTS'|'PARENTS'>('STUDENTS');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [studentForm, setStudentForm] = useState({ studentId:'', username:'', email:'', password:'Demo123!' });
  const [parentForm, setParentForm] = useState({ displayName:'', username:'', email:'', phone:'', password:'Demo123!', relationship:'Veli' });
  const [parentStudentIds, setParentStudentIds] = useState<string[]>([]);

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
      const r = await api<any>(`/api/access-accounts${qs({ institutionId: user?.role === 'SUPER_ADMIN' ? institutionId : null })}`);
      setStudents(r.students || []);
      setParents(r.parents || []);
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
        body: JSON.stringify({ institutionId: user?.role === 'SUPER_ADMIN' ? institutionId : undefined, username: studentForm.username || undefined, email: studentForm.email || undefined, password: studentForm.password }),
      });
      setNotice('Öğrenci giriş hesabı oluşturuldu.');
      setStudentForm({ studentId:'', username:'', email:'', password:'Demo123!' });
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
        }),
      });
      setNotice('Veli hesabı oluşturuldu ve seçilen öğrencilere bağlandı.');
      setParentForm({ displayName:'', username:'', email:'', phone:'', password:'Demo123!', relationship:'Veli' });
      setParentStudentIds([]);
      await load();
    } catch (e:any) { setError(e.message || 'Veli hesabı oluşturulamadı.'); }
    finally { setBusy(false); }
  };

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

    <div className="tabs"><button className={tab==='STUDENTS'?'active':''} onClick={()=>setTab('STUDENTS')}>Öğrenci Hesapları</button><button className={tab==='PARENTS'?'active':''} onClick={()=>setTab('PARENTS')}>Veli Hesapları</button></div>

    {tab === 'STUDENTS' ? <>
      <div className="panel-grid two">
        <form className="panel-card" onSubmit={createStudentAccount}>
          <div className="card-title"><UserPlus size={19}/><div><strong>Öğrenci Giriş Hesabı Aç</strong><small>Aktif öğrenciler için kullanıcı adı/e-posta ve şifre oluşturun.</small></div></div>
          <label>Öğrenci<select required value={studentForm.studentId} onChange={e=>setStudentForm(v=>({...v,studentId:e.target.value}))}><option value="">Öğrenci seç</option>{accountlessStudents.map(s=><option key={s.id} value={s.id}>{s.grade_level}/{s.section} · {s.student_number || 'No yok'} · {s.first_name} {s.last_name}</option>)}</select></label>
          <label>Kullanıcı adı<input value={studentForm.username} onChange={e=>setStudentForm(v=>({...v,username:e.target.value}))} placeholder="örn. ahmet.123"/></label>
          <label>E-posta (opsiyonel)<input type="email" value={studentForm.email} onChange={e=>setStudentForm(v=>({...v,email:e.target.value}))}/></label>
          <label>Geçici şifre<input value={studentForm.password} onChange={e=>setStudentForm(v=>({...v,password:e.target.value}))} minLength={8} required/></label>
          <button className="primary" disabled={busy || !studentForm.studentId}>Hesabı Oluştur</button>
        </form>
        <div className="panel-card"><div className="card-title"><CheckCircle2 size={19}/><div><strong>Erişim Kuralı</strong><small>Misafir öğrenci için hesap oluşturulamaz.</small></div></div><p className="muted">Öğrenci aktif hale getirildiğinde geçmiş sınavları aynı öğrenci kimliğinde kalır. Giriş hesabı yalnız bu aktif kimliğe bağlanır.</p></div>
      </div>

      <div className="table-card"><table><thead><tr><th>Öğrenci</th><th>No / Sınıf</th><th>Giriş</th><th>Veli</th><th>Durum</th><th></th></tr></thead><tbody>{students.map(s=><tr key={s.id}><td><strong>{s.first_name} {s.last_name}</strong></td><td>{s.student_number || '—'} · {s.grade_level}/{s.section || '—'}</td><td>{s.student_user_id ? (s.student_username || s.student_email || 'Tanımlı') : 'Hesap yok'}</td><td>{s.parent_count || 0}</td><td>{s.student_user_id ? <span className={`status ${s.student_user_active ? 'ok':'neutral'}`}>{s.student_user_active ? 'Aktif':'Pasif'}</span> : <span className="status neutral">Açılmadı</span>}</td><td>{s.student_user_id && <button className="ghost" disabled={busy} onClick={()=>void toggleAccessUser(s.student_user_id, !s.student_user_active)}><Power size={15}/>{s.student_user_active ? 'Pasife Al':'Aktif Et'}</button>}</td></tr>)}</tbody></table>{!students.length&&<div className="empty">Aktif öğrenci bulunamadı.</div>}</div>
    </> : <>
      <form className="panel-card" onSubmit={createParentAccount}>
        <div className="card-title"><UsersRound size={19}/><div><strong>Veli Hesabı Oluştur</strong><small>Aynı veli birden fazla aktif öğrenciye bağlanabilir.</small></div></div>
        <div className="form-grid"><label>Ad Soyad<input required value={parentForm.displayName} onChange={e=>setParentForm(v=>({...v,displayName:e.target.value}))}/></label><label>Kullanıcı adı<input value={parentForm.username} onChange={e=>setParentForm(v=>({...v,username:e.target.value}))}/></label><label>E-posta<input type="email" value={parentForm.email} onChange={e=>setParentForm(v=>({...v,email:e.target.value}))}/></label><label>Telefon<input value={parentForm.phone} onChange={e=>setParentForm(v=>({...v,phone:e.target.value}))}/></label><label>Yakınlık<input value={parentForm.relationship} onChange={e=>setParentForm(v=>({...v,relationship:e.target.value}))}/></label><label>Geçici şifre<input minLength={8} required value={parentForm.password} onChange={e=>setParentForm(v=>({...v,password:e.target.value}))}/></label></div>
        <div><strong>Bağlanacak öğrenciler</strong><div className="choice-grid">{students.map(s=><label key={s.id} className="check"><input type="checkbox" checked={parentStudentIds.includes(s.id)} onChange={e=>setParentStudentIds(v=>e.target.checked?[...v,s.id]:v.filter(id=>id!==s.id))}/>{s.grade_level}/{s.section} · {s.first_name} {s.last_name}</label>)}</div></div>
        <button className="primary" disabled={busy || parentStudentIds.length===0}><Link2 size={16}/> Veli Hesabını Oluştur</button>
      </form>

      <div className="table-card"><table><thead><tr><th>Veli</th><th>Giriş</th><th>Bağlı Öğrenci</th><th>Durum</th><th></th></tr></thead><tbody>{parents.map(p=><tr key={p.id}><td><strong>{p.display_name}</strong><small className="table-sub">{p.phone || ''}</small></td><td>{p.username || p.email || '—'}</td><td>{p.children || '—'} <span className="muted">({p.linked_student_count || 0})</span></td><td><span className={`status ${p.active?'ok':'neutral'}`}>{p.active?'Aktif':'Pasif'}</span></td><td><button className="ghost" disabled={busy} onClick={()=>void toggleAccessUser(p.id,!p.active)}><Power size={15}/>{p.active?'Pasife Al':'Aktif Et'}</button></td></tr>)}</tbody></table>{!parents.length&&<div className="empty">Veli hesabı bulunamadı.</div>}</div>
    </>}
  </>;
}
