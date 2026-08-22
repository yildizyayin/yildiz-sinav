import { useEffect,useState } from 'react';
import { ClipboardCheck,RefreshCw } from 'lucide-react';
import { api } from '../api';

export function GuidanceTests(){
 const [rows,setRows]=useState<any[]>([]);const [selected,setSelected]=useState<any>(null);const [answers,setAnswers]=useState<Record<string,number>>({});const [result,setResult]=useState<any>(null);const [error,setError]=useState('');
 const load=async()=>{const r=await api<any>('/api/platform/guidance');setRows(r.instruments||[])};useEffect(()=>{void load().catch(e=>setError(e.message))},[]);
 const submit=async()=>{if(!selected)return;try{const r=await api<any>('/api/platform/guidance',{method:'POST',body:JSON.stringify({instrumentId:selected.id,responses:answers})});setResult(r)}catch(e:any){setError(e.message)}};
 return <><div className="page-head"><div><span className="eyebrow">Eğitsel Rehberlik</span><h1>Rehberlik Testleri</h1><p>Çalışma alışkanlığı ve hedef farkındalığı gibi eğitsel alanlarda öz değerlendirme. Tanı üretmez.</p></div><button className="ghost" onClick={()=>void load()}><RefreshCw size={16}/> Yenile</button></div>{error&&<div className="alert error">{error}</div>}<div className="alert warning"><strong>Önemli:</strong> Bu testler psikolojik veya tıbbi değerlendirme değildir; yalnız eğitsel rehberlik amacı taşır.</div>
 <div className="exam-grid" style={{marginBottom:16}}>{rows.map(r=><button key={r.id} type="button" className={selected?.id===r.id?'exam-card selected':'exam-card'} style={{textAlign:'left'}} onClick={()=>{setSelected(r);setAnswers({});setResult(null)}}><ClipboardCheck size={26}/><h3>{r.title}</h3><p>{r.purpose}</p></button>)}</div>
 {selected&&<div className="panel"><h2>{selected.title}</h2>{(selected.questions||[]).map((q:any)=><label key={q.id}>{q.text}<input type="range" min="1" max="5" value={answers[q.id]||3} onChange={e=>setAnswers({...answers,[q.id]:Number(e.target.value)})}/><strong>{answers[q.id]||3}/5</strong></label>)}<button className="primary" onClick={submit}>Sonucu Oluştur</button>{result&&<div className="success-box" style={{marginTop:14}}><ClipboardCheck/><div><strong>{result.result?.interpretation}</strong><span>Puan: {result.result?.score} · {result.disclaimer}</span></div></div>}</div>}
 </>;
}
