import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Play, Video } from 'lucide-react';
import './public-video.css';

/**
 * video.anunex.com/c/<kod> (owner, 27 Nov 2026): what a student sees after scanning the QR next to a question on the
 * answer sheet — the solution video at once, the outcome it teaches, and the topic video when there is one. No
 * account, no menu, nothing about the student; a code not yet public says so kindly.
 */
type Info = { code: string; gradeLevel: number | null; subject: string | null; outcome: { code: string; title: string } | null; hasTopic: boolean };
export function PublicVideo() {
  const { code: raw = '' } = useParams();
  const navigate = useNavigate();
  const code = raw.toUpperCase();
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState('');
  const [which, setWhich] = useState<'solution' | 'topic'>('solution');
  const [typed, setTyped] = useState('');
  useEffect(() => {
    setInfo(null); setError(''); setWhich('solution');
    if (!code) return;
    fetch(`/api/public/video/${encodeURIComponent(code)}`).then(async (r) => { const b: any = await r.json().catch(() => null); if (!r.ok) throw new Error(b?.error?.message || 'Video bulunamadı.'); setInfo(b.video); }).catch((e) => setError(e.message || 'Video bulunamadı.'));
  }, [code]);
  return <div className="pv">
    <header className="pv-top"><span className="pv-logo">ANUNEX</span><span className="pv-sub">Çözüm videoları</span></header>
    {!code ? <section className="pv-card pv-join">
      <h1>Çözüm videosunu aç</h1>
      <p>Cevap kâğıdındaki QR’ı telefonunun kamerasıyla okut ya da QR’ın altındaki kodu yaz.</p>
      <form onSubmit={(e) => { e.preventDefault(); const c = typed.trim().toUpperCase(); if (c) navigate(`/c/${c}`); }}>
        <input value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={12} placeholder="KOD" aria-label="Video kodu" autoCapitalize="characters" spellCheck={false} />
        <button type="submit" disabled={!typed.trim()}>Aç</button>
      </form>
    </section> : error ? <section className="pv-card pv-join" role="alert"><h1>Video açılamadı</h1><p>{error}</p><p className="pv-code">Kod: {code}</p></section>
      : !info ? <p className="pv-wait">Video hazırlanıyor…</p>
        : <section className="pv-card">
          <div className="pv-meta">{info.outcome && <span className="pv-outcome">{info.outcome.code}</span>}<span>{[info.gradeLevel ? `${info.gradeLevel}. sınıf` : '', info.subject].filter(Boolean).join(' · ')}</span></div>
          {info.outcome && <h1>{info.outcome.title}</h1>}
          <div className="pv-player">
            <video key={which} src={`/api/public/video/${encodeURIComponent(info.code)}/${which}`} controls playsInline preload="metadata" autoPlay={which === 'topic'} />
          </div>
          <div className="pv-tabs" role="group" aria-label="Video">
            <button type="button" className={which === 'solution' ? 'on' : ''} aria-pressed={which === 'solution'} onClick={() => setWhich('solution')}><Play size={18} aria-hidden="true" />Sorunun çözümü</button>
            {info.hasTopic && <button type="button" className={which === 'topic' ? 'on' : ''} aria-pressed={which === 'topic'} onClick={() => setWhich('topic')}><Video size={18} aria-hidden="true" />Konuyu tekrar et</button>}
          </div>
          <p className="pv-code">Kod {info.code}</p>
        </section>}
    <footer className="pv-foot">ANUNEX · Bu sayfa giriş istemez ve seni tanımaz.</footer>
  </div>;
}
