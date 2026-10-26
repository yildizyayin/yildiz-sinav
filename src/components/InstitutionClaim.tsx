import { Fragment, useEffect, useState } from 'react';
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

/** S020/S022: Super Admin looks a school up by MEB/ANX code, sees its card and moves it into the app. */
export function InstitutionAdminLookup({ initialCode = '' }: { initialCode?: string } = {}) {
  const [code, setCode] = useState(initialCode); const [id, setId] = useState(''); const [conv, setConv] = useState<any>(null); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  useEffect(() => { if (initialCode) void find(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function find(e?: React.FormEvent) { e?.preventDefault(); setError(''); setNotice(''); setId(''); setConv(null);
    try { const r = await api<any>(`/api/admin/result-network/institutions/${encodeURIComponent(code.trim())}/card`); setId(r.institution.id); setConv(await api<any>(`/api/admin/result-network/institutions/${encodeURIComponent(r.institution.id)}/app-conversion`)); } catch (err: any) { setError(err.message); } }
  const act = async (action: 'PLAN' | 'CANCEL' | 'CONVERT') => { setError(''); setNotice('');
    if (action === 'CONVERT' && !window.confirm('Lisans ödemesi/onayı tamamlandı mı? Misafir öğrenciler app öğrencisine dönüşecek; bu işlem geri alınmaz.')) return;
    try { const r = await api<any>(`/api/admin/result-network/institutions/${encodeURIComponent(id)}/app-conversion`, { method: 'POST', body: JSON.stringify({ action, paymentConfirmed: action === 'CONVERT' }) }); setConv(r); setNotice(action === 'CONVERT' ? `${r.activated} öğrenci app'e geçti${r.skippedForLimit ? `; ${r.skippedForLimit} öğrenci lisans limiti nedeniyle bekliyor` : ''}.` : 'Kaydedildi.'); } catch (err: any) { setError(err.message); } };
  const label: Record<string, string> = { NONE: 'Yalnız sonuç ağı', PLANNED: 'App\'e geçiş planlandı (veri temizlikten korunuyor)', CONVERTED: 'App\'e geçti' };
  return <section className="panel institution-lookup-panel">
    <h3>Kurum kartı ve app'e geçiş</h3>
    <form onSubmit={find}><label>MEB veya ANX kurum kodu<input required value={code} onChange={(e) => setCode(e.target.value)} /></label><button className="secondary" type="submit">Kurumu aç</button></form>
    {error && <div className="alert error">{error}</div>}{notice && <div className="alert success">{notice}</div>}
    {id && <InstitutionCardPanel key={id} institutionId={id} />}
    {conv && <div className="conversion-box"><p><strong>Durum:</strong> {label[conv.status] || conv.status} · Misafir öğrenci: {conv.guestStudents} · App öğrencisi: {conv.activeStudents} · Sınav katılımı: {conv.examParticipations}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {conv.status === 'NONE' && <button className="secondary" onClick={() => void act('PLAN')}>App'e geçiş için işaretle</button>}
        {conv.status === 'PLANNED' && <button className="ghost" onClick={() => void act('CANCEL')}>İşareti kaldır</button>}
        {conv.status !== 'NONE' && conv.guestStudents > 0 && <button className="primary" onClick={() => void act('CONVERT')}>Öğrencileri app'e geçir</button>}
      </div></div>}
  </section>;
}

const LIFECYCLE_LABEL: Record<string, string> = { PASSIVE: 'Pasif', FROZEN: 'Dondurulmuş', ACTIVE: 'Aktif' };
const STATUS_LABEL: Record<string, string> = { DIRECTORY: 'Rehberde kayıtlı', CARD: 'Kurum kartı açık', CLAIMED: 'Hesabını açtı' };

/** S024: the Super Admin browses every MEB school in the directory, filters by city/district, and opens any school's card. */
type DirectoryActions = { onStatus?: (inst: any, status: string) => Promise<unknown>; onEdit?: (inst: any) => void };
export function InstitutionDirectoryBrowser({ reloadKey = 0, onStatus, onEdit }: { reloadKey?: number } & DirectoryActions) {
  const [q, setQ] = useState(''); const [city, setCity] = useState(''); const [district, setDistrict] = useState(''); const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const [open, setOpen] = useState('');
  const load = async (p = page) => {
    setLoading(true); setError('');
    try { const qs = new URLSearchParams({ q: q.trim(), city, district, page: String(p) }); setData(await api<any>(`/api/admin/result-network/institution-directory?${qs}`)); setPage(p); }
    catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };
  useEffect(() => { void load(1); }, [city, district, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  // The card is created on first use, then the same institution record is used for edit and status changes.
  const withCard = async (code: string, run: (inst: any) => unknown) => {
    setError('');
    try { const r = await api<any>(`/api/admin/result-network/institutions/${encodeURIComponent(code)}/card`); await run(r.institution); await load(page); }
    catch (err: any) { setError(err.message); }
  };
  return <section className="panel institution-directory-browser">
    <div className="panel-head"><div><span className="eyebrow">MEB KURUM REHBERİ</span><h2>Rehberdeki kurumlar</h2><p>MEB'e kayıtlı okullar sistemde hazır; ayrıca kurum açmaya gerek yok. Kurum kartını açınca kart oluşur, PIN verilebilir.</p></div></div>
    <form className="form-grid" onSubmit={(e) => { e.preventDefault(); void load(1); }}>
      <label>Kurum adı veya MEB kodu<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ör. Zonguldak Fen Lisesi veya 326653" /></label>
      <label>İl<select value={city} onChange={(e) => { setCity(e.target.value); setDistrict(''); }}><option value="">Tüm iller</option>{(data?.cities || []).map((c: any) => <option key={c.city} value={c.city}>{c.city} ({c.n})</option>)}</select></label>
      {city && <label>İlçe<select value={district} onChange={(e) => setDistrict(e.target.value)}><option value="">Tüm ilçeler</option>{(data?.districts || []).map((d: any) => <option key={d.district} value={d.district}>{d.district} ({d.n})</option>)}</select></label>}
      <div style={{ alignSelf: 'end' }}><button className="secondary" type="submit" disabled={loading}>Ara</button></div>
    </form>
    {error && <div className="alert error">{error}</div>}
    {data && <p className="bulk-directory-count" role="status">{data.total.toLocaleString('tr-TR')} kurum bulundu{data.total > data.pageSize ? ` · sayfa ${page} / ${pages}` : ''}.</p>}
    <div className="table-wrap"><table className="data-table"><thead><tr><th>MEB kodu</th><th>Kurum adı</th><th>İl / İlçe</th><th>Seviye</th><th>Durum</th><th></th></tr></thead>
      <tbody>{(data?.rows || []).map((r: any) => { const active = !r.lifecycle || r.lifecycle === 'ACTIVE'; return <Fragment key={r.code}><tr className={open === r.code ? 'selected' : undefined}><td>{r.code}</td><td><button className="link-button" type="button" title="Kurum kartını aç" onClick={() => setOpen(open === r.code ? '' : r.code)}>{r.name}</button>{r.ownership === 'PRIVATE' ? ' (özel)' : ''}</td><td>{r.city} / {r.district}</td><td>{r.level || '—'}</td><td>{STATUS_LABEL[r.status] || r.status}{!active ? ` · ${LIFECYCLE_LABEL[r.lifecycle] || r.lifecycle}` : ''}</td>
          <td><div className="row-actions"><button className="ghost" type="button" onClick={() => setOpen(open === r.code ? '' : r.code)}>{open === r.code ? 'Kartı kapat' : 'Kurum kartı'}</button>
            {onEdit && <button className="ghost" type="button" onClick={() => void withCard(r.code, onEdit)}>Düzenle</button>}
            {onStatus && <button className="ghost" type="button" onClick={() => void withCard(r.code, (inst) => onStatus(inst, active ? 'PASSIVE' : 'ACTIVE'))}>{active ? 'Pasife al' : 'Etkinleştir'}</button>}
            {onStatus && r.lifecycle !== 'FROZEN' && <button className="ghost" type="button" onClick={() => void withCard(r.code, (inst) => onStatus(inst, 'FROZEN'))}>Dondur</button>}</div></td></tr>
          {open === r.code && <tr><td colSpan={6}><InstitutionAdminLookup key={open} initialCode={open} /></td></tr>}</Fragment>; })}
        {data && !data.rows.length && <tr><td colSpan={6} className="empty">Aramaya uyan kurum yok. Rehber boşsa önce MEB kurum dizinini yükleyin.</td></tr>}</tbody></table></div>
    {data && pages > 1 && <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}><button className="ghost" type="button" disabled={loading || page <= 1} onClick={() => void load(page - 1)}>Önceki</button><span>{page} / {pages}</span><button className="ghost" type="button" disabled={loading || page >= pages} onClick={() => void load(page + 1)}>Sonraki</button></div>}
  </section>;
}
