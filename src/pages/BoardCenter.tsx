import { useEffect,useState } from 'react';
import { MonitorPlay,Plus,RefreshCw } from 'lucide-react';
import { api } from '../api';

export function BoardCenter(){
 const [rows,setRows]=useState<any[]>([]);const [title,setTitle]=useState('');const [classId,setClassId]=useState('');const [error,setError]=useState('');const [notice,setNotice]=useState('');
 const load=async()=>{const r=await api<any>('/api/platform/board');setRows(r.sessions||[])};useEffect(()=>{void load().catch(e=>setError(e.message))},[]);
 const create=async()=>{try{const r=await api<any>('/api/platform/board',{method:'POST',body:JSON.stringify({title,classId:classId||null,state:{mode:'QUESTION',items:[]}})});setNotice(`Akıllı tahta oturumu açıldı · ${r.id}`);setTitle('');await load()}catch(e:any){setError(e.message)}};
 return <><div className="page-head"><div><span className="eyebrow">Akıllı Tahta</span><h1>Board</h1><p>Soru, video, föy, mini oyun ve sınıf etkinlikleri aynı içerik motorundan akıllı tahtaya taşınır.</p></div><button className="ghost" onClick={()=>void load()}><RefreshCw size={16}/> Yenile</button></div>{error&&<div className="alert error">{error}</div>}{notice&&<div className="alert success">{notice}</div>}
 <div className="panel" style={{marginBottom:16}}><div className="panel-head"><div><h2>Yeni tahta oturumu</h2><p>İçerik silosu oluşturmaz; soru havuzu, video ve föy motorunu yeniden kullanır.</p></div><MonitorPlay/></div><div className="form-grid"><label>Oturum başlığı<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="8/A Matematik · Günün Soruları"/></label><label>Sınıf ID (opsiyonel)<input value={classId} onChange={e=>setClassId(e.target.value)}/></label></div><button className="primary" onClick={create} disabled={!title.trim()}><Plus size={16}/> Oturumu Aç</button></div>
 <div className="exam-grid">{rows.map(r=><div className="exam-card" key={r.id}><MonitorPlay size={28}/><h3>{r.title}</h3><p>{r.status} · {r.created_at}</p><span className="pill">{r.state?.mode||'QUESTION'}</span></div>)}</div></>;
}
