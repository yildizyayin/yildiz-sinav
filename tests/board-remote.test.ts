import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { BoardRoom, validCode } from '../worker/lib/board-remote';

/** Tahta kumandası: a board code opens nothing alone; only the signed-in teacher of that test (or manager / Super Admin) joins the room; the room relays commands to the board and the board's state to the phone. Synthetic data only. */
function fakeState() {
  const store = new Map<string, unknown>(); const sockets: Array<{ ws: any; tags: string[] }> = [];
  return {
    storage: { get: async (k: string) => store.get(k), put: async (k: string, v: unknown) => { store.set(k, v); }, delete: async (k: string) => { store.delete(k); }, deleteAll: async () => store.clear(), setAlarm: async () => {} },
    acceptWebSocket: (ws: any, tags: string[]) => { sockets.push({ ws, tags }); },
    getWebSockets: (tag?: string) => sockets.filter((s) => !tag || s.tags.includes(tag)).map((s) => s.ws),
    getTags: (ws: any) => sockets.find((s) => s.ws === ws)!.tags,
    sockets,
  };
}
const sock = () => { const sent: string[] = []; return { sent, send: (m: string) => sent.push(m), close: () => {} }; };
function fakeNamespace() {
  const rooms = new Map<string, BoardRoom>();
  return { rooms, idFromName: (n: string) => n, get: (id: string) => { if (!rooms.has(id)) rooms.set(id, new BoardRoom(fakeState(), {})); const r = rooms.get(id)!; return { fetch: (input: any, init?: any) => r.fetch(typeof input === 'string' ? new Request(input, init) : input) }; } };
}
async function world() {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT OR IGNORE INTO platform_features(feature_key,label,stage,enabled_default) VALUES('STUDIO','Studio','STANDARD',1);
    UPDATE platform_features SET enabled_default=1 WHERE feature_key='STUDIO';
    INSERT INTO studio_documents(id,institution_id,created_by,document_type,title,grade_level,subject_id,status,config_json) VALUES('d1','school','teacher','WORKSHEET','Kuvvet testi',5,'sub_tur','READY','{}');`);
  return t;
}

describe('Tahta kumandası', () => {
  it('says plainly when the room is not set up in this environment', async () => {
    const t = await world();
    const r = await t.request('/api/board-remote', 'POST', { documentId: 'd1' }, 'teacher');
    expect(r.response.status).toBe(503);
    expect(r.data.error.code).toBe('REMOTE_UNAVAILABLE');
  });

  it('gives the teacher a code; the code opens the test only for someone who may open it on the board', async () => {
    const t = await world(); const ns = fakeNamespace(); (t.env as any).BOARD_ROOM = ns;
    expect((await t.request('/api/board-remote', 'POST', { documentId: 'd1' }, 'stuuser')).response.status).toBe(403);
    const r = await t.request('/api/board-remote', 'POST', { documentId: 'd1' }, 'teacher');
    expect(r.response.status, r.text).toBe(201);
    expect(validCode(r.data.code)).toBe(true);
    expect(r.data.path).toBe(`/kumanda/${r.data.code}`);
    const info = await t.request(`/api/board-remote/${r.data.code}`, 'GET', undefined, 'teacher');
    expect(info.data).toMatchObject({ documentId: 'd1', title: 'Kuvvet testi' });
    // a student who reads the code on the board gets nothing
    expect((await t.request(`/api/board-remote/${r.data.code}`, 'GET', undefined, 'stuuser')).response.status).toBe(403);
    expect((await t.request(`/api/board-remote/${r.data.code}`, 'GET', undefined, 'parent')).response.status).toBe(403);
    expect((await t.request('/api/board-remote/ZZZZZ1', 'GET', undefined, 'teacher')).data.error.code).toBe('CODE_NOT_FOUND');
    expect((await t.request('/api/board-remote/abc', 'GET', undefined, 'teacher')).data.error.code).toBe('CODE_NOT_FOUND');
    // the WebSocket needs ANUNEX as its origin (no cross-site socket on the teacher's cookie) and a real upgrade
    const ws = await t.request(`/api/board-remote/${r.data.code}/ws?role=remote`, 'GET', undefined, 'teacher');
    expect(ws.response.status).toBe(426);
  });

  it('relays the phone’s commands to the board and the board’s state to the phone, and nothing the other way', async () => {
    const st = fakeState(); const roomObj = new BoardRoom(st, {});
    await roomObj.fetch(new Request('https://room/init', { method: 'POST', body: JSON.stringify({ docId: 'd1', by: 'teacher', expiresAt: Date.now() + 60_000 }) }));
    expect((await roomObj.fetch(new Request('https://room/init', { method: 'POST', body: JSON.stringify({ docId: 'd2', by: 'x', expiresAt: Date.now() + 60_000 }) }))).status).toBe(409);
    const board = sock(), phone = sock();
    st.acceptWebSocket(board, ['board']); st.acceptWebSocket(phone, ['remote']);
    await roomObj.webSocketMessage(phone, JSON.stringify({ type: 'cmd', action: 'next' }));
    expect(board.sent.map((m) => JSON.parse(m))).toEqual([{ type: 'cmd', action: 'next', value: null }]);
    await roomObj.webSocketMessage(board, JSON.stringify({ type: 'state', index: 1, total: 10 }));
    expect(JSON.parse(phone.sent.at(-1)!)).toMatchObject({ type: 'state', index: 1 });
    expect(await st.storage.get('last')).toMatchObject({ index: 1 });
    // a board cannot send commands, a phone cannot fake the board's state
    board.sent.length = 0; phone.sent.length = 0;
    await roomObj.webSocketMessage(board, JSON.stringify({ type: 'cmd', action: 'next' }));
    await roomObj.webSocketMessage(phone, JSON.stringify({ type: 'state', index: 9 }));
    expect(board.sent).toEqual([]); expect(phone.sent).toEqual([]);
    // an expired code closes the room
    const old = fakeState(); const gone = new BoardRoom(old, {});
    await old.storage.put('info', { docId: 'd1', by: 'teacher', expiresAt: Date.now() - 1 });
    expect((await gone.fetch(new Request('https://room/info'))).status).toBe(404);
  });
});
