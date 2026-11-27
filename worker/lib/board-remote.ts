/**
 * Tahta kumandası (owner, 27 Nov 2026: "telefondan tabletten pcden pardüsten her yerden"). The board shows a short
 * board code (tahta kodu) and a QR; the teacher opens it on their phone and moves the lesson from there — next,
 * previous, show the answer, the next solution step, the solution video, thinking time.
 *
 * Security: the code is on the board where the whole class can read it, so the code alone opens nothing. The phone
 * must be signed in as someone who may open that test on the board (the teacher who made it, the institution's
 * manager or the Super Admin) — the same rule as the board itself. A code lives three hours.
 *
 * One Durable Object per code (a "room") relays messages between the board and the phone over WebSockets with the
 * hibernation API: while nobody talks, the room sleeps and costs nothing.
 */
import type { AuthUser, Env } from '../types';
import { json } from './db';

const LIFETIME_MS = 3 * 60 * 60 * 1000;
const ALPHABET = 'ABCDEFGHJKLMNPRSTUVYZ23456789';
const fail = (status: number, code: string, message: string) => json({ ok: false, error: { code, message } }, status);
export const validCode = (c: string) => /^[A-Z0-9]{6}$/.test(c) && [...c].every((x) => ALPHABET.includes(x));
const newCode = () => [...crypto.getRandomValues(new Uint8Array(6))].map((x) => ALPHABET[x % ALPHABET.length]).join('');

type Info = { docId: string; by: string; expiresAt: number };

/** The room. Plain class (no runtime import) so the Worker bundle and the tests load it alike. */
export class BoardRoom {
  state: any;
  constructor(state: any, _env: unknown) {
    this.state = state;
    try { state.setWebSocketAutoResponse?.(new (globalThis as any).WebSocketRequestResponsePair('ping', 'pong')); } catch { /* older runtime */ }
  }
  async info(): Promise<Info | null> {
    const i = (await this.state.storage.get('info')) as Info | undefined;
    return i && i.expiresAt > Date.now() ? i : null;
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/init' && request.method === 'POST') {
      if (await this.info()) return new Response('taken', { status: 409 });
      const b = (await request.json()) as Info;
      await this.state.storage.put('info', b);
      await this.state.storage.delete('last');
      await this.state.storage.setAlarm?.(b.expiresAt + 60_000);
      return Response.json({ ok: true });
    }
    if (url.pathname === '/info') { const i = await this.info(); return i ? Response.json(i) : new Response('gone', { status: 404 }); }
    if (url.pathname === '/ws') {
      if (!(await this.info())) return new Response('gone', { status: 404 });
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('websocket required', { status: 426 });
      const role = request.headers.get('X-Board-Role') === 'board' ? 'board' : 'remote';
      const pair = new (globalThis as any).WebSocketPair();
      const [client, server] = Object.values(pair) as any[];
      this.state.acceptWebSocket(server, [role]);
      const last = await this.state.storage.get('last');
      if (role === 'remote' && last) server.send(JSON.stringify(last));
      this.announce();
      return new Response(null, { status: 101, webSocket: client } as any);
    }
    return new Response('not found', { status: 404 });
  }
  /** tells everyone how many boards and phones are in the room */
  announce() {
    const boards = this.state.getWebSockets('board').length, remotes = this.state.getWebSockets('remote').length;
    const msg = JSON.stringify({ type: 'presence', boards, remotes });
    for (const ws of this.state.getWebSockets()) { try { ws.send(msg); } catch { /* closing */ } }
  }
  async webSocketMessage(ws: any, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > 20_000) return;
    if (!(await this.info())) { try { ws.close(4001, 'Kodun süresi doldu'); } catch { /* */ } return; }
    let msg: any; try { msg = JSON.parse(raw); } catch { return; }
    const role = this.state.getTags(ws)[0];
    if (role === 'remote' && msg?.type === 'cmd' && typeof msg.action === 'string') {
      const out = JSON.stringify({ type: 'cmd', action: msg.action, value: msg.value ?? null });
      for (const b of this.state.getWebSockets('board')) { try { b.send(out); } catch { /* */ } }
    } else if (role === 'board' && msg?.type === 'state') {
      await this.state.storage.put('last', msg);
      for (const r of this.state.getWebSockets('remote')) { try { r.send(raw); } catch { /* */ } }
    }
  }
  async webSocketClose(ws: any, code: number) { try { ws.close(code, 'bye'); } catch { /* */ } this.announce(); }
  async webSocketError() { this.announce(); }
  async alarm() { for (const ws of this.state.getWebSockets()) { try { ws.close(4001, 'Kodun süresi doldu'); } catch { /* */ } } await this.state.storage.deleteAll(); }
}

