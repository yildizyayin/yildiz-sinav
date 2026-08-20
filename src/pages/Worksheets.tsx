import { useEffect,useState } from 'react';
import { BookOpenCheck } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { WorksheetAdmin } from './WorksheetAdmin';

export function Worksheets(){
 const {user}=useAuth();
 if(user?.role==='SUPER_ADMIN')return <WorksheetAdmin/>;
 return <PublishedWorksheets/>;
}

function PublishedWorksheets(){const[rows,setRows]=useState<any[]>([]);const[error,setError]=useState('');useEffect(()=>{void api<any>('/api/worksheets').then(r=>setRows(r.worksheets)).catch(e=>setError(e.message))},[]);return <><div className="page-head"><div><span className="eyebrow">16 Sayısal + 16 Sözel</span><h1>Föyler</h1><p>Akademik yıl, sınıf ve kazanım sürümüyle bağlı yayınlanmış çalışma içerikleri.</p></div></div>{error&&<div className="alert error">{error}</div>}<div className="worksheet-grid">{rows.map(w=><div className="worksheet-card" key={w.id}><div className="quick-icon"><BookOpenCheck/></div><span className="pill">{w.track==='NUMERIC'?'Sayısal':'Sözel'} {w.sequence_no}</span><h3>{w.title}</h3><p>{w.grade_level?`${w.grade_level}. sınıf · `:''}{w.subjects||'Ders tanımı bekleniyor'}</p></div>)}{!rows.length&&<div className="empty">Yayınlanmış föy bulunmuyor.</div>}</div></>}
