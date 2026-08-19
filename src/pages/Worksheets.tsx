import { useEffect,useState } from 'react';
import { BookOpenCheck } from 'lucide-react';
import { api } from '../api';

export function Worksheets(){const[rows,setRows]=useState<any[]>([]);useEffect(()=>{void api<any>('/api/worksheets').then(r=>setRows(r.worksheets))},[]);return <><div className="page-head"><div><span className="eyebrow">16 Sayısal + 16 Sözel</span><h1>Föyler</h1><p>Akademik yıl, sınıf ve kazanım sürümüyle bağlı haftalık çalışma içerikleri.</p></div></div><div className="worksheet-grid">{rows.map(w=><div className="worksheet-card" key={w.id}><div className="quick-icon"><BookOpenCheck/></div><span className="pill">{w.track==='NUMERIC'?'Sayısal':'Sözel'} {w.sequence_no}</span><h3>{w.title}</h3><p>{w.grade_level?`${w.grade_level}. sınıf · `:''}{w.subjects||'Ders tanımı bekleniyor'}</p></div>)}{!rows.length&&<div className="empty">Yayınlanmış föy bulunmuyor.</div>}</div></>}
