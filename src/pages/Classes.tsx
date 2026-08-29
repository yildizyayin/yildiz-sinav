import { useEffect,useState } from 'react';
import { BarChart3, ClipboardCheck, GraduationCap, Target, UserCheck, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import {useEnabledFeatures} from '../hooks/useEnabledFeatures';

export function Classes(){
  const {user}=useAuth();
  const{enabled}=useEnabledFeatures();
  const[rows,setRows]=useState<any[]>([]);
  const[error,setError]=useState('');
  useEffect(()=>{void api<any>('/api/classes').then(r=>setRows(r.classes||[])).catch(e=>setError(e.message))},[]);
  const guidance=user?.role==='GUIDANCE_TEACHER';
  return <>
    <div className="page-head"><div><span className="eyebrow">Yetki filtreli sınıf paneli</span><h1>Sınıflarım</h1><p>{guidance?'Rehber öğretmeni yalnız atandığı sınıfların tüm akademik verilerini görür.':'Branş öğretmeni yalnız atandığı sınıflarda kendi branşıyla ilgili akademik verileri görür.'}</p></div></div>
    {error&&<div className="alert error">{error}</div>}
    <div className="kpi-grid" style={{marginBottom:20}}><div className="kpi-card"><span>Atanmış sınıf</span><strong>{rows.length}</strong></div><div className="kpi-card"><span>Aktif öğrenci</span><strong>{rows.reduce((a,r)=>a+Number(r.student_count||0),0)}</strong></div></div>
    <div className="cards-list">{rows.map(r=><div className="list-card" key={r.id}><div className="quick-icon"><Users/></div><div><strong>{r.name}</strong><span>{r.student_count} aktif öğrenci{guidance?' · tüm dersler':' · branş kapsamı'}</span></div>{enabled('REPORTING')&&<Link className="secondary" to="/reports"><BarChart3 size={15}/> Gelişim</Link>}</div>)}{!rows.length&&<div className="empty">Henüz atanmış sınıf bulunmuyor.</div>}</div>
    <div className="section-head"><div><h2>Sınıf işlemleri</h2><p>Yetki kapsamınız her sayfada otomatik uygulanır.</p></div></div>
    <div className="action-grid">
      {enabled('EXAM_CENTER')&&<Link className="quick-card" to="/exams"><div className="quick-icon"><ClipboardCheck/></div><div><h3>Sınavlar</h3><p>Yetkili sınıfların sınavlarını inceleyin.</p></div></Link>}
      {enabled('ATTENDANCE')&&<Link className="quick-card" to="/attendance"><div className="quick-icon"><UserCheck/></div><div><h3>Yoklama</h3><p>Günlük veya ders bazlı yoklama alın.</p></div></Link>}
      {enabled('ASSIGNMENTS')&&<Link className="quick-card" to="/assignments"><div className="quick-icon"><ClipboardCheck/></div><div><h3>Ödev Ver</h3><p>Kitap, dijital kaynak veya föy ödevi oluşturun.</p></div></Link>}
      {enabled('REPORTING')&&<Link className="quick-card" to="/outcomes"><div className="quick-icon"><Target/></div><div><h3>Kazanımlar</h3><p>{guidance?'Sınıfın tüm ders kazanımlarını görün.':'Kendi branşınızdaki kazanımları görün.'}</p></div></Link>}
      {enabled('REPORTING')&&<Link className="quick-card" to="/reports"><div className="quick-icon"><GraduationCap/></div><div><h3>{guidance?'Öğrenci Gelişimi':'Branş Gelişimi'}</h3><p>Birleşik gelişim raporuna geçin.</p></div></Link>}
    </div>
  </>;
}
