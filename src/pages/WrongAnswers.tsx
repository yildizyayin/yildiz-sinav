import { useEffect,useMemo,useState } from 'react';
import { BookOpen,PlayCircle,RefreshCw,Target } from 'lucide-react';
import { api,qs } from '../api';

export function WrongAnswers(){
 const[rows,setRows]=useState<any[]>([]);const[exams,setExams]=useState<any[]>([]);const[examId,setExamId]=useState('');const[error,setError]=useState('');
 const load=async(id=examId)=>{setError('');try{const r=await api<any>(`/api/my-wrong-answers${qs({examId:id||null})}`);setRows(r.wrongAnswers||[]);setExams(r.exams||[])}catch(e:any){setError(e.message)}};
 useEffect(()=>{void load('')},[]);
 const grouped=useMemo(()=>{const map=new Map<string,any[]>();for(const row of rows){const key=`${row.exam_id}-${row.subject_name}`;if(!map.has(key))map.set(key,[]);map.get(key)!.push(row)}return [...map.entries()]},[rows]);
 return <><div className="page-head"><div><span className="eyebrow">Yanlış / boş soru merkezi</span><h1>Sorularım ve tekrar planım</h1><p>Yanlış veya boş bıraktığın sorudan kazanıma, çözüm videosuna ve konu tekrarına geç.</p></div><button className="ghost" onClick={()=>void load()}><RefreshCw size={16}/> Yenile</button></div>
 {error&&<div className="alert error">{error}</div>}
 <div className="panel"><div className="form-grid"><label>Sınav<select value={examId} onChange={e=>{setExamId(e.target.value);void load(e.target.value)}}><option value="">Tüm sınavlar</option>{exams.map((e:any)=><option key={e.id} value={e.id}>{e.title}{e.exam_date?` · ${e.exam_date}`:''}</option>)}</select></label></div></div>
 {grouped.map(([key,items])=><div className="panel" key={key}><div className="panel-head"><div><h2>{items[0].exam_title} · {items[0].subject_name}</h2><p>{items.length} yanlış/boş soru</p></div></div><div className="cards-list">{items.map((r:any)=><div className="list-card" key={`${r.exam_id}-${r.global_no}-${r.outcome_id||''}`} style={{alignItems:'flex-start'}}><div className="quick-icon"><Target size={18}/></div><div><strong>Soru {r.question_no} · {r.status==='BLANK'?'Boş':'Yanlış'}</strong><span>Senin cevabın: {r.answer||'—'} · Doğru cevap: {r.correct_answer||'—'}</span><span>{r.outcome_title?`${r.subject_name} · ${r.outcome_title}`:'Kazanım eşleştirmesi bekleniyor'}</span></div><div style={{display:'flex',gap:7,flexWrap:'wrap',justifyContent:'flex-end'}}>{r.solution_url&&<a className="secondary subtle" href={r.solution_url} target="_blank" rel="noreferrer"><PlayCircle size={14}/> Çözümü İzle</a>}{r.topic_url&&<a className="ghost subtle" href={r.topic_url} target="_blank" rel="noreferrer"><BookOpen size={14}/> Konuyu Tekrar Et</a>}{!r.solution_url&&!r.topic_url&&<span className="status neutral">Video bekleniyor</span>}</div></div>)}</div></div>)}
 {!rows.length&&<div className="empty">Yanlış veya boş soru bulunmuyor.</div>}</>;
}
