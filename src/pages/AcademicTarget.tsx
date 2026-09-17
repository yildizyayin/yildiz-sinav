import { useEffect,useMemo,useState } from 'react';
import { Bot,CheckCircle2,ExternalLink,GraduationCap,Search,Target,TrendingDown,TrendingUp } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';

function trendLabel(value:string){return value==='RISING'?'Yükseliyor':value==='FALLING'?'Dikkat gerekiyor':value==='STABLE'?'Dengeli':'Veri bekleniyor'}
function pct(v:any){return v==null?'—':`%${Number(v).toLocaleString('tr-TR',{maximumFractionDigits:3})}`}
function num(v:any){return v==null?'—':Number(v).toLocaleString('tr-TR',{maximumFractionDigits:2})}

export function AcademicTarget(){
 const{user}=useAuth();const[info,setInfo]=useState<any>(null);const[analysis,setAnalysis]=useState<any>(null);const[targets,setTargets]=useState<any[]>([]);const[q,setQ]=useState('');const[busy,setBusy]=useState(false);const[error,setError]=useState('');
 const load=async()=>{setError('');try{const [i,a]=await Promise.all([api<any>('/api/academic-targets/me'),api<any>('/api/academic-targets/analysis')]);setInfo(i);setAnalysis(a)}catch(e:any){setError(e.message)}};
 useEffect(()=>{void load()},[]);
 const type=info?.gradeLevel===8?'LGS_SCHOOL':info?.gradeLevel===12?'YKS_PROGRAM':null;
 const search=async()=>{if(!type)return;setBusy(true);setError('');try{const r=await api<any>(`/api/academic-targets/search?type=${type}&year=2026&q=${encodeURIComponent(q)}`);setTargets(r.targets||[])}catch(e:any){setError(e.message)}finally{setBusy(false)}};
 const choose=async(id:string)=>{if(!type)return;setBusy(true);try{await api('/api/academic-targets/me',{method:'POST',body:JSON.stringify({targetType:type,targetId:id})});setTargets([]);setQ('');await load()}catch(e:any){setError(e.message)}finally{setBusy(false)}};
 const gaps=useMemo(()=>analysis?.analysis?.gaps?.filter((x:any)=>x.gap>0).slice(0,6)||[],[analysis]);
 if(!user)return null;
 if(info&& !type)return <><div className="page-head"><div><span className="eyebrow">Nibiru Hedef Motoru</span><h1>🎯 Akademik Hedefim</h1><p>Hedef lise özelliği 8. sınıfta, hedef üniversite programı özelliği 12. sınıfta açılır.</p></div></div><div className="panel"><div className="empty">Aktif sınıf düzeyiniz {info.gradeLevel||'—'}. Bu modül 8. ve 12. sınıf öğrencileri için hazırlanmıştır.</div></div></>;
 return <>
  <div className="page-head"><div><span className="eyebrow">Nibiru · Resmî Veri Destekli</span><h1>🎯 {type==='LGS_SCHOOL'?'Hedef Lisem':'Üniversite Hedefim'}</h1><p>{type==='LGS_SCHOOL'?'MEB Rota Maarif / e-Okul verileriyle hedefini seç; Nibiru son sınavların ve kazanımlarınla karşılaştırsın.':'ÖSYM ve YÖK Atlas verileriyle hedef programını seç; Nibiru TYT–AYT performansını resmî yerleşme profiliyle karşılaştırsın.'}</p></div><Target/></div>
  {error&&<div className="alert error">{error}</div>}
  {analysis?.target?<>
   <div className="summary-strip" style={{marginBottom:18}}>
    <div className="kpi-card"><span>Hedef</span><strong>{analysis.target.target_type==='LGS_SCHOOL'?analysis.target.school_name:analysis.target.program_name}</strong></div>
    <div className="kpi-card"><span>{analysis.target.target_type==='LGS_SCHOOL'?'Yüzdelik':'Başarı Sırası'}</span><strong>{analysis.target.target_type==='LGS_SCHOOL'?pct(analysis.target.school_percentile):(analysis.target.success_rank?.toLocaleString('tr-TR')||'—')}</strong></div>
    <div className="kpi-card"><span>Karşılaştırılan Sınav</span><strong>{analysis.analysis?.examCount||0}</strong></div>
    <div className="kpi-card"><span>Gidişat</span><strong>{trendLabel(analysis.analysis?.trend)}</strong></div>
   </div>
   <div className="panel"><div className="panel-head"><div><h2>🤖 Nibiru hedef analizi</h2><p>Resmî hedef verisi ile yalnız sistemdeki doğrulanmış sınav sonuçların karşılaştırılır.</p></div>{analysis.analysis?.trend==='RISING'?<TrendingUp/>:<TrendingDown/>}</div>
    <div className="alert info"><Bot size={18}/><div><strong>{analysis.target.target_type==='LGS_SCHOOL'?`${analysis.target.school_city} · ${analysis.target.school_district||''}`:`${analysis.target.university_name} · ${analysis.target.score_type}`}</strong><span>{analysis.analysis?.officialNetProfile?'Resmî kaynakta net profili mevcut; ders bazlı farklar doğrudan bu profil üzerinden hesaplanıyor.':'Resmî net profili henüz veri havuzuna aktarılmamış; Nibiru net uydurmaz ve yalnız mevcut resmî göstergeleri kullanır.'}</span></div></div>
    {gaps.length>0&&<><h3>Hedef net profiline göre öncelikler</h3><div className="metrics">{gaps.map((g:any)=><div key={g.metric}><span>{g.metric}</span><strong>{num(g.current)} → {num(g.target)}</strong><small>Fark +{num(g.gap)} net</small></div>)}</div></>}
    <h3>Gelişime açık kazanımlar</h3><div className="table-card"><table><thead><tr><th>Ders</th><th>Kazanım</th><th>Kanıt</th><th>Başarı</th></tr></thead><tbody>{(analysis.analysis?.weakOutcomes||[]).map((x:any,i:number)=><tr key={i}><td>{x.subject_name}</td><td>{x.title}</td><td>{x.evidence}</td><td>{pct(x.avg_success)}</td></tr>)}</tbody></table>{!(analysis.analysis?.weakOutcomes||[]).length&&<div className="empty">Kazanım düzeyinde yeterli kanıt henüz oluşmadı.</div>}</div>
    <div className="muted" style={{marginTop:12}}>Kaynak: {analysis.analysis?.source?.kind} · {analysis.analysis?.source?.year}. Nibiru rehberlik amaçlı analiz yapar; yerleşme garantisi vermez.</div>
   </div>
  </>:<div className="panel"><div className="empty"><GraduationCap size={28}/><strong>Henüz hedef belirlemedin.</strong><span>Aşağıdan resmî hedef veri havuzunda arama yapabilirsin.</span></div></div>}
  <div className="panel"><div className="panel-head"><div><h2>{type==='LGS_SCHOOL'?'Hedef lise ara':'Üniversite / program ara'}</h2><p>2026 resmî kaynak havuzunda ara. Veri bulunmuyorsa Süper Admin resmî kaynaktan senkronize eder.</p></div><Search/></div><div style={{display:'flex',gap:8}}><input style={{flex:1}} value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void search()}} placeholder={type==='LGS_SCHOOL'?'Okul adı, il veya ilçe':'Üniversite veya bölüm'}/><button className="primary" disabled={busy} onClick={()=>void search()}>Ara</button></div>
   {!!targets.length&&<div className="table-card" style={{marginTop:14}}><table><thead><tr><th>{type==='LGS_SCHOOL'?'Okul':'Program'}</th><th>{type==='LGS_SCHOOL'?'Yüzdelik':'Sıralama'}</th><th>Puan</th><th>Kaynak</th><th></th></tr></thead><tbody>{targets.map((t:any)=><tr key={t.id}><td><strong>{type==='LGS_SCHOOL'?t.name:t.program_name}</strong><div className="muted">{type==='LGS_SCHOOL'?`${t.city} · ${t.district||''}`:`${t.university_name} · ${t.score_type}`}</div></td><td>{type==='LGS_SCHOOL'?pct(t.percentile):(t.success_rank?.toLocaleString('tr-TR')||'—')}</td><td>{num(t.base_score)}</td><td><a href={t.source_url} target="_blank" rel="noreferrer">{t.source_title} <ExternalLink size={12}/></a></td><td><button className="ghost" disabled={busy} onClick={()=>void choose(t.id)}><CheckCircle2 size={15}/> Hedefim Yap</button></td></tr>)}</tbody></table></div>}
  </div>
 </>;
}
