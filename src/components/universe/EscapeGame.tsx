import { useEffect, useMemo, useRef, useState } from 'react';
import { roomFor, type RoomObject } from './escapeRooms';
import './escape.css';

/**
 * Kaçış Odası (owner, 26 Nov 2026: bireysel oyunlar, süre baskısı yok). Three objects, each opened by one approved
 * question of the kazanım (checked on the server, in the order the student chooses); each gives a digit, and the door
 * opens when the student enters them in the order its sign shows. A wrong order only shakes the door; nothing is
 * compared with anyone else.
 */
type Check = { correct: boolean; partial: number; key: any; explanation: string | null };
type Props = {
  sessionId: string; items: Array<{ seq: number; content: any }>;
  check: (seq: number, r: any) => Promise<Check | null>;
  scored: (ok: boolean, el?: Element | null, gentle?: boolean) => void;
  say: (m: '' | 'happy' | 'oops', t: string) => void;
  onFinish: () => void; busy: boolean; onStep?: (done: number) => void;
};

function ObjectArt({ art }: { art: RoomObject['art'] }) {
  switch (art) {
    case 'panel': return <svg viewBox="0 0 80 64" aria-hidden="true"><rect x="6" y="10" width="68" height="44" rx="8" fill="#334155" /><circle cx="22" cy="26" r="6" fill="#3ee08f" /><circle cx="40" cy="26" r="6" fill="#ffd166" /><circle cx="58" cy="26" r="6" fill="#ff6b7d" /><rect x="16" y="40" width="48" height="6" rx="3" fill="#5aa8ff" /></svg>;
    case 'map': return <svg viewBox="0 0 80 64" aria-hidden="true"><rect x="8" y="8" width="64" height="48" rx="6" fill="#1d2b6b" /><circle cx="22" cy="20" r="2" fill="#fff" /><circle cx="40" cy="30" r="2.5" fill="#fff" /><circle cx="58" cy="18" r="2" fill="#fff" /><circle cx="50" cy="44" r="2" fill="#fff" /><path d="M22 20 L40 30 L58 18 M40 30 L50 44" stroke="#9fc4ff" strokeWidth="1.5" fill="none" /></svg>;
    case 'tank': return <svg viewBox="0 0 80 64" aria-hidden="true"><rect x="28" y="12" width="24" height="46" rx="12" fill="#7dd3fc" /><rect x="34" y="4" width="12" height="10" rx="3" fill="#64748b" /><rect x="31" y="30" width="18" height="6" rx="3" fill="#0369a1" /></svg>;
    case 'clock': return <svg viewBox="0 0 80 64" aria-hidden="true"><circle cx="40" cy="32" r="24" fill="#f3ead6" stroke="#8b5e34" strokeWidth="5" /><path d="M40 32 V18 M40 32 L51 38" stroke="#2b2217" strokeWidth="3" strokeLinecap="round" /></svg>;
    case 'book': return <svg viewBox="0 0 80 64" aria-hidden="true"><rect x="14" y="10" width="52" height="44" rx="4" fill="#9b1c1c" /><rect x="20" y="16" width="40" height="32" rx="2" fill="#b91c1c" /><rect x="28" y="26" width="24" height="4" fill="#fcd34d" /><rect x="14" y="48" width="52" height="6" fill="#f3ead6" /></svg>;
    case 'plant': return <svg viewBox="0 0 80 64" aria-hidden="true"><path d="M26 40 h28 l-4 20 h-20 z" fill="#c2410c" /><path d="M40 40 C40 24 28 18 22 14 C34 16 40 24 40 30 C40 22 48 12 58 10 C52 18 44 26 40 40" fill="#16a34a" /></svg>;
    case 'toolbox': return <svg viewBox="0 0 80 64" aria-hidden="true"><rect x="10" y="24" width="60" height="32" rx="5" fill="#dc2626" /><path d="M30 24 v-8 h20 v8" stroke="#475569" strokeWidth="5" fill="none" /><rect x="10" y="34" width="60" height="5" fill="#991b1b" /></svg>;
    case 'battery': return <svg viewBox="0 0 80 64" aria-hidden="true"><rect x="14" y="18" width="48" height="30" rx="5" fill="#16a34a" /><rect x="62" y="26" width="6" height="14" rx="2" fill="#475569" /><path d="M40 22 L32 34 H40 L36 44 L48 30 H40 Z" fill="#fde047" /></svg>;
    case 'screen': return <svg viewBox="0 0 80 64" aria-hidden="true"><rect x="10" y="8" width="60" height="40" rx="6" fill="#0f172a" stroke="#64748b" strokeWidth="3" /><circle cx="30" cy="26" r="5" fill="#5aa8ff" /><circle cx="50" cy="26" r="5" fill="#5aa8ff" /><path d="M30 36 q10 6 20 0" stroke="#5aa8ff" strokeWidth="3" fill="none" /><rect x="34" y="48" width="12" height="8" fill="#64748b" /></svg>;
  }
}

