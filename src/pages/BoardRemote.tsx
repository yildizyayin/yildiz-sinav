import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Eye, EyeOff, Lightbulb, Play, RotateCcw, Smartphone, Timer, Video, Wifi, WifiOff, X } from 'lucide-react';
import { api } from '../api';
import { useBoardSocket, type BoardMsg } from '../lib/boardSocket';
import './board-remote.css';

/**
 * Tahta kumandası on the phone (owner, 27 Nov 2026). The teacher types the board code (or scans its QR) and walks the
 * class through the test from anywhere in the room: big thumb-sized buttons, the question and its answer for the
 * teacher's eyes only, a gentle vibration on every tap.
 */
type State = { index: number; total: number; title: string; stem: string; options: Array<{ label: string; text: string }>; answer: string; revealed: boolean; steps: number; stepsTotal: number; hideOptions: boolean; hasVideo: boolean; hasTopic: boolean; videoOpen: boolean; timer: { left: number; on: boolean } | null };
const buzz = () => { try { navigator.vibrate?.(12); } catch { /* */ } };

export function BoardRemote() {
  const { code: param = '' } = useParams();
  const navigate = useNavigate();
  const code = param.toUpperCase();
  const [typed, setTyped] = useState(code);
  const [info, setInfo] = useState<{ title: string } | null>(null);
  const [error, setError] = useState('');
  const [st, setSt] = useState<State | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => { try { sessionStorage.removeItem('anunex.afterLogin'); } catch { /* */ } }, []);
  useEffect(() => {
    setInfo(null); setError(''); setSt(null);
    if (!code) { input.current?.focus(); return; }
    api<any>(`/api/board-remote/${encodeURIComponent(code)}`).then((r) => setInfo({ title: r.title })).catch((e) => setError(e?.message || 'Bu kod açılamadı.'));
  }, [code]);
  const link = useBoardSocket(info ? code : null, 'remote', (m: BoardMsg) => { if (m.type === 'state') setSt(m as any); });
  const cmd = (action: string, value?: unknown) => { buzz(); link.send({ type: 'cmd', action, value }); };

  if (!code || error) return <div className="br br-join">
    <span className="br-logo"><Smartphone size={30} aria-hidden="true" /></span>
    <h1>Tahta kumandası</h1>
    <p>Tahtadaki <b>Telefondan yönet</b> düğmesine bas; çıkan 6 harfli kodu yaz.</p>
    {error && <div className="br-err" role="alert">{error}</div>}
    <form onSubmit={(e) => { e.preventDefault(); const c = typed.trim().toUpperCase(); if (c.length === 6) navigate(`/kumanda/${c}`); }}>
      <input ref={input} className="br-code" value={typed} maxLength={6} autoCapitalize="characters" autoComplete="off" spellCheck={false} inputMode="text" aria-label="Tahta kodu" placeholder="KOD" onChange={(e) => setTyped(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
      <button type="submit" className="br-go" disabled={typed.trim().length !== 6}>Bağlan</button>
    </form>
  </div>;

  const online = link.status === 'open' && link.presence.boards > 0;
  const timeTxt = st?.timer ? `${Math.floor(st.timer.left / 60)}:${String(st.timer.left % 60).padStart(2, '0')}` : '';
  return <div className="br">
    <header className="br-top">
      <div className="br-title"><strong>{info?.title || 'Bağlanıyor…'}</strong><span>Kod {code}</span></div>
      <span className={`br-net${online ? ' on' : ''}`}>{online ? <Wifi size={16} aria-hidden="true" /> : <WifiOff size={16} aria-hidden="true" />}{online ? 'Tahta bağlı' : link.status === 'expired' ? 'Kodun süresi doldu' : link.status === 'open' ? 'Tahta açık değil' : 'Bağlanıyor…'}</span>
    </header>
    {link.status === 'expired' && <div className="br-err" role="alert">Kodun süresi doldu. Tahtada “Telefondan yönet”e yeniden bas.</div>}
    {st ? <section className="br-q" aria-live="polite">
      <div className="br-q-head"><span className="br-no">{st.index + 1}</span><span>/ {st.total}</span>{st.timer && <span className={`br-timer${st.timer.left <= 10 ? ' hot' : ''}`}><Timer size={16} aria-hidden="true" />{st.timer.left === 0 ? 'Süre doldu' : timeTxt}</span>}</div>
      <p className="br-stem">{st.stem}</p>
      <ul className="br-opts">{st.options.map((o) => <li key={o.label} className={o.label === st.answer ? 'right' : ''}><b>{o.label}</b>{o.text}</li>)}</ul>
      <p className="br-answer">Doğru cevap <b>{st.answer}</b> <small>· yalnız senin telefonunda görünür</small></p>
    </section> : <p className="br-wait">{online ? 'Tahtadan bilgi bekleniyor…' : 'Tahtada testi açık tut; telefon kendiliğinden bağlanır.'}</p>}

    <div className="br-pad" aria-label="Kumanda">
      <button type="button" className="br-b nav" disabled={!st || st.index === 0} onClick={() => cmd('prev')}><ChevronLeft size={34} aria-hidden="true" />Önceki</button>
      <button type="button" className="br-b nav main" disabled={!st || st.index >= st.total - 1} onClick={() => cmd('next')}>Sonraki<ChevronRight size={34} aria-hidden="true" /></button>
      <button type="button" className={`br-b${st?.revealed ? ' on' : ''}`} disabled={!st} onClick={() => cmd('reveal')}><Eye size={26} aria-hidden="true" />Cevabı göster</button>
      <button type="button" className="br-b" disabled={!st || !st.stepsTotal || st.steps >= st.stepsTotal} onClick={() => cmd('step')}><Lightbulb size={26} aria-hidden="true" />{st && st.steps > 0 ? `Sonraki adım ${st.steps}/${st.stepsTotal}` : 'Çözümü başlat'}</button>
      {st?.videoOpen ? <button type="button" className="br-b accent" onClick={() => cmd('closeVideo')}><X size={26} aria-hidden="true" />Videoyu kapat</button>
        : <button type="button" className="br-b accent" disabled={!st?.hasVideo} onClick={() => cmd('video')}><Play size={26} aria-hidden="true" />Çözüm videosu</button>}
      <button type="button" className="br-b" disabled={!st?.hasTopic || st?.videoOpen} onClick={() => cmd('topic')}><Video size={26} aria-hidden="true" />Konuyu hatırlat</button>
      <button type="button" className="br-b" disabled={!st} onClick={() => cmd('options')}>{st?.hideOptions ? <Eye size={26} aria-hidden="true" /> : <EyeOff size={26} aria-hidden="true" />}{st?.hideOptions ? 'Şıkları göster' : 'Şıkları gizle'}</button>
      <button type="button" className="br-b" disabled={!st || (!st.revealed && !st.steps)} onClick={() => cmd('reset')}><RotateCcw size={26} aria-hidden="true" />Baştan</button>
    </div>
    <div className="br-times" role="group" aria-label="Düşünme süresi"><Timer size={18} aria-hidden="true" />{[30, 60, 120].map((s) => <button key={s} type="button" disabled={!st} onClick={() => cmd('timer', s)}>{s < 60 ? `${s} sn` : `${s / 60} dk`}</button>)}{st?.timer && <button type="button" onClick={() => cmd('timer', 0)}>Kapat</button>}</div>
  </div>;
}
