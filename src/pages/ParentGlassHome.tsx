import { properName } from '../lib/personName';
import { useEffect,useState } from 'react';
import { ArrowDown,ArrowRight,ArrowUp,BarChart3,Bell,CalendarDays,UserCheck,Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api,qs } from '../api';
import { useAuth } from '../auth';
import { NibiruMark } from '../components/NibiruMark';
import './student-glass-home.css';

/**
 * Parent home in the student panel's glass look and themes: per child, the last published exam,
 * this week's exams and attendance at a glance. Uses only the parent-scoped endpoints that already
 * enforce the parent–child link (results list with studentId, weekly summary, own attendance).
 */
const fmt=(n:any,d=2)=>n==null||Number.isNaN(Number(n))?'—':Number(n).toLocaleString('tr-TR',{maximumFractionDigits:d});
function greeting(){const h=new Date().getHours();return h<12?'Günaydın':h<18?'İyi günler':'İyi akşamlar'}
const ATTENDANCE=[['PRESENT','Geldi'],['ABSENT','Gelmedi'],['LATE','Geç'],['EXCUSED','İzinli'],['MEDICAL','Raporlu']] as const;

export function ParentGlassHome(){
 const {user}=useAuth() as any;
 const [children,setChildren]=useState<any[]>([]);const[childId,setChildId]=useState('');const[error,setError]=useState('');
 const [results,setResults]=useState<any[]>([]);const[weekly,setWeekly]=useState<any>(null);const[attendance,setAttendance]=useState<any[]>([]);const[loading,setLoading]=useState(true);
 useEffect(()=>{let alive=true;Promise.all([api<any>('/api/dashboard'),api<any>('/api/school/attendance/my').catch(()=>({children:[]}))]).then(([d,a])=>{if(!alive)return;const list=d?.children||[];setChildren(list);setChildId(list[0]?.id||'');setAttendance(a?.children||[]);if(!list.length)setLoading(false)}).catch((e:any)=>alive&&(setError(e.message),setLoading(false)));return()=>{alive=false}},[]);
 useEffect(()=>{if(!childId)return;let alive=true;setLoading(true);
  Promise.all([api<any>(`/api/platform/exam-center/results${qs({studentId:childId})}`).catch(()=>({results:[]})),api<any>(`/api/parent/weekly-summary${qs({studentId:childId})}`).catch(()=>null)]).then(([r,w])=>{if(!alive)return;setResults(Array.isArray(r?.results)?r.results:[]);setWeekly(w);setLoading(false)});
  return()=>{alive=false}},[childId]);
 const child=children.find((c:any)=>c.id===childId);
 const latest=results[0],previous=results[1];
 const delta=latest&&previous&&latest.net!=null&&previous.net!=null?Number(latest.net)-Number(previous.net):null;
 const att=attendance.find((a:any)=>a.student?.id===childId);
 const summary=weekly?.summary;const developing=weekly?.developing||[];
 const firstName=String(user?.display_name||'').split(' ')[0];
 const childName=child?properName(String(child.name||'').split(' ')[0]):'';
 if(error)return <div className="alert error">{error}</div>;
 return <div className="sg-home sg-parent">
  <div className="sg-orbs" aria-hidden="true"><i/><i/><i/></div>
  <header className="sg-head">
   <div><span className="sg-muted">{greeting()}{firstName?',':''}</span><h1>{childName?`${childName} nasıl gidiyor?`:'Çocuğunuzun gelişimi'}</h1></div>
   {children.length>1&&<div className="sg-child-switch" role="group" aria-label="Çocuk seçimi">{children.map((c:any)=><button key={c.id} type="button" aria-pressed={c.id===childId} className={c.id===childId?'active':''} onClick={()=>setChildId(c.id)}>{String(c.name||'').split(' ')[0].toLocaleLowerCase('tr-TR').replace(/^./,(x:string)=>x.toLocaleUpperCase('tr-TR'))}</button>)}</div>}
  </header>
  {!children.length&&!loading?<section className="sg-card"><h2>Bağlı öğrenci yok</h2><p className="sg-muted">Bu veli hesabına henüz bir öğrenci bağlanmamış. Okulunuzdan bağlantı isteyebilirsiniz.</p></section>:<>
  <div className="sg-grid">
   <section className="sg-card sg-hero is-single" aria-labelledby="pg-last">
    <div className="sg-hero-main">
     <div className="sg-row"><span id="pg-last" className="sg-label">Son sınavı</span>{latest&&<span className="sg-muted sg-small">{latest.title}</span>}</div>
     {latest?<>
      <div className="sg-net"><strong>{fmt(latest.net)}</strong><div>{delta!=null&&<span className={`sg-chip ${delta<0?'down':''}`}>{delta<0?<ArrowDown size={14}/>:<ArrowUp size={14}/>}{fmt(Math.abs(delta))} net</span>}<span className="sg-muted sg-small">net{delta!=null?' · bir önceki sınava göre':''}</span></div></div>
      <div className="sg-stats">
       {latest.score!=null&&<div><span>Puan</span><strong>{fmt(latest.score,3)}</strong></div>}
       {latest.institution_rank!=null&&<div><span>Okul sırası</span><strong>{latest.institution_rank}{latest.institution_count?` / ${latest.institution_count}`:''}</strong></div>}
       {latest.class_rank!=null&&<div><span>Sınıf sırası</span><strong>{latest.class_rank}{latest.class_count?` / ${latest.class_count}`:''}</strong></div>}
      </div>
     </>:<p className="sg-empty">{loading?'Yükleniyor…':'Henüz yayınlanmış bir sınav sonucu yok.'}</p>}
    </div>
    <Link className="sg-link sg-hero-link" to={`/reports?studentId=${encodeURIComponent(childId)}`}>Gelişim raporunu aç <ArrowRight size={16}/></Link>
   </section>

   <section className="sg-card" aria-labelledby="pg-week">
    <div className="sg-row"><h2 id="pg-week">Son 7 gün</h2><Link className="sg-link sg-small" to="/weekly-summary">Haftalık özet</Link></div>
    {summary&&summary.exam_count>0?<>
     <div className="sg-countdown"><strong>{summary.exam_count}</strong><span>sınav</span>{summary.average_net!=null&&<em>· ortalama {fmt(summary.average_net)} net</em>}</div>
     {summary.delta_net!=null&&<p className={summary.delta_net<0?'sg-down-text':'sg-up-text'}>Önceki haftaya göre {summary.delta_net>0?'+':''}{fmt(summary.delta_net)} net</p>}
    </>:<p className="sg-muted">Bu hafta yayınlanmış bir sınav yok.</p>}
   </section>

   <section className="sg-card" aria-labelledby="pg-att">
    <div className="sg-row"><h2 id="pg-att">Devam durumu</h2><Link className="sg-link sg-small" to="/attendance">Yoklama</Link></div>
    {att&&Object.keys(att.summary||{}).length?<div className="sg-att">{ATTENDANCE.filter(([k])=>att.summary[k]).map(([k,l])=><div key={k} className={k==='ABSENT'?'warn':''}><strong>{att.summary[k]}</strong><span>{l}</span></div>)}</div>:<p className="sg-muted">Okul henüz yoklama girmedi.</p>}
   </section>

   <section className="sg-card sg-focus" aria-labelledby="pg-focus">
    <div className="sg-row"><h2 id="pg-focus">Desteklenebilecek konular</h2></div>
    {developing.slice(0,3).map((o:any)=><div className="sg-focus-item" key={o.id}>
     <span className="sg-focus-badge">{String(o.subject_name||'').slice(0,3).toLocaleUpperCase('tr-TR')}</span>
     <span className="sg-focus-text"><b>{o.title}</b><small>Bu hafta {o.evidence_count} sorudan {o.correct_count} doğru</small></span>
    </div>)}
    {!developing.length&&<p className="sg-muted">Bu hafta öne çıkan bir eksik konu yok.</p>}
   </section>
  </div>
  <nav className="sg-quick" aria-label="Kısayollar">
   <Link to="/nibiru"><NibiruMark size={22} state="active" title="Nibiru"/>Nibiru veli rehberi</Link>
   <Link to="/weekly-summary"><CalendarDays size={20}/>Haftalık özet</Link>
   <Link to="/reports"><BarChart3 size={20}/>Gelişim raporu</Link>
   <Link to="/attendance"><UserCheck size={20}/>Yoklama</Link>
   <Link to="/children"><Users size={20}/>Çocuklarım</Link>
   <Link to="/notifications"><Bell size={20}/>Bildirimler</Link>
  </nav></>}
 </div>
}
