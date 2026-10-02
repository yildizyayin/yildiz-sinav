import {useEffect,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {api} from '../api';

function date(value:string|null){
 if(!value)return '—';
 const parsed=new Date(value.includes('T')?value:value.replace(' ','T')+'Z');
 return Number.isNaN(parsed.getTime())?'—':parsed.toLocaleString('tr-TR');
}
export function ResultRetentionMonitor({administrations=[]}:{administrations?:any[]}){
 const[data,setData]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(){setBusy(true);setError('');try{setData(await api('/api/admin/result-network/retention-queue'))}catch(e:any){setError(e.message||'Temizlik durumu alınamadı.')}finally{setBusy(false)}}
 useEffect(()=>{void load()},[]);
 const title=(id:string)=>administrations.find(x=>x.id===id)?.title||id;
 return <div className="admin-section">
  <section className="panel">
   <div className="panel-head"><div><h2>Veri saklama ve temizlik</h2><p>Saklama süresi dolan sonuçların katılımcı verilerini ve özel dosyalarını izleyin.</p></div><button className="ghost" disabled={busy} onClick={()=>void load()}><RefreshCw size={16}/> {busy?'Yükleniyor':'Yenile'}</button></div>
   {error&&<p role="alert">{error}</p>}
   {data&&<>
    {data.alerts?.length>0&&<div role="alert" className="info-strip">{data.alerts.map((alert:any)=><p key={alert.code}>{alert.code==='QUEUE_BINDING_MISSING'?'Temizlik bağlantısı eksik.':alert.code==='QUEUE_JOB_ERRORS'?`${alert.count} iş hata nedeniyle tekrar denenecek.`:alert.code==='QUEUE_PROGRESS_STALLED'?`${alert.count} işte 30 dakikadır ilerleme yok.`:`${alert.count} yayında katılımcı temizliği hedef süresini aştı.`}</p>)}</div>}
    {data.policy&&<p>Katılımcı temizliği için operasyon hedefi: saklama süresinin bitişinden sonraki {data.policy.deadlineHours} saat. Bu gösterge dosya temizliğinin tamamlandığını belirtmez.</p>}
    <div className="info-strip">{data.enabled?'Temizlik kuyruğu etkin. İşler küçük parçalar halinde ilerler.':data.featureEnabled&&!data.configured?'Temizlik bağlantısı eksik. İşler henüz kuyruk üzerinden çalışmıyor.':'Temizlik kuyruğu henüz etkinleştirilmedi.'}</div>
    <div className="admin-kpi-grid">{[['Bekleyen',data.counts?.pending],['Hata alan',data.counts?.errors],['Yeniden gönderilecek',data.counts?.redispatch_due],['Turu tamamlanan',data.counts?.done]].map(([label,value])=><div className="admin-kpi" key={String(label)}><span>{label}</span><strong>{Number(value||0).toLocaleString('tr-TR')}</strong></div>)}</div>
    <div style={{overflowX:'auto'}}><table><thead><tr><th>Yayın</th><th>Temizlik</th><th>Durum</th><th>İşlenen parçalar</th><th>Son ilerleme</th><th>Hata sayısı</th></tr></thead><tbody>{data.jobs.map((job:any)=><tr key={job.kind+job.administration_id}><td>{title(job.administration_id)}</td><td>{job.kind==='COHORT_PURGE'?'Katılımcı verileri':'Sonuç dosyaları'}</td><td>{job.status==='ERROR'?'Tekrar denenecek':job.status==='DONE'?'Bu tur tamamlandı':'Bekliyor / ilerliyor'}</td><td>{Number(job.processed_pages||0).toLocaleString('tr-TR')}</td><td>{date(job.last_processed_at)}</td><td>{Number(job.failure_count||0)}</td></tr>)}</tbody></table></div>
    {!data.jobs.length&&<div className="empty">Henüz kayıtlı temizlik işi yok.</div>}
    {data.hasMore&&<p>İlk 100 kayıt gösteriliyor; hata alan işler önce listelenir.</p>}
   </>}
  </section>
 </div>;
}
