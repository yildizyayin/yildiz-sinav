import { useEffect,useState } from 'react';
import { Database,RefreshCw } from 'lucide-react';
import { api } from '../api';

export function ScaleInfrastructure(){
 const[data,setData]=useState<any>(null);const[error,setError]=useState('');
 const load=async()=>{setError('');try{setData(await api<any>('/api/v2/scale/health'))}catch(e:any){setError(e.message)}};
 useEffect(()=>{void load()},[]);
 const labels:Record<string,string>={institutions:'Kurum',students:'Aktif Öğrenci',classes:'Sınıf',exams:'Sınav',participants:'Sınav Katılımcısı',results:'Sonuç',scanRecords:'Optik Kayıt',publishedWorksheets:'Yayınlanmış Föy',bulkJobs:'Toplu İşlem'};
 return <>
  <div className="page-head"><div><span className="eyebrow">Ölçek Altyapısı</span><h1>Platform kapasite görünümü</h1><p>D1 veri hacmini, toplu iş yükünü ve bir sonraki ölçek adımını tek ekrandan izleyin.</p></div><button className="ghost" onClick={()=>void load()}><RefreshCw size={16}/> Yenile</button></div>
  {error&&<div className="alert error">{error}</div>}
  <div className="kpi-grid">{Object.entries(data?.metrics||{}).map(([k,v])=><div className="kpi-card" key={k}><span>{labels[k]||k}</span><strong>{Number(v).toLocaleString('tr-TR')}</strong></div>)}</div>
  <div className="panel" style={{marginTop:20}}><div className="panel-head"><div><h2>Mimari durumu</h2><p>Mevcut production yaklaşımı ve sonraki büyüme sınırı.</p></div><Database/></div><div className="cards-list">{Object.entries(data?.architecture||{}).map(([k,v])=><div className="list-card" key={k}><div><strong>{k}</strong><span>{String(v)}</span></div></div>)}</div></div>
  <div className="panel"><div className="panel-head"><div><h2>Ölçek uyarıları</h2><p>Hacim eşikleri aşıldığında uzun işlemler queue/workflow katmanına taşınır.</p></div></div>{(data?.warnings||[]).length?(data.warnings||[]).map((w:string)=><div className="alert info" key={w}>{w}</div>):<div className="alert success">Mevcut veri hacmi için kritik ölçek uyarısı bulunmuyor.</div>}</div>
 </>;
}
