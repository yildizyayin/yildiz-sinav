import { useEffect,useState } from 'react';
import { BookOpenCheck,BrainCircuit,Download,FileCheck2,PlayCircle,X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { WorksheetAdmin } from './WorksheetAdmin';

export function Worksheets(){
 const {user}=useAuth();
 if(user?.role==='SUPER_ADMIN')return <WorksheetAdmin/>;
 return <PublishedWorksheets/>;
}

function PublishedWorksheets(){
 const[rows,setRows]=useState<any[]>([]);const[detail,setDetail]=useState<any>(null);const[loading,setLoading]=useState(false);const[error,setError]=useState('');
 useEffect(()=>{void api<any>('/api/worksheets').then(r=>setRows(r.worksheets||[])).catch((e:any)=>setError(e.message))},[]);
 const openDetail=async(id:string)=>{setLoading(true);setError('');try{setDetail(await api<any>(`/api/worksheets/${encodeURIComponent(id)}`))}catch(e:any){setError(e.message)}finally{setLoading(false)}};
 return <>
  <div className="page-head"><div><span className="eyebrow">Anunex · Föy Merkezi</span><h1>Föyler</h1><p>Sınıfına ve yetkine uygun yayınlanmış çalışma föyleri, cevap anahtarları, soru bazlı video destekleri ve Nibiru iyileştirme akışı.</p></div><BookOpenCheck/></div>
  <div className="section-head"><div><span className="eyebrow">Nibiru Recovery</span><h2>Ölç → eksiği bul → çalış → yeniden ölç</h2><p>Nibiru; sınav, kazanım ve gelişim verilerini kullanarak hangi föye ve hangi konu desteğine öncelik verilmesi gerektiğini açıklar. Doğrulanmış veri yoksa tahmin üretmez.</p></div><Link className="link-button" to="/nibiru"><BrainCircuit size={16}/> Nibiru’ya Sor</Link></div>
  {error&&<div className="alert error">{error}</div>}
  <div className="worksheet-grid">{rows.map(w=><div className="worksheet-card" key={w.id}><div className="quick-icon"><BookOpenCheck/></div><span className="pill">{w.track==='NUMERIC'?'Sayısal':'Sözel'} {w.sequence_no}</span><h3>{w.title}</h3><p>{w.grade_level?`${w.grade_level}. sınıf · `:''}{w.subjects||'Ders tanımı bekleniyor'}</p><small className="muted">{Number(w.total_questions||0)} soru · {Number(w.solution_count||0)} çözüm · {Number(w.topic_count||0)} konu desteği</small><div className="video-actions" style={{marginTop:14}}>{w.pdf_asset_id&&<a className="primary" href={`/api/worksheets/${encodeURIComponent(w.id)}/assets/${encodeURIComponent(w.pdf_asset_id)}`} target="_blank" rel="noreferrer"><Download size={16}/> Föyü Aç</a>}{w.answer_key_asset_id&&<a className="secondary" href={`/api/worksheets/${encodeURIComponent(w.id)}/assets/${encodeURIComponent(w.answer_key_asset_id)}`} target="_blank" rel="noreferrer"><FileCheck2 size={16}/> Cevap Anahtarı</a>}<button className="ghost" disabled={loading} onClick={()=>void openDetail(w.id)}><PlayCircle size={16}/> Soru Destekleri</button></div>{!w.pdf_asset_id&&<div className="muted" style={{marginTop:10}}>Föy dosyası henüz yayınlanmamış.</div>}</div>)}{!rows.length&&<div className="empty">Sınıfına uygun yayınlanmış föy bulunmuyor.</div>}</div>
  {detail&&<div className="card" style={{marginTop:20}}><div className="page-head"><div><span className="eyebrow">Föy içeriği</span><h2>{detail.worksheet?.title}</h2><p>{(detail.subjects||[]).map((x:any)=>`${x.name} · ${x.question_count} soru`).join(' • ')}</p></div><button className="ghost" onClick={()=>setDetail(null)} aria-label="Kapat"><X size={18}/></button></div><div className="question-review-grid">{(detail.questionLinks||[]).map((q:any)=><div className="question-review-card" key={`${q.subject_id}-${q.question_no}`}><div className="question-review-head"><span>{q.subject_name} · Soru {q.question_no}</span></div><h3>{q.outcome_title||'Kazanım bağlantısı'}</h3><div className="video-actions">{q.solution_url&&<a className="primary" href={q.solution_url} target="_blank" rel="noreferrer"><PlayCircle size={16}/> Video Çözümü</a>}{q.topic_url&&<a className="secondary" href={q.topic_url} target="_blank" rel="noreferrer"><BookOpenCheck size={16}/> Konu Anlatım Videosu</a>}{!q.solution_url&&!q.topic_url&&<Link className="secondary" to="/nibiru"><BrainCircuit size={16}/> Nibiru ile Konu Desteği</Link>}</div></div>)}{!(detail.questionLinks||[]).length&&<div className="empty">Bu föy için soru desteği bulunmuyor.</div>}</div></div>}
 </>;
}
