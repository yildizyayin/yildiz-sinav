import { useEffect, useRef, useState } from 'react';
import { Share, SquarePlus, X } from 'lucide-react';
import { useAuth } from '../auth';
import { NibiruMark } from './NibiruMark';

/**
 * "Nibiru'yu telefonuma ekle" (owner, 24 Nov 2026: "veli Nibiru'yu WhatsApp gibi kullansın"). On the Nibiru page the
 * page announces itself as its own app — name "Nibiru", its own icon, opening straight into the conversation — so a
 * parent adds it to the home screen once. Android/Chrome gets the browser's own install prompt; iPhone gets the three
 * Safari steps. Parents on a phone see the guide once by themselves; anyone can open it from the Nibiru menu.
 */
export const NIBIRU_INSTALL_EVENT = 'nibiru-install-open';
const SEEN = 'anunex.nibiruInstallSeen.v1';
const standalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true);
const ios = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

function useNibiruAppHead() {
  useEffect(() => {
    const set = (sel: string, make: () => HTMLElement, attr: string, value: string) => {
      let el = document.head.querySelector(sel) as HTMLElement | null; let created = false;
      if (!el) { el = make(); document.head.appendChild(el); created = true; }
      const before = el.getAttribute(attr); el.setAttribute(attr, value);
      return () => { if (created) el!.remove(); else if (before != null) el!.setAttribute(attr, before); };
    };
    const link = (rel: string) => () => Object.assign(document.createElement('link'), { rel });
    const meta = (name: string) => () => Object.assign(document.createElement('meta'), { name });
    const undo = [
      set('link[rel="manifest"]', link('manifest'), 'href', '/nibiru.webmanifest'),
      set('link[rel="apple-touch-icon"]', link('apple-touch-icon'), 'href', '/nibiru-apple-touch-icon.png'),
      set('meta[name="apple-mobile-web-app-title"]', meta('apple-mobile-web-app-title'), 'content', 'Nibiru'),
      set('meta[name="apple-mobile-web-app-capable"]', meta('apple-mobile-web-app-capable'), 'content', 'yes'),
      set('meta[name="theme-color"]', meta('theme-color'), 'content', '#071b46'),
    ];
    return () => undo.forEach((u) => u());
  }, []);
}

export function NibiruInstallGuide() {
  const { user } = useAuth();
  useNibiruAppHead();
  const [open, setOpen] = useState(false);
  const prompt = useRef<any>(null);
  const [canPrompt, setCanPrompt] = useState(false);
  useEffect(() => {
    const keep = (e: Event) => { e.preventDefault(); prompt.current = e; setCanPrompt(true); };
    const show = () => setOpen(true);
    window.addEventListener('beforeinstallprompt', keep);
    window.addEventListener(NIBIRU_INSTALL_EVENT, show);
    let timer = 0;
    if (user?.role === 'PARENT' && !standalone() && window.innerWidth < 900) {
      let seen = true; try { seen = Boolean(localStorage.getItem(SEEN)); } catch { /* private mode */ }
      if (!seen) timer = window.setTimeout(() => { setOpen(true); try { localStorage.setItem(SEEN, '1'); } catch { /* ignore */ } }, 2500);
    }
    return () => { window.removeEventListener('beforeinstallprompt', keep); window.removeEventListener(NIBIRU_INSTALL_EVENT, show); window.clearTimeout(timer); };
  }, [user?.role]);
  if (!open) return null;
  const install = async () => { const p = prompt.current; if (!p) return; prompt.current = null; setCanPrompt(false); await p.prompt(); await p.userChoice?.catch(() => null); setOpen(false); };
  const done = standalone();
  return <div className="nbx-install" role="dialog" aria-label="Nibiru’yu telefonuna ekle">
    <div className="nbx-install-box">
      <button type="button" className="nbx-install-x" onClick={() => setOpen(false)} aria-label="Kapat"><X size={18}/></button>
      <div className="nbx-install-icon"><NibiruMark size={52} state="active" title="Nibiru"/></div>
      <h2>{done ? 'Nibiru telefonunda' : 'Nibiru’yu telefonuna ekle'}</h2>
      {done ? <p>Nibiru zaten ana ekranında. Simgesine dokununca doğrudan sohbet açılır.</p> : <>
        <p>WhatsApp gibi: simgeye dokun, Nibiru’ya yaz. Mağaza ya da ücret yok.</p>
        {canPrompt ? <button type="button" className="nbx-install-go" onClick={() => void install()}>Ana ekrana ekle</button>
          : ios() ? <ol className="nbx-install-steps">
            <li><span><Share size={18}/></span><span className="txt">Safari’de alttaki <b>Paylaş</b> düğmesine dokun.</span></li>
            <li><span><SquarePlus size={18}/></span><span className="txt"><b>Ana Ekrana Ekle</b>’yi seç.</span></li>
            <li><span>✓</span><span className="txt">Sağ üstteki <b>Ekle</b>’ye dokun. Ana ekranda <b>Nibiru</b> simgesi oluşur.</span></li>
          </ol>
          : <ol className="nbx-install-steps">
            <li><span>⋮</span><span className="txt">Tarayıcının sağ üstündeki <b>menüye</b> dokun.</span></li>
            <li><span><SquarePlus size={18}/></span><span className="txt"><b>Ana ekrana ekle</b> ya da <b>Uygulamayı yükle</b>’yi seç.</span></li>
            <li><span>✓</span><span className="txt">Onayla. Ana ekranda <b>Nibiru</b> simgesi oluşur.</span></li>
          </ol>}
        {ios() && <small>iPhone’da bu adımlar yalnız Safari’de çalışır.</small>}
      </>}
    </div>
  </div>;
}
