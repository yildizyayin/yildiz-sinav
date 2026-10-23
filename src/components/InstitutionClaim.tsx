import { useState } from 'react';
import { api } from '../api';
import { Turnstile } from './Turnstile';

/** S020: a school opens its own account once with its MEB code and the PIN it received. */
export function InstitutionClaimForm({ siteKey, onDone }: { siteKey: string; onDone: (login: string) => void }) {
  const [f, setF] = useState({ mebCode: '', pin: '', displayName: '', email: '', phone: '', address: '', password: '', password2: '' });
  const [token, setToken] = useState(''); const [cycle, setCycle] = useState(0);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (f.password !== f.password2) { setError('Şifreler aynı değil.'); return; }
    setBusy(true);
    try { const r = await api<any>('/api/public/results/institution-claim', { method: 'POST', body: JSON.stringify({ ...f, password2: undefined, turnstileToken: token }) }); onDone(r.login); }
    catch (err: any) { setError(err.message); setToken(''); setCycle((c) => c + 1); }
    finally { setBusy(false); }
  };
  return <form className="result-operator-login institution-claim" onSubmit={submit}>
    <div className="operator-intro"><span className="result-kicker">İLK GİRİŞ</span><h2>Kurum hesabı oluştur</h2><p>Kurumunuza verilen 8 karakterlik PIN ile yönetici hesabınızı bir kez oluşturun. PIN bu işlemden sonra geçersiz olur; sonraki girişlerde e-posta ve şifrenizi kullanırsınız.</p></div>
    {error && <div className="result-alert">{error}</div>}
    <label>MEB kurum kodu<input required inputMode="numeric" pattern="\d{5,12}" value={f.mebCode} onChange={set('mebCode')} /></label>
    <label>Kurum PIN'i<input required autoComplete="off" maxLength={9} value={f.pin} onChange={set('pin')} /></label>
    <label>Yetkili adı soyadı<input required minLength={3} value={f.displayName} onChange={set('displayName')} /></label>
    <label>E-posta (giriş adınız olur)<input required type="email" autoComplete="email" value={f.email} onChange={set('email')} /></label>
    <label>Kurum telefonu<input required type="tel" value={f.phone} onChange={set('phone')} /></label>
    <label>Kurum adresi<input value={f.address} onChange={set('address')} /></label>
    <label>Şifre (en az 10 karakter)<input required type="password" minLength={10} autoComplete="new-password" value={f.password} onChange={set('password')} /></label>
    <label>Şifre (tekrar)<input required type="password" minLength={10} autoComplete="new-password" value={f.password2} onChange={set('password2')} /></label>
    <Turnstile key={cycle} siteKey={siteKey} onToken={setToken} />
    <button className="result-primary" type="submit" disabled={busy || (!!siteKey && !token)}>{busy ? 'Oluşturuluyor…' : 'Hesabı oluştur'}</button>
  </form>;
}

/** S020: the school's card — the school, its dealer and the Super Admin keep the contact fields current. */
export function InstitutionCardPanel({ institutionId }: { institutionId: string }) {
  const [card, setCard] = useState<any>(null); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [form, setForm] = useState<any>(null);
  const load = async () => { try { const r = await api<any>(`/api/admin/result-network/institutions/${encodeURIComponent(institutionId)}/card`); setCard(r); setForm({ contactName: r.institution.contact_name || '', contactPhone: r.institution.contact_phone || '', contactEmail: r.institution.contact_email || '', address: r.institution.address || '' }); } catch (e: any) { setError(e.message); } };
  if (!card && !error) void load();
  const save = async (e: React.FormEvent) => { e.preventDefault(); setError(''); setNotice(''); try { const r = await api<any>(`/api/admin/result-network/institutions/${encodeURIComponent(institutionId)}/card`, { method: 'PATCH', body: JSON.stringify(form) }); setCard(r); setNotice('Kurum kartı güncellendi.'); } catch (err: any) { setError(err.message); } };
  if (!card) return error ? <div className="alert error">{error}</div> : null;
  const i = card.institution;
  return <section className="panel institution-card-panel">
    <h3>Kurum kartı</h3>
    <p><strong>{i.name}</strong> · MEB kodu {i.meb_code || i.code} · {i.city} / {i.district}{i.ownership ? ` · ${i.ownership === 'PRIVATE' ? 'Özel' : 'Devlet'}` : ''}</p>
    {error && <div className="alert error">{error}</div>}{notice && <div className="alert success">{notice}</div>}
    <form onSubmit={save}>
      <label>Yetkili<input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></label>
      <label>Telefon<input type="tel" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} /></label>
      <label>E-posta<input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} /></label>
      <label>Adres<input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
      <button className="primary" type="submit">Kaydet</button>
    </form>
  </section>;
}

/** S020: the Super Admin or a dealer issues a school's one-time PIN; it is shown only once. */
export function InstitutionPinIssuer() {
  const [mebCode, setMebCode] = useState(''); const [result, setResult] = useState<any>(null); const [error, setError] = useState('');
  const issue = async (e: React.FormEvent) => { e.preventDefault(); setError(''); setResult(null); try { setResult(await api<any>('/api/admin/result-network/institution-pins', { method: 'POST', body: JSON.stringify({ mebCode: mebCode.trim() }) })); } catch (err: any) { setError(err.message); } };
  return <section className="panel institution-pin-panel">
    <h3>Kurum PIN'i ver</h3>
    <p>MEB kodunu girin. Kurum rehberdeyse kaydı otomatik açılır. PIN yalnız bir kez gösterilir; kuruma güvenli bir kanaldan iletin. Yeni PIN eskisini geçersiz kılar.</p>
    {error && <div className="alert error">{error}</div>}
    <form onSubmit={issue}><label>MEB kurum kodu<input required inputMode="numeric" pattern="\d{5,12}" value={mebCode} onChange={(e) => setMebCode(e.target.value)} /></label><button className="primary" type="submit">PIN oluştur</button></form>
    {result && <div className="alert success" role="status"><strong>{result.institution.name}</strong> ({result.institution.city} / {result.institution.district}) için PIN: <code style={{ fontSize: '1.3em', letterSpacing: '.15em' }}>{result.pin}</code><br /><small>Kurum sonuc.anunex.com → Kurum → "Kurum hesabı oluştur" ile bu PIN'i kullanır.</small></div>}
  </section>;
}
