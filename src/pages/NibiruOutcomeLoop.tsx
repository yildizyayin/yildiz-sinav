import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Award, BellRing, CheckCircle2, ClipboardCheck, ExternalLink, Gamepad2, PlayCircle, Timer, Zap } from 'lucide-react';
import { api } from '../api';
import { embeddableVideo } from '../lib/physicalLink';
import { QuestionDataVisual } from '../components/QuestionDataVisual';
import './nibiru-loop.css';

/**
 * Nibiru kazanım iyileştirme döngüsü (owner, 9 Nov 2026): video → mini test → mini oyun → rozet ya da öğretmen.
 * Every step shows only what exists: no approved video, no questions → it says so; nothing is invented here.
 */
type State = any;
const GAME_SECONDS = 45;

function optionEntries(value: any): Array<[string, string]> {
  if (Array.isArray(value)) return value.map((x, i) => { const key = String.fromCharCode(65 + i); if (x && typeof x === 'object') return [String(x.key || x.code || key), String(x.text || x.label || x.value || '')]; return [key, String(x ?? '')]; });
  if (value && typeof value === 'object') return Object.entries(value).map(([k, v]) => [k, String(v ?? '')]);
  return [];
}

function QuestionBody({ q, no }: { q: any; no: number }) {
  return <>
    <strong className="nl-stem">{no}. {q.stem_text || 'Görsel soru'}</strong>
    {(q.assets || []).filter((a: any) => a.placement === 'STEM' || !a.placement).map((a: any) => a.url && <img key={a.id} className="nl-img" src={a.url} alt={a.alt_text || 'Soru görseli'} />)}
    <QuestionDataVisual blocks={q.contentBlocks} />
  </>;
}

const STEPS: Array<{ key: string; label: string; icon: any }> = [
  { key: 'VIDEO', label: 'Video', icon: PlayCircle },
  { key: 'MINI_TEST', label: 'Mini test', icon: ClipboardCheck },
  { key: 'GAME', label: 'Mini oyun', icon: Gamepad2 },
  { key: 'END', label: 'Sonuç', icon: Award },
];

function Stepper({ s }: { s: State }) {
  const order = ['VIDEO', 'MINI_TEST', 'GAME', 'END'];
  const at = ['PASSED', 'TEACHER_REVIEW', 'CLOSED'].includes(s.step) ? 3 : order.indexOf(s.step);
  const skipped = (k: string) => (k === 'VIDEO' && s.videoMissing) || (k === 'GAME' && !s.game && at === 3);
  return <ol className="nl-steps" aria-label="Çalışma adımları">{STEPS.map((st, i) => {
    const Icon = st.icon, state = i < at ? (skipped(st.key) ? 'skip' : 'done') : i === at ? 'now' : 'next';
    return <li key={st.key} className={`nl-step ${state}`} aria-current={state === 'now' ? 'step' : undefined}><span className="nl-dot"><Icon size={18} aria-hidden="true" /></span><span>{st.label}</span>{state === 'skip' && <small>atlandı</small>}</li>;
  })}</ol>;
}

