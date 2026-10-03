import { useState } from 'react';
import { api } from '../api';

type Outcome={id:string;code:string;title:string;subjectName:string;programVersion:string};
export function OutcomeMiniTestCatalog({onOpen,busy:parentBusy}:{onOpen:(id:string)=>Promise<void>;busy:boolean}){
 const[items,setItems]=useState<Outcome[]>([]),[loaded,setLoaded]=useState(false),[cursor,setCursor]=useState<string|null>(null),[year,setYear]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[repeat,setRepeat]=useState<Outcome|null>(null),[consent,setConsent]=useState(false);
 const load=async(more=false)=>{setBusy(true);setError('');try{const data=await api<any>(`/api/nibiru/coach/mini-test-catalog${more&&cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`);setItems(old=>more?[...old,...(data.items||[]).filter((x:Outcome)=>!old.some(y=>y.id===x.id))]:data.items||[]);setCursor(data.nextCursor||null);setYear(data.academicYear||'');setLoaded(true)}catch(e:any){setError(e.message||'Kazanımlar yüklenemedi.')}finally{setBusy(false)}};
 const start=async(outcome:Outcome,mode:'NEW'|'REPEAT')=>{if(mode==='REPEAT'&&!consent)return;setBusy(true);setError('');try{const data=await api<any>(`/api/nibiru/coach/outcomes/${encodeURIComponent(outcome.id)}/mini-test`,{method:'POST',body:JSON.stringify({mode,repeatConsent:mode==='REPEAT'&&consent})});setRepeat(null);setConsent(false);await onOpen(data.testId)}catch(e:any){setError(e.message||'Mini test başlatılamadı.')}finally{setBusy(false)}};
 const disabled=busy||parentBusy;
 return <div style={{display:'grid',gap:10}}><div><h2>Kazanım mini testleri</h2><p>Doğrulanmış güncel programındaki kazanımları seçebilirsin. Yeni test için yeterli onaylı soru bulunması gerekir; soru eksikse daha önce gördüğün sorular otomatik eklenmez.</p>{year&&<small className="muted">Eğitim yılı: {year}</small>}</div>
 {!loaded&&<button className="secondary" disabled={disabled} onClick={()=>void load()}>Kazanımları göster</button>}
 {error&&<div className="alert error">{error}</div>}
 {repeat&&<div className="alert info" style={{display:'grid',gap:8}}><strong>{repeat.title} · tekrar çalışması</strong><span>Daha önce gördüğün soruları çözersin. Sonuç yeni öğrenme kanıtı olarak kullanılmaz.</span><label style={{display:'flex',gap:8}}><input type="checkbox" style={{width:'auto',minHeight:0}} checked={consent} onChange={e=>setConsent(e.target.checked)}/> Gördüğüm soruları tekrar çözmeyi seçiyorum.</label><div><button className="secondary" disabled={disabled||!consent} onClick={()=>void start(repeat,'REPEAT')}>Tekrarı başlat</button> <button className="ghost" disabled={disabled} onClick={()=>{setRepeat(null);setConsent(false)}}>Vazgeç</button></div></div>}
 {loaded&&!items.length&&<div className="empty-state">Bu dönem ve sınıf için doğrulanmış kazanım bulunamadı.</div>}
 {items.map(item=><div key={item.id} style={{display:'grid',gap:7,borderBottom:'1px solid var(--border)',padding:'10px 0'}}><strong>{item.subjectName} · {item.code} {item.title}</strong><small className="muted">{item.programVersion}</small><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button className="secondary" disabled={disabled} onClick={()=>void start(item,'NEW')}>Yeni sorularla başla</button><button className="ghost" disabled={disabled} onClick={()=>{setRepeat(item);setConsent(false)}}>Gördüğüm sorularla tekrar</button></div></div>)}
 {cursor&&<button className="ghost" disabled={disabled} onClick={()=>void load(true)}>Diğer kazanımları yükle</button>}
 </div>;
}
