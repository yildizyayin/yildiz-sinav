import { useEffect,useState } from 'react';
import { CheckCircle2, RefreshCw, Settings2, ShieldCheck, XCircle } from 'lucide-react';
import { api } from '../api';

type Check={key:string;label:string;state:'READY'|'CONFIG_REQUIRED'|'MISSING';detail:string};
type Operational={key:string;label:string;state:'READY'|'SETUP_REQUIRED';value:number;detail:string;blocking:boolean};

export function StandardReadiness(){
 const[data,setData]=useState<any>(null);const[error,setError]=useState('');const[busy,setBusy]=useState(false);
 const load=async()=>{setBusy(true);setError('');try{setData(await api<any>('/api/standard-readiness'))}catch(e:any){setError(e.message)}finally{setBusy(false)}};
 useEffect(()=>{void load()},[]);
 return <><div className="page-head"><div><span className="eyebrow">Standard Paket · Kapanış Kontrolü</span><h1>Standard Hazırlık Denetçisi</h1><p>Önce kod/veri modeli, sonra gerçek operasyon verisi kontrol edilir. Böylece yalnız tablo var diye “hazır” sayılmaz.</p></div><button className="ghost" disabled={busy} onClick={()=>void load()}><RefreshCw size={16}/> Yenile</button></div>{error&&<div className="alert error">{error}</div>}
 {data&&<><div className="kpi-grid" style={{marginBottom:18}}><div className="kpi-card"><span>🟩 Çekirdek hazır</span><strong>{data.summary.ready}</strong></div><div className="kpi-card"><span>🟨 Dış ayar</span><strong>{data.summary.configRequired}</strong></div><div className="kpi-card"><span>🟥 Çekirdek eksik</span><strong>{data.summary.missing}</strong></div><div className="kpi-card"><span>Operasyon eksiği</span><strong>{data.acceptance?.blockingSetup??0}</strong></div></div>
 <div className={`alert ${data.acceptance?.standardAcceptanceReady?'success':data.summary.coreReady?'info':'error'}`} style={{marginBottom:16}}><ShieldCheck size={18}/><div><strong>{data.acceptance?.standardAcceptanceReady?'Standard kabul çekirdeği hazır':data.summary.coreReady?'Kod hazır; operasyon kurulumu tamamlanıyor':'Standard çekirdekte kod/veri modeli eksiği var'}</strong><span>Ortam: {data.environment} · Son kontrol: {new Date(data.generatedAt).toLocaleString('tr-TR')}</span></div></div>
 <h2>1 · Kod ve veri modeli</h2><div className="cards-list">{(data.checks as Check[]).map(c=><div className="list-card" key={c.key}><div className="quick-icon">{c.state==='READY'?<CheckCircle2 size={18}/>:c.state==='CONFIG_REQUIRED'?<Settings2 size={18}/>:<XCircle size={18}/>}</div><div><strong>{c.state==='READY'?'🟩':c.state==='CONFIG_REQUIRED'?'🟨':'🟥'} {c.label}</strong><span>{c.detail}</span></div><span className={`status ${c.state==='READY'?'success':c.state==='CONFIG_REQUIRED'?'warning':'danger'}`}>{c.state==='READY'?'HAZIR':c.state==='CONFIG_REQUIRED'?'AYAR GEREKLİ':'EKSİK'}</span></div>)}</div>
 <h2 style={{marginTop:24}}>2 · Operasyonel kabul</h2>{data.operationalError&&<div className="alert error">Operasyon kontrolü çalıştırılamadı: {data.operationalError}</div>}<div className="cards-list">{(data.operational as Operational[]||[]).map(c=><div className="list-card" key={c.key}><div className="quick-icon">{c.state==='READY'?<CheckCircle2 size={18}/>:<Settings2 size={18}/>}</div><div><strong>{c.state==='READY'?'🟩':'🟨'} {c.label}</strong><span>{c.detail}{!c.blocking&&c.state!=='READY'?' · Standard çekirdeği bloklamaz.':''}</span></div><span className={`status ${c.state==='READY'?'success':'warning'}`}>{c.state==='READY'?'HAZIR':'KURULUM GEREKLİ'}</span></div>)}</div>
 </>}
 </>;
}
