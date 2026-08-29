import {useEffect,useState,type ReactNode} from 'react';
import {LockKeyhole,RefreshCw} from 'lucide-react';
import {Link,useLocation} from 'react-router-dom';
import {api} from '../api';
import {useAuth} from '../auth';
import {featureForPath} from '../lib/feature-routes';

export function FeatureBoundary({children}:{children:ReactNode}){
  const{user}=useAuth();const location=useLocation();const feature=featureForPath(location.pathname);const[enabled,setEnabled]=useState<Set<string>|null>(null);const[error,setError]=useState('');
  const load=async()=>{setError('');try{const result=await api<any>('/api/platform/features');setEnabled(new Set((result.features||[]).filter((row:any)=>Number(row.effective_enabled||0)===1).map((row:any)=>String(row.feature_key))))}catch(e:any){setError(e.message||'Paket yetkileri doğrulanamadı.')}};
  useEffect(()=>{if(!user||user.role==='SUPER_ADMIN'||!feature){setEnabled(null);setError('');return}void load()},[user?.id,user?.role,user?.institution_id,feature]);
  if(!user||user.role==='SUPER_ADMIN'||!feature)return <>{children}</>;
  if(error)return <div className="panel feature-boundary"><div className="panel-head"><div><span className="eyebrow">Paket Yetkisi</span><h1>Modül yetkisi doğrulanamadı</h1><p>{error}</p></div><LockKeyhole/></div><button className="secondary" onClick={()=>void load()}><RefreshCw size={16}/> Yeniden Dene</button></div>;
  if(enabled===null)return <div className="panel"><span className="muted">Paket ve modül yetkileri doğrulanıyor…</span></div>;
  if(!enabled.has(feature))return <div className="panel feature-boundary"><div className="panel-head"><div><span className="eyebrow">Paket Sınırı · {feature}</span><h1>Bu modül kurum paketinizde etkin değil</h1><p>Doğrudan bağlantı kullanılsa bile modül açılmaz. Paket değişikliği veya seçilebilir modül talebi için kurumunuzun ANUNEX yöneticisiyle iletişime geçin.</p></div><LockKeyhole/></div><div className="feature-boundary-actions"><Link className="primary" to="/">Kurum Ana Sayfası</Link><Link className="ghost" to="/profile">Hesap ve Güvenlik</Link></div></div>;
  return <>{children}</>;
}
