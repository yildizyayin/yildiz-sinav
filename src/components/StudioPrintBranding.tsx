import { useEffect, useState } from 'react';
import { api } from '../api';

/** A017: per-document print branding choices and the institution's own print logo. */
export type PrintBranding = { showAnunex: boolean; showNibiru: boolean; useInstitution: boolean };

export function StudioPrintBranding({ value, onChange, onError }: { value: PrintBranding; onChange: (v: PrintBranding) => void; onError: (m: string) => void }) {
  const [info, setInfo] = useState<{ institutionName: string | null; hasLogo: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api<any>('/api/platform/studio/branding/logo').then(r => setInfo({ institutionName: r.institutionName, hasLogo: !!r.hasLogo })).catch(() => setInfo(null));
  useEffect(() => { void load(); }, []);
  const upload = async (file: File | undefined) => {
    if (!file) return; setBusy(true); onError('');
    try {
      const form = new FormData(); form.append('file', file);
      const response = await fetch('/api/platform/studio/branding/logo', { method: 'POST', body: form, credentials: 'same-origin' });
      const body: any = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message || 'Logo yüklenemedi.');
      await load();
    } catch (e: any) { onError(e.message || 'Logo yüklenemedi.'); } finally { setBusy(false); }
  };
  const set = (key: keyof PrintBranding) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: e.target.checked });
  return <fieldset className="studio-print-branding" style={{ border: '1px solid #e3e8f0', borderRadius: 10, padding: '8px 10px', display: 'grid', gap: 6 }}>
    <legend style={{ fontSize: 12, fontWeight: 700 }}>Baskı görünümü</legend>
    <label className="check"><input type="checkbox" checked={value.useInstitution} onChange={set('useInstitution')} /> Kurum adı ve logosu sol üstte{info?.institutionName ? ` (${info.institutionName}${info.hasLogo ? ', logo yüklü' : ', logo yok'})` : ''}</label>
    <label className="check"><input type="checkbox" checked={value.showAnunex} onChange={set('showAnunex')} /> ANUNEX logosu sağ üstte</label>
    <label className="check"><input type="checkbox" checked={value.showNibiru} onChange={set('showNibiru')} /> Yapay zekâ (Nibiru) ile üretilen soruların yanında Nibiru işareti</label>
    {info && <label style={{ fontSize: 12 }}>Kurum baskı logosu (PNG/JPEG, en fazla 1 MB)<input type="file" accept="image/png,image/jpeg" disabled={busy} onChange={e => void upload(e.target.files?.[0])} /></label>}
  </fieldset>;
}
