import {useEffect,useMemo,useRef,useState} from 'react';
import {api,qs} from '../api';

type Selection={classId?:string;institutionId:string;academicYear:string;sources:string[];examIds:string[];repeatPolicy:string;fromDate:string;toDate:string};
const statusLabels:Record<string,string>={QUEUED:'Hazırlama sırasına alındı',RUNNING:'Hazırlanıyor',READY:'Rapor hazır',FAILED:'Hazırlanamadı',REVOKED:'Erişim kapsamı değişti',EXPIRED:'İndirme süresi doldu'};
const errorLabels:Record<string,string>={REPORT_SOURCE_CHANGED:'Kaynak verisi değişti. Güncel verilerle yeni rapor hazırlayın.',REPORT_EXAM_UNAVAILABLE:'Seçili sınavlardan biri bu kapsamda yayımlanmış sonuç içermiyor. Sınav seçimini kontrol edin.',REPORT_SCOPE_TOO_LARGE:'Sınıf veya kazanım kapsamı çok geniş. Seçimi daraltın.',REPORT_EVENT_TOO_LARGE:'Tek bir kanıt kaydı güvenli boyut sınırını aşıyor. İçeriği kontrol edin.',REPORT_AGGREGATE_LIMIT:'Raporun sınıf veya kazanım kapsamı çok geniş. Seçimi daraltın.',REPORT_RETRY:'Geçici bir sorun oluştu; hazırlama yeniden denenecek.'};
export function PrivateCohortReportPanel({selection,userId,onResult}:{selection:Selection;userId:string;onResult:(report:any)=>void}){
 const scope=JSON.stringify([userId,selection]),current=useRef(scope),generation=useRef(0);current.current=scope;
 const [attempt,setAttempt]=useState(0),[state,setState]=useState<any>(null),[error,setError]=useState<any>(null),[busy,setBusy]=useState(false),[enabled,setEnabled]=useState<boolean|null>(null);
 const requestId=useMemo(()=>crypto.randomUUID(),[scope,attempt]);
 const job=state?.scope===scope?state.result:null;
 useEffect(()=>{let active=true;setEnabled(null);api<any>('/api/private-cohort-reports'+qs({selection:JSON.stringify(selection)})).then(r=>{if(active){setEnabled(r.enabled);if(r.jobs?.[0])setState({scope,result:r.jobs[0]})}}).catch(e=>{if(active)setError({scope,message:e.message})});return()=>{active=false}},[scope]);
 const execute=async(mode:'prepare'|'refresh'|'open')=>{const requested=scope,id=++generation.current;setBusy(true);setError(null);try{
  const result=await api<any>(mode==='prepare'?'/api/private-cohort-reports':`/api/private-cohort-reports/${encodeURIComponent(job.jobId)}`+(mode==='open'?'/result':''),mode==='prepare'?{method:'POST',body:JSON.stringify({...selection,requestId,confirmedReport:true})}:{});
  if(current.current===requested&&generation.current===id){if(mode==='open')onResult(result);else setState({scope:requested,result});}
 }catch(e:any){if(current.current===requested&&generation.current===id)setError({scope:requested,message:e.message})}finally{if(generation.current===id)setBusy(false)}};
 return <section className="panel"><h4>{selection.classId?'Sınıf raporunu arka planda hazırla':'Büyük kurum raporunu arka planda hazırla'}</h4><p>Aynı kaynak ve tarih seçimi dönem kayıtları halinde işlenir. Sayfayı açık tutmanız gerekmez. Hazırlama sırasında veri değişirse güncel bir rapor oluşturmanız istenir.</p>
 {enabled===false&&<p>Arka plan raporu henüz açık değil.</p>}
 {!job&&<button className="secondary" disabled={busy||enabled!==true} onClick={()=>void execute('prepare')}>{busy?'Kaydediliyor…':'Arka planda hazırla'}</button>}
 {error?.scope===scope&&<div className="alert error">{error.message}</div>}
 {job&&<><p>{statusLabels[job.status]||'Durum bekleniyor'} · {job.processedEnrollments??0} dönem kaydı işlendi{job.processedEvents>0?` · ${job.processedEvents} uzun geçmiş kaydı tarandı`:""}</p>{job.errorCode&&<p>{errorLabels[job.errorCode]||'Rapor tamamlanamadı. Kapsamı kontrol ederek yeniden hazırlayın.'}</p>}
 <button disabled={busy} onClick={()=>void execute('refresh')}>Durumu yenile</button><button disabled={busy} onClick={()=>{setState(null);setAttempt(a=>a+1);setError(null)}}>Yeni rapor hazırla</button>
 {job.status==='READY'&&<><button disabled={busy} onClick={()=>void execute('open')}>Raporu aç</button><a href={`/api/private-cohort-reports/${encodeURIComponent(job.jobId)}/download`}>CSV indir</a><p>Son indirme: {job.expiresAt?new Date(job.expiresAt.includes('T')?job.expiresAt:job.expiresAt.replace(' ','T')+'Z').toLocaleString('tr-TR'):'—'}</p></>}
 </>}
 </section>;
}
