import { useEffect, useRef, useState } from 'react';
import { api, qs } from '../api';

export function RubricObservationReport({studentId,userId,allowHistory=false}:{studentId:string;userId:string;allowHistory?:boolean}) {
 const [history,setHistory]=useState(false),[enrollmentId,setEnrollmentId]=useState('');
 const [scopedData,setData]=useState<any>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [selection,setSelection]=useState(''),[levels,setLevels]=useState<Record<string,string>>({});
 const [observedAt,setObservedAt]=useState(()=>new Date().toISOString().slice(0,10));
 const [evidenceNote,setEvidenceNote]=useState(''),[feedback,setFeedback]=useState(''),[nextStep,setNextStep]=useState('');
 const [confirmed,setConfirmed]=useState(false),[requestId,setRequestId]=useState(()=>crypto.randomUUID());
 const [withdrawId,setWithdrawId]=useState(''),[reason,setReason]=useState('');
 const base=`/api/learning-observations/students/${encodeURIComponent(studentId)}`;
 const scope=JSON.stringify([studentId,userId,history,enrollmentId]);
 const currentScope=useRef(scope);currentScope.current=scope;const generation=useRef(0),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
 const data=scopedData?.scope===scope?scopedData.result:null;
 const path=base+qs({view:history?'history':null,enrollmentId:enrollmentId||null});
 const load=async(cursor?:string)=>{const requested=scope,attempt=++generation.current;const result=await api<any>(path+(cursor?`${path.includes('?')?'&':'?'}cursor=${encodeURIComponent(cursor)}`:''));if(mounted.current&&currentScope.current===requested&&generation.current===attempt)setData((old:any)=>({scope:requested,result:{...result,observations:cursor&&old?.scope===requested?[...new Map([...old.result.observations,...result.observations].map((x:any)=>[x.id,x])).values()]:result.observations}}))};
 useEffect(()=>{setError('');setNotice('');setSelection('');setLevels({});setWithdrawId('');void load().catch(e=>{if(mounted.current&&currentScope.current===scope)setError(e.message)})},[scope]);
 const nextPage=async()=>{if(!data?.nextCursor)return;setBusy(true);setError('');try{await load(data.nextCursor)}catch(e:any){setError(e.message)}finally{setBusy(false)}};
 const exportCsv=async()=>{
  const requested=scope;setBusy(true);setError('');
  try{
   const rows:any[]=[];let cursor:string|null=null;
   do{const page=await api<any>(path+(cursor?`${path.includes('?')?'&':'?'}cursor=${encodeURIComponent(cursor)}`:''));if(!mounted.current||currentScope.current!==requested)return;rows.push(...page.observations);if(rows.length>5000)throw new Error('Dışa aktarım 5.000 gözlem sınırını aşıyor. Bir dönem seçerek kapsamı daraltın.');cursor=page.nextCursor||null;}while(cursor);
   if(!mounted.current||currentScope.current!==requested)return;
   const cell=(value:unknown)=>{let v=String(value??'');if(/^[\s\u0000-\u001f]*[=+\-@]|^[\t\r\n]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"'};
   const output=[['Eğitim yılı','Gözlem tarihi','Rubrik','Sürüm','Kaynak türü','Öğrenme çıktısı','Süreç','Ölçüt','Gözlenen düzey','Düzey açıklaması','Gözlem kanıtı','Geri bildirim','Sonraki adım']];
   for(const obs of rows)for(const selected of obs.selections){const c=obs.snapshot.criteria.find((x:any)=>x.id===selected.criterionId),l=c?.levels.find((x:any)=>x.id===selected.levelId);output.push([obs.snapshot.academicYear,obs.observed_at,obs.snapshot.title,obs.snapshot.versionLabel,obs.snapshot.sourceKind==='OFFICIAL'?'Resmî doküman':'Öğretmen tasarımı',obs.snapshot.outcomeCode,obs.snapshot.componentCode,c?.title,l?.label,l?.description,obs.evidence_note,obs.feedback,obs.next_step]);}
   const objectUrl=URL.createObjectURL(new Blob(['\ufeff'+output.map(row=>row.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8;'}));const link=document.createElement('a');link.href=objectUrl;link.download='rubrik-gozlemleri.csv';link.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);setNotice(`${rows.length} gözlem kaynak sürümleriyle dışa aktarıldı.`);
  }catch(e:any){if(mounted.current&&currentScope.current===requested)setError(e.message)}finally{if(mounted.current&&currentScope.current===requested)setBusy(false)}
 };
 useEffect(()=>{setConfirmed(false);setRequestId(crypto.randomUUID())},[selection,levels,observedAt,evidenceNote,feedback,nextStep]);
 const writable=(data?.rubrics||[]).filter((r:any)=>r.can_observe===1);
 const rubric=writable.find((r:any)=>`${r.enrollment_id}:${r.id}`===selection);
 const publish=async()=>{
  if(!rubric||!confirmed)return;setBusy(true);setError('');setNotice('');
  try{
   await api(base,{method:'POST',body:JSON.stringify({enrollmentId:rubric.enrollment_id,rubricId:rubric.id,requestId,observedAt:`${observedAt}T00:00:00.000Z`,evidenceNote,feedback,nextStep,selections:rubric.criteria.map((c:any)=>({criterionId:c.id,levelId:levels[c.id]})),confirmedObservation:true})});
   setNotice('Gözlem yayımlandı. Karne bu kaydın rubrik sürümünü ve gözlenen düzeylerini gösterir.');setConfirmed(false);await load();
  }catch(e:any){setError(e.message)}finally{setBusy(false)}
 };
 const withdraw=async()=>{
  if(!withdrawId)return;setBusy(true);setError('');setNotice('');try{await api(`${base}/${encodeURIComponent(withdrawId)}/withdraw`,{method:'POST',body:JSON.stringify({reason})});setWithdrawId('');setReason('');setNotice('Gözlem geri çekildi; geçmiş kayıt korundu. Düzeltmeyi yeni gözlem olarak yayımlayın.');await load()}catch(e:any){setError(e.message)}finally{setBusy(false)}
 };
 return <section className="panel" style={{marginTop:20}}><h2>Süreç ve rubrik gözlemleri</h2><p>{history?'Yetkili geçmiş dönem kayıtlarına ait öğretmen gözlemleri.':'Güncel aktif öğrenci kaydına ait öğretmen gözlemleri.'} Sınav doğruluk oranları ve rubrik düzeyleri ayrı kanıtlardır.</p>
  {error&&<div className="alert error">{error}</div>}{notice&&<div className="alert success">{notice}</div>}
  {!data&&!error&&<p>Gözlemler yükleniyor…</p>}
  {(allowHistory||data?.historyAvailable||history)&&<label><input type="checkbox" checked={history} disabled={busy} onChange={e=>{setHistory(e.target.checked);setEnrollmentId('')}}/> Geçmiş dönemler dahil</label>}
  {data&&<><label>Dönem<select value={enrollmentId} disabled={busy} onChange={e=>setEnrollmentId(e.target.value)}><option value="">Yetkili tüm dönem kayıtları</option>{data.enrollments.map((e:any)=><option key={e.id} value={e.id}>{e.academic_year} · {e.class_name||'Sınıf belirtilmemiş'} · {({ACTIVE:'Aktif',LEFT:'Ayrıldı',GRADUATED:'Mezun',ARCHIVED:'Arşiv'} as Record<string,string>)[e.status]||'Geçmiş kayıt'}</option>)}</select></label><button disabled={busy||!data.observations.length} onClick={()=>void exportCsv()}>Seçili kapsamı CSV indir</button></>}
  {!!writable.length&&<fieldset disabled={busy}><legend>Gerçek gözlem kaydet</legend><label>Dönem ve rubrik<select value={selection} onChange={e=>{setSelection(e.target.value);setLevels({})}}><option value="">Seçin</option>{writable.map((r:any)=><option key={`${r.enrollment_id}:${r.id}`} value={`${r.enrollment_id}:${r.id}`}>{data.enrollments.find((x:any)=>x.id===r.enrollment_id)?.academic_year} · {r.outcome_code} · {r.title} · {r.version_label}</option>)}</select></label>
  {rubric&&<><p>{rubric.task_instructions}</p><p>{rubric.component_code} · {rubric.component_title} · {rubric.source_kind==='OFFICIAL'?'Resmî rubrik':'Öğretmen tasarımı rubrik'}</p>
   {rubric.criteria.map((c:any)=><label key={c.id}>{c.title}<p>{c.description}</p><select value={levels[c.id]||''} onChange={e=>setLevels({...levels,[c.id]:e.target.value})}><option value="">Gözlenen düzeyi seçin</option>{c.levels.map((l:any)=><option key={l.id} value={l.id}>{l.label} · {l.description}</option>)}</select></label>)}
   <div className="form-grid"><label>Gözlem tarihi<input type="date" value={observedAt} onChange={e=>setObservedAt(e.target.value)}/></label><label>Gözlenen çalışma / davranış<textarea value={evidenceNote} onChange={e=>setEvidenceNote(e.target.value)} minLength={20} maxLength={2000}/></label><label>Öğrenciye geri bildirim<textarea value={feedback} onChange={e=>setFeedback(e.target.value)} minLength={10} maxLength={2000}/></label><label>Sonraki gelişim adımı<textarea value={nextStep} onChange={e=>setNextStep(e.target.value)} minLength={10} maxLength={2000}/></label></div>
   <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> Bu kaydı gerçek gözleme dayanarak değerlendirdim; öğrenci ve yetkili kişilerle paylaşılmasını onaylıyorum.</label><button className="primary" disabled={!confirmed||rubric.criteria.some((c:any)=>!levels[c.id])} onClick={()=>void publish()}>Gözlemi yayımla</button>
  </> }</fieldset>}
  {data&&!(data.observations||[]).length&&<p>Bu kapsamda yayımlanmış gözlem yok.</p>}
  {(data?.observations||[]).map((obs:any)=><article key={obs.id} className="panel"><h3>{obs.snapshot.title} · {obs.snapshot.versionLabel}</h3><p>{obs.snapshot.academicYear} · {obs.observed_at.slice(0,10)} · {obs.snapshot.outcomeCode} · {obs.snapshot.componentCode}</p><p>{obs.snapshot.sourceKind==='OFFICIAL'?'Resmî doküman rubriği':'Öğretmen tasarımı rubrik'}</p><p>{obs.evidence_note}</p><ul>{obs.selections.map((s:any)=>{const c=obs.snapshot.criteria.find((x:any)=>x.id===s.criterionId);const l=c?.levels.find((x:any)=>x.id===s.levelId);return <li key={s.criterionId}><strong>{c?.title}: {l?.label}</strong> — {l?.description}</li>})}</ul><p><strong>Geri bildirim:</strong> {obs.feedback}</p><p><strong>Sonraki adım:</strong> {obs.next_step}</p>
   {data.canObserve&&obs.observer_id===userId&&<button disabled={busy} onClick={()=>{setWithdrawId(obs.id);setReason('')}}>Bu gözlemi geri çek</button>}
  </article>)}
  {data?.nextCursor&&<button disabled={busy} onClick={()=>void nextPage()}>Önceki gözlemleri yükle</button>}
  {withdrawId&&<fieldset disabled={busy}><legend>Gözlemi geri çekme gerekçesi</legend><p>Geri çekilen gözlem karnede gösterilmez. Geçmiş kaydı korunur.</p><textarea value={reason} onChange={e=>setReason(e.target.value)} minLength={20} maxLength={1000}/><button disabled={reason.trim().length<20} onClick={()=>void withdraw()}>Gerekçeyle geri çek</button><button onClick={()=>setWithdrawId('')}>Vazgeç</button></fieldset>}
 </section>;
}
