import { useEffect,useState } from 'react';
import { BookOpenCheck,Bot,CalendarDays,Gamepad2,GraduationCap,Palette,Target,TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import './student-standard.css';

function targetName(t:any){return t.target_type==='LGS_SCHOOL'?t.school_name:`${t.university_name||''} · ${t.program_name||''}`}

export function StudentStandardHome(){
 const [dashboard,setDashboard]=useState<any>(null);const[home,setHome]=useState<any>(null);const[error,setError]=useState('');const[flipped,setFlipped]=useState(false);
 useEffect(()=>{let alive=true;Promise.all([api<any>('/api/dashboard'),api<any>('/api/student-standard/home-context')]).then(([d,h])=>{if(alive){setDashboard(d);setHome(h)}}).catch((e:any)=>alive&&setError(e.message));return()=>{alive=false}},[]);
 const latest=dashboard?.latest;const developing=dashboard?.developing||[];const strong=dashboard?.strong||[];const targets=home?.targets||[];const primary=targets.find((x:any)=>Number(x.priority)===1)||targets[0];
 if(error)return <div className="alert error">{error}</div>;
 return <div className="student-standard-shell" data-theme={home?.preferences?.theme_key||'AUTO'}>
   <div className="student-standard-head"><div><span className="eyebrow">Benim çalışma alanım</span><h1>Bugünkü rotan hazır ✨</h1><p>Sonuçlarını, hedefini ve bugünkü çalışma yönünü tek ekranda takip et.</p></div><Link className="student-icon-link" to="/student-settings" title="Görünümümü kişiselleştir"><Palette size={20}/></Link></div>

   <div className="student-top-grid">
    <button className={`countdown-card ${flipped?'is-flipped':''}`} onClick={()=>setFlipped(x=>!x)} aria-label="Sınav geri sayımı ve hedef bilgileri arasında geçiş yap" aria-pressed={flipped}>
      <div className="countdown-inner">
       <div className="countdown-face countdown-front"><span>{home?.countdown?.label||'Hedef sınav'}</span><strong>{home?.countdown?.days==null?'—':home.countdown.days}</strong><b>gün kaldı</b><small>Hedef rotanı görmek için dokun</small></div>
       <div className="countdown-face countdown-back"><CalendarDays size={24}/><span>Hedef rotan</span><b className="countdown-target-name">{primary?targetName(primary):'Önce hedefini belirle'}</b><div className="countdown-insights"><div><small>Son sınav</small><strong>{latest?.net==null?'—':Number(latest.net).toFixed(2)}</strong><em>net</em></div><div><small>Güçlendirilecek</small><strong>{developing.length}</strong><em>kazanım</em></div></div><small>{home?.countdown?.targetDate?`Sıradaki tarih · ${new Date(`${home.countdown.targetDate}T00:00:00`).toLocaleDateString('tr-TR',{day:'numeric',month:'long'})}`:'Geri sayım için tekrar dokun'}</small></div>
      </div>
    </button>
    <div className="goal-story-card"><div className="goal-story-icon"><Target/></div><span>{primary?.priority?`${primary.priority}. hedefin`:'Hedef yolculuğun'}</span><h2>{primary?targetName(primary):'Hedefini belirle'}</h2><p>{primary?.motivation_enabled&&primary?.motivation_label?primary.motivation_label:'Hedefini belirlediğinde Nibiru gelişimini onunla birlikte takip edecek.'}</p><Link to="/academic-target" className="link-button">Hedeflerimi aç →</Link></div>
   </div>

   <div className="student-kpi-grid">
    <div className="student-kpi"><span>Son sınav</span><strong>{latest?.title||'Henüz yok'}</strong><small>{latest?.net!=null?`${Number(latest.net).toFixed(2)} net`:'Sonuç oluştuğunda burada.'}</small></div>
    <div className="student-kpi"><span>Gelişim alanı</span><strong>{developing.length}</strong><small>kanıta dayalı kazanım</small></div>
    <div className="student-kpi"><span>Güçlü alan</span><strong>{strong.length}</strong><small>istikrarlı kazanım</small></div>
   </div>

   <div className="student-action-grid">
    <Link to="/nibiru" className="student-action"><Bot/><div><strong>Nibiru</strong><span>Bugün ne çalışacağını birlikte planla.</span></div></Link>
    <Link to="/my-results" className="student-action"><TrendingUp/><div><strong>Sonuçlarım</strong><span>Sınav, net ve kazanım gelişimini gör.</span></div></Link>
    <Link to="/assignments" className="student-action"><BookOpenCheck/><div><strong>Ödevlerim</strong><span>Atanan çalışmaları ve teslim tarihlerini takip et.</span></div></Link>
    <Link to="/academic-target" className="student-action"><GraduationCap/><div><strong>Hedeflerim</strong><span>LGS veya YKS hedeflerini takip et.</span></div></Link>
    <Link to="/my-books" className="student-action"><BookOpenCheck/><div><strong>Benim Kitaplarım</strong><span>Kişiye Özel Kitap ve Sıfır Hata Kitapçığı oluştur.</span></div></Link>
    <Link to="/student-games" className="student-action"><Gamepad2/><div><strong>Öğrenirken Oyna</strong><span>Yaşına uygun kısa akademik oyunlar.</span></div></Link>
   </div>

   <div className="student-section-head"><div><span className="eyebrow">Akıllı tekrar</span><h2>Önce bunları güçlendirelim</h2></div><Link to="/outcomes" className="link-button">Tüm kazanımlar →</Link></div>
   <div className="student-outcome-grid">{developing.slice(0,4).map((o:any)=><div className="student-outcome" key={o.id||o.outcome_id}><span>{o.subject_name}</span><strong>{o.title}</strong><div className="progress"><i style={{width:`${Math.round(Number(o.success_rate||0)*100)}%`}}/></div><small>%{Math.round(Number(o.success_rate||0)*100)} · {o.evidence_count||o.evidence||0} kanıt</small></div>)}{!developing.length&&<div className="empty">Yeterli ölçme kanıtı oluştuğunda kişisel tekrar alanların burada görünecek.</div>}</div>
  </div>
}