export function EscapeGame({ sessionId, items, check, scored, say, onFinish, busy, onStep }: Props) {
  const { room, digits } = useMemo(() => roomFor(sessionId), [sessionId]);
  const qs = items.slice(0, 3);
  const [opened, setOpened] = useState<Record<string, true>>({});
  const [active, setActive] = useState<string | null>(null);
  const [res, setRes] = useState<Check | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [code, setCode] = useState<number[]>([]);
  const [door, setDoor] = useState<'locked' | 'shake' | 'open'>('locked');
  const qBox = useRef<HTMLDivElement>(null);
  // on a phone the question sits under the door: bring it into view when an object opens
  useEffect(() => { if (active) qBox.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }); }, [active]);
  const qOf = (id: string) => qs[room.objects.findIndex((o) => o.id === id)];
  const done = Object.keys(opened).length;
  const nameOf = (id: string) => room.objects.find((o) => o.id === id)!.name;

  const open = (id: string) => { if (opened[id] || active) return; setActive(id); setRes(null); setChosen(null); say('', `${nameOf(id)} bir soru soruyor…`); };
  const answer = async (key: string | null) => {
    if (!active || chosen || res) return;
    setChosen(key || '-');
    if (!key) { setRes({ correct: false, partial: 0, key: null, explanation: null }); return; }
    const r = await check(qOf(active).seq, { answer: key });
    if (!r) { setChosen(null); return; }
    setRes(r); scored(r.correct, null, true);
    say(r.correct ? 'happy' : 'oops', r.correct ? 'Doğru! Rakam ortaya çıktı.' : 'Doğrusunu birlikte gördük; rakam yine de ortaya çıktı.');
  };
  const take = () => {
    if (!active) return;
    const next = { ...opened, [active]: true as const }; setOpened(next); setActive(null);
    const n = Object.keys(next).length; onStep?.(Math.min(n, 2));
    say('', n < 3 ? 'Rakamı not et! Sıradaki eşyayı sen seç.' : 'Üç rakam da elinde. Kapının üstündeki sıraya göre kodu gir.');
  };
  const press = (n: number) => {
    if (door === 'open' || done < 3) return;
    const next = [...code, n].slice(0, 3); setCode(next);
    if (next.length < 3) return;
    const ok = next.every((d, k) => d === digits[room.sign[k]]);
    if (ok) { setDoor('open'); say('happy', 'Klik! Kapı açılıyor…'); }
    else { setDoor('shake'); say('oops', 'Kod tutmadı. Kapının üstündeki sıraya bak ve eşyaların rakamlarını o sırayla gir.'); setTimeout(() => { setDoor('locked'); setCode([]); }, 600); }
  };
  const q = active ? qOf(active)?.content || {} : null;
  const right = res?.key?.correct as string | undefined;
  return <div className="er" aria-label={room.title}>
    <div className="er-room">
      <h3>{room.title}</h3>
      <p className="er-intro">{room.intro}</p>
      <div className="er-scene">
        <div className="er-objects">{room.objects.map((o) => <button key={o.id} type="button" className={`er-obj${opened[o.id] ? ' done' : ''}${active === o.id ? ' active' : ''}`} disabled={!!opened[o.id] || (!!active && active !== o.id)} onClick={() => open(o.id)} aria-label={`${o.name}${opened[o.id] ? `, rakam ${digits[o.id]}` : ', aç'}`}>
          <ObjectArt art={o.art} /><span>{o.name}</span>{opened[o.id] && <b className="er-digit">{digits[o.id]}</b>}
        </button>)}</div>
        <div className={`er-door ${door}`} aria-label={door === 'open' ? 'Kapı açık' : 'Kilitli kapı'}>
          <div className="er-sign">Kod sırası: {room.sign.map((id) => nameOf(id)).join(' → ')}</div>
          <div className="er-frame"><div className="er-leaf"><span className="er-knob" /></div></div>
          <div className="er-code" aria-live="polite">{[0, 1, 2].map((k) => <i key={k}>{code[k] ?? '•'}</i>)}</div>
          <div className="er-pad" role="group" aria-label="Kapı tuş takımı">{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <button key={n} type="button" disabled={done < 3 || door === 'open'} onClick={() => press(n)}>{n}</button>)}</div>
        </div>
      </div>
    </div>

    {active && q && <div className="er-q" ref={qBox}>
      <p className="er-qhead">{nameOf(active)}</p>
      <p className="er-stem">{q.stem}</p>
      {(q.assets || []).map((a: any, n: number) => <img key={n} className="er-img" src={a.url} alt={a.alt || 'Soru görseli'} />)}
      <div className="er-opts">{(q.options || []).map((o: any) => <button key={o.key} type="button" disabled={!!chosen || busy}
        className={`er-opt${res ? (o.key === right ? ' right' : o.key === chosen ? ' wrong' : ' dim') : ''}`} onClick={() => void answer(o.key)} aria-label={`${o.key}) ${o.text}`}><b>{o.key}</b><span>{o.text}</span></button>)}</div>
      <div className="er-fb" aria-live="polite">
        {res && <span className={res.correct ? 'good' : 'bad'}>{res.correct ? '✓ Doğru!' : chosen === '-' ? 'Boş bırakıldı.' : `Doğrusu: ${right}`}</span>}
        {res?.explanation && <span className="er-why">{res.explanation}</span>}
        {res ? <button type="button" className="ua-next" onClick={take}>Rakamı al: {digits[active]}</button>
          : <button type="button" className="ua-ghost" onClick={() => void answer(null)}>Boş bırak</button>}
      </div>
    </div>}

    {door === 'open' && <div className="er-out">
      <h3>Kaçtın!</h3>
      <p>{room.ending}</p>
      <button type="button" className="ua-next" disabled={busy} onClick={onFinish}>{busy ? 'Kaydediliyor…' : 'Odadan çık'}</button>
    </div>}
  </div>;
}
