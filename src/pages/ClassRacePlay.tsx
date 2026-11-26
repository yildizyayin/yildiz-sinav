import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { REASONS, useRaceSocket } from '../components/race/useRaceSocket';
import '../components/race/class-race.css';

/**
 * Sınıf Uzay Yarışı, the student's phone (owner, 25–26 Nov 2026). Enter the code from the board, wait in the lobby,
 * answer with one tap while the question is open; after it closes the phone shows only the student's own result,
 * score and place. The answers go to the karne as evidence of the race's outcome when the race ends.
 */
export function ClassRacePlay() {
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get('code') || '');
  const [race, setRace] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const join = async (c = code) => {
    if (!/^\d{4}$/.test(c.trim())) { setError('Kod 4 rakamdan oluşur.'); return; }
    setBusy(true); setError('');
    try { const r = await api<any>(`/api/class-race/join?code=${encodeURIComponent(c.trim())}`); setRace(r.race); }
    catch (e: any) { setError(e.message); }
    setBusy(false);
  };
  useEffect(() => { if (params.get('code')) void join(params.get('code')!); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="page" style={{ display: 'grid', gap: 16 }}>
    <div className="page-head"><div><span className="eyebrow">Öğrenme Evreni</span><h1>Sınıf Uzay Yarışı</h1></div></div>
    {!race ? <section className="cr cr-phone">
      <div className="cr-center">
        <p className="cr-big">Yarışa katıl</p>
        <p className="cr-muted">Öğretmeninin tahtada gösterdiği 4 haneli kodu yaz.</p>
        <label htmlFor="cr-code" className="cr-muted" style={{ fontWeight: 700 }}>Yarış kodu</label>
        <input id="cr-code" className="cr-codein" inputMode="numeric" autoComplete="off" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))} onKeyDown={(e) => { if (e.key === 'Enter') void join(); }} />
        {error && <div className="cr-alert" role="alert">{error}</div>}
        <button type="button" className="cr-next" disabled={busy || code.length !== 4} onClick={() => void join()}>{busy ? 'Aranıyor…' : 'Katıl'}</button>
        <Link to="/evren" className="cr-muted">Öğrenme Evreni'ne dön</Link>
      </div>
    </section> : <Phone race={race} />}
  </div>;
}

function Phone({ race }: { race: any }) {
  const { view: v, status, error, left, send } = useRaceSocket(race.id);
  const [chosen, setChosen] = useState<Record<number, string>>({});
  const mine = v ? (v.myAnswer || chosen[v.qi] || null) : null;
  const tap = (key: string) => { if (!v || v.phase !== 'QUESTION' || mine) return; setChosen((c) => ({ ...c, [v.qi]: key })); send({ type: 'answer', qi: v.qi, key }); };
  return <section className="cr cr-phone" aria-live="polite">
    <div className="cr-row" style={{ justifyContent: 'space-between' }}><span className="cr-status">{race.className}{v?.name ? ` · ${v.name}` : ''}</span><span className="cr-status">{status === 'open' ? (v && v.qi >= 0 ? `${v.qi + 1}/${v.total}` : 'Bağlandı') : status === 'refused' ? 'Bağlanılamadı' : 'Bağlanıyor…'}</span></div>
    {v?.outcome && <div className="cr-outcome"><span>Kazanım</span><b>{v.outcome.code}</b>{v.outcome.title}</div>}
    {error && <div className="cr-alert">{REASONS[error] || error}</div>}
    {status === 'refused' && <div className="cr-alert">Yarışa bağlanılamadı. Bu yarış başka bir sınıfın olabilir ya da bitmiş olabilir.</div>}
    {(!v || v.phase === 'LOBBY') && status !== 'refused' && <div className="cr-center"><p className="cr-big">Hazırsın!</p><p className="cr-muted">Adın tahtada görünüyor. Öğretmenin yarışı başlatınca ilk soru burada açılacak.</p>{v && <p className="cr-muted">{v.players} öğrenci katıldı</p>}</div>}
    {v?.phase === 'QUESTION' && v.question && <>
      <div className="cr-row" style={{ justifyContent: 'space-between' }}><span className="cr-status">★ {v.score}</span><span className="cr-timer" style={{ minWidth: 54, height: 54, fontSize: 22 }}>{left ?? ''}</span></div>
      <p className="cr-q" style={{ fontSize: 'clamp(19px,5vw,24px)' }}>{v.question.stem}</p>
      {(v.question.assets || []).map((a: any, k: number) => <img key={k} className="cr-img" src={a.url} alt={a.alt || 'Soru görseli'} />)}
      <div className="cr-pads">{v.question.options.map((o: any, k: number) => <button key={o.key} type="button" className={`cr-pad cr-c${k % 5}${mine === o.key ? ' chosen' : ''}`} disabled={!!mine} onClick={() => tap(o.key)} aria-label={`${o.key}) ${o.text}`}>{o.text}</button>)}</div>
      {mine && <p className="cr-muted" style={{ textAlign: 'center', margin: 0 }}>Cevabın alındı! Diğerleri bekleniyor…</p>}
    </>}
    {v?.phase === 'REVEAL' && v.reveal && <div className="cr-center">
      <div className={`cr-result ${v.reveal.right ? 'ok' : 'no'}`}>{v.reveal.right ? '✓ Doğru! Roketin bir adım ilerledi.' : v.reveal.answered ? `Doğrusu: ${v.reveal.correct}) ${v.reveal.correctText}` : `Süre doldu. Doğrusu: ${v.reveal.correct}) ${v.reveal.correctText}`}</div>
      <p className="cr-muted">{v.score} doğru · şu an {v.rank}. sıradasın</p><p className="cr-muted">Sıradaki soru tahtada açılınca burada görünecek.</p>
    </div>}
    {v?.phase === 'FINISHED' && <div className="cr-center">
      <p className="cr-big">{v.rank ? `${v.rank}. oldun!` : 'Yarış bitti!'}</p>
      <p className="cr-muted">{v.score}/{v.total} doğru. Cevapların bu kazanımın kanıtı olarak karnene ve gezegenine işlendi; yanlışların tekrarda karşına gelecek.</p>
      <Link to="/evren" className="cr-next">Öğrenme Evreni'ne dön</Link>
    </div>}
  </section>;
}
