import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Sınıf Uzay Yarışı: the live connection to one race room. Reconnects by itself (a phone that sleeps or a school
 * Wi-Fi that drops comes back into the same race) and counts the question clock down on the device between messages.
 */
export function useRaceSocket(raceId: string | null) {
  const [view, setView] = useState<any>(null);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'open' | 'closed' | 'refused'>('idle');
  const [error, setError] = useState('');
  const [left, setLeft] = useState<number | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const deadline = useRef<number | null>(null);
  const tries = useRef(0);
  useEffect(() => {
    if (!raceId) return;
    let alive = true, timer: any = null, ping: any = null;
    const connect = () => {
      if (!alive) return;
      setStatus('connecting');
      const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/class-race/${encodeURIComponent(raceId)}/ws`);
      ws.current = sock;
      sock.onopen = () => { tries.current = 0; setStatus('open'); clearInterval(ping); ping = setInterval(() => { try { sock.send(JSON.stringify({ type: 'ping' })); } catch { /* closed */ } }, 25000); };
      sock.onmessage = (e) => {
        let m: any; try { m = JSON.parse(String(e.data)); } catch { return; }
        if (m.type === 'pong') return;
        if (m.type === 'error') { setError(m.reason || 'İşlem yapılamadı.'); return; }
        setError('');
        deadline.current = typeof m.left === 'number' ? Date.now() + m.left * 1000 : null;
        setLeft(m.left ?? null); setView(m);
      };
      sock.onclose = (e) => {
        clearInterval(ping);
        if (!alive) return;
        if (e.code === 1008 || tries.current > 20) { setStatus('refused'); return; }
        setStatus('closed'); tries.current++;
        timer = setTimeout(connect, Math.min(8000, 600 * 2 ** Math.min(tries.current, 4)));
      };
    };
    connect();
    const tick = setInterval(() => { if (deadline.current) setLeft(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000))); }, 250);
    return () => { alive = false; clearTimeout(timer); clearInterval(tick); clearInterval(ping); try { ws.current?.close(); } catch { /* closed */ } };
  }, [raceId]);
  const send = useCallback((msg: any) => { try { ws.current?.send(JSON.stringify(msg)); return true; } catch { return false; } }, []);
  return { view, status, error, left, send };
}

export const REASONS: Record<string, string> = {
  NO_PLAYERS: 'Henüz kimse katılmadı.', QUESTION_OPEN: 'Soru hâlâ açık.', RACE_FINISHED: 'Yarış bitti.',
  QUESTION_CLOSED: 'Bu sorunun süresi doldu.', TIME_UP: 'Süre doldu.', ALREADY_ANSWERED: 'Bu soruyu zaten cevapladın.', NOT_JOINED: 'Yarışa yeniden bağlanılıyor…', INVALID_OPTION: 'Geçersiz seçenek.',
};
