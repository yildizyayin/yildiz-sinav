import { useEffect,useMemo,useState } from 'react';
import { BookOpen,PlayCircle,Sparkles } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import './student-standard.css';

const statusLabel=(s:string)=>s==='CORRECT'?'Doğru':s==='WRONG'?'Yanlış':s==='BLANK'?'Boş':'Kontrol';

export function StudentQuestionReview(){
 const[params]=useSearchParams();const examId=params.get('examId')||'';const[data,setData]=useState<any>(null);const[error,setError]=useState('');const[support,setSupport]=useState<Record<string,any>>({});const[loading,setLoading]=useState<string|null>(null);const[filter,setFilter]=useState('ALL');
 useEffect(()=>{if(!examId){setError('Sınav seçilmedi.');return}void api<any>(`/api/student-standard/exam-review?examId=${encodeURIComponent(examId)}`).then(setData).catch((e:any)=>setError(e.message))},[examId]);
 const answers=useMemo(()=>{const all=data?.answers||[];return filter==='ALL'?all:all.filter((x:any)=>x.status===filter)},[data,filter]);
 const loadSupport=async(id:string)=>{setLoading(id);setError('');try{const r=await api<any>(`/api/student-standard/question-support?examQuestionId=${encodeURIComponent(id)}`);setSupport(x=>({...x,[id]:r}))}catch(e:any){setError(e.message)}finally{setLoading(null)}};
 return <>
  <div className="page-head"><div><span className="eyebrow">Soru bazlı öğrenme</span><h1>🎥 {data?.exam?.title||'Sorularımı İncele'}</h1><p>Doğru, yanlış ve boş soruların tamamında çözüm veya kısa konu anlatımı desteğini açabilirsin.</p></div><PlayCircle/></div>
  {error&&<div className="alert error">{error}</div>}
  <div className="review-filter">{[['ALL','Tümü'],['CORRECT','Doğru'],['WRONG','Yanlış'],['BLANK','Boş']].map(([key,label])=><button key={key} className={filter===key?'primary':'ghost'} onClick={()=>setFilter(key)}>{label}</button>)}</div>
  <div className="question-review-grid">{answers.map((a:any)=>{const s=support[a.question_id];return <div className={`question-review-card status-${String(a.status).toLowerCase()}`} key={`${a.question_id}-${a.outcome_id||''}`}><div className="question-review-head"><span>{a.subject_name} · Soru {a.global_no||a.question_no}</span><b>{statusLabel(a.status)}</b></div><h3>{a.outcome_title||a.topic||'Kazanım eşlemesi bekleniyor'}</h3><p>{[a.topic,a.subtopic].filter(Boolean).join(' · ')||'Bu soru için konu bilgisi henüz tanımlanmadı.'}</p><div className="answer-line"><span>Senin cevabın <strong>{a.answer||'Boş'}</strong></span><span>Doğru cevap <strong>{a.correct_answer||'—'}</strong></span></div>{!s?<button className="secondary" disabled={loading===a.question_id} onClick={()=>void loadSupport(a.question_id)}><Sparkles size={16}/> {loading===a.question_id?'Destek hazırlanıyor…':'Video desteğini aç'}</button>:<div className="video-actions">{s.options?.solutionVideo&&<a className="primary" href={s.options.solutionVideo.url} target="_blank" rel="noreferrer"><PlayCircle size={16}/> Video Çözümü</a>}{s.options?.topicVideo&&<a className="secondary" href={s.options.topicVideo.url} target="_blank" rel="noreferrer"><BookOpen size={16}/> {s.options.topicVideo.source==='YOUTUBE_AI'?`${Math.max(1,Math.round(Number(s.options.topicVideo.duration_seconds||60)/60))} dk · Konuyu Hatırla`:'Konu Anlatım Videosu'}</a>}{!s.options?.solutionVideo&&!s.options?.topicVideo&&<div className="muted">Bu soru için uygun kısa video bulunamadı. Nibiru yalnız eşleşen ve güvenli içerik bulduğunda öneri gösterir.</div>}{s.microLearning?.candidateCount>0&&<small className="muted">{s.microLearning.candidateCount} kısa aday arasından konuya en uygun içerik seçildi.</small>}</div>}</div>})}{data&&!answers.length&&<div className="empty">Bu filtrede soru bulunmuyor.</div>}</div>
 </>;
}