export function NibiruOutcomeLoop() {
  const { id = '' } = useParams();
  const [s, setS] = useState<State>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [game, setGame] = useState<any>(null);

  const load = useCallback(async () => {
    try { setS(await api<State>(`/api/nibiru/coach/loops/${encodeURIComponent(id)}`)); setError(''); } catch (e: any) { setError(e.message); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(''); try { await fn(); } catch (e: any) { setError(e.message); await load(); } finally { setBusy(false); } };
  const watched = () => run(async () => { setS(await api(`/api/nibiru/coach/loops/${id}/video-done`, { method: 'POST', body: '{}' })); });
  const openTest = () => run(async () => {
    const r = await api<any>(`/api/nibiru/coach/loops/${id}/mini-test`, { method: 'POST', body: '{}' });
    setTest(await api<any>(`/api/nibiru/coach/mini-tests/${encodeURIComponent(r.testId)}`)); setAnswers({});
  });
  const sendTest = () => run(async () => {
    await api(`/api/nibiru/coach/mini-tests/${encodeURIComponent(test.test.id)}/submit`, { method: 'POST', body: JSON.stringify({ answers: Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer })) }) });
    setTest(null); await load();
  });
  const openGame = () => run(async () => { setGame(await api<any>(`/api/nibiru/coach/loops/${id}/game`, { method: 'POST', body: '{}' })); });

  if (error && !s) return <div className="nl-page"><div className="alert error">{error}</div><Link className="ghost" to="/wrong-answers">Yanlış ve boş sorularıma dön</Link></div>;
  if (!s) return <div className="nl-page"><div className="nl-card">Yükleniyor…</div></div>;
  const o = s.outcome || {};
  return <div className="nl-page">
    <header className="nl-head">
      <span className="nl-kicker">Kazanım çalışması · {o.subjectName || 'Ders'}</span>
      <h1>{o.code ? `${o.code} · ` : ''}{o.title || 'Kazanım'}</h1>
    </header>
    <Stepper s={s} />
    {error && <div className="alert error" role="alert">{error}</div>}

    {s.step === 'VIDEO' && s.video && <section className="nl-card">
      <h2><PlayCircle size={20} aria-hidden="true" /> Önce konuyu kısa bir videoyla hatırla</h2>
      {embeddableVideo(s.video.url)
        ? <div className="nl-video"><iframe title={s.video.title} src={embeddableVideo(s.video.url)!} allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" /></div>
        : null}
      <p className="nl-muted">{s.video.title}{s.video.durationSeconds ? ` · ${Math.max(1, Math.round(s.video.durationSeconds / 60))} dk` : ''} · öğretmen onaylı video</p>
      <div className="nl-actions">
        <a className="secondary" href={s.video.url} target="_blank" rel="noreferrer"><ExternalLink size={16} aria-hidden="true" /> {s.video.provider === 'YOUTUBE' ? "YouTube'da aç" : 'Videoyu aç'}</a>
        <button className="primary" disabled={busy} onClick={() => void watched()}><CheckCircle2 size={16} aria-hidden="true" /> İzledim, mini teste geç</button>
      </div>
    </section>}

    {s.step === 'MINI_TEST' && !test && <section className="nl-card">
      <h2><ClipboardCheck size={20} aria-hidden="true" /> Mini test</h2>
      {s.videoMissing && <p className="nl-note">Bu kazanım için henüz öğretmen onaylı bir video yok. Bulunan videolar öğretmen onayından sonra burada görünür.</p>}
      <p>Aynı kazanımdan 5 farklı soru. 5 sorudan en az 4'ünü doğru yaparsan bu adım tamam.</p>
      <div className="nl-actions"><button className="primary" disabled={busy} onClick={() => void openTest()}>{s.miniTest?.status === 'READY' ? 'Mini teste devam et' : 'Mini teste başla'}</button></div>
    </section>}

    {test && <section className="nl-card">
      <h2><ClipboardCheck size={20} aria-hidden="true" /> Mini test</h2>
      {(test.questions || []).map((q: any, i: number) => <fieldset key={q.question_id} className="nl-q">
        <legend className="sr-only">{i + 1}. soru</legend>
        <QuestionBody q={q} no={i + 1} />
        <div className="nl-options">{optionEntries(q.options).map(([key, label]) => <label key={key} className={`nl-opt${answers[q.question_id] === key ? ' on' : ''}`}>
          <input type="radio" name={`t_${q.question_id}`} value={key} checked={answers[q.question_id] === key} onChange={() => setAnswers((a) => ({ ...a, [q.question_id]: key }))} />
          <b>{key}</b><span>{label && label !== key ? label : ''}</span></label>)}</div>
      </fieldset>)}
      <div className="nl-actions"><button className="primary" disabled={busy || Object.keys(answers).length < (test.questions || []).length} onClick={() => void sendTest()}>Mini testi gönder</button></div>
    </section>}

    {s.step === 'GAME' && !game && <section className="nl-card nl-game-intro">
      <h2><Gamepad2 size={20} aria-hidden="true" /> Mini test %{Math.round(Number(s.miniTest?.scorePercent || 0))} oldu, şimdi Hızlı Seri!</h2>
      <p>Aynı kazanımdan 5 yeni soru, her biri için {GAME_SECONDS} saniye. Doğru cevaplar seri yapar; XP ödülü notuna karışmaz.</p>
      <div className="nl-actions"><button className="primary" disabled={busy} onClick={() => void openGame()}><Zap size={16} aria-hidden="true" /> Oyunu başlat</button></div>
    </section>}

    {game && s.step === 'GAME' && <Game loopId={id} data={game} onDone={(next) => { setGame(null); setS(next); }} onError={setError} />}

    {s.step === 'PASSED' && <section className="nl-card nl-end ok">
      <h2><Award size={22} aria-hidden="true" /> {s.loop.badgeAt ? 'Kazanım rozeti senin!' : 'Bu adımı başardın'}</h2>
      <p>{s.game?.status === 'PASSED' ? `Mini oyunda ${s.game.correct}/${s.game.questionCount} doğru.` : `Mini testte ${s.miniTest?.correct}/${s.miniTest?.questionCount} doğru.`}
        {s.loop.badgeAt ? ' Karnende bu kazanım "öğrenildi" olarak görünüyor.' : ` Rozet için son 30 günde ${s.loop.badgeNeed} farklı soruyu daha doğru çözmen yeterli.`}</p>
      {s.game?.xp ? <p className="nl-muted">+{s.game.xp} XP kazandın.</p> : null}
      <div className="nl-actions"><Link className="secondary" to="/question-practice">Soru çözmeye devam et</Link><Link className="ghost" to="/wrong-answers">Diğer yanlışlarım</Link></div>
    </section>}

    {s.step === 'TEACHER_REVIEW' && <section className="nl-card nl-end">
      <h2><BellRing size={22} aria-hidden="true" /> Öğretmenin seninle bu kazanımı çalışacak</h2>
      <p>{s.loop.teacherReason === 'GAME_NOT_ENOUGH' ? `Mini oyunda ${s.game?.correct ?? 0}/${s.game?.questionCount ?? 5} doğru yaptın; bu kazanım için biraz daha destek iyi olur.`
        : s.loop.teacherReason === 'NO_GAME_QUESTIONS' ? 'Mini oyun için bu kazanımda yeterli onaylı soru yok.'
          : 'Bu kazanım için yeterli onaylı soru olmadığından ölçme yapılamadı.'}
        {' '}{s.loop.teacherNotified ? 'Ders ve rehber öğretmenine haber verildi.' : 'Öğretmenin bu kazanımdan zaten haberdar.'}</p>
      {s.game?.xp ? <p className="nl-muted">Oyundan +{s.game.xp} XP kazandın.</p> : null}
      <div className="nl-actions"><Link className="ghost" to="/wrong-answers">Diğer yanlışlarım</Link></div>
    </section>}
  </div>;
}

