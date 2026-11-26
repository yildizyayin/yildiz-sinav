import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { REASONS, useRaceSocket } from '../components/race/useRaceSocket';
import '../components/race/class-race.css';

/**
 * Sınıf Uzay Yarışı, the teacher's board (owner, 25–26 Nov 2026). Made for the classroom screen: the teacher picks the
 * class and a verified MEB outcome of its grade, the class joins with the code, and one button moves the race on.
 * The board shows who joined and answered, the answers' spread after each question, the podium and the class report.
 */
const COLORS = ['#ffd166', '#ff6b7d', '#5aa8ff', '#3ee08f', '#b69cff', '#ff8a3d', '#7ee0f0', '#f472b6'];
const BAR = ['#e5484d', '#3b82f6', '#ca8a04', '#16a34a', '#9333ea'];
const Rocket = ({ c }: { c: string }) => <svg viewBox="0 0 46 24" aria-hidden="true"><path d="M6 12 L14 4 L34 4 Q44 12 34 20 L14 20 Z" fill={c} /><circle cx="30" cy="12" r="4" fill="#0b1440" stroke="#fff" strokeWidth="1.5" /><path d="M14 4 L8 0 L10 6 Z M14 20 L8 24 L10 18 Z" fill={c} opacity=".7" /></svg>;

export function ClassRaceBoard() {
  const [classes, setClasses] = useState<any[]>([]);
  const [live, setLive] = useState(true);
  const [classId, setClassId] = useState('');
  const [q, setQ] = useState('');
  const [outcomes, setOutcomes] = useState<any[]>([]);
  const [outcomeId, setOutcomeId] = useState('');
  const [count, setCount] = useState(5);
  const [seconds, setSeconds] = useState(20);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [race, setRace] = useState<any>(null);
  const cls = classes.find((c) => c.id === classId);
  useEffect(() => { api<any>('/api/class-race/classes').then((r) => { setClasses(r.classes || []); setLive(r.live !== false); if (r.classes?.length === 1) setClassId(r.classes[0].id); }).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    if (!cls) { setOutcomes([]); return; }
    const t = setTimeout(() => api<any>(`/api/reporting/universe/outcomes?gradeLevel=${cls.grade_level}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`)
      .then((r) => setOutcomes((r.outcomes || []).filter((o: any) => !o.academic_year || o.academic_year === cls.academic_year))).catch((e) => setError(e.message)), 250);
    return () => clearTimeout(t);
  }, [classId, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const create = async () => {
    setBusy(true); setError('');
    try { const r = await api<any>('/api/class-race', { method: 'POST', body: JSON.stringify({ classId, outcomeId, questionCount: count, seconds }) }); setRace(r.race); }
    catch (e: any) { setError(e.message); }
    setBusy(false);
  };
  return <div className="page" style={{ display: 'grid', gap: 16 }}>
    <div className="page-head"><div><span className="eyebrow">Öğrenme Evreni</span><h1>Sınıf Uzay Yarışı</h1><p className="muted">Sınıfınla canlı yarış: sorular kazanıma bağlı ve onaylı, puan yalnız doğru cevaptan gelir, sonuçlar karneye işlenir.</p></div></div>
    {!race && <section className="cr">
      <h2>Yeni yarış</h2>
      {!live && <div className="cr-alert">Canlı yarış bu ortamda henüz açık değil.</div>}
      {error && <div className="cr-alert" role="alert">{error}</div>}
      <div className="cr-form">
        <label>Sınıf<select value={classId} onChange={(e) => { setClassId(e.target.value); setOutcomeId(''); }}><option value="">{classes.length ? 'Sınıf seç' : 'Atanmış sınıfın yok'}</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.grade_level}. sınıf</option>)}</select></label>
        <label>Kazanım ara<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kod ya da kazanım" disabled={!cls} /></label>
        <label>Soru sayısı<select value={count} onChange={(e) => setCount(Number(e.target.value))}>{[3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n} soru</option>)}</select></label>
        <label>Soru başına süre<select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>{[15, 20, 30, 45, 60].map((n) => <option key={n} value={n}>{n} saniye</option>)}</select></label>
      </div>
      <div className="cr-form" style={{ gridTemplateColumns: '1fr' }}><label>Kazanım<select value={outcomeId} onChange={(e) => setOutcomeId(e.target.value)} disabled={!cls}><option value="">{cls ? `${outcomes.length} doğrulanmış kazanım` : 'Önce sınıf seç'}</option>{outcomes.map((o) => <option key={o.id} value={o.id}>{o.subject_name} · {o.code} {o.title}</option>)}</select></label></div>
      <div className="cr-row"><button type="button" className="cr-next" disabled={!classId || !outcomeId || busy || !live} onClick={() => void create()}>{busy ? 'Hazırlanıyor…' : '🚀 Yarışı oluştur'}</button><span className="cr-muted">Sorular bu kazanımın onaylı soru havuzundan seçilir.</span></div>
    </section>}
    {race && <Board race={race} onNew={() => { setRace(null); setOutcomeId(''); }} />}
  </div>;
}

