import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { Turnstile } from './Turnstile';

/**
 * Student sign-in on sonuc (D-S038, owner 28 Oct): İl › İlçe › Kurum, sınıf düzeyi, öğrenci no (or T.C.) and the
 * first three letters of the name. No access code and no card. The last il / ilçe / kurum are remembered on this
 * device only, so a returning student fills in three fields.
 */
type Inst = { code: string; name: string; city: string; district: string };
const KEY = 'anunex_student_place';
const recall = (): { city?: string; district?: string; inst?: Inst } => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
const keep = (v: object) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage may be blocked */ } };

export function StudentLogin({ siteKey, onSignedIn }: { siteKey: string; onSignedIn: () => Promise<void> }) {
  const saved = recall();
  const [cities, setCities] = useState<string[]>([]); const [districts, setDistricts] = useState<string[]>([]); const [schools, setSchools] = useState<Inst[]>([]);
  const [city, setCity] = useState(saved.city || ''); const [district, setDistrict] = useState(saved.district || ''); const [inst, setInst] = useState<Inst | null>(saved.inst || null);
  const [byName, setByName] = useState(false); const [query, setQuery] = useState(''); const [found, setFound] = useState<Inst[]>([]);
  const [form, setForm] = useState({ gradeLevel: '', lookupType: 'STUDENT_NUMBER', lookupValue: '', namePrefix: '', fullName: '' });
  const [needFull, setNeedFull] = useState(false);
  const [token, setToken] = useState(''); const [cycle, setCycle] = useState(0);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [info, setInfo] = useState('');
  const onToken = useCallback((v: string) => setToken(v), []);

  useEffect(() => { void api<any>('/api/public/results/locations').then((r) => setCities(r.cities || [])).catch(() => setCities([])); }, []);
  useEffect(() => { setDistricts([]); if (!city) return; void api<any>(`/api/public/results/locations?city=${encodeURIComponent(city)}`).then((r) => setDistricts(r.districts || [])).catch(() => undefined); }, [city]);
  useEffect(() => { setSchools([]); if (!city || !district) return; void api<any>(`/api/public/results/institutions?${new URLSearchParams({ city, district })}`).then((r) => setSchools(r.institutions || [])).catch(() => undefined); }, [city, district]);
  useEffect(() => { if (!byName) return; const h = setTimeout(() => { if (query.trim().length < 2) { setFound([]); return; } void api<any>(`/api/public/results/institutions?q=${encodeURIComponent(query)}`).then((r) => setFound(r.institutions || [])).catch(() => setFound([])); }, 250); return () => clearTimeout(h); }, [query, byName]);

  const pick = (i: Inst | null) => { setInst(i); if (i) keep({ city: i.city, district: i.district, inst: i }); };
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!inst) return; setBusy(true); setError(''); setInfo('');
    try {
      const r = await api<any>('/api/public/results/login', { method: 'POST', body: JSON.stringify({ ...form, institutionCode: inst.code, turnstileToken: token }) });
      if (r.found === false) { setInfo(r.message || 'Kurumunuz için yayınlanmış sonuç yok.'); setToken(''); setCycle((c) => c + 1); return; }
      await onSignedIn();
    } catch (err) { if (err instanceof ApiError && err.code === 'FULL_NAME_REQUIRED') setNeedFull(true); setError(err instanceof ApiError ? err.message : 'Giriş yapılamadı.'); setToken(''); setCycle((c) => c + 1); } finally { setBusy(false); }
  };
  const ready = !!inst && !!form.gradeLevel && !!form.lookupValue && form.namePrefix.replace(/\s/g, '').length >= 3 && (!needFull || form.fullName.trim().length >= 5) && !!token;

  return <form className="result-form student-login" onSubmit={submit} noValidate={false}>
    <div><span className="result-kicker">ÖĞRENCİ GİRİŞİ</span><h2>Sonucunu gör</h2><p>Kurumunu seç, sınıfını, numaranı ve adının ilk 3 harfini yaz. T.C. kimlik numarası açık olarak saklanmaz.</p></div>
    {error && <div className="result-alert" role="alert">{error}</div>}
    {info && <div className="result-info" role="status">{info}</div>}
    <fieldset className="sl-group"><legend>Kurum</legend>
      {!byName ? <>
        <div className="result-two">
          <label>İl<select value={city} onChange={(e) => { setCity(e.target.value); setDistrict(''); pick(null); }} required><option value="">İl seçin</option>{cities.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>İlçe<select value={district} disabled={!city} onChange={(e) => { setDistrict(e.target.value); pick(null); }} required><option value="">{city ? 'İlçe seçin' : 'Önce il'}</option>{districts.map((d) => <option key={d}>{d}</option>)}{district && !districts.includes(district) && <option>{district}</option>}</select></label>
        </div>
        <label>Kurum<select value={inst?.code || ''} disabled={!district} onChange={(e) => pick(schools.find((s) => s.code === e.target.value) || null)} required><option value="">{district ? (schools.length ? 'Kurum seçin' : 'Yükleniyor…') : 'Önce ilçe'}</option>{schools.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}{inst && !schools.some((s) => s.code === inst.code) && <option value={inst.code}>{inst.name}</option>}</select></label>
      </> : <label className="sl-search">Kurum adı veya MEB kodu<input value={query} onChange={(e) => { setQuery(e.target.value); pick(null); }} placeholder="Örn. Anadolu Lisesi veya 972857" autoFocus />
        {!!found.length && !inst && <div className="institution-options">{found.map((x) => <button type="button" key={x.code} onClick={() => { pick(x); setCity(x.city); setDistrict(x.district); setQuery(`${x.name} · ${x.code}`); setFound([]); }}><strong>{x.name}</strong><span>{x.city} · {x.district} · {x.code}</span></button>)}</div>}</label>}
      <button type="button" className="sl-link" onClick={() => { setByName(!byName); setFound([]); setQuery(''); }}>{byName ? 'İl ve ilçeden seç' : 'Kurumu adı veya MEB koduyla ara'}</button>
      {inst && <p className="sl-picked">Seçilen: <b>{inst.name}</b> · {inst.district} / {inst.city}</p>}
    </fieldset>
    <fieldset className="sl-group"><legend>Öğrenci</legend>
      <div className="result-two">
        <label>Sınıf düzeyi<select value={form.gradeLevel} onChange={(e) => set('gradeLevel', e.target.value)} required><option value="">Seçin</option>{Array.from({ length: 12 }, (_, i) => i + 1).map((x) => <option key={x} value={x}>{x}. sınıf</option>)}</select></label>
        <label>Arama yöntemi<select value={form.lookupType} onChange={(e) => set('lookupType', e.target.value)}><option value="STUDENT_NUMBER">Öğrenci numarası</option><option value="TCKN">T.C. kimlik numarası</option></select></label>
      </div>
      <div className="result-two">
        <label>{form.lookupType === 'TCKN' ? 'T.C. kimlik numarası' : 'Öğrenci numarası'}<input value={form.lookupValue} onChange={(e) => set('lookupValue', e.target.value.replace(/\s/g, ''))} inputMode="numeric" autoComplete="off" required /></label>
        <label>Adının ilk 3 harfi<input value={form.namePrefix} onChange={(e) => set('namePrefix', e.target.value.slice(0, 3))} maxLength={3} autoComplete="off" autoCapitalize="characters" placeholder="Örn. MEL" required /></label>
      </div>
      {needFull && <label>Adınız ve soyadınız (tam)<input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} autoComplete="off" placeholder="Örn. Melis Yılmaz" required autoFocus /></label>}
    </fieldset>
    <Turnstile key={cycle} siteKey={siteKey} onToken={onToken} />
    <button className="result-primary" disabled={busy || !ready}>{busy ? 'Kontrol ediliyor…' : 'Sonucumu göster'}</button>
  </form>;
}
