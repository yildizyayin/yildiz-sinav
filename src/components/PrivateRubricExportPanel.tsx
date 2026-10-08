import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {api,qs} from '../api';

export function PrivateRubricExportPanel({studentId,userId,view,enrollmentId,institutionId}:{studentId:string;userId:string;view:'current'|'history';enrollmentId:string;institutionId?:string}){
 const scope=JSON.stringify([studentId,userId,view,enrollmentId,institutionId]),current=useRef(scope),generation=useRef(0),epoch=useRef(0),mounted=useRef(false);
 const [attempt,setAttempt]=useState(0),[state,setState]=useState<any>(null),[error,setError]=useState<any>(null),[busy,setBusy]=useState(false);
 const requestId=useMemo(()=>crypto.randomUUID(),[scope,attempt]);
 const job=state?.scope===scope?state.result:null;
 const [capability,setCapability]=useState<boolean|null>(null);
 useLayoutEffect(()=>{current.current=scope;mounted.current=true;epoch.current++;generation.current++;setState(null);setError(null);setBusy(false);setCapability(null);return()=>{mounted.current=false;epoch.current++;generation.current++}},[scope]);
 const capture=()=>{const requested=scope,version=epoch.current;return()=>mounted.current&&current.current===requested&&epoch.current===version};
 useEffect(()=>{let active=true;const isCurrent=capture();api<any>('/api/private-rubric-exports'+qs({studentId,view,enrollmentId:enrollmentId||null,institutionId:institutionId||null})).then(r=>{if(active&&isCurrent()){setCapability(r.enabled);if(r.jobs?.[0])setState({scope,result:{...r.jobs[0],parts:[]}})}}).catch(e=>{if(active&&isCurrent())setError({scope,message:e.message})});return()=>{active=false}},[scope]);
 const prepare=async()=>{const requested=scope,id=++generation.current,scopeCurrent=capture();const isCurrent=()=>scopeCurrent()&&generation.current===id;setBusy(true);setError(null);try{const result=await api<any>('/api/private-rubric-exports',{method:'POST',body:JSON.stringify({studentId,view,enrollmentId,institutionId,requestId,confirmedExport:true})});if(isCurrent())setState({scope:requested,result:{...result,parts:[]}})}catch(e:any){if(isCurrent())setError({scope:requested,message:e.message})}finally{if(isCurrent())setBusy(false)}};
 const refresh=async(more=false)=>{if(!job?.jobId)return;const requested=scope,id=++generation.current,scopeCurrent=capture();const isCurrent=()=>scopeCurrent()&&generation.current===id;setBusy(true);setError(null);try{const result=await api<any>(`/api/private-rubric-exports/${encodeURIComponent(job.jobId)}`+qs({cursor:more?job.nextCursor:null}));if(isCurrent())setState({scope:requested,result:{...result,parts:more?[...job.parts,...result.parts]:result.parts}})}catch(e:any){if(isCurrent()){setState(null);setError({scope:requested,message:e.message})}}finally{if(isCurrent())setBusy(false)}};
 return <section className="panel"><h3>Büyük rubrik çıktısını arka planda hazırla</h3><p>Seçilen öğrenci ve dönem kapsamı küçük CSV bölümleri halinde hazırlanır. Sayfayı açık tutmanız gerekmez; isteğin oluşturulmasından itibaren 24 saat içinde indirilebilir.</p>
  {!job&&<button className="secondary" disabled={busy||capability!==true} onClick={()=>void prepare()}>{busy?'Kaydediliyor…':'Arka planda hazırla'}</button>}
  {capability===false&&<p>Arka plan çıktı hazırlama henüz açık değil.</p>}
  {error?.scope===scope&&<div className="alert error">{error.message}</div>}
  {job&&<><p>{({QUEUED:'Hazırlama sırasına alındı',RUNNING:'Hazırlanıyor',READY:'İndirmeye hazır',REVOKED:'Kapsam veya yetki değişti',EXPIRED:'İndirme süresi doldu',FAILED:'Hazırlanamadı'} as Record<string,string>)[job.status]||'Durum bekleniyor'} · {job.observationCount??0} gözlem · {job.partCount??0} bölüm</p><button disabled={busy} onClick={()=>void refresh()}>Durumu yenile</button><button disabled={busy} onClick={()=>{setState(null);setAttempt(attempt+1)}}>Yeni çıktı hazırla</button>
   {job.status==='READY'&&<><p>{job.message}</p><p>Son indirme: {job.expiresAt?new Date(job.expiresAt.replace(' ','T')+'Z').toLocaleString('tr-TR'):'—'}</p>{(job.parts||[]).map((p:any)=><div key={p.part_no}><a href={`/api/private-rubric-exports/${encodeURIComponent(job.jobId)}/parts/${p.part_no}/download`}>Bölüm {p.part_no+1} indir</a> · {p.observation_count} gözlem</div>)}{job.nextCursor!=null&&<button disabled={busy} onClick={()=>void refresh(true)}>Diğer bölümleri yükle</button>}</>}
  </>}
 </section>;
}
