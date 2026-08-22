import { useEffect,useState } from 'react';
import { ArrowLeft, Building2, Globe2, MapPin, Network, Printer, School, Users } from 'lucide-react';
import { Link,useParams,useSearchParams } from 'react-router-dom';
import { api,qs } from '../api';
import { useAuth } from '../auth';

export function PublishedResult(){
 const {examId}=useParams();const [sp]=useSearchParams();const {user}=useAuth();const [data,setData]=useState<any>(null);const [error,setError]=useState('');
 useEffect(()=>{if(!examId)return;void api<any>(`/api/exam-center/results/${examId}/me${qs({studentId:user?.role==='STUDENT'?null:sp.get('studentId')})}`).then(setData).catch(e=>setError(e.message))},[examId,sp.get('studentId'),user?.role]);
 if(error)return <><div className="page-head"><div><h1>Sonuç Karnesi</h1></div></div><div className="alert error">{error}</div></>;
 if(!data)return <div className="panel empty">Sonuç hazırlanıyor…</div>;
 const r=data.rankings||{};
 return <><div className="page-head"><div><span className="eyebrow">Yayınlanmış Sonuç</span><h1>{data.exam.title}</h1><p>{[data.exam.publisher,data.exam.type,data.exam.date].filter(Boolean).join(' · ')}</p></div><div style={{display:'flex',gap:8}}><Link className="ghost" to={user?.role==='STUDENT'?'/my-results':'/reports'}><ArrowLeft size={16}/> Geri</Link><button className="primary" onClick={()=>window.print()}><Printer size={16}/> Yazdır / PDF</button></div></div>
 <div className="student-hero result-hero"><div><span>{data.label}</span><h2>{data.student.name}</h2><p>{data.student.institutionName}{data.student.className?` · ${data.student.className}`:''}</p></div><div className="result-big"><div><span>Net</span><strong>{fmt(data.result.net)}</strong></div>{data.result.score!=null&&<div><span>Puan</span><strong>{fmt(data.result.score)}</strong></div>}</div></div>
 <div className="ranking-grid"><RankCard icon={<Globe2/>} title="Türkiye Geneli" rank={r.turkey?.rank} total={r.turkey?.total}/><RankCard icon={<MapPin/>} title={r.city?.name||'İl'} rank={r.city?.rank} total={r.city?.total}/><RankCard icon={<MapPin/>} title={r.district?.name||'İlçe'} rank={r.district?.rank} total={r.district?.total}/><RankCard icon={<Network/>} title="Kurum Ağı" rank={r.organization?.rank} total={r.organization?.total}/><RankCard icon={<Building2/>} title="Kurum" rank={r.institution?.rank} total={r.institution?.total}/><RankCard icon={<School/>} title={r.grade?.gradeLevel?`${r.grade.gradeLevel}. Sınıf`:'Sınıf'} rank={r.grade?.rank} total={r.grade?.total}/><RankCard icon={<Users/>} title={r.section?.section?`${r.section.section} Şubesi`:'Şube'} rank={r.section?.rank} total={r.section?.total}/></div>
 <div className="panel"><div className="panel-head"><div><h2>Ders sonuçları</h2><p>Doğru, yanlış, boş, net ve başarı yüzdesi.</p></div></div><div className="table-card"><table><thead><tr><th>Ders</th><th>Doğru</th><th>Yanlış</th><th>Boş</th><th>Net</th><th>Başarı</th></tr></thead><tbody>{(data.subjects||[]).map((s:any)=><tr key={s.code}><td><strong>{s.subject_name}</strong></td><td>{s.correct_count}</td><td>{s.wrong_count}</td><td>{s.blank_count}</td><td><strong>{fmt(s.net)}</strong></td><td>{s.success_percent!=null?`%${Number(s.success_percent).toFixed(1)}`:'—'}</td></tr>)}</tbody></table></div></div>
 <div className="alert info">Türkiye / il / ilçe ifadeleri, bu merkezi sınava katılan öğrenciler arasındaki sıralamayı gösterir; ülke veya bölgedeki tüm öğrencileri temsil ettiği iddia edilmez.</div></>;
}
function RankCard({icon,title,rank,total}:{icon:any;title:string;rank:any;total:any}){return <div className={`rank-card ${rank&&total?'':'muted-rank'}`}><div className="rank-icon">{icon}</div><span>{title}</span>{rank&&total?<><strong>{Number(rank).toLocaleString('tr-TR')}</strong><small>/ {Number(total).toLocaleString('tr-TR')} katılımcı</small></>:<strong>—</strong>}</div>}
function fmt(v:any){return v==null?'—':Number(v).toFixed(2)}
