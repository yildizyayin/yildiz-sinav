import { useEffect, useState } from 'react';
import { ArrowRight, BarChart3, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export function Children(){
  const [children,setChildren]=useState<any[]>([]);
  const [error,setError]=useState('');
  useEffect(()=>{void api<any>('/api/dashboard').then((r)=>setChildren(r.children||[])).catch((e)=>setError(e.message));},[]);
  return <>
    <div className="page-head"><div><span className="eyebrow">Veli paneli</span><h1>Çocuklarım</h1><p>Bu hesap yalnız kendisine bağlanmış aktif öğrencileri görebilir.</p></div></div>
    {error&&<div className="alert error">{error}</div>}
    <div className="kpi-grid" style={{marginBottom:20}}><div className="kpi-card"><span>Bağlı aktif öğrenci</span><strong>{children.length}</strong></div></div>
    <div className="cards-list">{children.map((c:any)=><div className="list-card" key={c.id}><div className="avatar big">{String(c.name||'?').charAt(0)}</div><div><strong>{c.name}</strong><span>{c.class_name||'Sınıf bilgisi'} · yalnız bu veli hesabına bağlı</span></div><Link to={`/reports?studentId=${c.id}`} className="secondary"><BarChart3 size={16}/> Gelişim</Link></div>)}{!children.length&&<div className="empty">Bu veli hesabına bağlı aktif öğrenci bulunmuyor.</div>}</div>
    <div className="panel" style={{marginTop:20}}><div className="panel-head"><div><h2>Veli erişim kuralı</h2><p>Başka bir öğrencinin bağlantısını veya kimliğini yazarak raporuna erişilemez.</p></div><ShieldCheck size={20}/></div><div className="cards-list"><div className="list-card"><div className="quick-icon"><UserRoundCheck size={18}/></div><div><strong>Bağlı çocuk erişimi</strong><span>Veli yalnız ilişkilendirilmiş çocuklarını görebilir. Yetki backend tarafında doğrulanır.</span></div><ArrowRight size={18}/></div></div></div>
  </>;
}
