import { useEffect, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { api } from '../api';

/**
 * The institution's print identity (owner, 27 Nov 2026: "testi hazırladı matbu olarak yazdırdı kurum adı ve logosu
 * çıksın"). One source for every screen: the name, whether a print logo is uploaded, and who may upload one — the
 * institution manager. A teacher is told to ask them; nobody is sent to a hidden settings page.
 */
export type Brand = { institutionId: string | null; institutionName: string | null; hasLogo: boolean; logoVersion?: string | null; canUpload: boolean };
export const logoUrl = (b: Brand) => `/api/teacher-tests/branding/logo?v=${encodeURIComponent(b.logoVersion || '')}`;

export function useBrand() {
  const [brand, setBrand] = useState<Brand | null>(null);
  const load = () => api<any>('/api/teacher-tests/branding').then((r) => setBrand(r && typeof r.hasLogo === 'boolean' ? r : null)).catch(() => setBrand(null));
  useEffect(() => { void load(); }, []);
  return { brand, reload: load };
}

/** Pick → upload → the paper shows it at once. PNG or JPEG, at most 1 MB (the printer's limits, checked again on the server). */
export function LogoUpload({ brand, onDone, label }: { brand: Brand; onDone: () => void; label?: string }) {
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const upload = async (file?: File) => {
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) { setMsg({ ok: false, text: 'Logo PNG ya da JPEG olmalı.' }); return; }
    if (file.size > 1024 * 1024) { setMsg({ ok: false, text: 'Logo en fazla 1 MB olabilir.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const form = new FormData(); form.append('file', file);
      await api(`/api/platform/studio/branding/logo${brand.institutionId ? `?institutionId=${encodeURIComponent(brand.institutionId)}` : ''}`, { method: 'POST', body: form });
      setMsg({ ok: true, text: 'Logo kaydedildi. Bundan sonra yazdırılan bütün testlerde çıkacak.' }); onDone();
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Logo yüklenemedi.' }); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  return <span className="logo-up">
    <input ref={input} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => void upload(e.target.files?.[0])} />
    <button type="button" className="logo-up-btn" disabled={busy} onClick={() => input.current?.click()}><ImagePlus size={18} aria-hidden="true" /> {busy ? 'Yükleniyor…' : label || (brand.hasLogo ? 'Logoyu değiştir' : 'Logo yükle')}</button>
    {msg && <span className={msg.ok ? 'logo-up-ok' : 'logo-up-err'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</span>}
  </span>;
}

/** A small A4 sheet as it will print: logo and institution top-left, ANUNEX top-right, the test's first lines. */
export function PaperPreview({ brand, title, useInstitution, showAnunex, lines = 6 }: { brand: Brand | null; title: string; useInstitution: boolean; showAnunex: boolean; lines?: number }) {
  const withInst = useInstitution && !!brand?.institutionName;
  const withLogo = useInstitution && !!brand?.hasLogo;
  return <div className="paper" aria-label="Kâğıdın görünümü">
    <div className="paper-head">
      {withLogo ? <img className="paper-logo" src={logoUrl(brand!)} alt={`${brand!.institutionName || 'Kurum'} logosu`} /> : useInstitution ? <span className="paper-logo empty" aria-hidden="true">logo</span> : null}
      <div className="paper-titles">{withInst && <small>{brand!.institutionName}</small>}<strong>{title}</strong></div>
      {showAnunex && <span className="paper-anunex">ANUNEX</span>}
    </div>
    <div className="paper-name">Ad Soyad ________ Sınıf ____ No ____</div>
    <div className="paper-cols">{[0, 1].map((c) => <div key={c}>{Array.from({ length: lines }, (_, i) => <span key={i} style={{ width: `${62 + ((i * 17 + c * 11) % 34)}%` }} />)}</div>)}</div>
    {withInst && <div className="paper-foot">{brand!.institutionName} · Sayfa 1</div>}
  </div>;
}
