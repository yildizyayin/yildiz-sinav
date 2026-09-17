import { useEffect,useState } from 'react';
import { Bell,CheckCheck,ExternalLink,RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export function Notifications(){
 const[rows,setRows]=useState<any[]>([]);const[unread,setUnread]=useState(0);const[error,setError]=useState('');
 const load=async()=>{setError('');try{const r=await api<any>('/api/notifications');setRows(r.notifications||[]);setUnread(Number(r.unread||0))}catch(e:any){setError(e.message)}};
 useEffect(()=>{void load()},[]);
 const read=async(id:string,dynamic?:boolean)=>{if(dynamic)return;try{await api(`/api/notifications/${id}/read`,{method:'POST'});await load()}catch(e:any){setError(e.message)}};
 return <><div className="page-head"><div><span className="eyebrow">Bildirim Merkezi</span><h1>Bildirimler</h1><p>Sınav sonucu, föy, aktivasyon ve önemli sistem hareketleri tek yerde.</p></div><button className="ghost" onClick={()=>void load()}><RefreshCw size={16}/> Yenile</button></div>
 {error&&<div className="alert error">{error}</div>}
 <div className="kpi-grid" style={{marginBottom:20}}><div className="kpi-card"><span>Okunmamış / yeni</span><strong>{unread}</strong></div></div>
 <div className="cards-list">{rows.map((n:any)=><div className="list-card" key={n.id} style={{alignItems:'flex-start'}}><div className="quick-icon"><Bell size={18}/></div><div><strong>{n.title}</strong><span>{n.body}</span><small style={{display:'block',marginTop:6,color:'#7b8797'}}>{n.created_at?new Date(n.created_at).toLocaleString('tr-TR'):''}</small></div><div style={{display:'flex',gap:8,alignItems:'center'}}>{n.action_url&&<Link className="secondary subtle" to={n.action_url}><ExternalLink size={14}/> Aç</Link>}{!n.dynamic&&!n.read_at&&<button className="ghost" onClick={()=>void read(n.id,n.dynamic)}><CheckCheck size={16}/> Okundu</button>}</div></div>)}{!rows.length&&<div className="empty">Yeni bildiriminiz bulunmuyor.</div>}</div></>;
}
