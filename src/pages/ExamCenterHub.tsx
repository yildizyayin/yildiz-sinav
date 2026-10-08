import { useEffect, useMemo, useState } from 'react';
import { FilePlus2, FileUp, RefreshCw } from 'lucide-react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { ExamCenter } from './ExamCenter';
import '../exam-mars.css';

type ExamRow = {
  id:string; title:string; exam_type:string; grade_level:number|null; academic_year:string; status:string;
  publisher_name:string|null; participant_count:number; booklet_codes:string|null;
};

export function ExamCenterHub(){
  const [params]=useSearchParams();
  const mode=params.get('mode');
  const examId=params.get('examId');
  const [rows,setRows]=useState<ExamRow[]>([]);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);

  const load=async()=>{
    setLoading(true);setError('');
    try{const r=await api<any>('/api/platform/exam-center/catalog');setRows(r.exams||[])}
    catch(e:any){setError(e.message||'Sınavlar yüklenemedi.')}
    finally{setLoading(false)}
  };
  useEffect(()=>{void load()},[]);
  const visible=useMemo(()=>rows.filter(r=>r.status!=='ARCHIVED'),[rows]);

  if(mode==='upload'&&examId) return <Navigate to={`/exams/${encodeURIComponent(examId)}/evaluate`} replace/>;
  if(mode==='upload'||mode==='catalog') return <ExamCenter/>;

  return <>
    <section className="exam-mars-hero"><div className="mars-stars"/><div className="mars-orbit mars-orbit-one"/><div className="mars-orbit mars-orbit-two"/><div className="mars-planet"><span className="mars-crater crater-one"/><span className="mars-crater crater-two"/><span className="mars-crater crater-three"/></div><div className="mars-hero-copy"><span className="eyebrow">MARS · SINAV MERKEZİ</span><h1>Sınav Merkezi</h1><div className="exam-center-hero-actions"><Link className="secondary" to="/exam-center?mode=upload"><FileUp size={16}/> Sınav Yükle</Link><Link className="primary" to="/exam-definitions"><FilePlus2 size={16}/> Sınav Ekle</Link></div></div><div className="mars-signal"><span/><span/><span/></div></section>
    <div className="exam-center-simple-head"><div><span className="eyebrow">SINAV MERKEZİ</span><h1>Kayıtlı sınavlar</h1><p>Sınav adına tıklayın; detay, rapor ve yönetim işlemleri ayrı çalışma alanında açılsın.</p></div><div className="exam-center-simple-actions"><button className="ghost" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Yenile</button><Link className="secondary" to="/exam-center?mode=upload"><FileUp size={16}/> Sınav Yükle</Link><Link className="primary" to="/exam-definitions"><FilePlus2 size={16}/> Sınav Ekle</Link></div></div>
    {error&&<div className="alert error">{error}</div>}
    <section className="panel exam-center-simple-list">
      {visible.length?<div className="table-card"><table><thead><tr><th>Sınav</th><th>Tür / sınıf</th><th>Katılım</th><th>Kitapçık</th><th>Durum</th></tr></thead><tbody>{visible.map(r=><tr key={r.id}><td><Link to={`/exam-center/${encodeURIComponent(r.id)}`} style={{fontWeight:800,textDecoration:'none'}}>{r.title}</Link><br/><small>{r.academic_year}{r.publisher_name?` · ${r.publisher_name}`:''}</small></td><td>{r.exam_type} · {r.grade_level?`${r.grade_level}. sınıf`:'-'}</td><td>{Number(r.participant_count||0).toLocaleString('tr-TR')}</td><td>{r.booklet_codes||'—'}</td><td><span className={`status ${r.status==='ACTIVE'?'ok':r.status==='DRAFT'?'warn':'neutral'}`}>{r.status==='DRAFT'?'Taslak':r.status==='ACTIVE'?'Hazır':r.status}</span></td></tr>)}</tbody></table></div>:<div className="empty-state"><FilePlus2/><strong>Henüz eklenmiş sınav yok</strong><span>Önce Sınav Ekle ile bir sınav kartı oluşturun.</span></div>}
    </section>
  </>;
}
