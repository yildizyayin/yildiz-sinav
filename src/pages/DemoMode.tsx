import { useEffect,useState } from 'react';
import { FlaskConical,RefreshCw } from 'lucide-react';
import { api } from '../api';

export function DemoMode(){
 const[demos,setDemos]=useState<any[]>([]);const[name,setName]=useState('Ölçme Platformu Demo Kurumu');const[username,setUsername]=useState('demo.kurum');const[password,setPassword]=useState('Demo2026!');const[busy,setBusy]=useState(false);const[error,setError]=useState('');const[notice,setNotice]=useState('');
 const load=async()=>{try{const r=await api<any>('/api/v2/demo');setDemos(r.demos||[])}catch(e:any){setError(e.message)}};
 useEffect(()=>{void load()},[]);
 const create=async()=>{setBusy(true);setError('');setNotice('');try{const r=await api<any>('/api/v2/demo/seed',{method:'POST',body:JSON.stringify({name,managerUsername:username,managerPassword:password})});setNotice(`${r.institution.name} hazır: ${r.students} öğrenci, ${r.classes} sınıf. Demo yönetici: ${r.manager.username}`);await load()}catch(e:any){setError(e.message)}finally{setBusy(false)}};
 return <>
  <div className="page-head"><div><span className="eyebrow">Demo Modu</span><h1>Hazır kurum demosu oluştur</h1><p>Boş ekran göstermeden 8 sınıf ve 160 sentetik öğrenci içeren güvenli demo kurumu üretin.</p></div><button className="ghost" onClick={()=>void load()}><RefreshCw size={16}/> Yenile</button></div>
  {error&&<div className="alert error">{error}</div>}{notice&&<div className="alert success">{notice}</div>}
  <div className="panel"><div className="panel-head"><div><h2>Yeni demo</h2><p>Demo verileri gerçek kurumlardan demo_mode ile ayrılır.</p></div><FlaskConical/></div><div className="form-grid"><label>Kurum adı<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Yönetici kullanıcı adı<input value={username} onChange={e=>setUsername(e.target.value)}/></label><label>Yönetici şifresi<input type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label></div><button className="primary" disabled={busy||!username||password.length<8} onClick={create}>{busy?'Oluşturuluyor…':'Demo Kurumu Oluştur'}</button></div>
  <div className="table-card"><table><thead><tr><th>Kurum</th><th>Kod</th><th>Sınıf</th><th>Öğrenci</th><th>Durum</th></tr></thead><tbody>{demos.map(d=><tr key={d.id}><td><strong>{d.name}</strong></td><td>{d.code}</td><td>{d.class_count}</td><td>{d.student_count}</td><td><span className={`status ${d.status==='ACTIVE'?'ok':'off'}`}>{d.status}</span></td></tr>)}</tbody></table>{!demos.length&&<div className="empty">Henüz demo kurumu bulunmuyor.</div>}</div>
 </>;
}
