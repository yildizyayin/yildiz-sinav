import { useEffect, useMemo, useState } from 'react';
import { FilePlus2, FileUp, RefreshCw } from 'lucide-react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { ExamCenter } from './ExamCenter';
import '../exam-mars.css';
import '../exam-workspace.css';
import './approved-exam-list.css';
import { useAuth } from '../auth';

type ExamRow = {
  id:string; title:string; exam_type:string; grade_level:number|null; academic_year:string; status:string;
  publisher_name:string|null; participant_count:number; booklet_codes:string|null; app_channel_status?:string|null;
};
// A032: every status has a Turkish label; archived exams are reachable from their own filter.
const STATUS_LABEL:Record<string,string>={DRAFT:'Taslak',ACTIVE:'Hazır',CLOSED:'Kapandı',ARCHIVED:'Arşivde'};

export function ExamCenterHub(){
  const { user } = useAuth();
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState('');
  const [params]=useSearchParams();
  const mode=params.get('mode');
  const examId=params.get('examId');
  const [rows,setRows]=useState<ExamRow[]>([]);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);

  const load=async()=>{
    setLoading(true);setError('');
    try{const r=await api<any>(`/api/platform/exam-center/catalog${status==='ARCHIVED'?'?archived=1':''}`);setRows(r.exams||[])}
    catch(e:any){setError(e.message||'Sınavlar yüklenemedi.')}
    finally{setLoading(false)}
  };
  useEffect(()=>{void load()},[status==='ARCHIVED']);
  const visible=useMemo(()=>rows.filter(r=>(!status || r.status===status) && `${r.title} ${r.publisher_name||''}`.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR'))),[rows,query,status]);

  if(mode==='upload'&&examId) return <Navigate to={`/exams/${encodeURIComponent(examId)}/evaluate`} replace/>;
  if(mode==='upload'||mode==='catalog') return <ExamCenter/>;

  return <div className="exam-workspace approved-exam-list">
    <div className="exam-center-simple-head"><div><span className="eyebrow">SINAV MERKEZİ</span><h1>Kayıtlı sınavlar</h1><p>Sınav adına tıklayın; detay, rapor ve yönetim işlemleri ayrı çalışma alanında açılsın.</p></div><div className="exam-center-simple-actions"><button className="ghost" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Yenile</button><Link className="secondary" to="/exam-center?mode=upload"><FileUp size={16}/> Sınav Yükle</Link><Link className="primary" to="/exam-definitions"><FilePlus2 size={16}/> Sınav Ekle</Link></div></div>
    {error&&<div className="alert error">{error}</div>}
    <section className="panel exam-center-simple-list">
    <div className="exam-filter-row"><label>Sınav ara<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Sınav adı veya yayınevi"/></label><label>Durum<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">Tüm durumlar</option><option value="DRAFT">Taslak</option><option value="ACTIVE">Hazır</option><option value="CLOSED">Kapandı</option><option value="ARCHIVED">Arşiv</option></select></label>{user?.role==='SUPER_ADMIN'&&<Link className="secondary" to="/exam-channels">Yayın ve kanal yönetimi</Link>}</div>
      {visible.length?<><p className="approved-exam-scroll-hint">Diğer sütunlar için tabloyu yatay kaydırabilirsiniz.</p><div className="table-card"><table><thead><tr><th>Sınav</th><th>Tür / sınıf</th><th>Katılım</th><th>Kitapçık</th><th>Durum</th><th>İşlemler</th></tr></thead><tbody>{visible.map(r=><tr key={r.id}><td><Link to={`/exam-center/${encodeURIComponent(r.id)}`} className="approved-exam-title" style={{fontWeight:800,textDecoration:'none'}}>{r.title}</Link><br/><small>{r.academic_year}{r.publisher_name?` · ${r.publisher_name}`:''}</small></td><td>{r.exam_type} · {r.grade_level?`${r.grade_level}. sınıf`:'-'}</td><td>{Number(r.participant_count||0).toLocaleString('tr-TR')}</td><td>{r.booklet_codes||'—'}</td><td><span className={`status ${r.status==='ACTIVE'?'ok':r.status==='DRAFT'?'warn':'neutral'}`}>{STATUS_LABEL[r.status]||r.status}</span>{r.status!=='DRAFT'&&r.app_channel_status&&r.app_channel_status!=='ACTIVE'&&<><br/><small className="muted">Kurumlara yayında değil</small></>}</td><td><Link className="secondary approved-exam-view" to={`/exam-center/${encodeURIComponent(r.id)}`} aria-label={`${r.title} — Görüntüle`}>Görüntüle</Link></td></tr>)}</tbody></table></div></>:<div className="empty-state"><FilePlus2/><strong>{loading ? 'Sınavlar yükleniyor…' : rows.length ? 'Aramaya uygun sınav bulunamadı' : status==='ARCHIVED' ? 'Arşivde sınav yok' : 'Henüz eklenmiş sınav yok'}</strong><span>{rows.length ? 'Arama veya durum filtresini değiştirin.' : 'Önce Sınav Ekle ile bir sınav kartı oluşturun.'}</span></div>}
    </section>
  </div>;
}
