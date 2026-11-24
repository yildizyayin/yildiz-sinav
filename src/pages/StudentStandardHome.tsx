import { useEffect,useMemo,useState } from 'react';
import { ArrowRight,ArrowDown,ArrowUp,BookOpenCheck,ChevronRight,Gamepad2,GraduationCap,Palette,PenLine,TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { useFeatures } from '../lib/useFeatures';
import { NibiruMark } from '../components/NibiruMark';
import './student-standard.css';
import './student-glass-home.css';

/**
 * Student home (owner approved the glass draft, 9 Nov 2026): one screen that answers three questions —
 * how did my last exam go, what should I do today, how far is my goal. Colours come from the panel theme
 * the institution enabled and the student picked (Standart, Kozmik, Neon, Odak); see student-glass-home.css.
 * Only published results are shown, through the same endpoints the results page uses.
 */
const fmt=(n:any,d=2)=>n==null||Number.isNaN(Number(n))?'—':Number(n).toLocaleString('tr-TR',{maximumFractionDigits:d});
function targetName(t:any){return t.target_type==='LGS_SCHOOL'?t.school_name:[t.university_name,t.program_name].filter(Boolean).join(' · ')}
function greeting(){const h=new Date().getHours();return h<12?'Günaydın':h<18?'İyi günler':'İyi akşamlar'}
function istanbulDay(d:Date){return new Date(d.getTime()+3*3600e3).toISOString().slice(0,10)}
const DAY_LABELS=['Pt','Sa','Ça','Pe','Cu','Ct','Pz'];

export function StudentStandardHome(){
 const features=useFeatures();const {user}=useAuth() as any;
 const [dashboard,setDashboard]=useState<any>(null);const[home,setHome]=useState<any>(null);const[results,setResults]=useState<any[]>([]);const[subjects,setSubjects]=useState<{now:any[];before:any[]}>({now:[],before:[]});const[error,setError]=useState('');
 useEffect(()=>{let alive=true;
  Promise.all([api<any>('/api/dashboard'),api<any>('/api/student-standard/home-context'),api<any>('/api/platform/exam-center/results').catch(()=>({results:[]}))]).then(async([d,h,r])=>{
   if(!alive)return;setDashboard(d);setHome(h);const list=Array.isArray(r?.results)?r.results:[];setResults(list);
   const detail=(row:any)=>row?api<any>(`/api/platform/exam-center/${row.id}/result`).then(x=>x?.result?.subjects||[]).catch(()=>[]):Promise.resolve([]);
   const [now,before]=await Promise.all([detail(list[0]),detail(list[1])]);if(alive)setSubjects({now,before});
  }).catch((e:any)=>alive&&setError(e.message));
  return()=>{alive=false}},[]);

 const latest=results[0];const previous=results[1];
 const delta=latest&&previous&&latest.net!=null&&previous.net!=null?Number(latest.net)-Number(previous.net):null;
 const totalQuestions=subjects.now.reduce((sum:number,s:any)=>sum+Number(s.correct_count||0)+Number(s.wrong_count||0)+Number(s.blank_count||0),0);
 const trend=useMemo(()=>results.slice(0,5).reverse().filter((r:any)=>r.net!=null),[results]);
 const trendMax=Math.max(1,...trend.map((r:any)=>Number(r.net)));
 const lessons=subjects.now.map((s:any)=>{const total=Number(s.correct_count||0)+Number(s.wrong_count||0)+Number(s.blank_count||0);const old=subjects.before.find((b:any)=>b.subject===s.subject);return{name:s.subject,net:Number(s.net||0),total,change:old?Number(s.net||0)-Number(old.net||0):null}});
 const developing=dashboard?.developing||[];const focus=developing[0];
 const targets=home?.targets||[];const primary=targets.find((x:any)=>Number(x.priority)===1)||targets[0];
 const days=home?.countdown?.days;
 const dream=(home?.professions||[])[0];
 const practiced=new Set<string>(home?.practiceDays||[]);
 const week=useMemo(()=>{const today=new Date();const dow=(today.getDay()+6)%7;return DAY_LABELS.map((label,i)=>{const d=new Date(today.getTime()+(i-dow)*864e5);const key=istanbulDay(d);return{label,key,done:practiced.has(key),future:i>dow}})},[home]);
 const streak=useMemo(()=>{let n=0;const today=new Date();for(let i=0;i<14;i++){const key=istanbulDay(new Date(today.getTime()-i*864e5));if(practiced.has(key))n++;else if(i>0)break}return n},[home]);
 const firstName=String(user?.display_name||'').split(' ')[0];
 const canPractice=features.has('QUESTION_BANK');

 if(error)return <div className="alert error">{error}</div>;
 return <div className="sg-home">
  <div className="sg-orbs" aria-hidden="true"><i/><i/><i/></div>
  <header className="sg-head">
   <div><span className="sg-muted">{greeting()}{firstName?',':''}</span><h1>{firstName||'Hoş geldin'}</h1></div>
   <div className="sg-head-actions">{streak>1&&<span className="sg-pill"><i/>{streak} gün üst üste çalıştın</span>}<Link className="sg-icon-button" to="/student-settings" aria-label="Temamı değiştir" title="Temamı değiştir"><Palette size={20}/></Link></div>
  </header>

  <div className="sg-grid">
   <section className={`sg-card sg-hero ${trend.length>1?'':'is-single'}`} aria-labelledby="sg-last-exam">
    <div className="sg-hero-main">
     <div className="sg-row"><span id="sg-last-exam" className="sg-label">Son sınavın</span>{latest&&<span className="sg-muted sg-small">{latest.title}{latest.exam_date?` · ${new Date(`${latest.exam_date}T00:00:00`).toLocaleDateString('tr-TR',{day:'numeric',month:'long'})}`:''}</span>}</div>
     {latest?<>
      <div className="sg-net"><strong>{fmt(latest.net)}</strong><div>{delta!=null&&<span className={`sg-chip ${delta<0?'down':''}`}>{delta<0?<ArrowDown size={14}/>:<ArrowUp size={14}/>}{fmt(Math.abs(delta))} net</span>}<span className="sg-muted sg-small">net{totalQuestions?` · ${totalQuestions} sorudan`:''}</span></div></div>
      <div className="sg-stats">
       {latest.score!=null&&<div><span>Puan</span><strong>{fmt(latest.score,3)}</strong></div>}
       {latest.institution_rank!=null&&<div><span>Okul sıran</span><strong>{latest.institution_rank}{latest.institution_count?` / ${latest.institution_count}`:''}</strong></div>}
       {latest.class_rank!=null&&<div><span>Sınıf sıran</span><strong>{latest.class_rank}{latest.class_count?` / ${latest.class_count}`:''}</strong></div>}
      </div>
     </>:<p className="sg-empty">Henüz yayınlanmış bir sınav sonucun yok. İlk sonucun yayınlandığında burada görünecek.</p>}
    </div>
    {trend.length>1&&<div className="sg-hero-trend">
     <span className="sg-muted sg-small sg-strong">Son {trend.length} sınavda netin</span>
     <div className="sg-bars" role="img" aria-label={`Son ${trend.length} sınavdaki netler: ${trend.map((r:any)=>fmt(r.net)).join('; ')}`}>
      {trend.map((r:any,i:number)=><div key={`${r.id}-${r.snapshot_version}`} className={i===trend.length-1?'is-last':''}><span>{fmt(r.net,1)}</span><i style={{height:`${Math.max(8,Math.round(Number(r.net)/trendMax*100))}%`}}/></div>)}
     </div>
    </div>}
    {latest&&<Link className="sg-link sg-hero-link" to="/my-results">Sonucun ayrıntısını gör <ArrowRight size={16}/></Link>}
   </section>

   <section className="sg-card sg-today" aria-labelledby="sg-today-title">
    <div className="sg-today-orb" aria-hidden="true"/>
    <span className="sg-label">Bugün senin için</span>
    {focus?<>
     <h2 id="sg-today-title">{focus.title}</h2>
     <p>{focus.subject_name} · son sınavlarda {focus.evidence_count} sorudan {focus.correct_count} doğru</p>
     <div className="sg-spacer"/>
     {canPractice?<Link className="sg-cta" to="/question-practice"><PenLine size={18}/>Soru çöz</Link>:<Link className="sg-cta" to="/nibiru">Nibiru ile çalış</Link>}
    </>:<>
     <h2 id="sg-today-title">Bugün ne çalışsam?</h2>
     <p>Sınav sonuçların geldikçe sana özel çalışma konusu burada belirecek. Şimdilik Nibiru ile plan yapabilirsin.</p>
     <div className="sg-spacer"/>
     <Link className="sg-cta" to="/nibiru">Nibiru ile planla</Link>
    </>}
   </section>

   {home?.profile&&!home.profile.academicTarget?<section className="sg-card sg-target" aria-labelledby="sg-target-title">
    <div className="sg-row"><h2 id="sg-target-title">Hayalindeki meslek</h2><Link className="sg-link sg-small" to="/academic-target">{dream?'Değiştir':'Seç'}</Link></div>
    <div className="sg-countdown"><strong className="sg-countdown-empty">{dream?dream.title:'Henüz seçmedin'}</strong></div>
    <p className="sg-muted">{dream?(dream.motivation_title||'Nibiru seni bu yolda destekler.'):'İlgi duyduğun meslekleri seç; Nibiru seni bu yolda motive etsin.'}</p>
   </section>:   <section className="sg-card sg-target" aria-labelledby="sg-target-title">
    <div className="sg-row"><h2 id="sg-target-title">Hedefin</h2><Link className="sg-link sg-small" to="/academic-target">{primary?'Değiştir':'Belirle'}</Link></div>
    {days!=null?<div className="sg-countdown"><strong>{days}</strong><span>gün kaldı</span>{home?.countdown?.label&&<em>· {home.countdown.label}</em>}</div>:<div className="sg-countdown"><strong className="sg-countdown-empty">Hedefini belirle</strong></div>}
    <p className="sg-muted">{primary?targetName(primary):'Hedef okulunu ya da bölümünü seçtiğinde geri sayım ve hedef takibi burada başlar.'}</p>
    {primary?.motivation_enabled&&primary?.motivation_label?<p className="sg-small sg-strong">{primary.motivation_label}</p>:null}
   </section>}

   {lessons.length>0&&<section className="sg-card sg-lessons" aria-labelledby="sg-lessons-title">
    <div className="sg-row"><h2 id="sg-lessons-title">Derslerin</h2><Link className="sg-link sg-small" to="/student-report">Karnem</Link></div>
    {lessons.map((l:any)=><div className="sg-lesson" key={l.name}>
     <div className="sg-row"><span className="sg-strong">{l.name}</span><span><strong>{fmt(l.net)}</strong><span className="sg-muted"> / {l.total}</span>{l.change!=null&&<b className={l.change<0?'down':'up'}> {l.change>0?'+':l.change<0?'−':''}{fmt(Math.abs(l.change))}</b>}</span></div>
     <div className="sg-track"><i style={{width:`${l.total?Math.max(0,Math.min(100,Math.round(l.net/l.total*100))):0}%`}}/></div>
    </div>)}
   </section>}

   <section className="sg-card sg-focus" aria-labelledby="sg-focus-title">
    <div className="sg-row"><h2 id="sg-focus-title">Sırada güçlendireceklerin</h2><Link className="sg-link sg-small" to="/outcomes">Tümü</Link></div>
    {developing.slice(0,3).map((o:any)=><Link className="sg-focus-item" key={o.id||o.outcome_id} to="/outcomes">
     <span className="sg-focus-badge">{String(o.subject_name||'').slice(0,3).toLocaleUpperCase('tr-TR')}</span>
     <span className="sg-focus-text"><b>{o.title}</b><small>{o.evidence_count} sorudan {o.correct_count} doğru</small></span>
     <ChevronRight size={16} aria-hidden="true"/>
    </Link>)}
    {!developing.length&&<p className="sg-muted">Birkaç sınav sonra hangi konulara biraz daha çalışman gerektiğini burada göreceksin.</p>}
   </section>

   <section className="sg-card sg-week" aria-labelledby="sg-week-title">
    <div className="sg-row"><h2 id="sg-week-title">Bu hafta</h2><span className="sg-small sg-accent2">{week.filter(d=>d.done).length?`${week.filter(d=>d.done).length} gün soru çözdün`:'Bugün ilk adımı at'}</span></div>
    <div className="sg-days">{week.map(d=><div key={d.key} className={`${d.done?'done':''} ${d.future?'future':''}`}><i aria-hidden="true"/><span>{d.label}</span></div>)}</div>
   </section>
  </div>

  <nav className="sg-quick" aria-label="Kısayollar">
   <Link to="/nibiru"><NibiruMark size={22} state="active" title="Nibiru"/>Nibiru</Link>
   {canPractice&&<Link to="/question-practice"><PenLine size={20}/>Soru çöz</Link>}
   <Link to="/my-results"><TrendingUp size={20}/>Sonuçlarım</Link>
   {features.has('ASSIGNMENTS')&&<Link to="/assignments"><BookOpenCheck size={20}/>Ödevlerim</Link>}
   <Link to="/academic-target"><GraduationCap size={20}/>Hedeflerim</Link>
   <Link to="/my-books"><BookOpenCheck size={20}/>Kitaplarım</Link>
   <Link to="/evren"><Gamepad2 size={20}/>Öğrenme Evreni</Link>
  </nav>
 </div>
}
