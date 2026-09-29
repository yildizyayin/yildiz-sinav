import { useEffect, useState } from 'react';
import { Archive, ArrowLeft, BarChart3, Copy, FileUp, MoreVertical, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import '../exam-mars.css';

export function ExamDetail(){
  const {examId=''}=useParams();
  const navigate=useNavigate();
  const [detail,setDetail]=useState<any>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [menu,setMenu]=useState(false);

  const load=async()=>{
    if(!examId)return;
    setBusy(true);setError('');
    try{setDetail(await api<any>(`/api/exam-definitions/${encodeURIComponent(examId)}`))}
    catch(e:any){setError(e.message||'Sınav detayı yüklenemedi.')}
    finally{setBusy(false)}
  };
  useEffect(()=>{void load()},[examId]);

  const exam=detail?.exam;
  const copyExam=async()=>{setBusy(true);setError('');setMenu(false);try{const r=await api<any>(`/api/exam-definitions/${encodeURIComponent(examId)}/copy`,{method:'POST'});setNotice('Sınav kopyası taslak olarak oluşturuldu.');navigate(`/exam-center/${encodeURIComponent(r.id)}`)}catch(e:any){setError(e.message)}finally{setBusy(false)}};
  const archiveExam=async()=>{if(!confirm('Bu sınav arşivlensin mi? Arşivlenen sınav aktif listelerden kaldırılır, verileri korunur.'))return;setBusy(true);setError('');setMenu(false);try{await api(`/api/exam-definitions/${encodeURIComponent(examId)}/status`,{method:'PATCH',body:JSON.stringify({status:'ARCHIVED'})});setNotice('Sınav arşivlendi.');await load()}catch(e:any){setError(e.message)}finally{setBusy(false)}};
  const deleteExam=async()=>{if(exam?.status!=='DRAFT'){setError('Sonucu veya yayını bulunan sınav doğrudan silinmez; önce arşivleyin.');setMenu(false);return}if(!confirm('Bu taslak sınav kalıcı olarak silinsin mi? Bu işlem geri alınamaz.'))return;setBusy(true);setError('');setMenu(false);try{await api(`/api/exam-definitions/${encodeURIComponent(examId)}`,{method:'DELETE'});navigate('/exam-center')}catch(e:any){setError(e.message)}finally{setBusy(false)}};

  if(!exam&&!error)return <div className="panel">Sınav detayı yükleniyor…</div>;

  return <>
    <div className="page-head exam-operation-head"><div><span className="eyebrow">SINAV MERKEZİ / SINAV DETAYI</span><h1>{exam?.title||'Sınav detayı'}</h1><p>{[exam?.publisher_name,exam?.exam_type,exam?.academic_year].filter(Boolean).join(' · ')}</p></div><div className="exam-operation-head-actions"><Link className="ghost" to="/exam-center"><ArrowLeft size={16}/> Sınavlara dön</Link><button className="ghost" onClick={()=>void load()} disabled={busy}><RefreshCw size={16}/> Yenile</button><div style={{position:'relative'}}><button className="primary" onClick={()=>setMenu(v=>!v)} aria-label="Sınav işlemleri"><MoreVertical size={18}/></button>{menu&&<div className="panel" style={{position:'absolute',right:0,top:'calc(100% + 8px)',zIndex:20,minWidth:210,padding:8,display:'grid',gap:6}}><Link className="ghost" to={`/exam-definitions?examId=${encodeURIComponent(examId)}`} onClick={()=>setMenu(false)}><Pencil size={15}/> Düzenle</Link><button className="ghost" onClick={()=>void copyExam()}><Copy size={15}/> Kopyala</button><Link className="ghost" to={`/reports?examId=${encodeURIComponent(examId)}`} onClick={()=>setMenu(false)}><BarChart3 size={15}/> Raporlar</Link><button className="ghost" onClick={()=>void archiveExam()} disabled={exam?.status==='ARCHIVED'}><Archive size={15}/> Arşivle</button><button className="ghost" onClick={()=>void deleteExam()}><Trash2 size={15}/> Sil</button></div>}</div></div></div>
    {error&&<div className="alert error">{error}</div>}{notice&&<div className="alert success">{notice}</div>}
    {exam&&<>
      <section className="panel" style={{marginBottom:18}}><div className="panel-head"><div><h2>Genel bilgiler</h2><p>Sınavın tanımı, kitapçıkları ve yayın durumu.</p></div><span className={`status ${exam.status==='ACTIVE'?'ok':exam.status==='DRAFT'?'warn':'neutral'}`}>{exam.status}</span></div><div className="kpi-grid"><div className="kpi-card"><span>Tür</span><strong>{exam.exam_type||'—'}</strong></div><div className="kpi-card"><span>Sınıf</span><strong>{exam.grade_level?`${exam.grade_level}. sınıf`:'—'}</strong></div><div className="kpi-card"><span>Kitapçık</span><strong>{(detail.booklets||[]).map((b:any)=>b.code).join(', ')||'—'}</strong></div><div className="kpi-card"><span>Soru</span><strong>{(detail.subjects||[]).reduce((n:number,s:any)=>n+Number(s.question_count||0),0)}</strong></div></div></section>
      <section className="panel" style={{marginBottom:18}}><div className="panel-head"><div><h2>Çalışma alanı</h2><p>Değerlendirme, rapor ve tanım araçlarına buradan geçin.</p></div></div><div style={{display:'flex',gap:10,flexWrap:'wrap'}}><Link className="primary" to={`/exam-center?mode=upload&examId=${encodeURIComponent(examId)}`}><FileUp size={16}/> Veri yükle / değerlendir</Link><Link className="secondary" to={`/exam-definitions?examId=${encodeURIComponent(examId)}`}><Pencil size={16}/> Sınavı düzenle</Link><Link className="secondary" to={`/reports?examId=${encodeURIComponent(examId)}`}><BarChart3 size={16}/> Raporlar</Link></div></section>
      <section className="panel"><div className="panel-head"><div><h2>Ders ve soru yapısı</h2><p>Cevap anahtarı ve değerlendirme motorunun kullandığı güncel yapı.</p></div></div><div className="table-card"><table><thead><tr><th>Ders</th><th>Soru aralığı</th><th>Soru</th><th>Şık</th><th>Yanlış götürme</th></tr></thead><tbody>{(detail.subjects||[]).map((s:any)=><tr key={s.subject_id}><td>{s.subject_name||s.subject_id}</td><td>{s.question_start||1}–{s.question_end||Number(s.question_start||1)+Number(s.question_count||0)-1}</td><td>{s.question_count}</td><td>{s.option_count||5}</td><td>{Number(s.wrong_divisor||0)>0?`${s.wrong_divisor} yanlış / 1 doğru`:'Yok'}</td></tr>)}</tbody></table></div></section>
    </>}
  </>;
}
