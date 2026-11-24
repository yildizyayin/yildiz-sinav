// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

/** Öğrenme Evreni PR-4: in the Nibiru loop the game step opens the Evren player when the outcome has activities. */
const api = vi.fn();
vi.mock('../src/api', () => ({ api: (...a: any[]) => api(...a) }));
import { NibiruOutcomeLoop } from '../src/pages/NibiruOutcomeLoop';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; });

const state = { ok: true, step: 'GAME', gameKind: 'UNIVERSE', outcome: { code: 'M.8.1.1', title: 'Sentetik kazanım', subjectName: 'Matematik' }, loop: { id: 'l1', teacherNotified: 0 },
  miniTest: { status: 'FAILED', scorePercent: 40, correct: 2, questionCount: 5 }, game: null, videoMissing: true };
const view = { ok: true, session: { id: 'lus1', status: 'OPEN', mode: 'FINAL', template: { code: 'LU_FINAL', kind: 'FINAL', title: 'Kazanım Finali' }, outcome: { id: 'o1', code: 'M.8.1.1', title: 'Sentetik' }, timed: false, secondsPerItem: null, itemCount: 1 },
  items: [{ seq: 1, kind: 'PAIRS', repeat: false, content: { left: [{ id: 'a', text: '2³' }, { id: 'b', text: '3²' }], right: [{ id: '1', text: '8' }, { id: '2', text: '9' }] } }] };

it('explains the Evren game and opens its player', async () => {
  api.mockImplementation(async (path: string, init?: any) => {
    if (path === '/api/nibiru/coach/loops/l1/game' && init?.method === 'POST') return { ok: true, universe: { sessionId: 'lus1' }, round: { status: 'READY' }, questions: [] };
    if (path === '/api/student-standard/universe/sessions/lus1') return view;
    return state;
  });
  const node = document.createElement('div'); document.body.append(node);
  await act(async () => createRoot(node).render(createElement(MemoryRouter, { initialEntries: ['/kazanim-calismasi/l1'] },
    createElement(Routes, {}, createElement(Route, { path: '/kazanim-calismasi/:id', element: createElement(NibiruOutcomeLoop) })))));
  await act(async () => { await Promise.resolve(); });
  expect(node.textContent).toContain('şimdi Öğrenme Evreni oyunu!');
  expect(node.textContent).not.toContain('Hızlı Seri');
  const start = [...node.querySelectorAll('button')].find((b) => b.textContent?.includes('Oyunu başlat'))!;
  await act(async () => { start.click(); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  expect(node.querySelector('.uv-player')).not.toBeNull();
  expect(node.textContent).toContain('2³');
});