function Game({ loopId, data, onDone, onError }: { loopId: string; data: any; onDone: (s: State) => void; onError: (m: string) => void }) {
  const qs: any[] = data.questions || [];
  const [i, setI] = useState(0);
  const [given, setGiven] = useState<Record<string, string>>({});
  const [left, setLeft] = useState(GAME_SECONDS);
  const [sending, setSending] = useState(false);
  const started = useRef(Date.now());
  const finish = useCallback(async (all: Record<string, string>) => {
    setSending(true);
    try {
      onDone(await api(`/api/nibiru/coach/loops/${loopId}/game/submit`, { method: 'POST', body: JSON.stringify({ answers: qs.map((q) => ({ questionId: q.id, answer: all[q.id] || '' })), durationSeconds: Math.round((Date.now() - started.current) / 1000) }) }));
    } catch (e: any) { onError(e.message); setSending(false); }
  }, [loopId, qs, onDone, onError]);
  const next = useCallback((answer: string) => {
    const q = qs[i]; if (!q) return;
    const all = { ...given, [q.id]: answer };
    setGiven(all);
    if (i + 1 >= qs.length) void finish(all); else { setI(i + 1); setLeft(GAME_SECONDS); }
  }, [qs, i, given, finish]);
  useEffect(() => {
    if (sending) return;
    if (left <= 0) { next(''); return; }
    const t = setTimeout(() => setLeft((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [left, sending, next]);
  const q = qs[i];
  if (!q) return null;
  return <section className="nl-card nl-game" aria-live="polite">
    <div className="nl-game-top">
      <span className="nl-progress">{qs.map((x, k) => <i key={x.id} className={k < i ? 'done' : k === i ? 'now' : ''} />)}</span>
      <span className={`nl-timer${left <= 10 ? ' low' : ''}`}><Timer size={16} aria-hidden="true" /> {left} sn</span>
    </div>
    <div className="nl-bar"><span style={{ width: `${(left / GAME_SECONDS) * 100}%` }} /></div>
    <div className="nl-q"><QuestionBody q={q} no={i + 1} /></div>
    <div className="nl-options big">{optionEntries(q.options).map(([key, label]) => <button key={key} type="button" className="nl-opt" disabled={sending} onClick={() => next(key)}><b>{key}</b><span>{label && label !== key ? label : ''}</span></button>)}</div>
    <div className="nl-actions"><button type="button" className="ghost" disabled={sending} onClick={() => next('')}>Bilmiyorum, geç</button></div>
  </section>;
}
