import { useMemo, useRef, useState } from 'react';
import { caseFor, type Suspect } from './mysteryCases';
import './mystery.css';

/**
 * Gizem Dosyası (owner, 25–26 Nov 2026: bireysel, hikâyeli oyun). A case file over three approved questions of the
 * chosen kazanım: each answer is checked on the server (the clue opens either way, a wrong answer shows the right one
 * and why), then the student decides which suspect the clue rules out, and finally who it was. Nothing is compared
 * with anyone else; the "dedektif yıldızı" is the student's own.
 */
type Check = { correct: boolean; partial: number; key: any; explanation: string | null };
type Props = {
  sessionId: string; items: Array<{ seq: number; content: any }>;
  check: (seq: number, r: any) => Promise<Check | null>;
  scored: (ok: boolean, el?: Element | null, gentle?: boolean) => void;
  say: (m: '' | 'happy' | 'oops', t: string) => void;
  onFinish: () => void; busy: boolean; onStep?: (done: number) => void;
};

const HAT: Record<string, string> = { captain: '#14215a', gardener: '#2f8f5b', chef: '#f3f3f3', engineer: '#e0a100', guide: '#c2410c', guard: '#334155', visitor: '#7c3aed', librarian: '#1d4ed8', coach: '#ca8a04', musician: '#be185d' };
function Art({ s }: { s: Suspect }) {
  if (s.art === 'robot') return <svg viewBox="0 0 120 96" aria-hidden="true"><rect x="38" y="18" width="44" height="34" rx="8" fill="#8fa3c8" /><circle cx="51" cy="34" r="6" fill="#ffd166" /><circle cx="69" cy="34" r="6" fill="#ffd166" /><rect x="50" y="44" width="20" height="4" rx="2" fill="#2b2217" /><line x1="60" y1="18" x2="60" y2="8" stroke="#2b2217" strokeWidth="3" /><circle cx="60" cy="7" r="4" fill="#ff6b7d" /><rect x="34" y="56" width="52" height="36" rx="8" fill="#6f84ab" /></svg>;
  if (s.art === 'astronaut') return <svg viewBox="0 0 120 96" aria-hidden="true"><circle cx="60" cy="36" r="24" fill="#f3f6ff" stroke="#8fa3c8" strokeWidth="3" /><ellipse cx="60" cy="38" rx="15" ry="12" fill="#1d3fb8" /><path d="M50 34 q10 -8 20 0" stroke="#9fd0ff" strokeWidth="3" fill="none" /><rect x="34" y="60" width="52" height="34" rx="12" fill="#f3f6ff" stroke="#8fa3c8" strokeWidth="3" /><rect x="52" y="68" width="16" height="10" rx="2" fill="#ff6b7d" /></svg>;
  const hat = HAT[s.art] || '#14215a';
  return <svg viewBox="0 0 120 96" aria-hidden="true"><rect x="34" y="62" width="52" height="32" rx="10" fill={hat} opacity=".85" /><circle cx="60" cy="40" r="20" fill="#e0b48c" />
    {s.art === 'chef' ? <path d="M42 26 q-6 -14 8 -14 q4 -8 10 -2 q6 -6 10 2 q14 0 8 14 z" fill="#fff" stroke="#cbd5e1" /> : <><rect x="40" y="16" width="40" height="10" rx="4" fill={hat} /><rect x="36" y="24" width="48" height="4" rx="2" fill={hat} /></>}
    <circle cx="53" cy="40" r="2.5" fill="#2b2217" /><circle cx="67" cy="40" r="2.5" fill="#2b2217" /><path d="M51 49 q9 6 18 0" stroke="#2b2217" strokeWidth="2.5" fill="none" /></svg>;
}

