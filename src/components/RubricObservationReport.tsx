import { useEffect, useState } from 'react';
import { api } from '../api';

export function RubricObservationReport({studentId,userId}:{studentId:string;userId:string}) {
 const [data,setData]=useState<any>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [selection,setSelection]=useState(''),[levels,setLevels]=useState<Record<string,string>>({});
 const [observedAt,setObservedAt]=useState(()=>new Date().toISOString().slice(0,10));
 const [evidenceNote,setEvidenceNote]=useState(''),[feedback,setFeedback]=useState(''),[nextStep,setNextStep]=useState('');
 const [confirmed,setConfirmed]=useState(false),[requestId,setRequestId]=useState(()=>crypto.randomUUID());
 const [withdrawId,setWithdrawId]=useState(''),[reason,setReason]=useState('');
 const base=`/api/learning-observations/students/${encodeURIComponent(studentId)}`;
 const load=async()=>setData(await api<any>(base));
 useEffect(()=>{let active=true;api<any>(base).then(r=>{if(active)setData(r)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[base,userId]);
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
 return <section className="panel" style={{marginTop:20}}><h2>Süreç ve rubrik gözlemleri</h2><p>Güncel aktif öğrenci kaydına ait öğretmen gözlemleri. Sınav doğruluk oranları ve rubrik düzeyleri ayrı kanıtlardır.</p>
  {error&&<div className="alert error">{error}</div>}{notice&&<div className="alert success">{notice}</div>}
  {!data&&!error&&<p>Gözlemler yükleniyor…</p>}
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
  {data?.hasMore&&<p>En yeni 200 gözlem gösteriliyor.</p>}
  {withdrawId&&<fieldset disabled={busy}><legend>Gözlemi geri çekme gerekçesi</legend><p>Geri çekilen gözlem karnede gösterilmez. Geçmiş kaydı korunur.</p><textarea value={reason} onChange={e=>setReason(e.target.value)} minLength={20} maxLength={1000}/><button disabled={reason.trim().length<20} onClick={()=>void withdraw()}>Gerekçeyle geri çek</button><button onClick={()=>setWithdrawId('')}>Vazgeç</button></fieldset>}
 </section>;
}
