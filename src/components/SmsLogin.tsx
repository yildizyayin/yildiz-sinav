import { useCallback, useEffect, useState } from 'react';
import { ApiError, post } from '../api';
import { Turnstile } from './Turnstile';

type Purpose = 'LOGIN' | 'RESET';

/**
 * S046: bank-style SMS code login and password reset. The server never says whether a number is registered;
 * the code is valid for 3 minutes. Used by the login page only when the SMS provider is configured.
 */
export function SmsLogin({ purpose, siteKey, onDone, onCancel }: { purpose: Purpose; siteKey: string; onDone: (mustChangePassword: boolean) => void; onCancel: () => void }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [remember, setRemember] = useState(true);
  const [token, setToken] = useState('');
  const [cycle, setCycle] = useState(0);
  const [stage, setStage] = useState<'phone' | 'code'>('phone');
  const [accounts, setAccounts] = useState<Array<{ id: string; label: string }>>([]);
  const [accountId, setAccountId] = useState('');
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const onToken = useCallback((value: string) => setToken(value), []);
  useEffect(() => { if (left <= 0) return; const t = setTimeout(() => setLeft((v) => v - 1), 1000); return () => clearTimeout(t); }, [left]);

  const send = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await post<any>('/api/auth/sms/request', { phone, purpose, turnstileToken: token });
      setStage('code'); setLeft(Number(r.expiresInSeconds || 180)); setNotice(r.message || 'Kod gönderildi.'); setCode('');
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Kod gönderilemedi.'); }
    finally { setBusy(false); setToken(''); setCycle((v) => v + 1); }
  };
  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (purpose === 'RESET' && password !== password2) { setError('Yeni şifre tekrarı eşleşmiyor.'); return; }
    setBusy(true); setError('');
    try {
      const r = await post<any>('/api/auth/sms/verify', { phone, code, purpose, remember, accountId: accountId || undefined, newPassword: purpose === 'RESET' ? password : undefined });
      if (r.chooseAccount) { setAccounts(r.chooseAccount); setAccountId(r.chooseAccount[0]?.id || ''); setNotice('Bu numara birden fazla hesapta kayıtlı. Hangi hesapla devam edeceğinizi seçin.'); return; }
      onDone(Boolean(r.mustChangePassword));
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Kod doğrulanamadı.'); }
    finally { setBusy(false); }
  };
  const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  const title = purpose === 'LOGIN' ? 'SMS kodu ile giriş' : 'Şifremi unuttum';
  const intro = purpose === 'LOGIN' ? 'Hesabınıza kayıtlı cep telefonuna tek kullanımlık kod gönderelim.' : 'Hesabınıza kayıtlı cep telefonuna gelen kodla yeni şifrenizi belirleyin.';

  return <form className="sms-login" onSubmit={verify}>
    <div><strong>{title}</strong><p className="muted">{intro}</p></div>
    <label>Cep telefonu<input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="5XX XXX XX XX" disabled={stage === 'code'} required /></label>
    {stage === 'phone' ? <>
      <Turnstile key={cycle} siteKey={siteKey} onToken={onToken} />
      {error && <div className="alert error">{error}</div>}
      <button type="button" className="primary large" disabled={busy || !phone.trim() || (Boolean(siteKey) && !token)} onClick={() => void send()}>{busy ? 'Gönderiliyor…' : 'Kod gönder'}</button>
    </> : <>
      {notice && <div className="alert info" role="status">{notice}</div>}
      {accounts.length > 1 && <label>Hesap<select value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>}
      <label>SMS kodu<input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6 haneli kod" maxLength={6} required /></label>
      {purpose === 'RESET' && <>
        <label>Yeni şifre<input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <label>Yeni şifre tekrarı<input type="password" autoComplete="new-password" minLength={8} value={password2} onChange={(e) => setPassword2(e.target.value)} required /></label>
      </>}
      {purpose === 'LOGIN' && <label className="check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Beni hatırla</label>}
      <p className="muted">{left > 0 ? `Kodun kalan süresi: ${mm}` : 'Kodun süresi doldu.'} {left <= 120 && <button type="button" className="link-button" onClick={() => { setStage('phone'); setAccounts([]); setAccountId(''); setError(''); setNotice(''); }}>Yeni kod iste</button>}</p>
      {error && <div className="alert error">{error}</div>}
      <button className="primary large" disabled={busy || code.length !== 6 || left <= 0}>{busy ? 'Doğrulanıyor…' : purpose === 'LOGIN' ? 'Giriş yap' : 'Şifreyi kaydet ve giriş yap'}</button>
    </>}
    <button type="button" className="link-button" onClick={onCancel}>Şifre ile girişe dön</button>
  </form>;
}
