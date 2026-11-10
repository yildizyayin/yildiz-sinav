import { useEffect,useState,type ReactNode } from 'react';
import { BarChart3,Bell,BookOpenCheck,Building2,CalendarDays,ClipboardCheck,GraduationCap,KeyRound,Layers3,ListChecks,Palette,Printer,ShieldCheck,Sparkles,Target,UserCog,Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { useFeatures } from '../lib/useFeatures';
import './teacher-today.css';

function useDashboard(){const[data,setData]=useState<any>(null);const[error,setError]=useState('');useEffect(()=>{void api<any>('/api/dashboard').then(setData).catch(e=>setError(e.message))},[]);return{data,error}}
function Kpis({cards}:{cards:any[]}){return <div className="kpi-grid">{(cards||[]).map((c:any)=><div className="kpi-card" key={c.label}><span>{c.label}</span><strong>{c.value}</strong></div>)}</div>}
// Tiles for features an institution has not switched on are left out (owner, 9 Nov: "kapalıysa menüde gizle").
const TILE_FEATURE:Record<string,string>={'/assignments':'ASSIGNMENTS','/guidance-tests':'GUIDANCE_TESTS','/live-lessons':'LIVE','/quick-tests':'STUDIO'};
type ActionProps={to:string;icon:ReactNode;title:string;text:string};
function GatedAction(props:ActionProps&{gate:string}){const features=useFeatures();return features.has(props.gate)?<PlainAction {...props}/>:null}
function Action(props:ActionProps){const gate=TILE_FEATURE[props.to];return gate?<GatedAction {...props} gate={gate}/>:<PlainAction {...props}/>}
function PlainAction({to,icon,title,text}:ActionProps){return <Link to={to} className="exam-card module-card"><div className="quick-icon">{icon}</div><div><h3>{title}</h3><p>{text}</p><span className="link-button">Aç →</span></div></Link>}
function Welcome({eyebrow,title,text,icon}:{eyebrow:string;title:string;text:string;icon:ReactNode}){return <section className="role-welcome"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p></div><div className="role-welcome-icon">{icon}</div></section>}
function SectionTitle({eyebrow,title,text}:{eyebrow:string;title:string;text:string}){return <div className="role-section-title"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{text}</p></div></div>}

export function SuperAdminStandardHome(){
 const{user}=useAuth();const{data,error}=useDashboard();
 return <div className="role-dashboard super-admin-dashboard"><Welcome eyebrow="ANUNEX · Süper Admin" title="Platform Kontrol Merkezi" text="Kurumlar, lisanslar, akademik operasyonlar, içerik, optik ve güvenlik tek yönetim yüzeyinde." icon={<ShieldCheck/>}/>{error&&<div className="alert error">{error}</div>}<Kpis cards={data?.cards||[]}/><SectionTitle eyebrow="Merkezi yönetim" title="Bugün yöneteceğiniz alanlar" text="Günlük operasyonlar ve platform politikaları rol sınırları korunarak burada yönetilir."/><div className="action-grid"><Action to="/institutions" icon={<Building2/>} title="Kurumlar & Zincirler" text="Kurum yaşam döngüsü, kampüs yapısı ve erişimleri yönetin."/><Action to="/licenses" icon={<KeyRound/>} title="Paket & Lisanslar" text="Standart, Premium ve modüler paket yetkilerini yönetin."/><Action to="/theme-management" icon={<Palette/>} title="Tema & Özel Günler" text="Temaları kurum/rol bazında açın; tarih aralıklı özel görünüm yayınlayın."/><Action to="/exam-center" icon={<ClipboardCheck/>} title="Merkezi Sınavlar" text="Kurum, ağ ve merkezi sınav akışlarını yönetin."/><Action to="/content-center" icon={<Layers3/>} title="Soru Havuzu & Studio" text="Soruları, kaynakları, inceleme ve video süreçlerini yönetin."/><Action to="/opticals" icon={<Printer/>} title="Optik Merkezi" text="Optik tanımları, baskı standardı ve kalibrasyonu yönetin."/><Action to="/worksheet-admin" icon={<BookOpenCheck/>} title="Föy Merkezi" text="Mavi ve Kırmızı serileri, haftalık planı ve içeriklerini yönetin."/><Action to="/users" icon={<UserCog/>} title="Kullanıcı & Roller" text="Yetkileri, kurum kapsamlarını ve hesap güvenliğini yönetin."/><Action to="/standard-readiness" icon={<ShieldCheck/>} title="Güvenlik & Hazırlık" text="KVKK, dış servis ve üretim hazırlık durumunu izleyin."/><Action to="/completion-center" icon={<Sparkles/>} title="Tamamlanma Merkezi" text="Dış aktivasyonları ve yıllık içerik planını takip edin."/></div><div className="alert info">Aktif kullanıcı: {user?.display_name}. Tema, rol ve kurum değişiklikleri denetim kaydına alınır.</div></div>
}

/** Owner (9 Nov): "iş odaklı sade" — the teacher home leads with today's work, in the existing look. */
function TeacherToday({today,guidance}:{today:any;guidance:boolean}){
 if(!today)return null;
 const classes=today.classes||[],missing=classes.filter((c:any)=>!c.attendance_today&&c.student_count>0),exams=today.recentExams||[],weak=today.weakOutcomes||[];
 const fmt=(n:any)=>n==null?'—':Number(n).toLocaleString('tr-TR',{maximumFractionDigits:2});
 return <section className="teacher-today" aria-labelledby="teacher-today-title">
  <SectionTitle eyebrow="Bugün" title="Yapılacaklar" text="Yalnız size atanmış sınıf ve dersler."/>
  <div className="teacher-today-grid">
   <div className="panel teacher-today-card">
    <div className="teacher-today-head"><h3 id="teacher-today-title">Yoklama</h3><Link className="link-button" to="/attendance">Yoklamaya git →</Link></div>
    {!classes.length?<p className="muted">Size atanmış sınıf yok.</p>:missing.length?<><p><strong>{missing.length}</strong> sınıfta bugünün yoklaması girilmedi.</p><ul className="teacher-today-list">{missing.slice(0,6).map((c:any)=><li key={c.id}><span>{c.name}</span><small>{c.student_count} öğrenci</small></li>)}</ul></>:<p className="ok-text">Bugünün yoklaması tüm sınıflarınızda girildi.</p>}
   </div>
   <div className="panel teacher-today-card">
    <div className="teacher-today-head"><h3>Yeni sonuçlar</h3><Link className="link-button" to="/exams">Sınavlar →</Link></div>
    {exams.length?<ul className="teacher-today-list">{exams.map((x:any)=><li key={x.id}><span>{x.title}</span><small>{x.participant_count} öğrenciniz · ortalama {fmt(x.average_net)} net</small></li>)}</ul>:<p className="muted">Son 30 günde öğrencilerinizin girdiği değerlendirilmiş sınav yok.</p>}
   </div>
   <div className="panel teacher-today-card">
    <div className="teacher-today-head"><h3>Kazanım desteği</h3><Link className="link-button" to="/kazanim-destek">Listeye git →</Link></div>
    {Number(today.outcomeSupport||0)>0?<p><strong>{today.outcomeSupport}</strong> öğrenci video, mini test ve mini oyundan sonra desteğinizi bekliyor.</p>:<p className="muted">Desteğinizi bekleyen öğrenci yok.</p>}
   </div>
   {!guidance&&<div className="panel teacher-today-card">
    <div className="teacher-today-head"><h3>Zorlanılan kazanımlar</h3><Link className="link-button" to="/outcomes">Kazanımlar →</Link></div>
    {weak.length?<ul className="teacher-today-list">{weak.map((o:any)=><li key={o.id}><span>{o.code?`${o.code} · `:''}{o.title}</span><small>%{Math.round(o.success_rate*100)} doğru · {o.student_count} öğrenci · {o.subject_name}</small></li>)}</ul>:<p className="muted">Son 60 günde yeterli kanıt yok.</p>}
   </div>}
  </div>
 </section>
}

export function TeacherStandardHome(){
 const{user}=useAuth();const{data,error}=useDashboard();const guidance=user?.role==='GUIDANCE_TEACHER';
 return <div className={`role-dashboard ${guidance?'guidance-dashboard':'teacher-dashboard'}`}><Welcome eyebrow={`ANUNEX · ${guidance?'Rehber Öğretmen':'Branş Öğretmeni'}`} title={guidance?'Öğrenci Gelişim Merkezi':'Branş Akademik Merkezi'} text={guidance?'Atandığınız sınıfların akademik, sosyal ve rehberlik gelişimini güvenli bir bütün olarak izleyin.':'Atanmış sınıf ve branşınızda sınav, kazanım, soru, ödev ve föy süreçlerini yönetin.'} icon={guidance?<ListChecks/>:<GraduationCap/>}/>{error&&<div className="alert error">{error}</div>}<Kpis cards={data?.cards||[]}/><TeacherToday today={data?.today} guidance={guidance}/>{data?.scope&&<div className="alert info">Yetki modu: {data.scope.mode==='GUIDANCE'?'Rehberlik · atanmış sınıfların tüm dersleri':'Branş · yalnız atanmış sınıf ve ders'}.</div>}<SectionTitle eyebrow="Günlük çalışma alanı" title={guidance?'Rehberlik ve gelişim akışları':'Ders ve ölçme akışları'} text="Yalnız yetkili olduğunuz öğrenci, sınıf ve ders kayıtları gösterilir."/><div className="action-grid"><Action to="/classes" icon={<Users/>} title="Sınıflarım" text="Yetkili sınıfları ve öğrenci kapsamını görün."/><Action to="/attendance" icon={<Users/>} title="Yoklama" text="Sınıf yoklamasını mobilde tek dokunuşla kaydedin."/><Action to="/assignments" icon={<BookOpenCheck/>} title="Ödev Merkezi" text="Çalışmaları atayın ve öğrenci ilerlemesini takip edin."/><Action to="/exams" icon={<ClipboardCheck/>} title="Sınavlar" text="Sınavları, sonuçları ve değerlendirme durumunu inceleyin."/><Action to="/outcomes" icon={<Target/>} title="Kazanım Gelişimi" text="Güçlü ve gelişime açık kazanımları izleyin."/>{guidance&&<Action to="/guidance-tests" icon={<ListChecks/>} title="Rehberlik Onayları" text="RBA ve rehberlik ölçümlerini onaylı süreçle yönetin."/>}<Action to="/content-center" icon={<Layers3/>} title="Soru Havuzu" text="Soruları ekleyin ve içerik inceleme akışına gönderin."/><Action to="/worksheets" icon={<BookOpenCheck/>} title="Föyler" text="Haftalık föyleri ve kişiselleştirilmiş çalışmaları kullanın."/><Action to="/reports" icon={<BarChart3/>} title="Akademik Raporlar" text={guidance?'Öğrenci ve sınıf gelişimini bütüncül izleyin.':'Branş ve öğrenci gelişimini raporlayın.'}/><Action to="/announcements" icon={<Bell/>} title="Duyurular" text="Yetkili olduğunuz gruplara kurum içi duyuru yayınlayın."/></div></div>
}

export function ParentStandardHome(){
 const{data,error}=useDashboard();const children=data?.children||[];
 return <div className="role-dashboard parent-dashboard"><Welcome eyebrow="ANUNEX · Veli" title="Çocuğumun Gelişimi" text="Sonuçları, gelişim eğilimini, haftalık çalışmayı ve kurum bildirimlerini sade bir görünümde takip edin." icon={<Users/>}/>{error&&<div className="alert error">{error}</div>}<div className="kpi-grid"><div className="kpi-card"><span>Bağlı öğrenci</span><strong>{children.length}</strong></div></div><div className="cards-list">{children.map((c:any)=><Link key={c.id} to={`/reports?studentId=${c.id}`} className="list-card"><div className="avatar big">{String(c.name||'?').charAt(0)}</div><div><strong>{c.name}</strong><span>{c.class_name?`${c.class_name} · `:''}Gelişim raporunu aç</span></div></Link>)}{!children.length&&<div className="empty">Bu veli hesabına bağlı aktif öğrenci bulunmuyor.</div>}</div><SectionTitle eyebrow="Veli araçları" title="Takip ve iletişim" text="Öğrencinin özel cevapları yerine güvenli gelişim özetleri gösterilir."/><div className="action-grid"><Action to="/weekly-summary" icon={<CalendarDays/>} title="Haftalık Özet" text="Son yedi günlük sınav ve kazanım gelişimini görün."/><Action to="/reports" icon={<BarChart3/>} title="Gelişim Raporu" text="Sınav, ders ve kazanım gelişimini inceleyin."/><Action to="/children" icon={<Users/>} title="Çocuklarım" text="Bağlı öğrencileri ve erişim durumunu görün."/><Action to="/nibiru" icon={<Sparkles/>} title="Nibiru Veli Rehberi" text="Gelişim verilerini yargısız ve destekleyici bir dille yorumlayın."/></div></div>
}
