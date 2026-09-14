import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, post } from '../api';
import { Turnstile } from '../components/Turnstile';
import { useAuth } from '../auth';
import { AnunexCosmos } from '../components/AnunexCosmos';

export function Login() {
  const navigate = useNavigate();
  const { user, refresh } = useAuth();
  const [config, setConfig] = useState<{ productName:string; turnstileSiteKey:string; superAdminMfaEnabled?:boolean } | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [turnstileCycle, setTurnstileCycle] = useState(0);
  const [configError, setConfigError] = useState(false);
  const isDemoHost = typeof window !== 'undefined' && (
    window.location.hostname.toLowerCase() === 'demo.anunex.com'
    || new URLSearchParams(window.location.search).get('demo') === '1'
  );
  // Demo roles mirror scripts/generate-demo-seed.mjs. SUPER_ADMIN stays on app.anunex.com.
  const demoAccounts = [
    ['Kurum', 'manager', 'Demo123!'],
    ['Öğretmen', 'math', 'Demo123!'],
    ['Rehberlik', 'guidance', 'Demo123!'],
    ['Öğrenci', 'student1', 'Demo123!'],
    ['Veli', 'parent1', 'Demo123!'],
  ] as const;
  const loadConfig = useCallback(() => { setConfigError(false); void api<any>('/api/config').then(setConfig).catch(() => setConfigError(true)); }, []);
  useEffect(loadConfig, [loadConfig]);
  useEffect(()=>{ if(user) navigate('/'); },[user,navigate]);
  const onToken = useCallback((value:string)=>setToken(value),[]);
  const submit = async (e:React.FormEvent) => {
    e.preventDefault(); if(loading || !config || !token) return; setError(''); setLoading(true);
    try {
      await post('/api/auth/login',{identifier,password,remember,turnstileToken:token,mfaCode:mfaCode.trim()||undefined});
      await refresh(); navigate('/');
    } catch(e){ setError(e instanceof ApiError ? e.message : 'Giriş yapılamadı.'); setToken(''); setTurnstileCycle(value => value + 1); }
    finally{ setLoading(false); }
  };
  const mfaValid = !mfaCode || /^\d{6}$/.test(mfaCode);
  return <div className="login-page">
    <div className="login-art"><AnunexCosmos/></div>
    <div className="login-panel"><form className="login-card" onSubmit={submit}>
      <div><span className="eyebrow">Anunex · Tek giriş · Rol otomatik tanınır</span><h2>{config?.productName || 'Anunex — Nibiru AI Destekli Ölçme ve Analiz Platformu'}</h2><p className="muted">Kullanıcı adı, e-posta veya telefon numaranızla giriş yapın.</p></div>
      {isDemoHost && <div className="demo-role-picker"><div><strong>Demo Koleji</strong><span>İncelemek istediğiniz paneli seçin; demo hesabı güvenli biçimde doldurulur.</span></div><div>{demoAccounts.map(([label,user,pass])=><button type="button" key={user} onClick={()=>{setIdentifier(user);setPassword(pass);setError('')}}>{label}</button>)}</div></div>}
      <label>Kullanıcı adı / e-posta / telefon<input value={identifier} onChange={e=>setIdentifier(e.target.value)} autoComplete="username" required/></label>
      <label>Şifre<div className="password-input"><input type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/><button type="button" aria-label={show?'Şifreyi gizle':'Şifreyi göster'} onClick={()=>setShow(v=>!v)}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>
      {config?.superAdminMfaEnabled && <label>Süper Admin doğrulama kodu <span className="muted">(yalnız yönetici hesabı)</span><input value={mfaCode} onChange={e=>setMfaCode(e.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6 haneli kod" maxLength={6}/></label>}
      <div className="form-row"><label className="check"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/> Beni hatırla</label><span className="muted">Şifre yardımı için kurum yöneticinizle iletişime geçin.</span></div>
      {configError && <div role="alert" className="alert error">Giriş hizmetine ulaşılamadı. <button type="button" onClick={loadConfig}>Yeniden dene</button></div>}
      <Turnstile key={turnstileCycle} siteKey={config?.turnstileSiteKey || ''} onToken={onToken}/>
      {error && <div role="alert" className="alert error">{error}</div>}
      <button className="primary large" disabled={loading||!config||!token||!identifier.trim()||!password||!mfaValid}>{loading?'Giriş yapılıyor…':'Giriş Yap'}</button>
      {isDemoHost && <p className="muted">Örnek hesaplarla beş farklı paneli inceleyebilirsiniz. Demo alanına gerçek öğrenci bilgisi yüklemeyin. Kurumunuza özel 7 günlük deneme için <a href="https://anunex.com/#iletisim">iletişime geçin</a>.</p>}
      <nav className="entry-links" aria-label="ANUNEX hizmetleri"><a href="https://anunex.com">Ana sayfa</a><a href="https://sonuc.anunex.com/#student-results">Sınav sonucum</a><a href={isDemoHost?'https://app.anunex.com':'https://demo.anunex.com'}>{isDemoHost?'Kurum hesabımla giriş':'Demoyu incele'}</a></nav>
    </form></div>
  </div>;
}
