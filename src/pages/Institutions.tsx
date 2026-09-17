import { useEffect,useState } from 'react';
import { PauseCircle, PlayCircle } from 'lucide-react';
import { api, post } from '../api';

export function Institutions(){
 const [rows,setRows]=useState<any[]>([]); const [busy,setBusy]=useState('');
 const load=()=>api<any>('/api/institutions').then(r=>setRows(r.institutions)); useEffect(()=>{void load()},[]);
 const toggle=async(r:any)=>{setBusy(r.id);await post(`/api/institutions/${r.id}/status`,{status:r.status==='ACTIVE'?'PASSIVE':'ACTIVE'});await load();setBusy('')};
 return <><div className="page-head"><div><span className="eyebrow">Süper Admin</span><h1>Kurumlar</h1><p>Kurum erişimi, aktif/misafir öğrenci durumu ve sezon yönetimi.</p></div></div><div className="table-card"><table><thead><tr><th>Kurum</th><th>Kod</th><th>Aktif</th><th>Misafir</th><th>Durum</th><th></th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><strong>{r.name}</strong><small>{r.city||''} {r.district||''}</small></td><td>{r.code}</td><td>{r.active_students}</td><td>{r.guest_students}</td><td><span className={`status ${r.status==='ACTIVE'?'ok':'off'}`}>{r.status==='ACTIVE'?'Aktif':'Pasif'}</span></td><td><button className={r.status==='ACTIVE'?'danger subtle':'primary subtle'} disabled={busy===r.id} onClick={()=>toggle(r)}>{r.status==='ACTIVE'?<><PauseCircle size={16}/> Pasife Al</>:<><PlayCircle size={16}/> Aktif Et</>}</button></td></tr>)}</tbody></table></div></>
}