export function MysteryGame({ sessionId, items, check, scored, say, onFinish, busy, onStep }: Props) {
  const c = useMemo(() => caseFor(sessionId), [sessionId]);
  const qs = items.slice(0, 3);
  const [step, setStep] = useState(0);                       // which clue is open (0..2), 3 = accusation done
  const [phase, setPhase] = useState<'question' | 'clue' | 'pick' | 'accuse' | 'solved'>('question');
  const [res, setRes] = useState<Check | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [out, setOut] = useState<Set<string>>(new Set());
  const [shake, setShake] = useState<string | null>(null);
  const [stars, setStars] = useState(3);
  const cards = useRef<Record<string, HTMLButtonElement | null>>({});
  const clue = c.clues[step];
  const q = qs[step]?.content || {};

  const answer = async (key: string | null) => {
    if (chosen || res) return;
    setChosen(key || '-');
    if (!key) { setRes({ correct: false, partial: 0, key: null, explanation: null }); say('', 'Boş bıraktın; ipucu yine de açılıyor.'); return; }
    const r = await check(qs[step].seq, { answer: key });
    if (!r) { setChosen(null); return; }
    setRes(r); scored(r.correct, null, true);
    say(r.correct ? 'happy' : 'oops', r.correct ? 'Doğru! İpucu açılıyor…' : 'Olsun, doğrusunu birlikte gördük. İpucu yine de açılıyor.');
  };
  const openClue = () => { setPhase(clue.rulesOut ? 'pick' : 'accuse'); say('', clue.rulesOut ? 'İpucunu şüpheli kartlarıyla karşılaştır: kim elenmeli? Kartına dokun.' : 'Son ipucu! Kalan şüphelilere bak ve suçlamayı yap.'); };
  const pickSuspect = (id: string) => {
    if (phase === 'pick') {
      if (id === clue.rulesOut) {
        setOut(new Set([...out, id])); say('happy', `Doğru! ${c.suspects.find((s) => s.id === id)!.name} bu ipucuna uymuyor, elendi.`);
        setStep(step + 1); onStep?.(step + 1); setPhase('question'); setRes(null); setChosen(null);
      } else { setShake(id); setTimeout(() => setShake(null), 500); setStars((x) => Math.max(1, x - 1)); say('oops', 'Bu şüpheli ipucuna uyuyor. Kart bilgilerini ipucuyla karşılaştır.'); }
    } else if (phase === 'accuse') {
      if (id === c.culprit) { setPhase('solved'); setStep(3); onStep?.(3); say('happy', 'Bütün ipuçları onu gösteriyor… ama bir sürpriz var!'); }
      else { setShake(id); setTimeout(() => setShake(null), 500); setStars((x) => Math.max(1, x - 1)); say('oops', out.has(id) ? 'O zaten elendi. Kalanlara bak!' : 'Bu şüpheli son ipucuna uymuyor. Tekrar bak!'); }
    }
  };
  const right = res?.key?.correct as string | undefined;
  return <div className="gm" aria-label={c.title}>
    <div className="gm-file">
      <span className="gm-tab">DOSYA · {c.title.toLocaleUpperCase('tr-TR')}</span>
      <h3>{c.title}</h3>
      <p className="gm-type">{c.intro}</p>
      <div className="gm-suspects">{c.suspects.map((s) => {
        const picking = phase === 'pick' || phase === 'accuse';
        return <button key={s.id} ref={(el) => { cards.current[s.id] = el; }} type="button" className={`gm-sus${out.has(s.id) ? ' out' : ''}${shake === s.id ? ' shake' : ''}${phase === 'solved' && s.id === c.culprit ? ' culprit' : ''}`}
          disabled={!picking || out.has(s.id)} onClick={() => pickSuspect(s.id)} aria-label={`${s.name}${out.has(s.id) ? ', elendi' : ''}`}>
          <Art s={s} /><strong>{s.name}</strong>
          <dl>{s.facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          <span className="gm-stamp" aria-hidden="true">ELENDİ</span>
        </button>;
      })}</div>
      <p className="gm-type gm-stars">Dedektif yıldızın: {'★'.repeat(stars)}{'☆'.repeat(3 - stars)} · yanlış eleme yıldız götürür, yanlış cevap götürmez.</p>
    </div>

    <ol className="gm-clues">{c.clues.map((k, i) => {
      const st = i < step || phase === 'solved' ? 'solved' : i === step ? 'open' : 'locked';
      return <li key={k.title} className={`gm-clue ${st}`}>
        <span className="gm-no">{i + 1}</span>
        <div>
          <h4>{k.title}</h4>
          {(st === 'solved' || (st === 'open' && phase !== 'question')) && <p className="gm-found">{k.found}</p>}
          {st === 'locked' && <p className="gm-muted">Önceki ipucunu çözünce açılır.</p>}
          {st === 'open' && phase === 'question' && <div className="gm-q">
            <p className="gm-muted">Bu ipucunu açmak için soruyu çöz:</p>
            <p className="gm-stem">{q.stem}</p>
            {(q.assets || []).map((a: any, n: number) => <img key={n} className="gm-img" src={a.url} alt={a.alt || 'Soru görseli'} />)}
            <div className="gm-opts">{(q.options || []).map((o: any) => <button key={o.key} type="button" disabled={!!chosen || busy}
              className={`gm-opt${res ? (o.key === right ? ' right' : o.key === chosen ? ' wrong' : ' dim') : ''}`} onClick={() => void answer(o.key)} aria-label={`${o.key}) ${o.text}`}><b>{o.key}</b><span>{o.text}</span></button>)}</div>
            <div className="gm-fb" aria-live="polite">
              {res && <span className={res.correct ? 'good' : 'bad'}>{res.correct ? '✓ Doğru!' : chosen === '-' ? 'Boş bırakıldı.' : `Doğrusu: ${right}`}</span>}
              {res?.explanation && <span className="gm-why">{res.explanation}</span>}
              {res ? <button type="button" className="ua-next" onClick={openClue}>İpucunu aç</button>
                : <button type="button" className="ua-ghost" onClick={() => void answer(null)}>Boş bırak, ipucunu aç</button>}
            </div>
          </div>}
          {st === 'open' && (phase === 'pick' || phase === 'accuse') && <p className="gm-ask">{phase === 'pick' ? 'Bu ipucuna uymayan şüphelinin kartına dokun.' : `${c.ask} Kalan şüphelinin kartına dokun.`}</p>}
        </div>
      </li>;
    })}</ol>

    {phase === 'solved' && <div className="gm-solved">
      <div className="gm-badge" aria-hidden="true"><svg viewBox="0 0 58 58"><circle cx="24" cy="24" r="14" fill="none" stroke="#5a3500" strokeWidth="5" /><path d="M34 34 l14 14" stroke="#5a3500" strokeWidth="7" strokeLinecap="round" /></svg></div>
      <h3>Vaka çözüldü!</h3>
      <p>{c.ending}</p>
      <button type="button" className="ua-next" disabled={busy} onClick={onFinish}>{busy ? 'Kaydediliyor…' : 'Dosyayı kapat'}</button>
    </div>}
  </div>;
}
