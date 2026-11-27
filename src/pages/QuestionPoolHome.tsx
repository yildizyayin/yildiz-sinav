import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Plus } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { LogoUpload, PaperPreview, useBrand } from '../components/InstitutionLogo';
import './question-pool-home.css';
import './test-prepare.css';

/**
 * Soru Havuzu (owner, 27 Nov 2026): for institutions and teachers the entry shows only two choices — Test Hazırla and
 * Testlerim. Teachers are not asked to learn a tool; the work starts with one tap. (The Super Admin keeps the pool
 * management panel under the same name.)
 */
export function QuestionPoolHome() {
  const { user } = useAuth();
  const [drafts, setDrafts] = useState<number | null>(null);
  useEffect(() => { api<{ tests: any[] }>('/api/teacher-tests').then((r) => setDrafts(r.tests.filter((t) => t.kind === 'DRAFT' && (user?.role !== 'TEACHER' || t.mine)).length)).catch(() => setDrafts(null)); }, [user?.role]);
  const manager = user?.role !== 'TEACHER';
  const { brand, reload } = useBrand();
  return <div className="qph">
    <header>
      <p>Soru Havuzu</p>
      <h1>Ne yapmak istiyorsun?</h1>
    </header>
    <div className="qph-tiles">
      <Link className="qph-tile qph-main" to="/soru-havuzu/hazirla">
        <svg className="qph-orb" viewBox="0 0 300 300" aria-hidden="true"><circle cx="150" cy="150" r="120" /><circle cx="150" cy="150" r="84" className="dash" /><circle cx="150" cy="150" r="46" className="sun" /><circle cx="252" cy="104" r="10" className="moon" /></svg>
        <span className="qph-icon"><Plus size={34} aria-hidden="true" /></span>
        <span className="qph-text"><strong>Test Hazırla</strong><span>Üniteyi seç, test hazır gelsin. Ödev ver ya da yazdır.</span></span>
      </Link>
      <Link className="qph-tile" to="/soru-havuzu/testlerim">
        <span className="qph-icon soft"><ClipboardList size={34} aria-hidden="true" /></span>
        <span className="qph-text"><strong>{manager ? 'Kurumun testleri' : 'Testlerim'}</strong><span>{manager ? 'Öğretmenlerin hazırladığı testler ve sonuçları.' : 'Hazırladığın testler, sonuçlar ve yarım kalanlar.'}</span>
          {drafts ? <em>{drafts} test yarım kaldı</em> : null}</span>
      </Link>
    </div>
    {/* Owner, 27 Nov 2026: the institution's name and logo on every printed test — the manager sets the logo here, in one place */}
    {brand?.canUpload && brand.institutionName && <section className={`qph-brand${brand.hasLogo ? '' : ' missing'}`} aria-labelledby="qph-brand-h">
      <PaperPreview brand={brand} title="Kuvveti Tanıyalım · Ünite testi" useInstitution showAnunex lines={4} />
      <div>
        <h2 id="qph-brand-h">{brand.hasLogo ? 'Kurum logonuz testlerde çıkıyor' : 'Kurum logonuzu yükleyin'}</h2>
        <p>{brand.hasLogo ? `Yazdırılan her testin sol üstünde ${brand.institutionName} adı ve logosu, optik formda ve cevap anahtarında da kurum bilgisi var.` : `Yazdırılan testlerde şimdilik yalnız “${brand.institutionName}” yazıyor. Logoyu bir kez yükleyin; bütün öğretmenlerin testlerinde, optik formda ve cevap anahtarında çıksın.`}</p>
        <LogoUpload brand={brand} onDone={reload} />
      </div>
    </section>}
  </div>;
}
