import { useEffect,useState } from 'react';
import { CheckCircle2,ExternalLink,GraduationCap,Search,Target,Trash2 } from 'lucide-react';
import { api } from '../api';
import './student-standard.css';

function num(v:any){return v==null?'—':Number(v).toLocaleString('tr-TR',{maximumFractionDigits:2})}
function pct(v:any){return v==null?'—':`%${Number(v).toLocaleString('tr-TR',{maximumFractionDigits:3})}`}
function label(t:any){return t.target_type==='LGS_SCHOOL'?t.school_name:`${t.university_name} · ${t.program_name}`}

export function StudentTargetsV2(){
 const [info,setInfo]=useState<any>(null);const[results,setResults]=useState<any[]>([]);const[q,setQ]=useState('');const[busy,setBusy]=useState(false);const[error,setError]=useState('');const[selectedPriority,setSelectedPriority]=useState(1);
 const load=async()=>{try{setInfo(await api<any>('/api/student-standard/targets'))}catch(e:any){setError(e.message)}};
 useEffect(()=>{void load()},[]);
 const grade=Number(info?.gradeLevel||0);const isYks=grade===12||info?.enrollmentStatus==='GRADUATED';const type=isYks?'YKS_PROGRAM':grade===8?'LGS_SCHOOL':null;
 const search=async()=>{if(!type||!q.trim())return;setBusy(true);setError('');try{const r=await api<any>(`/api/academic-targets/search?type=${type}&year=2026&q=${encodeURIComponent(q.trim())}`);setResults(r.targets||[])}catch(e:any){setError(e.message)}finally{setBusy(false)}};
 const choose=async(targetId:string)=>{if(!type)return;setBusy(true);setError('');try{await api('/api/student-standard/targets',{method:'POST',body:JSON.stringify({targetType:type,targetId,priority:isYks?selectedPriority:1})});setResults([]);setQ('');await load()}catch(e:any){setError(e.message)}finally{setBusy(false)}};
 const remove=async(id:string)=>{setBusy(true);try{await api(`/api/student-standard/targets/${id}`,{method:'DELETE'});await load()}catch(e:any){setError(e.message)}finally{setBusy(false)}};
 const active=info?.targets||[];
 if(info&&!type)return <><div className="page-head"><div><span className="eyebrow">Hedef motoru</span><h1>🎯 Akademik Hedeflerim</h1><p>LGS hedefi 8. sınıfta; YKS üniversite + bölüm hedefleri 12. sınıf ve mezun öğrencilerde açılır.</p></div></div><div className="panel"><div className="empty">Bu sınıf düzeyinde hedef seçim alanı henüz aktif değil.</div></div></>;
 return <>
  <div className="page-head"><div><span className="eyebrow">Nibiru · Hedef yolculuğu</span><h1>{isYks?'🎓 3 Üniversite Hedefim':'🎯 Hedef Lisem'}</h1><p>{isYks?'En fazla üç üniversite + bölüm seç. 1. hedef ana rotandır; diğerleri alternatif rotalar olarak izlenir.':'Hedef liseni seç; Nibiru gelişimini bu hedefle karşılaştırsın.'}</p></div><Target/></div>
  {error&&<div className="alert error">{error}</div>}
  <div className={`target-slot-grid ${isYks?'three':''}`}>
   {Array.from({length:isYks?3:1},(_,i)=>i+1).map(priority=>{const t=active.find((x:any)=>Number(x.priority)===priority);return <div className={`target-slot ${priority===1?'primary':''}`} key={priority}><span>{priority}. Hedef</span>{t?<><h3>{label(t)}</h3><p>{t.target_type==='LGS_SCHOOL'?`${t.school_city||''} ${t.school_district||''}`:`${t.score_type||''} · Başarı sırası ${t.success_rank?.toLocaleString('tr-TR')||'—'}`}</p>{t.motivation_enabled&&t.motivation_label&&<div className="target-motivation">✨ {t.motivation_label}</div>}<button className="ghost" disabled={busy} onClick={()=>void remove(t.id)}><Trash2 size={15}/> Hedefi kaldır</button></>:<><GraduationCap size={30}/><h3>Hedef bekliyor</h3><p>Aşağıdan arayıp bu sıraya ekleyebilirsin.</p><button className={selectedPriority===priority?'primary':'ghost'} onClick={()=>setSelectedPriority(priority)}>Bu sıraya hedef seç</button></>}</div>})}
  </div>
  <div className="panel"><div className="panel-head"><div><h2>{isYks?'Üniversite / bölüm ara':'Lise ara'}</h2><p>Resmî hedef veri havuzunda ara ve {isYks?`${selectedPriority}. hedef`:'hedef'} olarak kaydet.</p></div><Search/></div>
   {isYks&&<div className="priority-picker">{[1,2,3].map(x=><button key={x} className={selectedPriority===x?'primary':'ghost'} onClick={()=>setSelectedPriority(x)}>{x}. hedef</button>)}</div>}
   <div style={{display:'flex',gap:8,marginTop:12}}><input style={{flex:1}} value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void search()}} placeholder={isYks?'Örn. Cerrahpaşa Tıp, Boğaziçi Bilgisayar':'Okul adı, il veya ilçe'}/><button className="primary" disabled={busy||!q.trim()} onClick={()=>void search()}>Ara</button></div>
   {!!results.length&&<div className="table-card" style={{marginTop:14}}><table><thead><tr><th>{isYks?'Program':'Okul'}</th><th>{isYks?'Sıralama':'Yüzdelik'}</th><th>Puan</th><th>Kaynak</th><th></th></tr></thead><tbody>{results.map((t:any)=><tr key={t.id}><td><strong>{isYks?t.program_name:t.name}</strong><div className="muted">{isYks?`${t.university_name} · ${t.score_type}`:`${t.city} · ${t.district||''}`}</div></td><td>{isYks?(t.success_rank?.toLocaleString('tr-TR')||'—'):pct(t.percentile)}</td><td>{num(t.base_score)}</td><td>{t.source_url?<a href={t.source_url} target="_blank" rel="noreferrer">{t.source_title} <ExternalLink size={12}/></a>:'—'}</td><td><button className="ghost" disabled={busy} onClick={()=>void choose(t.id)}><CheckCircle2 size={15}/> {isYks?`${selectedPriority}. hedef yap`:'Hedefim Yap'}</button></td></tr>)}</tbody></table></div>}
  </div>
 </>;
}
