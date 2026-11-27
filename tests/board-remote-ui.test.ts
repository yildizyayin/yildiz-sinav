// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

/** Tahta kumandası: the board shows its code and QR; the phone sees the question and its answer and moves the board. A fake WebSocket stands in for the room. */
const lesson = { test: { id: 'doc1', title: 'Kuvvet testi' }, items: [
  { position: 1, id: 'q1', stem: 'Kapıyı çeken kuvvet hangisidir?', answer: 'B', options: [{ label: 'A', text: 'İtme', image: null }, { label: 'B', text: 'Çekme', image: null }], images: [], solution: 'Kol gelir. Kuvvet çekmedir.', steps: ['Kol gelir.', 'Kuvvet çekmedir.'], solutionVideo: null, outcome: null, topicVideo: null },
  { position: 2, id: 'q2', stem: 'İkinci soru?', answer: 'A', options: [{ label: 'A', text: 'bir', image: null }, { label: 'B', text: 'iki', image: null }], images: [], solution: null, steps: [], solutionVideo: null, outcome: null, topicVideo: null },
] };
const calls: string[] = [];
vi.mock('../src/api', () => ({ api: async (url: string, init?: any) => { calls.push(`${init?.method || 'GET'} ${url}`); if (url === '/api/board-remote') return { ok: true, code: 'K7M2PA', path: '/kumanda/K7M2PA' }; if (url.startsWith('/api/board-remote/')) return { ok: true, documentId: 'doc1', title: 'Kuvvet testi' }; return lesson; } }));
(globalThis as any).fetch = vi.fn(async () => new Response('x'));
class FakeWS {
  static all: FakeWS[] = [];
  url: string; readyState = 0; sent: string[] = []; onopen?: () => void; onmessage?: (e: any) => void; onclose?: (e: any) => void;
  constructor(url: string) { this.url = url; FakeWS.all.push(this); setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 0); }
  send(m: string) { this.sent.push(m); }
  close() { this.readyState = 3; }
  receive(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }); }
}
(globalThis as any).WebSocket = FakeWS;
import { SmartBoard } from '../src/pages/SmartBoard';
import { BoardRemote } from '../src/pages/BoardRemote';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const roots: any[] = [];
afterEach(async () => { for (const r of roots.splice(0)) await act(async () => r.unmount()); document.body.innerHTML = ''; FakeWS.all = []; calls.length = 0; });
const btn = (n: Element, t: string) => [...n.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(t)) as HTMLButtonElement;
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });
async function mount(path: string) {
  const node = document.createElement('div'); document.body.append(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Routes, null,
    createElement(Route, { path: '/board/:documentId', element: createElement(SmartBoard) }), createElement(Route, { path: '/kumanda/:code', element: createElement(BoardRemote) })))));
  await tick();
  return node;
}

it('the board gives its code, takes the phone’s commands and reports where the lesson is', async () => {
  const node = await mount('/board/doc1');
  expect(FakeWS.all).toHaveLength(0);                                                          // no socket until asked
  await act(async () => { btn(node, 'Telefondan yönet').click(); }); await tick();
  expect(calls).toContain('POST /api/board-remote');
  expect(node.querySelector('.sb-pair-code')?.textContent).toBe('K7M2PA');
  expect(node.querySelector('.sb-pair-qr')?.getAttribute('src')).toMatch(/^data:image\/gif;base64,/);
  const ws = FakeWS.all[0];
  expect(ws.url).toMatch(/\/api\/board-remote\/K7M2PA\/ws\?role=board$/);
  await tick();
  expect(JSON.parse(ws.sent.at(-1)!)).toMatchObject({ type: 'state', index: 0, total: 2, answer: 'B', stepsTotal: 2 });
  await act(async () => { ws.receive({ type: 'presence', boards: 1, remotes: 1 }); });
  expect(node.querySelector('.sb-pair')).toBeNull();                                           // the phone joined: the panel steps aside
  expect(btn(node, 'Telefon bağlı')).toBeTruthy();
  await act(async () => { ws.receive({ type: 'cmd', action: 'reveal' }); });
  expect(node.querySelector('.sb-opt.right b')?.textContent).toBe('B');
  await act(async () => { ws.receive({ type: 'cmd', action: 'step' }); });
  expect(node.querySelectorAll('.sb-solution li')).toHaveLength(1);
  await act(async () => { ws.receive({ type: 'cmd', action: 'next' }); }); await tick();
  expect(node.querySelector('.sb-stem')?.textContent).toBe('İkinci soru?');
  expect(JSON.parse(ws.sent.at(-1)!)).toMatchObject({ type: 'state', index: 1, revealed: false });
  await act(async () => { ws.receive({ type: 'cmd', action: 'timer', value: 30 }); });
  expect(node.querySelector('.sb-timer')?.textContent).toBe('0:30');
});

it('the phone shows the question with its answer and sends big-button commands', async () => {
  const node = await mount('/kumanda/k7m2pa');
  expect(calls).toContain('GET /api/board-remote/K7M2PA');
  const ws = FakeWS.all[0];
  expect(ws.url).toMatch(/\/api\/board-remote\/K7M2PA\/ws\?role=remote$/);
  await tick();
  await act(async () => { ws.receive({ type: 'presence', boards: 1, remotes: 1 }); ws.receive({ type: 'state', index: 0, total: 2, title: 'Kuvvet testi', stem: 'Kapıyı çeken kuvvet hangisidir?', options: [{ label: 'A', text: 'İtme' }, { label: 'B', text: 'Çekme' }], answer: 'B', revealed: false, steps: 0, stepsTotal: 2, hideOptions: false, hasVideo: false, hasTopic: false, videoOpen: false, timer: null }); });
  expect(node.querySelector('.br-net')?.textContent).toBe('Tahta bağlı');
  expect(node.querySelector('.br-answer b')?.textContent).toBe('B');
  expect(node.querySelector('.br-opts li.right')?.textContent).toBe('BÇekme');
  expect(btn(node, 'Önceki').disabled).toBe(true);
  expect(btn(node, 'Çözüm videosu').disabled).toBe(true);
  await act(async () => { btn(node, 'Sonraki').click(); btn(node, 'Cevabı göster').click(); btn(node, '30 sn').click(); });
  expect(ws.sent.map((m) => JSON.parse(m))).toEqual([{ type: 'cmd', action: 'next' }, { type: 'cmd', action: 'reveal' }, { type: 'cmd', action: 'timer', value: 30 }]);
});
