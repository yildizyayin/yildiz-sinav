import { useEffect, useRef, useState } from 'react';
import { Send, X } from 'lucide-react';
import { NibiruMark, type NibiruVisualState } from './NibiruMark';
import { SITE_NIBIRU_CHIPS, SITE_NIBIRU_GREETING, answerSiteNibiru, type SiteNibiruAction } from '../lib/siteNibiru';
import './SiteNibiruChat.css';

// anunex.com Nibiru tanıtım asistanı: prepared answers only, worked out in the visitor's browser. Nothing is sent
// anywhere and nothing is kept; closing the page forgets the conversation.
type Message = { from: 'visitor' | 'nibiru'; text: string; actions?: SiteNibiruAction[] };
export const SITE_NIBIRU_OPEN_EVENT = 'site-nibiru-open';

export function SiteNibiruChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ from: 'nibiru', text: SITE_NIBIRU_GREETING }]);
  const [draft, setDraft] = useState('');
  const [state, setState] = useState<NibiruVisualState>('active');
  const turns = useRef(0);
  const timers = useRef<number[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(SITE_NIBIRU_OPEN_EVENT, show);
    return () => { window.removeEventListener(SITE_NIBIRU_OPEN_EVENT, show); timers.current.forEach((t) => window.clearTimeout(t)); };
  }, []);
  useEffect(() => { if (open) inputRef.current?.focus({ preventScroll: true }); }, [open]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, state]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);

  const ask = (question: string) => {
    const text = question.trim().slice(0, 200);
    if (!text || state === 'thinking') return;
    setMessages((m) => [...m, { from: 'visitor', text }]);
    setDraft('');
    setState('thinking');
    const answer = answerSiteNibiru(text, turns.current++);
    timers.current.push(window.setTimeout(() => {
      setMessages((m) => [...m, { from: 'nibiru', text: answer.text, actions: answer.actions }]);
      setState('speaking');
      timers.current.push(window.setTimeout(() => setState('active'), 1600));
    }, 650 + Math.min(900, answer.text.length * 4)));
  };

  return <>
    {!open && <button type="button" className="site-nibiru-launcher" onClick={() => setOpen(true)} aria-label="Nibiru ile yazışın">
      <NibiruMark size={34} state="active" title="Nibiru"/><span>Nibiru’ya sor</span>
    </button>}
    {open && <section className="site-nibiru-panel" role="dialog" aria-label="Nibiru tanıtım asistanı">
      <header>
        <NibiruMark size={44} state={state} title="Nibiru"/>
        <div><strong>Nibiru</strong><small>{state === 'thinking' ? 'düşünüyor…' : state === 'listening' ? 'dinliyor…' : 'Tanıtım asistanı · kaydedilmez'}</small></div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Kapat"><X size={18}/></button>
      </header>
      <div className="site-nibiru-list" ref={listRef} aria-live="polite">
        {messages.map((m, k) => <div key={k} className={`site-nibiru-msg ${m.from}`}>
          <p>{m.text}</p>
          {m.actions?.length ? <div className="site-nibiru-actions">{m.actions.map((a) => <a key={a.href} href={a.href} onClick={() => { if (a.href.startsWith('#')) setOpen(false); }} {...(a.href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}>{a.label}</a>)}</div> : null}
        </div>)}
        {state === 'thinking' && <div className="site-nibiru-msg nibiru typing" aria-label="Nibiru yazıyor"><i/><i/><i/></div>}
      </div>
      <div className="site-nibiru-chips">{SITE_NIBIRU_CHIPS.map((c) => <button key={c} type="button" onClick={() => ask(c)} disabled={state === 'thinking'}>{c}</button>)}</div>
      <form onSubmit={(e) => { e.preventDefault(); ask(draft); }}>
        <input ref={inputRef} value={draft} maxLength={200} placeholder="Sorunuzu yazın…" aria-label="Sorunuz" autoComplete="off"
          onChange={(e) => { setDraft(e.target.value); if (state !== 'thinking' && state !== 'speaking') setState(e.target.value ? 'listening' : 'active'); }}/>
        <button type="submit" aria-label="Gönder" disabled={!draft.trim() || state === 'thinking'}><Send size={18}/></button>
      </form>
      <p className="site-nibiru-note">Önceden hazırlanmış cevaplar. Yazdıklarınız hiçbir yere gönderilmez; kişisel bilgi paylaşmayın.</p>
    </section>}
  </>;
}