function Board({ race, onNew }: { race: any; onNew: () => void }) {
  const { view: v, status, error, left, send } = useRaceSocket(race.id);
  const box = useRef<HTMLElement>(null);
  const order = useMemo(() => new Map<string, number>(), []);
  const players: any[] = v?.players || [];
  players.forEach((p) => { if (!order.has(p.id)) order.set(p.id, order.size); });
  const lanes = [...players].sort((a, b) => (order.get(a.id)! - order.get(b.id)!));
  const total = v?.total || race.questionCount;
  const full = () => { const el = box.current as any; try { (document.fullscreenElement ? document.exitFullscreen() : el?.requestFullscreen?.())?.catch?.(() => undefined); } catch { /* not offered here */ } };
  const answeredCount = players.filter((p) => p.answered).length;
  return <section className="cr" ref={box} aria-label="Yarış tahtası">
    <div className="cr-head">
      <h2>{race.className} · Sınıf Uzay Yarışı</h2>
      <span className="cr-status">{status === 'open' ? (v ? `${Math.max(0, v.qi + 1)}/${total}. soru` : 'Bağlandı') : status === 'connecting' ? 'Bağlanıyor…' : 'Bağlantı yeniden kuruluyor…'}</span>
      <span className="cr-code" aria-label={`Katılım kodu ${race.code}`}>{race.code}</span>
      <button type="button" className="cr-ghost" onClick={full}>Tam ekran</button>
    </div>
    <div className="cr-outcome"><span>Kazanım</span><b>{race.outcome?.code}</b>{race.outcome?.title}</div>
    {error && <div className="cr-alert" role="alert">{REASONS[error] || error}</div>}

    {(!v || v.phase === 'LOBBY') && <div className="cr-panel">
      <p className="cr-join">Öğrenciler ANUNEX'te <b>Öğrenme Evreni → Sınıf yarışına katıl</b> bölümüne bu kodu girer.</p>
      <h3>{players.length ? `${players.length} öğrenci katıldı` : 'Öğrenciler bekleniyor…'}</h3>
      <div className="cr-chips">{players.map((p) => <span key={p.id}>{p.name}</span>)}</div>
      <div className="cr-row"><button type="button" className="cr-next" disabled={!players.length} onClick={() => send({ type: 'next' })}>Yarışı başlat</button><span className="cr-muted">{total} soru · soru başına {race.seconds} sn</span></div>
    </div>}

    {v && (v.phase === 'QUESTION' || v.phase === 'REVEAL') && v.question && <div className="cr-panel">
      <div className="cr-row" style={{ justifyContent: 'space-between' }}><p className="cr-q" style={{ flex: 1 }}>{v.question.stem}</p>{v.phase === 'QUESTION' && <span className="cr-timer" aria-label={`${left} saniye`}>{left ?? ''}</span>}</div>
      {(v.question.assets || []).map((a: any, k: number) => <img key={k} className="cr-img" src={a.url} alt={a.alt || 'Soru görseli'} />)}
      <div className="cr-opts">{v.question.options.map((o: any, k: number) => <div key={o.key} className={`cr-opt cr-c${k % 5}${v.reveal ? (o.key === v.reveal.correct ? ' right' : ' dim') : ''}`}><b>{o.key}</b><span>{o.text}</span></div>)}</div>
      {v.phase === 'QUESTION' && <div className="cr-row"><span className="cr-muted">{answeredCount}/{players.length} öğrenci cevapladı</span><button type="button" className="cr-ghost" onClick={() => send({ type: 'close' })}>Süreyi bitir</button></div>}
      {v.reveal && <><div className="cr-dist" style={{ ['--n' as any]: v.question.options.length }} aria-label="Cevap dağılımı">{v.question.options.map((o: any, k: number) => { const n = v.reveal.counts[o.key] || 0, max = Math.max(1, ...Object.values(v.reveal.counts as Record<string, number>)); return <div key={o.key}><strong>{n}</strong><i style={{ height: 14 + (n / max) * 100, background: o.key === v.reveal.correct ? '#3ee08f' : BAR[k % 5], opacity: o.key === v.reveal.correct ? 1 : 0.55 }} /><span>{o.key}{o.key === v.reveal.correct ? ' ✓' : ''}</span></div>; })}</div>
        <div className="cr-row"><button type="button" className="cr-next" onClick={() => send({ type: 'next' })}>{v.qi + 1 < total ? 'Sonraki soru' : 'Sonuçları göster'}</button></div></>}
    </div>}

    {v && v.phase !== 'LOBBY' && v.phase !== 'FINISHED' && <div className="cr-lanes" aria-label="Yarış pisti">{lanes.map((p) => <div key={p.id} className="cr-lane"><span className="who">{p.name}</span><span className="cr-rocket" style={{ left: `calc(118px + (100% - 190px) * ${(p.score / Math.max(1, total)).toFixed(3)})` }}><i /><Rocket c={COLORS[order.get(p.id)! % COLORS.length]} /></span><span className={`dot${p.answered ? ' on' : ''}`} /></div>)}</div>}

    {v?.phase === 'FINISHED' && <div className="cr-panel">
      <h3>Yarış bitti!</h3>
      <div className="cr-podium">{[players[1], players[0], players[2]].map((p, k) => p ? <div key={p.id} className={['p2', 'p1', 'p3'][k]}><b>{p.name}</b><span className="cr-muted">{p.score} doğru</span><i style={{ height: [78, 110, 58][k] }}>{p.rank}</i></div> : <div key={k} />)}</div>
      {v.report && <div className="cr-report"><strong>Öğretmen raporu</strong>
        <span>{v.report.players} öğrenci · {v.report.asked} soru · sınıfın doğru oranı <b>%{v.report.rate}</b>{v.report.hardest ? <> · en çok zorlanılan: <b>{v.report.hardest.index}. soru</b></> : null}</span>
        <span className="cr-muted">Cevaplar her öğrencinin karnesine bu kazanımın kanıtı olarak işlendi; yanlış yapılan sorular aralıklı tekrarda geri gelir.</span>
        <div style={{ overflowX: 'auto' }}><table><thead><tr><th>Soru</th><th>Cevaplayan</th><th>Doğru</th></tr></thead><tbody>{v.report.questions.map((x: any) => <tr key={x.index}><td>{x.index}. {String(x.stem).slice(0, 70)}{String(x.stem).length > 70 ? '…' : ''}</td><td>{x.answered}</td><td>{x.correct}</td></tr>)}</tbody></table></div>
      </div>}
      <div className="cr-row"><button type="button" className="cr-next" onClick={onNew}>Yeni yarış</button></div>
    </div>}
  </section>;
}
