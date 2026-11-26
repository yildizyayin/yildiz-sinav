import { Link } from 'react-router-dom';
import './mastery.css';

/**
 * Ustalık Yıldızları ve Kendi Rekorun (owner, 26 Nov 2026: bireysel ilerleme; öğrenciler birbiriyle kıyaslanmaz).
 * Stars come from the karne's own learning stages (Tanışma, Pekiştirme, Ustalık); a dimmed star asks for a review.
 * Every number here is the student's own; nothing about another student is ever shown.
 */
const LABEL = ['Henüz başlamadın', 'Tanışma', 'Pekiştirme', 'Ustalık'];

export function Stars({ n, dim = false, size = 16 }: { n: number; dim?: boolean; size?: number }) {
  const label = `${n}/3 yıldız · ${LABEL[n] || ''}${dim ? ' · tekrar zamanı' : ''}`;
  return <span className={`ms-stars${dim ? ' dim' : ''}`} role="img" aria-label={label} title={label}>
    {[1, 2, 3].map((k) => <svg key={k} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z" className={k <= n ? 'on' : 'off'} /></svg>)}
  </span>;
}

type Mastery = { byStars: number[]; stars: number; max: number; reviewDue: Array<{ id: string; code: string | null; title: string; game: string | null }> };
export function MasteryCard({ mastery, play }: { mastery?: Mastery | null; play: (outcome: string, template: string) => string }) {
  if (!mastery || !mastery.max) return null;
  const [, one, two, three] = mastery.byStars;
  return <section className="panel ms-card" aria-labelledby="ms-title">
    <div className="ms-head"><h2 id="ms-title">Ustalık Yıldızların</h2><span className="ms-total"><Stars n={1} size={18} /> {mastery.stars} / {mastery.max}</span></div>
    <p className="muted" style={{ margin: 0 }}>Her kazanımda üç yıldız: Tanışma, Pekiştirme, Ustalık. Burada yalnız kendi ilerlemen görünür.</p>
    <div className="ms-levels">
      <div><Stars n={1} /><strong>{one}</strong><span>Tanışma</span></div>
      <div><Stars n={2} /><strong>{two}</strong><span>Pekiştirme</span></div>
      <div><Stars n={3} /><strong>{three}</strong><span>Ustalık</span></div>
    </div>
    {mastery.reviewDue.length > 0 && <div className="ms-review"><strong>Tekrar zamanı</strong><span className="muted">Bu yıldızlar biraz söndü; kısa bir tekrarla yeniden parlarlar.</span>
      <ul>{mastery.reviewDue.map((o) => <li key={o.id}><Stars n={3} dim size={14} /><span>{o.code ? `${o.code} ` : ''}{o.title}</span>{o.game && <Link to={`${play(o.id, o.game)}&mode=REVIEW`}>Tekrar et →</Link>}</li>)}</ul></div>}
  </section>;
}

export type Progress = { rate: number; correct: number; total: number; first: boolean; previous: { correct: number; total: number; rate: number } | null; change: number | null; bestBefore: number | null; newBest: boolean; plays: number; stars: number; starsLabel: string; dim: boolean };
/** Kendi Rekorun: today against the student's own earlier plays of the same outcome, said kindly either way. */
export function OwnRecord({ p }: { p?: Progress | null }) {
  if (!p) return null;
  const line = p.first ? `Bu kazanımdaki ilk oyunun: %${p.rate}. Bundan sonra kendinle yarışacaksın.`
    : p.change! > 0 ? `Geçen sefer %${p.previous!.rate}, bugün %${p.rate}: ${p.change} puan gelişim!`
      : p.change === 0 ? `Geçen seferle aynı: %${p.rate}. İstikrar da bir başarı.`
        : `Geçen sefer %${p.previous!.rate}, bugün %${p.rate}. Bazı günler zor geçer; yanlışların tekrarda karşına gelecek.`;
  return <div className="ms-record" aria-live="polite">
    <span className="ms-tag">Kendi Rekorun</span>
    {p.newBest && <strong className="ms-best">Kendi rekorunu kırdın!</strong>}
    <span>{line}</span>
    <span className="ms-now"><Stars n={p.stars} dim={p.dim} size={18} /> {p.starsLabel}{p.plays > 1 ? ` · bu kazanımda ${p.plays}. oyunun` : ''}</span>
  </div>;
}
