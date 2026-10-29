import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Grid3x3, Send } from 'lucide-react';
import { api, ApiError } from '../api';
import { Turnstile } from '../components/Turnstile';
import { AnunexSymbol } from '../components/AnunexBrand';
import './quick-tests.css';

/**
 * S044 student exam page (no account): app.anunex.com/sinav/KOD. Name, surname and number; a server-side clock;
 * every mark is saved within a second; closing the page and coming back on the same device continues where it was;
 * when time is up the saved answers are handed in by themselves.
 */
type Stored = { attemptId: string; token: string; number: string; name: string };
const store = (code: string) => `anunex_qt_${code}`;
const read = (code: string): Stored | null => { try { return JSON.parse(localStorage.getItem(store(code)) || 'null'); } catch { return null; } };
const localAnswers = (attemptId: string): Record<string, string> => { try { return JSON.parse(localStorage.getItem(`anunex_qt_ans_${attemptId}`) || '{}') || {}; } catch { return {}; } };
const keepAnswers = (attemptId: string, v: Record<string, string>) => { try { localStorage.setItem(`anunex_qt_ans_${attemptId}`, JSON.stringify(v)); } catch { /* storage may be blocked */ } };
const keep = (code: string, v: Stored | null) => { try { if (v) localStorage.setItem(store(code), JSON.stringify(v)); else localStorage.removeItem(store(code)); } catch { /* storage may be blocked */ } };
const toMs = (s: string) => new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z')).getTime();
const clock = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(x).padStart(2, '0')}`; };

export function QuickExamTake() {
  const { code: routeCode = '' } = useParams();
  const navigate = useNavigate();
  const code = routeCode.toUpperCase();
  const [codeInput, setCodeInput] = useState('');
  const [exam, setExam] = useState<any>(null); const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ name: '', number: '', className: '' });
  const [siteKey, setSiteKey] = useState(''); const [token, setToken] = useState(''); const [cycle, setCycle] = useState(0);
  const [session, setSession] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0); const [showGrid, setShowGrid] = useState(false);
  const [now, setNow] = useState(Date.now()); const offset = useRef(0);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [finished, setFinished] = useState<any>(null); const [confirm, setConfirm] = useState(false);
  const saveTimer = useRef<any>(null); const submitting = useRef(false); const latest = useRef<Record<string, string>>({});
  const [zoom, setZoom] = useState(false);
  const onToken = useCallback((v: string) => setToken(v), []);

  useEffect(() => { document.title = 'ANUNEX · Online sınav'; void api<any>('/api/config').then((c) => setSiteKey(c.turnstileSiteKey || '')).catch(() => undefined); }, []);
  const begin = (r: any, name: string, number: string) => {
    if (r.submitted) { setFinished({ result: r.result }); return; }
    offset.current = toMs(r.serverNow) - Date.now();
    keep(code, { attemptId: r.attemptId, token: r.token, number, name });
    // Answers kept on this device win over the server copy for questions the server missed (a save lost on reload/offline).
    const merged = { ...(r.answers || {}), ...localAnswers(r.attemptId) };
    setSession(r); setAnswers(merged); latest.current = merged; setIndex(0);
    if (Object.keys(merged).length !== Object.keys(r.answers || {}).length) void api(`/api/public/quick-tests/attempts/${r.attemptId}/answers?t=${r.token}`, { method: 'PUT', body: JSON.stringify({ answers: merged }) }).catch(() => undefined);
  };
  useEffect(() => {
    if (!code) return;
    setLoadError('');
    void api<any>(`/api/public/quick-tests/${code}`).then(async (r) => {
      setExam(r.exam);
      const s = read(code);
      if (s && r.exam.state === 'OPEN') {
        try { const again = await api<any>(`/api/public/quick-tests/${code}/start`, { method: 'POST', body: JSON.stringify({ name: s.name, number: s.number, resumeToken: s.token }) }); begin(again, s.name, s.number); }
        catch { keep(code, null); }
      } else if (s) {
        try { const res = await api<any>(`/api/public/quick-tests/attempts/${s.attemptId}/result?t=${s.token}`); if (res.submitted) setFinished({ result: res.result, resultMode: res.resultMode }); } catch { /* the stored attempt is gone */ }
      }
    }).catch((e) => setLoadError(e instanceof ApiError ? e.message : 'Sınav bulunamadı.'));
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!session) return; const h = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(h); }, [session]);
  const left = session ? toMs(session.deadlineAt) - (now + offset.current) : 0;

  const persist = useCallback(async (next: Record<string, string>) => {
    if (!session) return;
    setSaved('saving');
    try { await api(`/api/public/quick-tests/attempts/${session.attemptId}/answers?t=${session.token}`, { method: 'PUT', body: JSON.stringify({ answers: next }) }); setSaved('saved'); }
    catch (e: any) { if (e?.code === 'TIME_UP') void submit(true); else setSaved('error'); }
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (qid: string, letter: string) => {
    setAnswers((a) => { const next = { ...a }; if (next[qid] === letter) delete next[qid]; else next[qid] = letter; clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => void persist(next), 300); latest.current = next; if (session) keepAnswers(session.attemptId, next); return next; });
  };
  const submit = async (auto = false) => {
    if (!session || submitting.current) return; submitting.current = true; setBusy(true); setError('');
    clearTimeout(saveTimer.current);
    try { const r = await api<any>(`/api/public/quick-tests/attempts/${session.attemptId}/submit?t=${session.token}`, { method: 'POST', body: JSON.stringify({ answers }) }); setFinished({ result: r.result, resultMode: r.resultMode, auto }); setSession(null); }
    catch (e: any) { setError(e.message || 'Teslim edilemedi; internet bağlantınızı kontrol edip tekrar deneyin.'); submitting.current = false; }
    finally { setBusy(false); }
  };
  useEffect(() => { if (session && left <= 0) void submit(true); }, [session, left <= 0]); // eslint-disable-line react-hooks/exhaustive-deps
  // Leaving or reloading the page: the last marks are sent with keepalive so they survive the page going away.
  useEffect(() => {
    if (!session) return;
    latest.current = answers;
    const flush = () => { clearTimeout(saveTimer.current); try { void fetch(`/api/public/quick-tests/attempts/${session.attemptId}/answers?t=${session.token}`, { method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: latest.current }) }); } catch { /* best effort */ } };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide); window.addEventListener('pagehide', flush);
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', flush); };
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!session) return;
    const onKey = (e: KeyboardEvent) => { const q = session.questions[index]; if (!q) return; const k = e.key.toUpperCase(); if ('ABCDE'.slice(0, session.optionCount).includes(k) && k.length === 1) choose(q.id, k); else if (e.key === 'ArrowRight') setIndex((i) => Math.min(session.questions.length - 1, i + 1)); else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1)); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [session, index]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setBusy(true); setError('');
    try { const r = await api<any>(`/api/public/quick-tests/${code}/start`, { method: 'POST', body: JSON.stringify({ ...form, turnstileToken: token, resumeToken: read(code)?.token }) }); begin(r, form.name, form.number); }
    catch (e: any) { setError(e.message); setToken(''); setCycle((c) => c + 1); }
    finally { setBusy(false); }
  };
  const blanks = useMemo(() => session ? session.questions.filter((q: any) => !answers[q.id]).length : 0, [session, answers]);

  // --- screens ---------------------------------------------------------------------------------------------
  if (!code) return <Shell><form className="qx-card" onSubmit={(e) => { e.preventDefault(); if (codeInput.trim()) navigate(`/sinav/${codeInput.trim().toUpperCase()}`); }}>
    <h1>Online sınava gir</h1><p>Öğretmeninizin verdiği sınav kodunu yazın.</p>
    <label>Sınav kodu<input value={codeInput} onChange={(e) => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))} className="qx-code-input" placeholder="Örn. K7M2PA" autoFocus autoCapitalize="characters" /></label>
    <button className="qx-primary" disabled={codeInput.length < 4}>Devam</button></form></Shell>;
  if (loadError) return <Shell><div className="qx-card"><h1>Sınav bulunamadı</h1><p>{loadError}</p><button className="qx-primary" onClick={() => navigate('/sinav')}>Kodu yeniden yaz</button></div></Shell>;
  if (finished) return <Shell><div className="qx-card qx-done"><CheckCircle2 size={44} /><h1>{finished.auto ? 'Süre doldu, sınavınız teslim edildi' : 'Sınavınız teslim edildi'}</h1>
    {finished.result ? <div className="qx-result"><div><b>{finished.result.correct}</b><span>Doğru</span></div><div><b>{finished.result.wrong}</b><span>Yanlış</span></div><div><b>{finished.result.blank}</b><span>Boş</span></div><div className="net"><b>{finished.result.net}</b><span>Net</span></div></div>
      : <p>{finished.resultMode === 'AFTER_CLOSE' ? 'Sonucunuz sınav süresi bitince bu sayfada görünecek.' : 'Sonucunuzu öğretmeniniz paylaşacak.'}</p>}
    <p className="qx-muted">Bu sayfayı kapatabilirsiniz.</p></div></Shell>;
  if (!exam) return <Shell><div className="qx-card"><p>Yükleniyor…</p></div></Shell>;
  if (!session) return <Shell><form className="qx-card" onSubmit={(e) => { e.preventDefault(); void start(); }}>
    <span className="qx-kicker">{exam.institution}</span><h1>{exam.title}</h1>
    <ul className="qx-facts"><li><b>{exam.questionCount}</b> soru</li><li><b>{exam.durationMinutes}</b> dakika</li><li>Kapanış: <b>{new Date(toMs(exam.closesAt)).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</b></li></ul>
    {exam.state === 'NOT_OPEN' && <div className="qx-alert">Sınav {new Date(toMs(exam.opensAt)).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })} saatinde başlayacak.</div>}
    {exam.state === 'CLOSED' && <div className="qx-alert">Bu sınavın süresi bitti.</div>}
    {exam.state === 'OPEN' && <>
      <label>Adınız ve soyadınız<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" required /></label>
      <div className="qx-two"><label>Okul numaranız<input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value.replace(/\s/g, '') })} inputMode="numeric" required /></label><label>Sınıf / şube<input value={form.className} onChange={(e) => setForm({ ...form, className: e.target.value })} placeholder="6A" /></label></div>
      <p className="qx-muted">“Başla”ya bastığınızda süre başlar ve durdurulamaz. Cevaplarınız her işaretlemede kaydedilir; sayfa kapanırsa aynı cihazdan kaldığınız yerden devam edersiniz.</p>
      {error && <div className="qx-alert" role="alert">{error}</div>}
      <Turnstile key={cycle} siteKey={siteKey} onToken={onToken} />
      <button className="qx-primary" disabled={busy || form.name.trim().split(/\s+/).length < 2 || !form.number || (!!siteKey && !token)}>{busy ? 'Başlıyor…' : 'Sınava başla'}</button>
    </>}
  </form></Shell>;

  const q = session.questions[index];
  const letters = 'ABCDE'.slice(0, session.optionCount).split('');
  const low = left < 60000;
  return <div className="qx-exam">
    <header className="qx-bar"><div className="qx-title"><b>{session.title}</b><small>{saved === 'saving' ? 'Kaydediliyor…' : saved === 'saved' ? 'Kaydedildi' : saved === 'error' ? 'Kaydedilemedi, tekrar denenecek' : ' '}</small></div>
      <div className={`qx-timer ${low ? 'low' : ''}`} role="timer" aria-live={low ? 'assertive' : 'off'}><Clock size={18} /> {clock(left)}</div></header>
    <main className="qx-main">
      <div className="qx-qhead"><b>Soru {index + 1} / {session.questions.length}</b><button type="button" className="qx-gridbtn" onClick={() => setShowGrid((v) => !v)} aria-expanded={showGrid}><Grid3x3 size={16} /> {session.questions.length - blanks}/{session.questions.length} cevaplandı</button></div>
      {showGrid && <div className="qx-grid">{session.questions.map((x: any, i: number) => <button type="button" key={x.id} className={`${answers[x.id] ? 'on' : ''} ${i === index ? 'cur' : ''}`} onClick={() => { setIndex(i); setShowGrid(false); }}>{i + 1}{answers[x.id] ? <small>{answers[x.id]}</small> : null}</button>)}</div>}
      <div className={`qx-question ${zoom ? 'zoom' : ''}`}>
        {q.kind === 'IMAGE' && <button type="button" className="qx-zoom" onClick={() => setZoom((z) => !z)}>{zoom ? 'Küçült' : 'Büyüt'}</button>}
        {q.kind === 'IMAGE' ? <img onClick={() => setZoom((z) => !z)} src={`/api/public/quick-tests/attempts/${session.attemptId}/image/${q.id}?t=${session.token}`} alt={`Soru ${index + 1}`} style={{ aspectRatio: `${q.width} / ${q.height}` }} />
          : <div className="qx-text"><p>{q.stem}</p><ol type="A">{(q.options || []).map((o: string, j: number) => <li key={j}>{o}</li>)}</ol></div>}
      </div>
      <div className="qx-choices" role="radiogroup" aria-label={`Soru ${index + 1} cevabı`}>{letters.map((l) => <button type="button" role="radio" aria-checked={answers[q.id] === l} key={l} className={answers[q.id] === l ? 'on' : ''} onClick={() => choose(q.id, l)}>{l}</button>)}</div>
      <small className="qx-muted qx-hint">İşaretlediğiniz şıkka tekrar dokunursanız cevap silinir.</small>
    </main>
    <footer className="qx-nav">
      <button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)}><ChevronLeft size={18} /> Önceki</button>
      {index < session.questions.length - 1 ? <button type="button" className="qx-next" onClick={() => setIndex(index + 1)}>Sonraki <ChevronRight size={18} /></button>
        : <button type="button" className="qx-finish" onClick={() => setConfirm(true)}><Send size={16} /> Sınavı bitir</button>}
    </footer>
    {index < session.questions.length - 1 && <button type="button" className="qx-finish-link" onClick={() => setConfirm(true)}>Sınavı bitir</button>}
    {confirm && <div className="qx-modal" role="dialog" aria-modal="true" aria-labelledby="qx-confirm"><div className="qx-card"><h2 id="qx-confirm">Sınavı teslim etmek istiyor musunuz?</h2>
      <p>{blanks ? `${blanks} soru boş.` : 'Bütün soruları cevapladınız.'} Teslim ettikten sonra cevaplarınızı değiştiremezsiniz.</p>
      {error && <div className="qx-alert" role="alert">{error}</div>}
      <div className="qx-two"><button type="button" className="qx-secondary" onClick={() => setConfirm(false)}>Geri dön</button><button type="button" className="qx-primary" disabled={busy} onClick={() => void submit(false)}>{busy ? 'Teslim ediliyor…' : 'Evet, teslim et'}</button></div></div></div>}
  </div>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="qx-shell"><div className="qx-brand"><AnunexSymbol className="qx-logo" /> ANUNEX <small>Online sınav</small></div>{children}</div>;
}
