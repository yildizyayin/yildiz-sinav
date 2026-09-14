import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    turnstile?: { render: (element: HTMLElement, options: Record<string, unknown>) => string; remove: (id: string) => void; reset: (id?: string) => void };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => { script.remove(); scriptPromise = null; reject(new Error('Turnstile yüklenemedi.')); };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!siteKey || !ref.current) return;
    setError(false);
    onToken('');
    let widgetId = '';
    let alive = true;
    void loadScript().then(() => {
      if (!alive || !ref.current || !window.turnstile) return;
      widgetId = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        theme: 'light',
        size: 'flexible',
        callback: (token: string) => { setError(false); onToken(token); },
        'expired-callback': () => onToken(''),
        'error-callback': () => { onToken(''); setError(true); },
        'timeout-callback': () => { onToken(''); setError(true); },
      });
    }).catch(() => { if (alive) { onToken(''); setError(true); } });
    return () => { alive = false; if (widgetId && window.turnstile) window.turnstile.remove(widgetId); };
  }, [siteKey, onToken, attempt]);
  if (!siteKey) return <div role="status" className="dev-note">Güvenli giriş hazırlanıyor. Bu mesaj devam ederse sayfayı yenileyin veya kurumunuzdan destek alın.</div>;
  return <div><div ref={ref} className="turnstile-box" />{error && <div role="alert" className="alert error">Güvenlik doğrulaması yüklenemedi. Bağlantınızı kontrol edin. <button type="button" onClick={() => setAttempt(value => value + 1)}>Yeniden dene</button></div>}</div>;
}
