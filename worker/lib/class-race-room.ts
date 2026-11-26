import type { Env } from '../types';
import { answer, boardView, close, join, newRace, next, playerView, type RaceState } from './class-race-engine';

/**
 * Sınıf Uzay Yarışı, the live room: one Durable Object per race (SQLite-backed, free tier; owner 26 Nov 2026 "En iyi
 * şekilde yap izin veriyorum"). The Worker checks who may come in and opens the socket here with trusted headers; the
 * room keeps the state, runs the clock with an alarm and sends each screen its own view: the board sees the class,
 * a phone sees only itself. Hibernatable sockets, so a quiet room costs nothing while it waits.
 */
type Att = { role: 'board' | 'player'; id: string };
type DOState = { storage: any; acceptWebSocket(ws: WebSocket, tags?: string[]): void; getWebSockets(tag?: string): WebSocket[]; blockConcurrencyWhile<T>(f: () => Promise<T>): Promise<T> };

export class RaceRoom {
  private s: RaceState | null = null;
  constructor(private state: DOState, private env: Env) {
    void state.blockConcurrencyWhile(async () => { this.s = (await state.storage.get('race')) || null; });
  }
  private async save() { await this.state.storage.put('race', this.s); }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/init' && request.method === 'POST') {
      if (this.s) return new Response('exists', { status: 200 });
      this.s = newRace(await request.json() as any); await this.save();
      return new Response('ok');
    }
    if (url.pathname === '/ws') {
      if (!this.s) return new Response('no race', { status: 404 });
      const role = request.headers.get('x-race-role') === 'board' ? 'board' : 'player', id = request.headers.get('x-race-user') || '';
      if (role === 'player') { const r = join(this.s, id, Date.now()); if (!r.ok) return new Response(r.reason, { status: 403 }); await this.save(); }
      const pair = new (globalThis as any).WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      this.state.acceptWebSocket(server, [role]);
      (server as any).serializeAttachment({ role, id } satisfies Att);
      this.broadcast();
      return new Response(null, { status: 101, webSocket: client } as any);
    }
    return new Response('not found', { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (!this.s) return;
    const me = (ws as any).deserializeAttachment() as Att;
    let msg: any; try { msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); } catch { return; }
    const now = Date.now();
    if (msg?.type === 'ping') { ws.send(JSON.stringify({ type: 'pong' })); return; }
    if (me.role === 'board' && msg?.type === 'next') {
      const r = next(this.s, now);
      if (!r.ok) { ws.send(JSON.stringify({ type: 'error', reason: r.reason })); return; }
      if (r.phase === 'QUESTION') {
        await this.state.storage.setAlarm(this.s.deadline!);
        if (this.s.qi === 0) await import('./class-race').then((m) => m.markRaceStarted(this.env, this.s!.id)).catch(() => undefined);
      }
      if (r.phase === 'FINISHED') await import('./class-race').then((m) => m.persistRaceResults(this.env, this.s!)).catch((e) => console.error(JSON.stringify({ event: 'class_race_persist_failed', error: String(e) })));
    } else if (me.role === 'board' && msg?.type === 'close') {
      close(this.s);
    } else if (me.role === 'player' && msg?.type === 'answer') {
      const r = answer(this.s, me.id, Number(msg.qi), String(msg.key || ''), now);
      if (!r.ok) { ws.send(JSON.stringify({ type: 'error', reason: r.reason })); return; }
      if (r.allIn) close(this.s);
    } else return;
    await this.save();
    this.broadcast();
  }

  async alarm() {
    if (!this.s || this.s.phase !== 'QUESTION') return;
    if (this.s.deadline && Date.now() + 50 < this.s.deadline) { await this.state.storage.setAlarm(this.s.deadline); return; }
    close(this.s); await this.save(); this.broadcast();
  }

  async webSocketClose(ws: WebSocket) { try { ws.close(); } catch { /* already closed */ } }

  private broadcast() {
    if (!this.s) return;
    const now = Date.now();
    for (const ws of this.state.getWebSockets()) {
      try {
        const a = (ws as any).deserializeAttachment() as Att;
        ws.send(JSON.stringify(a.role === 'board' ? boardView(this.s, now) : playerView(this.s, a.id, now)));
      } catch { /* a closed socket */ }
    }
  }
}
