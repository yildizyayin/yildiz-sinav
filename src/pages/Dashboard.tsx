import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BarChart3, BookMarked, BookOpenCheck, Building2, ClipboardCheck, FileUp, GraduationCap, KeyRound, Printer, ScanLine, ShieldCheck, Target, TrendingUp, UserCog, UserRound, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

export function Dashboard() {
  const { user, institution } = useAuth();
  const [data,setData]=useState<any>(null);
  const [classes,setClasses]=useState<any[]>([]);
  const [error,setError]=useState('');

  useEffect(()=>{
    if(!user)return;
    setError('');
    void api<any>('/api/dashboard').then(setData).catch((e)=>setError(e.message));
    if(user.role==='TEACHER'||user.role==='GUIDANCE_TEACHER'){
      void api<any>('/api/classes').then((r)=>setClasses(r.classes||[])).catch(()=>setClasses([]));
    }
  },[user?.role]);

  if(!user) return null;
  if(error)return <div className="alert error">{error}</div>;
  if(user.role==='STUDENT') return <StudentDashboard data={data}/>;
  if(user.role==='PARENT') return <ParentDashboard data={data}/>;
  if(user.role==='TEACHER'||user.role==='GUIDANCE_TEACHER') return <TeacherDashboard data={data} classes={classes} guidance={user.role==='GUIDANCE_TEACHER'} name={user.display_name}/>;
  if(user.role==='INSTITUTION_MANAGER') return <ManagerDashboard data={data} name={user.display_name} institutionName={institution?.name||''}/>;
  return <AdminDashboard data={data} name={user.display_name}/>;
}

function AdminDashboard({data,name}:{data:any;name:string}){
  return <>
    <Head eyebrow="Platform kontrol merkezi" title={`Merhaba, ${first(name)}`} text="Kurumları, sınavları, optikleri, müfredatı ve veri akışlarını tek yerden yönetin."/>
    <Cards cards={data?.cards}/>
    <Section title="Ana yönetim işlemleri" text="Platformun kritik kurulum ve kontrol noktaları."/>
    <div className="action-grid">
      <Quick to="/institutions" icon={<Building2/>} title="Kurumlar" text="Aktif/pasif kurumları ve kurum yaşam döngüsünü yönetin."/>
      <Quick to="/exam-definitions" icon={<ClipboardCheck/>} title="Sınav Oluştur" text="LGS/TYT/AYT veya standart denemeyi cevap anahtarından oluşturun."/>
      <Quick to="/opticals" icon={<ScanLine/>} title="Optik Tanıtma" text="Fotoğraf, TXT/DAT veya manuel yöntemle optik tanımlayın."/>
      <Quick to="/curriculum" icon={<BookMarked/>} title="Müfredat & Kazanımlar" text="Resmî kazanım verilerini ve sürümlerini yönetin."/>
      <Quick to="/transfers" icon={<FileUp/>} title="Veri Transferi" text="Edesis/Okulizyon/Excel/TXT-DAT verilerini kontrollü aktarın."/>
      <Quick to="/reports" icon={<BarChart3/>} title="Platform Raporları" text="Kurum ve öğrenci sonuçlarını yetki kapsamında inceleyin."/>
    </div>
    <Section title="Erişim ve operasyon" text="Kullanıcı, sezon ve öğretmen kapsamlarını kontrol edin."/>
    <div className="action-grid">
      <Quick to="/users" icon={<UserCog/>} title="Kullanıcılar" text="Kurum yöneticisi ve sistem kullanıcılarını yönetin."/>
      <Quick to="/teacher-assignments" icon={<ShieldCheck/>} title="Öğretmen Yetkileri" text="Branş + sınıf ve rehber sınıf kapsamlarını atayın."/>
      <Quick to="/access-accounts" icon={<KeyRound/>} title="Öğrenci/Veli Erişimi" text="Lisanslı öğrenciler ve bağlı veliler için erişim hesaplarını yönetin."/>
    </div>
  </>;
}