const room = (env: Env, code: string) => { const ns = (env as any).BOARD_ROOM; return ns ? ns.get(ns.idFromName(`board:${code}`)) : null; };

/**
 * POST /api/board-remote {documentId} → a new code for this test;
 * GET  /api/board-remote/:code → which test it opens (for the signed-in phone);
 * GET  /api/board-remote/:code/ws?role=board|remote → the WebSocket into the room.
 */
export async function handleBoardRemote(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/api\/board-remote(?:\/([^/]+)(?:\/(ws))?)?$/);
  if (!m) return null;
  // a WebSocket from another site must never ride on the teacher's cookie
  if ((request.method !== 'GET' || m[2]) && request.headers.get('Origin') !== url.origin) return fail(403, 'FORBIDDEN', 'İsteği ANUNEX üzerinden başlatın.');
  const { getAuthUser } = await import('./auth');
  const user: AuthUser | null = await getAuthUser(env, request);
  if (!user) return fail(401, 'UNAUTHENTICATED', 'Kumanda için telefonda ANUNEX’e giriş yapın.');
  const { boardDoc } = await import('./smart-board');
  const [, rawCode, ws] = m;
  if (!(env as any).BOARD_ROOM) return fail(503, 'REMOTE_UNAVAILABLE', 'Tahta kumandası bu ortamda henüz etkin değil.');
  if (!rawCode) {
    if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
    const b: any = await request.json().catch(() => ({}));
    const doc = await boardDoc(env, user, String(b?.documentId || ''));
    if (doc instanceof Response) return doc;
    const expiresAt = Date.now() + LIFETIME_MS;
    for (let tries = 0; tries < 6; tries++) {
      const code = newCode();
      const r = await room(env, code)!.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ docId: doc.id, by: user.id, expiresAt }) });
      if (r.ok) return json({ ok: true, code, expiresAt: new Date(expiresAt).toISOString(), path: `/kumanda/${code}` }, 201);
    }
    return fail(503, 'CODE_BUSY', 'Kod oluşturulamadı; tekrar deneyin.');
  }
  const code = rawCode.toUpperCase();
  if (!validCode(code)) return fail(404, 'CODE_NOT_FOUND', 'Bu tahta kodu bulunamadı. Tahtadaki kodu yeniden yazın.');
  const stub = room(env, code)!;
  const infoRes = await stub.fetch('https://room/info');
  if (!infoRes.ok) return fail(404, 'CODE_NOT_FOUND', 'Bu tahta kodu bulunamadı ya da süresi doldu. Tahtada “Telefondan yönet”e yeniden basın.');
  const info = (await infoRes.json()) as Info;
  const doc = await boardDoc(env, user, info.docId);
  if (doc instanceof Response) return fail(403, 'FORBIDDEN', 'Bu tahtayı yönetme yetkiniz yok. Testi hazırlayan öğretmenin hesabıyla giriş yapın.');
  if (!ws) return json({ ok: true, documentId: doc.id, title: doc.title, expiresAt: new Date(info.expiresAt).toISOString() });
  if (request.headers.get('Upgrade') !== 'websocket') return fail(426, 'WEBSOCKET_REQUIRED', 'WebSocket bağlantısı gerekli.');
  const headers = new Headers(request.headers); headers.set('X-Board-Role', url.searchParams.get('role') === 'board' ? 'board' : 'remote');
  return stub.fetch(new Request('https://room/ws', { headers }));
}
