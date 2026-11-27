import { useEffect, useRef, useState } from 'react';

/**
 * One WebSocket into a board room (tahta kumandası), kept alive over weak school Wi-Fi: it reconnects by itself
 * (1 s, 2 s, 4 s … up to 15 s) and pings every 25 s so proxies do not drop a quiet line.
 */
export type BoardMsg = { type: string; [k: string]: any };
export function useBoardSocket(code: string | null, role: 'board' | 'remote', onMessage: (m: BoardMsg) => void) {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'open' | 'closed' | 'expired'>('idle');
  const [presence, setPresence] = useState({ boards: 0, remotes: 0 });
  const sock = useRef<WebSocket | null>(null);
  const handler = useRef(onMessage); handler.current = onMessage;
  useEffect(() => {
    if (!code || typeof WebSocket === 'undefined') { setStatus('idle'); return; }
    let stop = false, wait = 1000, retry: number | undefined, ping: number | undefined;
    const open = () => {
      setStatus('connecting');
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/board-remote/${encodeURIComponent(code)}/ws?role=${role}`);
      sock.current = ws;
      ws.onopen = () => { wait = 1000; setStatus('open'); ping = window.setInterval(() => { try { ws.send('ping'); } catch { /* */ } }, 25_000); };
      ws.onmessage = (e) => { if (e.data === 'pong') return; try { const m = JSON.parse(String(e.data)); if (m.type === 'presence') setPresence({ boards: m.boards, remotes: m.remotes }); handler.current(m); } catch { /* not ours */ } };
      ws.onclose = (e) => {
        window.clearInterval(ping); sock.current = null;
        if (stop) return;
        if (e.code === 4001) { setStatus('expired'); return; }
        setStatus('closed'); retry = window.setTimeout(open, wait); wait = Math.min(wait * 2, 15_000);
      };
    };
    open();
    return () => { stop = true; window.clearTimeout(retry); window.clearInterval(ping); try { sock.current?.close(1000, 'bye'); } catch { /* */ } sock.current = null; };
  }, [code, role]);
  const send = (m: BoardMsg) => { const ws = sock.current; if (ws && ws.readyState === 1) { ws.send(JSON.stringify(m)); return true; } return false; };
  return { status, presence, send };
}