function ManagerDashboard({data,name,institutionName}:{data:any;name:string;institutionName:string}){
  return <>
    <Head eyebrow="Kurum yönetici paneli" title={`Merhaba, ${first(name)}`} text={`${institutionName||'Kurumunuz'} içindeki sınav, öğrenci, öğretmen, optik ve rapor süreçleri burada.`}/>
    <Cards cards={data?.cards}/>
    <Section title="Bugün ne yapmak istiyorsunuz?" text="Ana işlemler en fazla birkaç tıklamayla tamamlanır."/>
    <div className="action-grid">
      <Quick to="/exam-definitions" icon={<ClipboardCheck/>} title="Sınav Oluştur" text="Cevap anahtarından veya manuel ders/soru yapısıyla sınav tanımlayın."/>
      <Quick to="/exams" icon={<ClipboardCheck/>} title="Sınav Değerlendir" text="TXT/DAT yükleyin veya kameradan optik okuyun."/>
      <Quick to="/students" icon={<Users/>} title="Öğrenciler" text="Aktif öğrenciler ve misafir katılımcıları ayrı yönetin."/>
      <Quick to="/optical-prepare" icon={<Printer/>} title="Optik Hazırla" text="Kişiye özel optikleri sınıf bazında hazırlayıp yazdırın."/>
      <Quick to="/reports" icon={<BarChart3/>} title="Raporlar" text="Tek sınav ve birleşik gelişim raporlarını inceleyin."/>
      <Quick to="/worksheets" icon={<BookOpenCheck/>} title="Föyler" text="Yayınlanmış haftalık föyleri kurum içinde kullanın."/>
    </div>
    <Section title="Kurum erişimleri" text="Öğretmen ve öğrenci/veli hesaplarını kurum içinde yönetin."/>
    <div className="action-grid">
      <Quick to="/users" icon={<UserCog/>} title="Kullanıcılar" text="Kurum personeli ve öğretmen kullanıcılarını yönetin."/>
      <Quick to="/teacher-assignments" icon={<ShieldCheck/>} title="Öğretmen Yetkileri" text="Branş ve rehberlik kapsamlarını sınıf bazında atayın."/>
      <Quick to="/access-accounts" icon={<KeyRound/>} title="Öğrenci/Veli Erişimi" text="Aktif öğrenciler ve bağlı veliler için panel hesaplarını yönetin."/>
    </div>
    <div className="alert info" style={{marginTop:20}}>Misafir katılımcılar sınav değerlendirmesine katılabilir; öğrenci/veli paneli, föy ve birleşik rapor erişimi yalnız aktif lisanslı öğrenciye açılır.</div>
  </>;
}

function TeacherDashboard({data,classes,guidance,name}:{data:any;classes:any[];guidance:boolean;name:string}){
  return <>
    <Head eyebrow={guidance?'Rehber öğretmeni paneli':'Branş öğretmeni paneli'} title={`Merhaba, ${first(name)}`} text={guidance?'Atandığınız sınıflardaki öğrencilerin tüm ders gelişimini bütüncül görün.':'Yalnız atandığınız sınıflarda kendi branşınıza ait sınav, sonuç ve kazanım verilerini görün.'}/>
    <Cards cards={data?.cards}/>
    <div className="alert info" style={{marginTop:16}}>{guidance?'Rehber öğretmeni görünümü: atanmış sınıf/öğrencilerin tüm akademik dersleri görünür; başka sınıflar görünmez.':'Branş öğretmeni görünümü: atanmış sınıflar + kendi branşınız. Diğer dersler backend tarafından erişime kapalıdır.'}</div>
    <Section title="Hızlı işlemler" text="Ders ve sınıf kapsamınız otomatik uygulanır."/>
    <div className="action-grid">
      <Quick to="/classes" icon={<GraduationCap/>} title="Sınıflarım" text="Yetkili olduğunuz sınıfları ve aktif öğrenci sayılarını görün."/>
      <Quick to="/exams" icon={<ClipboardCheck/>} title="Sınavlar" text="Yetkiniz kapsamındaki sınavları ve sonuçları inceleyin."/>
      <Quick to="/outcomes" icon={<Target/>} title="Kazanımlar" text={guidance?'Sınıfın tüm ders kazanımlarını görün.':'Kendi branşınızdaki geliştirilecek kazanımları görün.'}/>
      <Quick to="/reports" icon={<TrendingUp/>} title={guidance?'Öğrenci Gelişimi':'Branş Gelişimi'} text={guidance?'Öğrencinin tüm derslerini birleşik raporda izleyin.':'Sadece kendi branşınız için gelişim raporunu izleyin.'}/>
      <Quick to="/worksheets" icon={<BookOpenCheck/>} title="Föyler" text="Yetkili sınıf ve dersler için yayınlanan çalışma föylerine erişin."/>
    </div>
    <Section title="Sınıf kapsamınız" text={`${classes.length} atanmış sınıf`}/>
    <div className="cards-list">{classes.slice(0,8).map((c)=><div className="list-card" key={c.id}><div className="quick-icon"><GraduationCap size={18}/></div><div><strong>{c.name}</strong><span>{c.student_count} aktif öğrenci</span></div><Link className="link-button" to="/reports">Gelişim</Link></div>)}{!classes.length&&<div className="empty">Henüz atanmış sınıf bulunmuyor.</div>}</div>
  </>;
}

