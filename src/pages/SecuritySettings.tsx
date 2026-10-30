import { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { ShieldCheck, ShieldAlert, KeyRound } from 'lucide-react';
import { api, ApiError } from '../api';

type MfaStatus = { active: boolean; source: 'PLATFORM_SECRET' | 'ACCOUNT' | null; pending: boolean; activatedAt: string | null; enforcedOnLogin: boolean; canEnroll: boolean };

function QrImage({ text }: { text: string }) {
  const src = useMemo(() => { const qr = qrcode(0, 'M'); qr.addData(text); qr.make(); return qr.createDataURL(5, 8); }, [text]);
  return <img src={src} alt="Doğrulayıcı uygulama için QR kod" width={220} height={220} style={{ imageRendering: 'pixelated', background: '#fff', borderRadius: 8 }} />;
}

/** S045: Super Admin security settings — two-step login enrollment. */
export function SecuritySettings() {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = () => api<{ data: MfaStatus }>('/api/security/mfa').then((r) => setStatus(r.data)).catch((e) => setError(e instanceof ApiError ? e.message : 'Durum okunamadı.'));
  useEffect(() => { void load(); }, []);

  const run = async (path: string, body?: unknown) => {
    setBusy(true); setError(''); setNotice('');
    try { return await api<any>(path, { method: 'POST', body: JSON.stringify(body || {}) }); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'İşlem tamamlanamadı.'); return null; }
    finally { setBusy(false); }
  };
  const start = async () => { const r = await run('/api/security/mfa/enroll'); if (r) { setSetup(r.data); setCode(''); await load(); } };
  const confirm = async () => { const r = await run('/api/security/mfa/confirm', { code }); if (r) { setSetup(null); setCode(''); setNotice('İki adımlı doğrulama açıldı. Bundan sonra girişte uygulamadaki kod istenecek.'); await load(); } };
  const disable = async () => { const r = await run('/api/security/mfa/disable', { code }); if (r) { setCode(''); setNotice('İki adımlı doğrulama kapatıldı.'); await load(); } };
  const codeInput = <label>Uygulamadaki 6 haneli kod<input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={6} /></label>;

  return <div className="page">
    <div className="page-head"><div><span className="eyebrow">Sistem Yönetimi</span><h1>Güvenlik</h1><p className="muted">Süper Admin hesabını şifreye ek olarak telefonunuzdaki doğrulayıcı uygulamayla koruyun.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    {notice && <div className="alert success">{notice}</div>}
    <section className="panel">
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{status?.active ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />} İki adımlı doğrulama</h2>
      {!status ? <p className="muted">Yükleniyor…</p> : status.active ? <>
        <p><strong>Açık.</strong> {status.source === 'PLATFORM_SECRET' ? 'Platform anahtarı (Cloudflare) ile korunuyor; buradan kapatılamaz.' : `Hesabınızda kurulu${status.activatedAt ? `, ${new Date(status.activatedAt.replace(' ', 'T') + 'Z').toLocaleString('tr-TR')} tarihinden beri` : ''}.`}</p>
        {!status.enforcedOnLogin && <p className="muted">Bu ortam canlı değil; kod yalnız canlı sistemde girişte istenir.</p>}
        {status.source === 'ACCOUNT' && <div className="form-grid">{codeInput}<div style={{ alignSelf: 'end' }}><button className="secondary" disabled={busy || code.length !== 6} onClick={disable}>Kapat</button></div></div>}
      </> : setup ? <>
        <ol>
          <li>Telefonunuzda Google Authenticator, Microsoft Authenticator veya benzeri bir doğrulayıcı uygulama açın.</li>
          <li>Aşağıdaki QR kodu okutun. Okutamıyorsanız anahtarı elle girin.</li>
          <li>Uygulamanın gösterdiği 6 haneli kodu girip onaylayın. Onaylayana kadar giriş değişmez.</li>
        </ol>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <QrImage text={setup.otpauthUri} />
          <div><p className="muted">Elle giriş anahtarı</p><code style={{ fontSize: 16, letterSpacing: 2, wordBreak: 'break-all' }}>{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code><p className="muted" style={{ marginTop: 8 }}><a href={setup.otpauthUri}>Bu cihazdaki uygulamada aç</a></p></div>
        </div>
        <div className="form-grid">{codeInput}<div style={{ alignSelf: 'end', display: 'flex', gap: 8 }}><button className="primary" disabled={busy || code.length !== 6} onClick={confirm}>Onayla ve aç</button><button className="secondary" disabled={busy} onClick={() => setSetup(null)}>Vazgeç</button></div></div>
        <p className="muted">Anahtar yalnız şimdi gösterilir; sayfadan çıkarsanız kurulumu yeniden başlatırsınız.</p>
      </> : <>
        <p><strong>Kapalı.</strong> Hesabınız şu an yalnız şifreyle korunuyor.</p>
        {status.pending && <p className="muted">Yarım kalmış bir kurulum var; yeniden başlatarak yeni QR kod alın.</p>}
        {status.canEnroll ? <button className="primary" disabled={busy} onClick={start}><KeyRound size={16} /> Kurulumu başlat</button> : <p className="alert error">Sunucu anahtarı tanımlı olmadığı için kurulum yapılamıyor.</p>}
      </>}
    </section>
  </div>;
}
