import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import './PilotApplicationForm.css';

/**
 * Pilot okul başvurusu (owner, 12 Nov 2026) on anunex.com. Posts to app.anunex.com; only contact details, with the
 * KVKK notice shown right under the form. No student data is asked.
 */
const ENDPOINT = 'https://app.anunex.com/api/public/pilot-applications';
const TYPES: [string, string][] = [['DEVLET_OKULU', 'Devlet okulu'], ['OZEL_OKUL', 'Özel okul'], ['KURS', 'Kurs / dershane'], ['ETUT_MERKEZI', 'Etüt merkezi'], ['DIGER', 'Diğer']];
const COUNTS = ['0-100', '100-300', '300-500', '500-1000', '1000+'];

export function PilotApplicationForm() {
  const [f, setF] = useState({ institutionName: '', city: '', institutionType: '', studentCount: '', contactName: '', phone: '', email: '', message: '', website: '' });
  const [kvkk, setKvkk] = useState(false); const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, kvkk }) });
      const data: any = await res.json().catch(() => null);
      if (res.status === 201 || res.status === 429) setDone(true);
      else setError(data?.error?.message || 'Başvuru gönderilemedi; lütfen bizi arayın.');
    } catch { setError('Bağlantı kurulamadı; lütfen bizi arayın.'); } finally { setBusy(false); }
  };
  if (done) return <div className="pilot-form pilot-done" role="status"><CheckCircle2 size={34} /><h3>Başvurunuz bize ulaştı</h3><p>Pilot okul programı için en kısa sürede sizi arayacağız. Teşekkür ederiz.</p></div>;
  return <form className="pilot-form" onSubmit={submit} aria-labelledby="pilot-title">
    <h3 id="pilot-title">Pilot okul başvurusu</h3>
    <p className="pilot-lead">İlk pilot okullardan biri olun: kurulum, eğitim ve ilk dönem desteği bizden. Formu bırakın, sizi arayalım.</p>
    {error && <div className="pilot-error" role="alert">{error}</div>}
    <div className="pilot-grid">
      <label className="wide">Kurum adı<input required maxLength={160} value={f.institutionName} onChange={set('institutionName')} autoComplete="organization" /></label>
      <label>İl<input required maxLength={60} value={f.city} onChange={set('city')} autoComplete="address-level1" /></label>
      <label>Kurum türü<select required value={f.institutionType} onChange={set('institutionType')}><option value="">Seçin</option>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label>Öğrenci sayısı<select value={f.studentCount} onChange={set('studentCount')}><option value="">Seçin</option>{COUNTS.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
      <label>Yetkili adı soyadı<input required maxLength={120} value={f.contactName} onChange={set('contactName')} autoComplete="name" /></label>
      <label>Telefon<input required inputMode="tel" maxLength={30} placeholder="05XX XXX XX XX" value={f.phone} onChange={set('phone')} autoComplete="tel" /></label>
      <label>E-posta (isteğe bağlı)<input type="email" maxLength={160} value={f.email} onChange={set('email')} autoComplete="email" /></label>
      <label className="wide">Notunuz (isteğe bağlı)<textarea maxLength={600} rows={3} value={f.message} onChange={set('message')} /></label>
      <label className="pilot-hp" aria-hidden="true">Web sitesi<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} /></label>
    </div>
    <label className="pilot-kvkk"><input type="checkbox" checked={kvkk} onChange={(e) => setKvkk(e.target.checked)} required />
      <span><button type="button" className="pilot-link" onClick={() => setOpen(!open)}>Aydınlatma metnini</button> okudum; başvurumla ilgili aranmak için bilgilerimin işlenmesini kabul ediyorum.</span></label>
    {open && <div className="pilot-notice">
      <p><strong>Pilot okul başvurusu aydınlatma metni.</strong> Bu formda verdiğiniz kurum adı, il, kurum türü, öğrenci sayısı aralığı, yetkili adı, telefon, e-posta ve notunuz; yalnızca başvurunuzu değerlendirmek ve sizinle pilot program hakkında iletişime geçmek amacıyla, 6698 sayılı KVKK’nın 5/2-c (sözleşmenin kurulması) ve 5/2-f (meşru menfaat) maddelerine dayanılarak işlenir.</p>
      <p>Bilgileriniz ANUNEX’in Türkiye’deki yetkili ekibi dışında kimseyle paylaşılmaz; veriler Cloudflare altyapısında saklanır. Kötüye kullanımı önlemek için bağlantı adresiniz yalnızca geri döndürülemez biçimde (özet) tutulur. Pilot görüşmesi sonuçlanmazsa bilgileriniz en geç 1 yıl içinde silinir.</p>
      <p>KVKK’nın 11. maddesindeki haklarınız (bilgi isteme, düzeltme, silme vb.) için bize telefon ya da WhatsApp üzerinden ulaşabilirsiniz. Formda öğrenci bilgisi istenmez; lütfen yazmayın.</p>
    </div>}
    <button type="submit" className="marketing-button" disabled={busy}>{busy ? 'Gönderiliyor…' : 'Başvuruyu gönder'}</button>
  </form>;
}
