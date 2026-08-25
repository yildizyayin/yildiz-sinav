import { useEffect,useState } from 'react';
import { CheckCircle2, RefreshCw, Settings2, ShieldCheck, XCircle } from 'lucide-react';
import { api } from '../api';

type Check={key:string;label:string;state:'READY'|'CONFIG_REQUIRED'|'MISSING';detail:string};

export function StandardReadiness(){
 const[data,setData]=useState<any>(null);const[error,setError]=useState('');const[busy,setBusy]=useState(false);
 const load=async()=>{setBusy(true);setError('');try{setData(await api<any>('/api/standard-readiness'))}catch(e:any){setError(e.message)}finally{setBusy(false)}};
 useEffect(()=>{void load()},[]);
 return <><div className="page-head"><div><span className="eyebrow">Standard Paket · Kapanış Kontrolü</span><h1>Standard Hazırlık Denetçisi</h1><p>Yeşil = gerçek veri modeli/binding hazır. Sarı = kod hazır, dış servis yapılandırması gerekiyor. Kırmızı = çekirdek eksik.</p></div><button className="ghost" disabled={busy} onClick={()=>void load()}><RefreshCw size={16}/> Yenile</button></div>{error&&<div className="alert error">{error}</div>}
 {data&&<><div className="kpi-grid" style={{marginBottom:18}}><div className="kpi-card"><span>Toplam kontrol</span><strong>{data.summary.total}</strong></div><div className="kpi-card"><span>🟩 Hazır</span><strong>{data.summary.ready}</strong></div><div className="kpi-card"><span>🟨 Yapılandırma</span><strong>{data.summary.configRequired}</strong></div><div className="kpi-card"><span>🟥 Eksik</span><strong>{data.summary.missing}</strong></div></div>
 <div className={`alert ${data.summary.coreReady?'success':'error'}`} style={{marginBottom:16}}><ShieldCheck size={18}/><div><strong>{data.summary.coreReady?'Standard çekirdek veri modeli hazır':'Standard çekirdekte eksik var'}</strong><span>Ortam: {data.environment} · Son kontrol: {new Date(data.generatedAt).toLocaleString('tr-TR')}</span></div></div>
 <div className="cards-list">{(data.checks as Check[]).map(c=><div className="list-card" key={c.key}><div className="quick-icon">{c.state==='READY'?<CheckCircle2 size={18}/>:c.state==='CONFIG_REQUIRED'?<Settings2 size={18}/>:<XCircle size={18}/>}</div><div><strong>{c.state==='READY'?'🟩':c.state==='CONFIG_REQUIRED'?'🟨':'🟥'} {c.label}</strong><span>{c.detail}</span></div><span className={`status ${c.state==='READY'?'success':c.state==='CONFIG_REQUIRED'?'warning':'danger'}`}>{c.state==='READY'?'HAZIR':c.state==='CONFIG_REQUIRED'?'AYAR GEREKLİ':'EKSİK'}</span></div>)}</div></>}
 </>;
}
