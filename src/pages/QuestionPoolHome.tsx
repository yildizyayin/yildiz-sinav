import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Plus } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import './question-pool-home.css';

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
  return <div className="qph">
    <header>
      <p>Soru Havuzu</p>
      <h1>Ne yapmak istiyorsun?</h1>
    </header>
    <div className="qph-tiles">
      {/* Test Hazırla's own screens come next; until then it opens the Studio generator */}
      <Link className="qph-tile qph-main" to="/content-center">
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
  </div>;
}
