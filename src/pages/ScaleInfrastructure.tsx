import { useEffect,useState } from 'react';
import { Database,Play,RefreshCw } from 'lucide-react';
import { api } from '../api';

export function ScaleInfrastructure(){
 const[data,setData]=useState<any>(null);const[tests,setTests]=useState<any>(null);const[error,setError]=useState('');const[busy,setBusy]=useState(false);
 const load=async()=>{setError('');try{const[h,t]=await Promise.all([api<any>('/api/v2/scale/health'),api<any>('/api/admin/capacity-tests')]);setData(h);setTests(t)}catch(e:any){setError(e.message)}};
 const start=async()=>{if(!window.confirm('Staging üzerinde 100.000 izole sentetik kayıt ve 1.000 Queue işi oluşturulsun mu?'))return;setBusy(true);setError('');try{await api('/api/admin/capacity-tests',{method:'POST',body:JSON.stringify({confirmation:'RUN_100K_STAGING'})});await load()}catch(e:any){setError(e.message)}finally{setBusy(false)}};
 useEffect(()=>{void load()},[]);
 const labels:Record<string,string>={institutions:'Kurum',students:'Aktif Öğrenci',classes:'Sınıf',exams:'Sınav',participants:'Sınav Katılımcısı',results:'Sonuç',scanRecords:'Optik Kayıt',publishedWorksheets:'Yayınlanmış Föy',bulkJobs:'Toplu İşlem'};
 return <>
  <div className="page-head"><div><span className="eyebrow">Ölçek Altyapısı</span><h1>Platform kapasite görünümü</h1><p>D1 veri hacmini, toplu iş yükünü ve bir sonraki ölçek adımını tek ekrandan izleyin.</p></div><div style={{display:'flex',gap:10}}><button className="primary" disabled={busy||!tests?.queueConfigured||tests?.environment!=='staging'} onClick={()=>void start()}><Play size={16}/> 100.000 Staging Testi</button><button className="ghost" onClick={()=>void load()}><RefreshCw size={16}/> Yenile</button></div></div>
  {error&&<div className="alert error">{error}</div>}
  {!tests?.queueConfigured&&<div className="alert info">SCALE_QUEUE henüz Cloudflare hesabında oluşturulup bağlanmadığı için canlı test başlatılamaz.</div>}
  <div className="kpi-grid">{Object.entries(data?.metrics||{}).map(([k,v])=><div className="kpi-card" key={k}><span>{labels[k]||k}</span><strong>{Number(v).toLocaleString('tr-TR')}</strong></div>)}</div>
  <div className="panel" style={{marginTop:20}}><div className="panel-head"><div><h2>Mimari durumu</h2><p>Mevcut production yaklaşımı ve sonraki büyüme sınırı.</p></div><Database/></div><div className="cards-list">{Object.entries(data?.architecture||{}).map(([k,v])=><div className="list-card" key={k}><div><strong>{k}</strong><span>{String(v)}</span></div></div>)}</div></div>
  <div className="panel"><div className="panel-head"><div><h2>Ölçek uyarıları</h2><p>Hacim eşikleri aşıldığında uzun işlemler queue/workflow katmanına taşınır.</p></div></div>{(data?.warnings||[]).length?(data.warnings||[]).map((w:string)=><div className="alert info" key={w}>{w}</div>):<div className="alert success">Mevcut veri hacmi için kritik ölçek uyarısı bulunmuyor.</div>}</div>
  <div className="panel"><div className="panel-head"><div><h2>100.000 öğrenci test defteri</h2><p>Test verisi gerçek öğrenci tablolarından tamamen ayrıdır ve yalnız staging ortamında üretilir.</p></div></div><div className="cards-list">{(tests?.runs||[]).map((r:any)=><div className="list-card" key={r.id}><div><strong>{Number(r.target_count).toLocaleString('tr-TR')} kayıt · {r.status}</strong><span>{Number(r.processed_count).toLocaleString('tr-TR')} işlendi · {r.completed_chunks}/{r.total_chunks} parça · {r.started_at}</span>{r.last_error&&<span>{r.last_error}</span>}</div></div>)}{!(tests?.runs||[]).length&&<div className="empty">Henüz kaydedilmiş kapasite koşusu yok.</div>}</div></div>
 </>;
}
