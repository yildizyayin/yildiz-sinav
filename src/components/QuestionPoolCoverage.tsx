import {useEffect,useRef,useState} from 'react';
import {api,qs} from '../api';

type Filters={academicYear:string;gradeLevel:string;subjectId:string};
type Outcome={id:string;code:string;title:string;subjectId:string;subjectName:string;gradeLevel:number;curriculumVersionId:string;programVersion:string;approvedUniqueCount:number;reviewCount:number;draftCount:number;missingCount:number;status:string};
type Job={id:string;outcomeId:string;status:string;questionCount:number;createdAt:string;context:any;attemptCount?:number;generatedCount?:number;leaseUntil?:string;errorCode?:string};

function usePages<T>(endpoint:string,filters:Filters,field:'items'|'jobs'){
 const scope=JSON.stringify([endpoint,filters]),current=useRef(scope),generation=useRef(0);
 current.current=scope;
 const [state,setState]=useState<{scope:string;rows:T[];cursor:string|null;busy:boolean;error:string;executionEnabled?:boolean}>({scope:'',rows:[],cursor:null,busy:false,error:''});
 const loaded=state.scope===scope;
 const load=async(more=false)=>{
  const requestScope=scope,attempt=++generation.current,cursor=more&&loaded?state.cursor:null;
  setState(previous=>({scope:requestScope,rows:more&&previous.scope===requestScope?previous.rows:[],cursor:null,busy:true,error:''}));
  try{
   const params=field==='jobs'?{academicYear:filters.academicYear,limit:50,cursor}:{...filters,limit:50,cursor};
   const result=await api<any>(endpoint+qs(params));
   if(current.current!==requestScope||generation.current!==attempt)return;
   const rows=Array.isArray(result[field])?result[field] as T[]:[];
   setState(previous=>({scope:requestScope,rows:[...new Map([...(more?previous.rows:[]),...rows].map((row:any)=>[row.id,row])).values()] as T[],cursor:result.nextCursor||null,busy:false,error:'',executionEnabled:result.executionEnabled===true}));
  }catch(error:any){if(current.current===requestScope&&generation.current===attempt)setState(previous=>({...previous,busy:false,error:error.message||'Liste yüklenemedi.'}));}
 };
 useEffect(()=>{void load();return()=>{generation.current++;};},[scope]);
 return {rows:loaded?state.rows:[],cursor:loaded?state.cursor:null,busy:loaded&&state.busy,error:loaded?state.error:'',executionEnabled:loaded&&state.executionEnabled===true,load};
}

