import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, post } from '../api';
import { Turnstile } from '../components/Turnstile';
import { useAuth } from '../auth';

const PRODUCT='Anunex — Nibiru AI Destekli Ölçme ve Analiz Platformu';

export function Login() {
  const navigate = useNavigate();
  const { user, refresh } = useAuth();
  const [config, setConfig] = useState<{ productName:string; turnstileSiteKey:string } | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(()=>{ void api<any>('/api/config').then(setConfig).catch(()=>setConfig({productName:PRODUCT,turnstileSiteKey:''})); },[]);
  useEffect(()=>{ if(user) navigate('/'); },[user,navigate]);
  const onToken = useCallback((value:string)=>setToken(value),[]);
  const submit = async (e:React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      await post('/api/auth/login',{identifier,password,remember,turnstileToken:token});
      await refresh(); navigate('/');
    } catch(e){ setError(e instanceof ApiError ? e.message : 'Giriş yapılamadı.'); }
    finally{ setLoading(false); }
  };
  return <div className="login-page">
    <div className="login-art">
      <div className="login-logo">A</div>
      <div className="login-copy"><span className="pill dark"><ShieldCheck size={15}/> Cloudflare korumalı</span><h1>Bilginin yörüngesinde.</h1><p>ANUNEX ile sınav, optik, kazanım analizi, föy ve Nibiru AI destekli akademik gelişim akışlarını tek ölçme platformunda yönetin.</p></div>
    </div>
    <div className="login-panel"><form className="login-card" onSubmit={submit}>
      <div><span className="eyebrow">Anunex · Nibiru</span><h2>{config?.productName || PRODUCT}</h2><p className="muted">Kullanıcı adı, e-posta veya telefon numaranızla giriş yapın.</p></div>
      <label>Kullanıcı adı / e-posta / telefon<input value={identifier} onChange={e=>setIdentifier(e.target.value)} autoComplete="username" required autoFocus/></label>
      <label>Şifre<div className="password-input"><input type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/><button type="button" onClick={()=>setShow(v=>!v)} aria-label={show?'Şifreyi gizle':'Şifreyi göster'}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>
      <div className="form-row"><label className="check"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/> Beni hatırla</label><span className="muted">Şifre yardımı için kurum yöneticinizle iletişime geçin.</span></div>
      <Turnstile siteKey={config?.turnstileSiteKey || ''} onToken={onToken}/>
      {error && <div className="alert error">{error}</div>}
      <button className="primary large" disabled={loading}>{loading?'Giriş yapılıyor…':'Giriş Yap'}</button>
      <div className="demo-box"><strong>Demo erişimi</strong><span>Demo giriş bilgileri yalnız yetkili ANUNEX yöneticisi tarafından oluşturulur.</span></div>
    </form></div>
  </div>;
}
