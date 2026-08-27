import { useEffect,useState } from 'react';
import { Activity, Database, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '../api';

export function ScaleInfrastructure(){
 const[data,setData]=useState<any>(null);const[error,setError]=useState('');
 const load=async()=>{setError('');try{setData(await api<any>('/api/v2/scale/health'))}catch(e:any){setError(e.message)}};
 useEffect(()=>{void load()},[]);
 const labels:Record<string,string>={institutions:'Kurum',students:'Aktif Öğrenci',classes:'Sınıf',exams:'Sınav',participants:'Sınav Katılımcısı',results:'Sonuç',scanRecords:'Optik Kayıt',publishedWorksheets:'Yayınlanmış Föy',bulkJobs:'Toplu İşlem',intelligenceProfiles:'Student Intelligence Profili',intelligenceBacklog:'6+ Saat Eski/Eksik Profil',pendingScanBatches:'Bekleyen Optik Batch',activeSessions:'Aktif Oturum'};
 const statusClass=(status:string)=>status==='PASS'?'ok':status==='WARN'||status==='PENDING'?'warn':'ok';
 return <>
  <div className="page-head"><div><span className="eyebrow">Anunex · Ölçek Altyapısı</span><h1>100.000 öğrenciye hazırlık görünümü</h1><p>D1 veri hacmini, uzun işlem darboğazlarını, Student Intelligence yenileme kuyruğunu ve staging kapasite kabulünü tek ekrandan izleyin.</p></div><button className="ghost" onClick={()=>void load()}><RefreshCw size={16}/> Yenile</button></div>
  {error&&<div className="alert error">{error}</div>}
  <div className="kpi-grid">{Object.entries(data?.metrics||{}).map(([k,v])=><div className="kpi-card" key={k}><span>{labels[k]||k}</span><strong>{Number(v).toLocaleString('tr-TR')}</strong></div>)}</div>

  <div className="panel" style={{marginTop:20}}>
   <div className="panel-head"><div><h2>Release readiness</h2><p>“100.000 hazır” kararı tahminle değil ölçülen ve doğrulanan maddelerle verilir.</p></div><ShieldCheck/></div>
   <div className="cards-list">{(data?.readiness||[]).map((item:any)=><div className="list-card" key={item.key}><div><strong>{item.label}</strong><span>{item.detail}</span></div><span className={`status ${statusClass(item.status)}`}>{item.status}</span></div>)}</div>
  </div>

  <div className="panel">
   <div className="panel-head"><div><h2>Student Intelligence yenileme</h2><p>Profil erişimde anlık yenilenir; cron düşük yükte stale profilleri temizler. Büyük backlog oluşursa Queue/Workflow zorunlu hale gelir.</p></div><Activity/></div>
   <div className="cards-list">
    <div className="list-card"><div><strong>Stale eşiği</strong><span>{data?.profileRefresh?.staleAfterHours??6} saat</span></div></div>
    <div className="list-card"><div><strong>Cron batch</strong><span>{data?.profileRefresh?.scheduledBatchSize??25} profil / {data?.profileRefresh?.cron||'—'}</span></div></div>
    <div className="list-card"><div><strong>En eski profil</strong><span>{data?.profileRefresh?.oldestRefreshAt?new Date(data.profileRefresh.oldestRefreshAt).toLocaleString('tr-TR'):'Henüz profil yok'}</span></div></div>
   </div>
  </div>

  <div className="panel"><div className="panel-head"><div><h2>Mimari durumu</h2><p>Mevcut çalışma biçimi ve ölçüme bağlı sonraki büyüme adımı.</p></div><Database/></div><div className="cards-list">{Object.entries(data?.architecture||{}).map(([k,v])=><div className="list-card" key={k}><div><strong>{k}</strong><span>{String(v)}</span></div></div>)}</div></div>
  <div className="panel"><div className="panel-head"><div><h2>Ölçek uyarıları</h2><p>Uyarı yokluğu tek başına 100.000 öğrenci kabulü değildir; staging benchmark maddesi PASS olmalıdır.</p></div></div>{(data?.warnings||[]).length?(data.warnings||[]).map((w:string)=><div className="alert info" key={w}>{w}</div>):<div className="alert success">Mevcut veri hacmi için kritik runtime uyarısı bulunmuyor.</div>}</div>
 </>;
}
