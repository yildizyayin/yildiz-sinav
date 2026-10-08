import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';

export function ChangePassword() {
  const navigate = useNavigate();
  const { user, refresh } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (newPassword.length < 8) { setError('Yeni şifre en az 8 karakter olmalıdır.'); return; }
    if (newPassword !== confirmation) { setError('Yeni şifre tekrarı eşleşmiyor.'); return; }
    setBusy(true);
    try {
      await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
      await refresh();
      navigate('/', { replace: true });
    } catch (error) {
      setError(error instanceof ApiError ? error.message : 'Şifre değiştirilemedi.');
    } finally { setBusy(false); }
  };

  return <div className="login-page"><div className="login-panel" style={{ gridColumn: '1 / -1' }}><form className="login-card" onSubmit={submit}>
    <div><span className="eyebrow">Anunex · Güvenli ilk giriş</span><h2>Geçici şifrenizi değiştirin</h2><p className="muted">{user?.display_name || 'Hesabınız'} için oluşturulan geçici şifre yalnız ilk giriş içindir.</p></div>
    <label>Mevcut geçici şifre<input type="password" autoComplete="current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required /></label>
    <label>Yeni şifre<input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={e => setNewPassword(e.target.value)} required /></label>
    <label>Yeni şifre tekrarı<input type="password" autoComplete="new-password" minLength={8} value={confirmation} onChange={e => setConfirmation(e.target.value)} required /></label>
    {error && <div className="alert error">{error}</div>}
    <button className="primary large" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Yeni şifreyi kaydet'}</button>
  </form></div></div>;
}

