import {useEffect,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {api} from '../api';
import {artifactErrorText,artifactJobStatus,artifactVerificationPassed} from '../lib/result-artifact-status';
import './result-artifact-monitor.css';
function date(value?:string|null){
 if(!value)return '—';
 const parsed=new Date(value.includes('T')?value:value.replace(' ','T')+'Z');
 return Number.isNaN(parsed.getTime())?'—':new Intl.DateTimeFormat('tr-TR',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Istanbul'}).format(parsed);
}
export function ResultArtifactMonitor({administrations=[]}:{administrations?:any[]}){
 const published=administrations.filter(row=>row.status==='PUBLISHED'&&Number(row.published_snapshot_version)>0);
 const[chosen,setChosen]=useState(''),[refresh,setRefresh]=useState(0),[busy,setBusy]=useState(true),[data,setData]=useState<any>(null);
 const selected=published.find(row=>row.id===chosen)||published[0];
 const id=selected?.id||'',version=Number(selected?.published_snapshot_version||0),selectionKey=id+':'+version;
 useEffect(()=>{
  let active=true;setBusy(true);
  const base='/api/admin/result-network/administrations/'+encodeURIComponent(id);
  const reads=[api('/api/admin/result-network/artifact-queue'),id?api(base+'/prepare-artifact-job'):Promise.resolve(null),id?api(base+'/verify-artifact-job'):Promise.resolve(null)];
  void Promise.allSettled(reads).then(results=>{
   if(!active)return;
   setData({selectionKey,results});setBusy(false);
  });
  return()=>{active=false};
 },[id,version,refresh]);
 const results=data?.selectionKey===selectionKey?data.results:null;
 const result=(index:number)=>results?.[index]?.status==='fulfilled'?results[index].value:null;
 const issue=(index:number)=>results?.[index]?.status==='rejected'?artifactErrorText(results[index].reason?.code):'';
 const preparation=result(1),verification=result(2),queue=result(0);
 const prep=preparation?.jobs?.find((row:any)=>row.snapshot_version===version);
 const verified=verification?.records?.find((row:any)=>row.snapshot_version===version);
 const passed=artifactVerificationPassed(verified,version);
 const title=(adminId:string)=>administrations.find(row=>row.id===adminId)?.title||'Yayın kaydı';
 return <div className="admin-section artifact-monitor">
  <section className="panel">
   <div className="panel-head"><div><h2>Sonuç dosyaları ve denetim</h2><p>Hazırlama, bağımsız dosya denetimi ve kuyruk ilerlemesini izleyin.</p></div><button className="ghost" disabled={busy} onClick={()=>setRefresh(value=>value+1)}><RefreshCw size={16}/> {busy?'Yükleniyor':'Yenile'}</button></div>
   <label>Sonuçları yayınlanmış sınav<select value={id} onChange={event=>setChosen(event.target.value)} disabled={busy||!published.length}>{!published.length&&<option value="">Yayınlanmış sonuç yok</option>}{published.map(row=><option key={row.id} value={row.id}>{row.title} · sürüm {row.published_snapshot_version}</option>)}</select></label>
   {!id&&<div className="empty">Dosya hazırlama ve denetim durumunu görmek için yayınlanmış sonuç gerekir.</div>}
   {id&&<>
    <p>Gösterilen yayın sürümü: {version}. Bu ekran işlemleri başlatmaz veya yayını değiştirmez.</p>
    <div className="admin-kpi-grid">
     <div className="admin-kpi"><span>Hazırlama</span><strong>{prep?artifactJobStatus(prep.status,'preparation'):busy?'Yükleniyor':issue(1)?'Durum alınamadı':'Kayıt yok'}</strong><small>{prep?`${Number(prep.prepared_count||0).toLocaleString('tr-TR')} öğrenci işlendi`:issue(1)||'Bu sürüm için hazırlama kaydı yok.'}</small></div>
     <div className="admin-kpi"><span>Bağımsız denetim</span><strong>{verified?verified.status==='VERIFIED'&&!passed?'Güncel denetim gerekiyor':artifactJobStatus(verified.status,'verification'):busy?'Yükleniyor':issue(2)?'Durum alınamadı':'Kayıt yok'}</strong><small>{verified?`${Number(verified.verified_count||0).toLocaleString('tr-TR')} / ${Number(verified.expected_count||0).toLocaleString('tr-TR')} öğrenci`:issue(2)||'Bu sürüm için denetim kaydı yok.'}</small></div>
    </div>
    {prep?.last_error_code&&<p role="status">Hazırlama: {artifactErrorText(prep.last_error_code)} Yeniden deneme: {date(prep.next_attempt_at)}</p>}
    {verified?.last_error_code&&<p role="status">Denetim: {artifactErrorText(verified.last_error_code)} Yeniden deneme: {date(verified.next_attempt_at)}</p>}
    {passed?<div className="info-strip">Bu yayın sürümündeki öğrenci dosyaları bağımsız denetim turundan geçti. Tamamlanma: {date(verified.verified_at)}. Bu kayıt sürekli dosya erişimi veya eşzamanlı kullanıcı kapasitesi garantisi değildir.</div>:verified?.status==='VERIFIED'&&<div className="info-strip">Denetim kaydı güncel yayın için geçerli değil; yeniden kontrol gerekiyor.</div>}
    {preparation?.hasMore||verification?.hasMore?<p>Son 10 sürüm kaydı alındı; yalnız seçilen güncel sürüm gösteriliyor.</p>:null}
   </>}
  </section>
  <section className="panel">
   <div className="panel-head"><div><h2>Dosya kuyruğu</h2><p>Sayfa sayıları kuyruk takibidir; toplam hazır veya doğrulanmış öğrenci sayısı değildir.</p></div></div>
   {issue(0)&&<p role="status">{issue(0)}</p>}
   {queue&&<>
    <div className="info-strip">{queue.enabled?'Dosya kuyruğu etkin.':!queue.configured?'Dosya kuyruğu bağlantısı henüz tanımlı değil.':'Dosya kuyruğu henüz etkin değil.'}</div>
    <div style={{overflowX:'auto'}}><table><thead><tr><th>Yayın</th><th>Sürüm</th><th>İş</th><th>Durum</th><th>Kaydedilen sayfalar</th><th>Son kayıt</th><th>Hata</th></tr></thead><tbody>{(queue.jobs||[]).map((job:any)=><tr key={[job.kind,job.administration_id,job.snapshot_version,job.source_generation].join(':')}><td>{title(job.administration_id)}</td><td>{job.snapshot_version}</td><td>{job.kind==='PREPARE'?'Hazırlama':'Denetim'}</td><td>{artifactJobStatus(job.status,'queue')}</td><td>{Number(job.processed_pages||0).toLocaleString('tr-TR')}</td><td>{date(job.updated_at)}</td><td>{artifactErrorText(job.last_error_code)||'—'}</td></tr>)}</tbody></table></div>
    {!queue.jobs?.length&&<div className="empty">Henüz dosya kuyruğu kaydı yok.</div>}
    {queue.hasMore&&<p>İlk 100 kuyruk kaydı gösteriliyor.</p>}
   </>}
  </section>
 </div>;
}
