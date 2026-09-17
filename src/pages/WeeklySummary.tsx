import { useEffect,useState } from 'react';
import { BarChart3,RefreshCw,Target,TrendingUp } from 'lucide-react';
import { api,qs } from '../api';

export function WeeklySummary(){
 const[children,setChildren]=useState<any[]>([]);const[studentId,setStudentId]=useState('');const[data,setData]=useState<any>(null);const[error,setError]=useState('');
 const load=async(id=studentId)=>{setError('');try{const r=await api<any>(`/api/parent/weekly-summary${qs({studentId:id||null})}`);setChildren(r.children||[]);setData(r);if(!id&&r.student?.id)setStudentId(r.student.id)}catch(e:any){setError(e.message)}};
 useEffect(()=>{void load('')},[]);
 const s=data?.summary;
 return <><div className="page-head"><div><span className="eyebrow">Son 7 gün</span><h1>Haftalık veli özeti</h1><p>Çocuğunuzun son bir haftadaki sınav hareketini ve geliştirilecek alanlarını sade şekilde görün.</p></div><button className="ghost" onClick={()=>void load()}><RefreshCw size={16}/> Yenile</button></div>
 {error&&<div className="alert error">{error}</div>}
 <div className="panel"><div className="form-grid"><label>Çocuk<select value={studentId} onChange={e=>{setStudentId(e.target.value);void load(e.target.value)}}>{children.map((c:any)=><option key={c.id} value={c.id}>{c.name}{c.class_name?` · ${c.class_name}`:''}</option>)}</select></label></div></div>
 {data?.student&&<><div className="section-head"><div><h2>{data.student.name}</h2><p>{data.student.class_name||''}</p></div></div><div className="kpi-grid"><K label="Bu hafta sınav" value={s?.exam_count??0}/><K label="Ortalama net" value={fmt(s?.average_net)}/><K label="En iyi net" value={fmt(s?.best_net)}/><K label="Önceki hafta ort." value={fmt(s?.previous_average_net)}/><K label="Net değişimi" value={s?.delta_net==null?'—':`${s.delta_net>0?'+':''}${Number(s.delta_net).toFixed(2)}`}/></div>
 <div className="panel" style={{marginTop:20}}><div className="panel-head"><div><h2>Geliştirilecek kazanımlar</h2><p>Son 7 gündeki yeterli soru kanıtına göre.</p></div><Target size={20}/></div><div className="cards-list">{(data.developing||[]).map((o:any)=><div className="list-card" key={o.id}><div className="quick-icon"><TrendingUp size={18}/></div><div><strong>{o.subject_name} · {o.title}</strong><span>{o.topic||'Konu'} · %{Math.round(Number(o.success_rate||0)*100)} · {o.evidence_count} soru</span></div></div>)}{!data.developing?.length&&<div className="empty">Bu hafta yeterli kanıtla geliştirilecek kazanım oluşmadı.</div>}</div></div></>}
 {!data?.student&&<div className="empty">Bu veli hesabına bağlı aktif öğrenci bulunmuyor.</div>}</>;
}
function K({label,value}:{label:string;value:any}){return <div className="kpi-card"><BarChart3 size={18}/><span>{label}</span><strong>{value}</strong></div>}
function fmt(v:any){return v==null?'—':Number(v).toFixed(2)}