export function QuestionPoolCoverage({onDraftsReady}:{onDraftsReady?:()=>void}){
 const initial={academicYear:'2026-2027',gradeLevel:'',subjectId:''};
 const [draft,setDraft]=useState<Filters>(initial),[filters,setFilters]=useState<Filters>(initial);
 const scope=JSON.stringify(filters),current=useRef(scope);current.current=scope;
 const coverage=usePages<Outcome>('/api/question-bank-standard/coverage',filters,'items');
 const jobs=usePages<Job>('/api/question-bank-standard/generation-jobs',filters,'jobs');
 const [action,setAction]=useState({scope:'',id:'',error:'',notice:''});
 const requestKeys=useRef(new Map<string,string>()),inFlight=useRef(false);
 useEffect(()=>()=>{current.current='';},[]);
 const visibleAction=action.scope===scope?action:{id:'',error:'',notice:''};
 const create=async(outcome:Outcome)=>{
  if(inFlight.current)return;inFlight.current=true;
  const actionScope=scope,questionCount=Math.min(10,outcome.missingCount);
  const context={curriculumVersionId:outcome.curriculumVersionId,academicYear:filters.academicYear,gradeLevel:outcome.gradeLevel,subjectId:outcome.subjectId,programVersion:outcome.programVersion};
  const key=JSON.stringify([outcome.id,context,questionCount]);
  if(!requestKeys.current.has(key))requestKeys.current.set(key,crypto.randomUUID());
  setAction({scope:actionScope,id:outcome.id,error:'',notice:''});
  try{
   const result=await api<any>('/api/question-bank-standard/generation-jobs',{method:'POST',body:JSON.stringify({outcomeId:outcome.id,expectedContext:context,questionCount,requestKey:requestKeys.current.get(key)})});
   if(current.current!==actionScope)return;
   requestKeys.current.delete(key);
   setAction({scope:actionScope,id:'',error:'',notice:result.reused?'Bu kazanım için mevcut talep gösteriliyor.':'Üretim talebi kaydedildi. Henüz soru üretilmedi.'});
   await jobs.load();
  }catch(error:any){if(current.current===actionScope)setAction({scope:actionScope,id:'',error:error.message||'Talep kaydedilemedi.',notice:''});}
  finally{inFlight.current=false;setAction(previous=>previous.scope===actionScope?{...previous,id:''}:previous);}
 };
 const cancel=async(job:Job)=>{
  if(inFlight.current)return;inFlight.current=true;const actionScope=scope;
  setAction({scope:actionScope,id:job.id,error:'',notice:''});
  try{
   await api(`/api/question-bank-standard/generation-jobs/${encodeURIComponent(job.id)}/cancel`,{method:'PATCH',body:JSON.stringify({})});
   if(current.current!==actionScope)return;
   setAction({scope:actionScope,id:'',error:'',notice:'Talep iptal edildi.'});await jobs.load();
  }catch(error:any){if(current.current===actionScope)setAction({scope:actionScope,id:'',error:error.message||'Talep iptal edilemedi.',notice:''});}
  finally{inFlight.current=false;setAction(previous=>previous.scope===actionScope?{...previous,id:''}:previous);}
 };
 const run=async(job:Job)=>{
  if(inFlight.current)return;inFlight.current=true;const actionScope=scope;
  setAction({scope:actionScope,id:job.id,error:'',notice:''});
  try{
   const result=await api<any>(`/api/question-bank-standard/generation-jobs/${encodeURIComponent(job.id)}/run`,{method:'POST',body:JSON.stringify({})});
   if(current.current!==actionScope)return;
   setAction({scope:actionScope,id:'',error:'',notice:`${result.job?.generatedCount??result.generatedCount??0} taslak insan incelemesine kaydedildi. Otomatik onay verilmedi.`});
   onDraftsReady?.();await Promise.all([jobs.load(),coverage.load()]);
  }catch(error:any){if(current.current===actionScope){setAction({scope:actionScope,id:'',error:error.message||'Üretim tamamlanamadı.',notice:''});await jobs.load();}}
  finally{inFlight.current=false;setAction(previous=>previous.scope===actionScope?{...previous,id:''}:previous);}
 };
 const labels:Record<string,string>={REQUESTED:'Üretim bekliyor',RUNNING:'Üretiliyor',REVIEW_READY:'Taslaklar incelemede',FAILED:'Üretim tamamlanamadı',CANCELLED:'İptal edildi'};
 const errorLabels:Record<string,string>={GENERATION_OUTPUT_INVALID:'Soru biçimi doğrulanamadı.',GENERATION_DUPLICATE:'Tekrarlanan içerik bulundu.',GENERATION_PROVIDER_FAILED:'Model yanıtı alınamadı.',GENERATION_TIMEOUT:'Üretim süresi aşıldı.',GENERATION_CONTEXT_CHANGED:'Kazanım bağlamı değişti.',GENERATION_COMMIT_FAILED:'Taslaklar kaydedilemedi.'};
 const canRun=(job:Job)=>['REQUESTED','FAILED'].includes(job.status)||(job.status==='RUNNING'&&job.leaseUntil&&Date.parse(job.leaseUntil)<Date.now());
 const busy=coverage.busy||jobs.busy||Boolean(visibleAction.id);
 return <div className="module-stack">
  <div className="module-card">
   <div className="module-heading"><div><h2>Kazanım başına soru kapsamı</h2><p>Ortak platform havuzunda hedef: kazanım başına 10 onaylı farklı soru. Aynı metin ve seçeneklerin kopyaları bir kez sayılır.</p></div></div>
   <div className="form-grid">
    <label>Eğitim yılı<input value={draft.academicYear} onChange={event=>setDraft({...draft,academicYear:event.target.value})} placeholder="2026-2027"/></label>
    <label>Sınıf<input type="number" min="1" max="12" value={draft.gradeLevel} onChange={event=>setDraft({...draft,gradeLevel:event.target.value})} placeholder="Tüm sınıflar"/></label>
    <label>Ders kodu<input value={draft.subjectId} onChange={event=>setDraft({...draft,subjectId:event.target.value})} placeholder="Tüm dersler"/></label>
   </div>
   <button className="secondary" disabled={busy} onClick={()=>{if(JSON.stringify(draft)===scope){void coverage.load();void jobs.load();}else setFilters({...draft});}}>Kapsamı getir</button>
   <p>İncelemedeki ve taslak sorular onaylı sayıya dahil değildir. Kurumlara özel havuzlar ve öğrencinin daha önce gördüğü sorular bu genel kapsam hesabına dahil edilmez; öğrencinin yeni soru yeterliliği test başlatırken kontrol edilir.</p>
   {(coverage.error||jobs.error||visibleAction.error)&&<div className="alert error">{visibleAction.error||coverage.error||jobs.error}</div>}
   {visibleAction.notice&&<div className="alert success">{visibleAction.notice}</div>}
   {coverage.busy&&<p>Öğrenme çıktıları yükleniyor…</p>}
   {!coverage.busy&&!coverage.error&&coverage.rows.length===0&&<p>Bu kapsamda doğrulanmış aktif öğrenme çıktısı bulunamadı.</p>}
   {coverage.rows.length>0&&<div className="module-table"><table><thead><tr><th>Öğrenme çıktısı</th><th>Program</th><th>Onaylı farklı</th><th>İncelemede</th><th>Taslak</th><th>Eksik</th><th>Talep</th></tr></thead><tbody>{coverage.rows.map(outcome=><tr key={outcome.id}>
    <td><strong>{outcome.code} · {outcome.title}</strong><div>{outcome.gradeLevel}. sınıf · {outcome.subjectName||outcome.subjectId}</div></td>
    <td>{outcome.programVersion||'Sürüm belirtilmedi'}</td><td>{outcome.approvedUniqueCount} / 10</td><td>{outcome.reviewCount}</td><td>{outcome.draftCount}</td><td>{outcome.missingCount===0?'Hedef karşılandı':outcome.missingCount}</td>
    <td><button className="secondary" disabled={busy||outcome.missingCount===0||!outcome.programVersion} onClick={()=>void create(outcome)}>Talep oluştur</button></td>
   </tr>)}</tbody></table></div>}
   {coverage.cursor&&<button className="secondary" disabled={busy} onClick={()=>void coverage.load(true)}>Sonraki kazanımları getir</button>}
  </div>
  <div className="module-card"><h2>Üretim talepleri · {filters.academicYear}</h2><p>{jobs.executionEnabled?'Üretim etkin. Oluşan taslaklar insan incelemesini bekler.':'Yapay zekâ üretimi şu anda kapalı; talepler kaydedilir.'} Talep sayısı, üretilmiş veya onaylanmış soru sayısı değildir. Talep başına en fazla üç üretim denemesi yapılır.</p>
   {jobs.busy&&<p>Talepler yükleniyor…</p>}
   {!jobs.busy&&!jobs.error&&jobs.rows.length===0&&<p>Bu eğitim yılında talep bulunamadı.</p>}
   {jobs.rows.length>0&&<div className="module-table"><table><thead><tr><th>Kazanım</th><th>Kapsam</th><th>İstenen soru</th><th>Durum</th><th>Taslak / Deneme</th><th>İşlem</th></tr></thead><tbody>{jobs.rows.map(job=><tr key={job.id}>
    <td>{job.context?.outcomeCode||job.outcomeId}<div>{job.context?.outcomeTitle||''}</div></td><td>{job.context?.gradeLevel}. sınıf · {job.context?.subjectId} · {job.context?.programVersion}</td><td>{job.questionCount}</td><td>{labels[job.status]||job.status}{job.errorCode&&<div>{errorLabels[job.errorCode]||'Son deneme tamamlanamadı.'}</div>}</td><td>{job.generatedCount||0} / {job.attemptCount||0}</td><td>{jobs.executionEnabled&&canRun(job)&&<button className="secondary" disabled={busy||(job.attemptCount||0)>=3} onClick={()=>void run(job)}>Taslak üret</button>}{['REQUESTED','RUNNING','FAILED'].includes(job.status)&&<button className="secondary" disabled={busy} onClick={()=>void cancel(job)}>İptal et</button>}</td>
   </tr>)}</tbody></table></div>}
   {jobs.cursor&&<button className="secondary" disabled={busy} onClick={()=>void jobs.load(true)}>Sonraki talepleri getir</button>}
  </div>
 </div>;
}
