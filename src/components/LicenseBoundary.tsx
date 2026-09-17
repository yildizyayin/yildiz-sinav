import { useEffect,useState,type ReactNode } from 'react';
import { CalendarClock,LockKeyhole } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';

export function LicenseBoundary({children}:{children:ReactNode}){
 const{user}=useAuth();const[license,setLicense]=useState<any>(null);const[loading,setLoading]=useState(Boolean(user?.institution_id));
 useEffect(()=>{if(!user?.institution_id){setLoading(false);setLicense(null);return}let active=true;setLoading(true);void api<any>('/api/license/status').then(r=>{if(active)setLicense(r.license)}).catch(()=>{if(active)setLicense(null)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[user?.institution_id]);
 if(loading)return <div className="panel"><span className="muted">Lisans durumu kontrol ediliyor…</span></div>;
 if(license?.locked)return <div className="panel" style={{maxWidth:760,margin:'40px auto'}}><div className="panel-head"><div><span className="eyebrow">Lisans Durumu</span><h1>{license.planCode==='TRIAL_7_DAY'?'7 günlük deneme süresi sona erdi':'Kurum lisansı aktif değil'}</h1><p>Verileriniz silinmedi. Kurum hesabı güvenli biçimde korunuyor; yıllık lisans etkinleştirildiğinde kaldığınız yerden devam edebilirsiniz.</p></div><LockKeyhole size={34}/></div><div className="alert warning"><strong>{license.status}</strong> · Sistem yöneticinizle iletişime geçerek yıllık lisans seçeneğini etkinleştirebilirsiniz.</div></div>;
 return <>{license?.planCode==='TRIAL_7_DAY'&&license.status==='ACTIVE'&&<div className="alert info" style={{marginBottom:14}}><CalendarClock size={17}/><div><strong>7 Günlük Demo</strong><span>Deneme lisansınız aktif · kalan süre: {license.daysRemaining} gün. Tüm verileriniz yıllık lisansa geçişte korunabilir.</span></div></div>}{children}</>;
}
