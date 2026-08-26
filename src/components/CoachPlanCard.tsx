import { useEffect,useState } from 'react';
import { CheckCircle2,ChevronRight,RotateCcw } from 'lucide-react';
import { api } from '../api';

type Props={plan:any};

function optionEntries(value:any):Array<[string,string]>{
 if(Array.isArray(value))return value.map((x,i)=>{const key=String.fromCharCode(65+i);if(x&&typeof x==='object')return[String(x.key||x.code||key),String(x.text||x.label||x.value||'')];return[key,String(x??'')]});
 if(value&&typeof value==='object')return Object.entries(value).map(([k,v])=>[k,String(v??'')]);
 return[];
}

export function CoachPlanCard({plan:initial}:Props){
 const[plan,setPlan]=useState(initial);const[test,setTest]=useState<any>(null);const[answers,setAnswers]=useState<Record<string,string>>({});const[busy,setBusy]=useState(false);const[error,setError]=useState('');const[notice,setNotice]=useState('');
 useEffect(()=>setPlan(initial),[initial]);
 const refresh=async()=>{const fresh=await api<any>('/api/nibiru/coach/daily-plan');if(fresh.available)setPlan(fresh)};
 const openTest=async(testId:string)=>{setBusy(true);setError('');try{const detail=await api<any>(`/api/nibiru/coach/mini-tests/${encodeURIComponent(testId)}`);setTest(detail);setAnswers(Object.fromEntries((detail.questions||[]).filter((q:any)=>q.student_answer).map((q:any)=>[q.question_id,q.student_answer])))}catch(e:any){setError(e.message||'Mini-test açılamadı.')}finally{setBusy(false)}};
 const startTest=async(item:any)=>{setBusy(true);setError('');setNotice('');try{const started=await api<any>(`/api/nibiru/coach/items/${encodeURIComponent(item.id)}/mini-test`,{method:'POST',body:'{}'});await openTest(started.testId)}catch(e:any){setError(e.message||'Mini-test başlatılamadı.')}finally{setBusy(false)}};
 const completeSimple=async(item:any)=>{setBusy(true);setError('');try{await api(`/api/nibiru/coach/items/${encodeURIComponent(item.id)}/complete`,{method:'PATCH',body:JSON.stringify({completed:true})});await refresh()}catch(e:any){setError(e.message||'Görev güncellenemedi.')}finally{setBusy(false)}};
 const submit=async()=>{if(!test?.test?.id)return;setBusy(true);setError('');setNotice('');try{const payload=await api<any>(`/api/nibiru/coach/mini-tests/${encodeURIComponent(test.test.id)}/submit`,{method:'POST',body:JSON.stringify({answers:Object.entries(answers).map(([questionId,answer])=>({questionId,answer}))})});setTest(payload.detail);setNotice(payload.result?.passed?'Kazanım doğrulandı ve tamamlandı.':'Yeniden ölçüm tamamlandı. Destek adımından sonra yeni mini-test açılacak.');await refresh()}catch(e:any){setError(e.message||'Mini-test gönderilemedi.')}finally{setBusy(false)}};
 const completeFollowup=async(action:any)=>{setBusy(true);setError('');try{await api(`/api/nibiru/coach/followups/${encodeURIComponent(action.id)}/complete`,{method:'PATCH',body:'{}'});await openTest(action.test_id||test.test.id)}catch(e:any){setError(e.message||'Destek adımı güncellenemedi.')}finally{setBusy(false)}};
 const items=plan?.items||[],progress=Math.round(Number(plan?.plan?.progress||0));
 return <div style={{marginTop:12,paddingTop:10,borderTop:'1px solid var(--border,#dbe2ea)',display:'grid',gap:10}}>
  <strong>Bugünkü kayıtlı plan · %{progress}</strong>
  {error&&<div className="alert error" style={{margin:0}}>{error}</div>}{notice&&<div className="alert success" style={{margin:0}}>{notice}</div>}
  {items.map((item:any)=>{const outcome=item.payload?.kind==='OUTCOME_PRACTICE',latest=item.latestMiniTest;return <div key={item.id} style={{display:'grid',gap:7,padding:'10px 0',borderBottom:'1px solid var(--border,#e5e7eb)'}}>
   <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}><span style={{whiteSpace:'normal',display:'inline-flex',alignItems:'center',gap:7}}>{item.completed?<CheckCircle2 size={15}/>:<span aria-hidden="true">•</span>} {item.payload?.label||'Çalışma görevi'}{item.payload?.questionTarget?` · ${item.payload.questionTarget} soru`:''}</span>
    {item.completed?<span className="status ok">Kazanım tamamlandı</span>:outcome?<button className="ghost" disabled={busy} onClick={()=>latest?.id?void openTest(latest.id):void startTest(item)}>{latest?.status==='READY'?'Mini testi aç':latest?.status==='FAILED'?'Sonucu ve desteği aç':'Mini teste başla'} <ChevronRight size={14}/></button>:<button className="ghost" disabled={busy} onClick={()=>void completeSimple(item)}>Tamamladım</button>}
   </div>
   {latest?.status==='FAILED'&&<small className="muted">Son ölçüm %{Math.round(Number(latest.scorePercent||0))}. Destek tamamlandıktan sonra yeniden ölçüm açılır.</small>}
  </div>})}
  {test&&<div style={{marginTop:4,padding:14,border:'1px solid var(--border,#dbe2ea)',borderRadius:14,background:'var(--panel,#fff)',display:'grid',gap:13}}>
   <div><strong>{test.test.subject_name} · {test.test.outcome_title}</strong><div className="muted" style={{fontSize:12,marginTop:3}}>Mini-test {test.test.cycle_no}. ölçüm · geçme sınırı %{Math.round(Number(test.test.pass_threshold||.8)*100)}</div></div>
   {(test.questions||[]).map((q:any)=><div key={q.question_id} style={{display:'grid',gap:7,paddingTop:10,borderTop:'1px solid var(--border,#e5e7eb)'}}><strong style={{fontSize:13}}>{q.sort_order}. {q.stem_text}</strong><div style={{display:'grid',gap:6}}>{optionEntries(q.options).map(([key,label])=><label key={key} style={{display:'flex',alignItems:'center',gap:8,fontWeight:500,cursor:test.test.status==='READY'?'pointer':'default'}}><input type="radio" name={`${test.test.id}_${q.question_id}`} value={key} checked={(answers[q.question_id]||q.student_answer)===key} disabled={test.test.status!=='READY'} onChange={()=>setAnswers(x=>({...x,[q.question_id]:key}))} style={{width:'auto',minHeight:0,margin:0}}/><span>{key}) {label}</span>{test.test.status!=='READY'&&q.correct_answer===key&&<span className="status ok">Doğru</span>}</label>)}</div>{test.test.status!=='READY'&&q.correct===0&&<small style={{color:'#b42318'}}>Senin cevabın: {q.student_answer||'Boş'}</small>}{test.test.status!=='READY'&&q.solution_text&&<small className="muted">Çözüm: {q.solution_text}</small>}</div>)}
   {test.test.status==='READY'?<button className="primary" disabled={busy||Object.keys(answers).length<(test.questions||[]).length} onClick={()=>void submit()}>Mini-testi gönder</button>:<div className={`alert ${test.test.status==='PASSED'?'success':'info'}`} style={{margin:0}}><strong>{test.test.status==='PASSED'?'Kazanım tamamlandı':'Yeniden çalışma gerekli'} · %{Math.round(Number(test.test.score_percent||0))}</strong></div>}
   {test.test.status==='FAILED'&&<div style={{display:'grid',gap:8}}><strong>Şimdi yapılacak destek</strong>{(test.followups||[]).map((action:any)=><div key={action.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}><span>{action.action_type==='VIDEO'?'Video: ':''}{action.title}{action.payload?.questionTarget?` · ${action.payload.questionTarget} soru`:''}</span>{action.status==='DONE'?<span className="status ok"><CheckCircle2 size={13}/> Tamamlandı</span>:<button className="ghost" disabled={busy} onClick={()=>void completeFollowup({...action,test_id:test.test.id})}>Desteği tamamladım</button>}</div>)}{(test.followups||[]).some((x:any)=>x.status==='DONE')&&<button className="secondary" disabled={busy} onClick={()=>{const item=items.find((x:any)=>x.id===test.test.assignment_item_id);if(item)void startTest(item)}}><RotateCcw size={15}/> Yeni mini-test</button>}</div>}
  </div>}
 </div>;
}
