import { useEffect, useState } from 'react';
import { ArrowRight, BookOpenCheck, ClipboardCheck, Printer, Target, TrendingUp, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

export function Dashboard() {
  const { user } = useAuth();
  const [data,setData]=useState<any>(null);
  useEffect(()=>{ void api('/api/dashboard').then(setData); },[]);
  if(!user) return null;
  if(user.role==='STUDENT') return <StudentDashboard data={data}/>;
  if(user.role==='PARENT') return <ParentDashboard data={data}/>;
  return <>
    <div className="page-head"><div><span className="eyebrow">Kontrol merkezi</span><h1>Merhaba, {user.display_name.split(' ')[0]}</h1><p>Bugünkü işlemleri tek ekrandan takip edin.</p></div></div>
    <div className="kpi-grid">{(data?.cards||[]).map((c:any)=><div className="kpi-card" key={c.label}><span>{c.label}</span><strong>{c.value}</strong></div>)}</div>
    <div className="section-head"><div><h2>Hızlı işlemler</h2><p>En sık kullanılan akışlar.</p></div></div>
    <div className="action-grid">
      {(user.role==='SUPER_ADMIN'||user.role==='INSTITUTION_MANAGER')&&<Quick to="/exams" icon={<ClipboardCheck/>} title="Sınav Değerlendir" text="TXT/DAT yükle veya kameradan oku."/>}
      {(user.role==='SUPER_ADMIN'||user.role==='INSTITUTION_MANAGER')&&<Quick to="/students" icon={<Users/>} title="Öğrenciler" text="Aktif ve misafir öğrencileri yönetin."/>}
      {user.role==='INSTITUTION_MANAGER'&&<Quick to="/optical-prepare" icon={<Printer/>} title="Optik Hazırla" text="Kişiye özel optikleri yazdırın."/>}
      {(user.role==='TEACHER'||user.role==='GUIDANCE_TEACHER')&&<Quick to="/outcomes" icon={<Target/>} title="Kazanımlar" text="Yetkili olduğunuz alanlardaki eksikleri görün."/>}
      <Quick to="/worksheets" icon={<BookOpenCheck/>} title="Föyler" text="Yayınlanmış haftalık föylere erişin."/>
    </div>
  </>;
}
function Quick({to,icon,title,text}:{to:string;icon:React.ReactNode;title:string;text:string}){return <Link to={to} className="quick-card"><div className="quick-icon">{icon}</div><div><h3>{title}</h3><p>{text}</p></div><ArrowRight size={20}/></Link>}
function StudentDashboard({data}:{data:any}){return <>
  <div className="page-head student-hello"><div><span className="eyebrow">Kendi gelişimine odaklan</span><h1>Son durumun</h1><p>Eksiklerini gör, gelişimini takip et, doğru kaynağa geç.</p></div></div>
  <div className="student-hero"><div><span>Son sınav</span><h2>{data?.latest?.title||'Henüz sonuç yok'}</h2>{data?.latest&&<div className="hero-number">{Number(data.latest.net).toFixed(2)} <small>net</small></div>}<p>{data?.latest?.exam_date||''}</p></div><TrendingUp size={52}/></div>
  <div className="section-head"><div><h2>Geliştirilecek kazanımlar</h2><p>Tek bir yanlışla değil, yeterli kanıta göre hesaplanır.</p></div><Link to="/outcomes" className="link-button">Tümünü gör</Link></div>
  <div className="outcome-cards">{(data?.developing||[]).length?data.developing.map((o:any)=><div className="outcome-card" key={o.id}><strong>{o.title}</strong><span>{o.subject_name}</span><div className="progress"><i style={{width:`${Math.round(o.success_rate*100)}%`}}/></div><small>%{Math.round(o.success_rate*100)} · {o.evidence_count} soru</small></div>):<div className="empty">Yeterli sınav verisi oluştuğunda burada gösterilecek.</div>}</div>
</>}
function ParentDashboard({data}:{data:any}){return <><div className="page-head"><div><span className="eyebrow">Veli paneli</span><h1>Çocuğunuzun durumunu 30 saniyede görün</h1><p>Sonuç, gelişim ve üzerinde çalışılması gereken alanlar tek yerde.</p></div></div><div className="cards-list">{(data?.children||[]).map((c:any)=><Link key={c.id} to={`/reports?studentId=${c.id}`} className="list-card"><div className="avatar big">{c.name.charAt(0)}</div><div><strong>{c.name}</strong><span>Gelişim raporunu aç</span></div><ArrowRight/></Link>)}</div></>}