function StudentDashboard({data}:{data:any}){
  const developing=data?.developing||[];
  const strong=data?.strong||[];
  const latest=data?.latest;
  return <>
    <Head eyebrow="Öğrenci paneli" title="Kendi gelişimine odaklan" text="Sonuçlarını gör, geliştirilecek kazanımlarını takip et ve ilgili föye geç."/>
    <div className="student-hero"><div><span>Son sınav</span><h2>{latest?.title||'Henüz sonuç yok'}</h2>{latest&&<div className="hero-number">{Number(latest.net).toFixed(2)} <small>net</small></div>}<p>{latest?.exam_date||'Yeni sınav sonucu oluştuğunda burada görünecek.'}</p></div><TrendingUp size={52}/></div>
    <Section title="Hızlı erişim" text="Gelişimini tek ekrandan devam ettir."/>
    <div className="action-grid">
      <Quick to="/my-results" icon={<ClipboardCheck/>} title="Sonuçlarım" text="Sınav geçmişini ve ders bazlı netlerini incele."/>
      <Quick to="/outcomes" icon={<Target/>} title="Geliştirilecek Kazanımlar" text="Yeterli kanıta göre gelişime ihtiyaç duyduğun alanları gör."/>
      <Quick to="/worksheets" icon={<BookOpenCheck/>} title="Föylerim" text="Sınıfına uygun haftalık çalışma föylerine geç."/>
      <Quick to="/profile" icon={<UserRound/>} title="Profil" text="Hesap ve erişim kapsamını gör."/>
    </div>
    <Section title="Geliştirilecek kazanımlar" text="Tek bir yanlışla değil; birden fazla sınav/soru kanıtına göre hesaplanır." right={<Link to="/outcomes" className="link-button">Tümünü gör</Link>}/>
    <div className="outcome-cards">{developing.length?developing.slice(0,6).map((o:any)=><div className="outcome-card" key={o.id||o.outcome_id}><strong>{o.title}</strong><span>{o.subject_name}</span><div className="progress"><i style={{width:`${Math.round(Number(o.success_rate||0)*100)}%`}}/></div><small>%{Math.round(Number(o.success_rate||0)*100)} · {o.evidence_count||o.evidence||0} soru</small><div style={{marginTop:10}}><Link to="/worksheets" className="link-button">Konuyu tekrar et →</Link></div></div>):<div className="empty">Yeterli sınav verisi oluştuğunda burada gösterilecek.</div>}</div>
    <Section title="Güçlü kazanımlar" text="Yeterli kanıta ulaşan güçlü alanların."/>
    <div className="cards-list">{strong.slice(0,6).map((o:any)=><div className="list-card" key={o.id||o.outcome_id}><div className="quick-icon"><Target size={18}/></div><div><strong>{o.title}</strong><span>{o.subject_name} · %{Math.round(Number(o.success_rate||0)*100)}</span></div></div>)}{!strong.length&&<div className="empty">Güçlü kazanım listesi yeterli veri oluşunca gösterilecek.</div>}</div>
  </>;
}

function ParentDashboard({data}:{data:any}){
  const children=data?.children||[];
  return <>
    <Head eyebrow="Veli paneli" title="Çocuğunuzun durumunu hızlıca görün" text="Sonuç, gelişim ve üzerinde çalışılması gereken alanları tek yerden takip edin."/>
    <div className="kpi-grid" style={{marginBottom:20}}><div className="kpi-card"><span>Bağlı öğrenci</span><strong>{children.length}</strong></div></div>
    <Section title="Çocuklarım" text="Birden fazla çocuk varsa buradan seçim yapabilirsiniz."/>
    <div className="cards-list">{children.map((c:any)=><Link key={c.id} to={`/reports?studentId=${c.id}`} className="list-card"><div className="avatar big">{String(c.name||'?').charAt(0)}</div><div><strong>{c.name}</strong><span>{c.class_name?`${c.class_name} · `:''}Gelişim raporunu aç</span></div><ArrowRight/></Link>)}{!children.length&&<div className="empty">Bu veli hesabına bağlı aktif öğrenci bulunmuyor.</div>}</div>
    <Section title="Veli işlemleri" text="Sade ve hızlı erişim."/>
    <div className="action-grid">
      <Quick to="/children" icon={<Users/>} title="Çocuklarım" text="Bağlı öğrencileri ve erişim durumunu görün."/>
      <Quick to="/reports" icon={<BarChart3/>} title="Gelişim" text="Seçili çocuğun sınav, ders ve kazanım gelişimini inceleyin."/>
      <Quick to="/profile" icon={<UserRound/>} title="Profil" text="Veli hesabınızın erişim kapsamını görün."/>
    </div>
  </>;
}

function Head({eyebrow,title,text}:{eyebrow:string;title:string;text:string}){return <div className="page-head"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p></div></div>}
function Cards({cards}:{cards:any[]|undefined}){return <div className="kpi-grid">{(cards||[]).map((c:any)=><div className="kpi-card" key={c.label}><span>{c.label}</span><strong>{c.value}</strong></div>)}</div>}
function Section({title,text,right}:{title:string;text:string;right?:React.ReactNode}){return <div className="section-head"><div><h2>{title}</h2><p>{text}</p></div>{right}</div>}
function Quick({to,icon,title,text}:{to:string;icon:React.ReactNode;title:string;text:string}){return <Link to={to} className="quick-card"><div className="quick-icon">{icon}</div><div><h3>{title}</h3><p>{text}</p></div><ArrowRight size={20}/></Link>}
function first(name:string){return name.trim().split(/\s+/)[0]||name}
