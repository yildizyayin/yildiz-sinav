import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Compass, Flame, RotateCcw, Sparkles, Target } from 'lucide-react';
import { api } from '../api';
import { NibiruMark } from '../components/NibiruMark';
import '../components/universe/universe-map.css';

/**
 * Nibiru Öğrenme Evreni — the learning map (owner, 11 Nov 2026). One page, three looks by age group:
 * A (4–6) lively and big, B (7–8) map + levels, C (9–12) calm and plan-like. Only playable game kinds are offered;
 * an outcome without approved content says so. Missions are suggestions; nothing is lost by skipping a day.
 */
const MISSION: Record<string, { label: string; icon: any }> = { REVIEW: { label: 'Tekrar zamanı', icon: RotateCcw }, STRENGTHEN: { label: 'Güçlendir', icon: Target }, DISCOVER: { label: 'Keşfet', icon: Compass } };
const GREETING: Record<string, string> = { A: 'Bugün hangi gezegene uçalım?', B: 'Görevlerin hazır; kaldığın yerden devam et.', C: 'Bugünkü çalışma planın.' };
const play = (outcome: string, template: string) => `/evren/oyna?outcome=${encodeURIComponent(outcome)}&template=${encodeURIComponent(template)}`;

export function UniverseHome() {
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState('');
  const [subject, setSubject] = useState('');
  const [open, setOpen] = useState('');
  useEffect(() => { api<any>('/api/student-standard/universe/map').then((r) => { setD(r); setSubject(r.subjects?.[0]?.id || ''); }).catch((e) => setError(e.message)); }, []);
  const current = useMemo(() => d?.subjects?.find((s: any) => s.id === subject), [d, subject]);
  if (error) return <div className="alert error">{error}</div>;
  if (!d) return <div className="panel">Evren yükleniyor…</div>;
  const group = d.student.designGroup || 'B';
  const weekPct = Math.min(100, Math.round((d.week.done / Math.max(1, d.week.goal)) * 100));
  return <div className="um" data-group={group}>
    <header className="um-hero">
      <div className="um-guide"><NibiruMark size={group === 'A' ? 64 : 48} state="active" title="" /><div><span className="um-kicker">Nibiru Öğrenme Evreni · {d.student.gradeLevel}. sınıf</span><h1>{GREETING[group]}</h1></div></div>
      <div className="um-stats">
        <div className="um-stat"><Sparkles size={18} aria-hidden="true" /><div><strong>Seviye {d.xp.level}</strong><span className="um-bar" aria-label={`Sonraki seviyeye ${d.xp.toNext} XP`}><i style={{ width: `${100 - (d.xp.toNext / 200) * 100}%` }} /></span><small>{d.xp.total} XP · sonrakine {d.xp.toNext}</small></div></div>
        <div className="um-stat"><Flame size={18} aria-hidden="true" /><div><strong>Bu hafta {d.week.done}/{d.week.goal}</strong><span className="um-bar"><i style={{ width: `${weekPct}%` }} /></span><small>Haftalık hedef bir öneridir.</small></div></div>
      </div>
    </header>

    <section aria-labelledby="um-missions">
      <h2 id="um-missions" className="um-h2">Bugünün görevleri</h2>
      {d.missions.length ? <div className="um-missions">{d.missions.map((m: any) => { const M = MISSION[m.type]; const Icon = M.icon; return <Link key={m.type} className={`um-mission ${m.type.toLowerCase()}`} to={play(m.outcomeId, m.game)}>
        <span className="um-mission-type"><Icon size={16} aria-hidden="true" /> {M.label}</span><strong>{m.title}</strong>{m.code && <small>{m.code}</small>}<span className="um-go">Başla →</span></Link>; })}</div>
        : <p className="um-empty">{d.summary.playable ? 'Bugün için önerilecek bir görev yok; haritadan istediğin gezegeni seçebilirsin.' : 'Sınıfın için onaylı etkinlikler hazırlandıkça görevlerin burada görünecek.'}</p>}
    </section>

    <section aria-labelledby="um-map">
      <div className="um-map-head"><h2 id="um-map" className="um-h2">Öğrenme haritası</h2><small>{d.summary.outcomes} kazanımın {d.summary.playable} tanesi için etkinlik hazır · {d.summary.learned} öğrenildi</small></div>
      {!d.subjects.length ? <p className="um-empty">Bu eğitim yılı için sınıfının doğrulanmış MEB programı henüz yüklenmedi.</p> : <>
        <div className="um-tabs" role="tablist">{d.subjects.map((s: any) => <button key={s.id} role="tab" type="button" aria-selected={s.id === subject} className={s.id === subject ? 'on' : ''} onClick={() => { setSubject(s.id); setOpen(''); }}>{s.name}</button>)}</div>
        <div className="um-planets">{current?.planets.map((p: any, k: number) => {
          const id = `${current.id}:${p.name}`, pct = Math.round((p.learned / Math.max(1, p.outcomes.length)) * 100), isOpen = open === id;
          return <div key={id} className={`um-planet${p.discovered ? ' found' : ''}${isOpen ? ' open' : ''}`} style={{ ['--hue' as any]: (k * 47) % 360 }}>
            <button type="button" className="um-planet-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? '' : id)}>
              <span className="um-orb" aria-hidden="true"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5" className="track" />{pct > 0 && <circle cx="18" cy="18" r="15.5" className="fill" strokeDasharray={`${pct} 100`} pathLength={100} />}</svg></span>
              <span className="um-planet-text"><strong>{p.name}</strong><small>{p.outcomes.length} kazanım · {p.playable ? `${p.playable} kazanımda etkinlik hazır` : 'içerik hazırlanıyor'}{p.discovered ? ' · keşfedildi' : ''}</small></span>
              <ChevronDown size={18} aria-hidden="true" className="um-chev" />
            </button>
            {isOpen && <ul className="um-outcomes">{p.outcomes.map((o: any) => <li key={o.id}>
              <div className="um-o-text"><span className={`um-stage ${o.stage.toLowerCase()}`}>{o.stageLabel}{o.reviewDue ? ' · tekrar zamanı' : ''}</span><strong>{o.code ? `${o.code} ` : ''}{o.title}</strong></div>
              {o.games.length ? <div className="um-games">{o.games.map((g: any) => <Link key={g.code} className="um-game" to={play(o.id, g.code)}>{g.title}</Link>)}</div> : <small className="um-none">Bu kazanım için onaylı etkinlik hazırlanıyor.</small>}
            </li>)}</ul>}
          </div>;
        })}</div>
      </>}
    </section>
  </div>;
}
