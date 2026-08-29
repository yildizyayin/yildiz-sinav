import { useEffect,useMemo,useState } from 'react';
import { BookOpenCheck,Bot,Clock3,FileText,Gamepad2,GraduationCap,ListChecks,Palette,Route,Target,TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useEnabledFeatures } from '../hooks/useEnabledFeatures';
import './student-standard.css';

function two(v:number){return String(v).padStart(2,'0')}
function targetName(t:any){return t.target_type==='LGS_SCHOOL'?t.school_name:`${t.university_name||''} · ${t.program_name||''}`}

export function StudentStandardHome(){
 const [dashboard,setDashboard]=useState<any>(null);const[home,setHome]=useState<any>(null);const[error,setError]=useState('');const[flipped,setFlipped]=useState(false);const[now,setNow]=useState(new Date());
 const {enabled,loading:featuresLoading}=useEnabledFeatures();
 useEffect(()=>{let alive=true;Promise.all([api<any>('/api/dashboard'),api<any>('/api/student-standard/home-context')]).then(([d,h])=>{if(alive){setDashboard(d);setHome(h)}}).catch((e:any)=>alive&&setError(e.message));const timer=setInterval(()=>setNow(new Date()),1000);return()=>{alive=false;clearInterval(timer)}},[]);
 const latest=dashboard?.latest;const developing=dashboard?.developing||[];const strong=dashboard?.strong||[];const targets=home?.targets||[];const primary=targets.find((x:any)=>Number(x.priority)===1)||targets[0];
 const clock=useMemo(()=>`${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}`,[now]);
 if(error)return <div className="alert error">{error}</div>;
 return <div className="student-standard-shell" data-theme={home?.preferences?.theme_key||'AUTO'}>
   <div className="student-standard-head"><div><span className="eyebrow">Benim çalışma alanım</span><h1>Bugünkü rotan hazır ✨</h1><p>Sonuçlarını, hedefini ve bugünkü çalışma yönünü tek ekranda takip et.</p></div><Link className="student-icon-link" to="/student-settings" title="Görünümümü kişiselleştir"><Palette size={20}/></Link></div>

   <div className="student-top-grid">
    <button className={`countdown-card ${flipped?'is-flipped':''}`} onClick={()=>setFlipped(x=>!x)} aria-label="Geri sayım ve saat arasında geçiş yap">
      <div className="countdown-inner">
       <div className="countdown-face countdown-front"><span>{home?.countdown?.label||'Hedef sınav'}</span><strong>{home?.countdown?.days==null?'—':home.countdown.days}</strong><b>gün kaldı</b><small>Saati görmek için dokun</small></div>
       <div className="countdown-face countdown-back"><Clock3 size={24}/><strong className="digital-clock">{clock}</strong><b>{now.toLocaleDateString('tr-TR',{weekday:'long',day:'numeric',month:'long'})}</b><small>Geri sayım için tekrar dokun</small></div>
      </div>
    </button>
    <div className="goal-story-card"><div className="goal-story-icon"><Target/></div><span>{primary?.priority?`${primary.priority}. hedefin`:'Hedef yolculuğun'}</span><h2>{primary?targetName(primary):'Hedefini belirle'}</h2><p>{primary?.motivation_enabled&&primary?.motivation_label?primary.motivation_label:'Hedefini belirlediğinde Nibiru gelişimini onunla birlikte takip edecek.'}</p><Link to="/academic-target" className="link-button">Hedeflerimi aç →</Link></div>
   </div>

   {enabled('REPORTING')&&<div className="student-kpi-grid">
    <div className="student-kpi"><span>Son sınav</span><strong>{latest?.title||'Henüz yok'}</strong><small>{latest?.net!=null?`${Number(latest.net).toFixed(2)} net`:'Sonuç oluştuğunda burada.'}</small></div>
    <div className="student-kpi"><span>Gelişim alanı</span><strong>{developing.length}</strong><small>kanıta dayalı kazanım</small></div>
    <div className="student-kpi"><span>Güçlü alan</span><strong>{strong.length}</strong><small>istikrarlı kazanım</small></div>
   </div>}

   <div className="student-section-head"><div><span className="eyebrow">Bugünkü çalışma</span><h2>İhtiyacın olan alanlara tek dokunuşla geç</h2></div></div>
   <div className="student-action-grid">
    <Link to="/nibiru" className="student-action"><Bot/><div><strong>Nibiru</strong><span>Bugün ne çalışacağını birlikte planla.</span></div></Link>
    {enabled('REPORTING')&&<Link to="/my-results" className="student-action"><TrendingUp/><div><strong>Sonuçlarım</strong><span>Sınav, net ve kazanım gelişimini gör.</span></div></Link>}
    <Link to="/academic-target" className="student-action"><GraduationCap/><div><strong>Hedeflerim</strong><span>LGS veya YKS hedeflerini takip et.</span></div></Link>
    {enabled('ASSIGNMENTS')&&<Link to="/assignments" className="student-action"><BookOpenCheck/><div><strong>Ödevlerim</strong><span>Verilen ödevleri aç, ilerlemeni güncelle.</span></div></Link>}
    {enabled('WORKSHEETS')&&<Link to="/worksheets" className="student-action"><FileText/><div><strong>Föylerim</strong><span>Sınıf düzeyine uygun yayınlanmış föylere ulaş.</span></div></Link>}
    {enabled('PERSONAL_BOOKS')&&<Link to="/my-books" className="student-action"><BookOpenCheck/><div><strong>Benim Kitaplarım</strong><span>Gelişim alanlarından Kişiye Özel Kitabını oluştur.</span></div></Link>}
    {enabled('ZERO_ERROR_BOOKLET')&&<Link to="/wrong-answers" className="student-action"><ListChecks/><div><strong>Sıfır Hata Rotam</strong><span>Yanlış ve boş sorularını tekrar döngüsüne al.</span></div></Link>}
    {enabled('LEARNING_GRAPH')&&<Link to="/student-growth" className="student-action"><Route/><div><strong>Gelişim Yolculuğum</strong><span>Öğrenme grafiğini ve öncelikli gelişim alanlarını gör.</span></div></Link>}
    {enabled('GUIDANCE_TESTS')&&<Link to="/guidance-tests" className="student-action"><ListChecks/><div><strong>Rehberlik Testleri</strong><span>Yalnız kurumunun açtığı rehberlik çalışmalarını tamamla.</span></div></Link>}
    {enabled('GAMES')&&<Link to="/student-games" className="student-action"><Gamepad2/><div><strong>Öğrenirken Oyna</strong><span>Yaşına uygun kısa akademik oyunlar.</span></div></Link>}
   </div>
   {featuresLoading&&<div className="empty">Kurum paketindeki çalışma araçların hazırlanıyor…</div>}

   {enabled('REPORTING')&&<><div className="student-section-head"><div><span className="eyebrow">Akıllı tekrar</span><h2>Önce bunları güçlendirelim</h2></div><Link to="/outcomes" className="link-button">Tüm kazanımlar →</Link></div>
   <div className="student-outcome-grid">{developing.slice(0,4).map((o:any)=><div className="student-outcome" key={o.id||o.outcome_id}><span>{o.subject_name}</span><strong>{o.title}</strong><div className="progress"><i style={{width:`${Math.round(Number(o.success_rate||0)*100)}%`}}/></div><small>%{Math.round(Number(o.success_rate||0)*100)} · {o.evidence_count||o.evidence||0} kanıt</small></div>)}{!developing.length&&<div className="empty">Yeterli ölçme kanıtı oluştuğunda kişisel tekrar alanların burada görünecek.</div>}</div></>}
  </div>
}
