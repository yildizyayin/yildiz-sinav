// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

const api = vi.fn();
vi.mock('../src/api', () => ({ api: (...a: any[]) => api(...a) }));
import { NibiruOutcomeLoop } from '../src/pages/NibiruOutcomeLoop';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const base = { ok: true, outcome: { code: 'M.8.1.1', title: 'Sentetik kazanım', subjectName: 'Matematik' }, loop: { id: 'l1', teacherNotified: 0 }, miniTest: null, game: null };
async function render(state: any) {
  api.mockReset(); api.mockResolvedValue(state);
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
  await act(async () => root.render(createElement(MemoryRouter, { initialEntries: ['/kazanim-calismasi/l1'] },
    createElement(Routes, {}, createElement(Route, { path: '/kazanim-calismasi/:id', element: createElement(NibiruOutcomeLoop) })))));
  await act(async () => { await Promise.resolve(); });
  return { node, done: async () => { await act(async () => root.unmount()); node.remove(); } };
}
afterEach(() => { document.body.innerHTML = ''; });

it('shows the approved video first and embeds YouTube without cookies', async () => {
  const v = await render({ ...base, step: 'VIDEO', video: { url: 'https://www.youtube.com/watch?v=abcdefghijk', title: 'Üslü ifadeler', provider: 'YOUTUBE' }, videoMissing: false });
  expect(v.node.querySelector('iframe')?.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/abcdefghijk');
  expect(v.node.textContent).toContain('İzledim, mini teste geç');
  expect(v.node.querySelector('[aria-current="step"]')?.textContent).toContain('Video');
  await v.done();
});

it('says plainly when there is no approved video, and when the teacher was told', async () => {
  let v = await render({ ...base, step: 'MINI_TEST', video: null, videoMissing: true });
  expect(v.node.textContent).toContain('henüz öğretmen onaylı bir video yok');
  expect(v.node.querySelector('iframe')).toBeNull();
  await v.done();
  v = await render({ ...base, step: 'TEACHER_REVIEW', loop: { id: 'l1', teacherReason: 'GAME_NOT_ENOUGH', teacherNotified: 2 }, game: { correct: 3, questionCount: 5, xp: 22 }, videoMissing: true });
  expect(v.node.textContent).toContain('Mini oyunda 3/5 doğru');
  expect(v.node.textContent).toContain('Ders ve rehber öğretmenine haber verildi');
  await v.done();
});

it('tells how many more questions the badge needs, and celebrates it once earned', async () => {
  let v = await render({ ...base, step: 'PASSED', loop: { id: 'l1', badgeAt: null, badgeNeed: 2 }, miniTest: { correct: 5, questionCount: 5 }, videoMissing: true });
  expect(v.node.textContent).toContain('2 farklı soruyu daha');
  await v.done();
  v = await render({ ...base, step: 'PASSED', loop: { id: 'l1', badgeAt: '2026-11-09' }, miniTest: { correct: 5, questionCount: 5 }, videoMissing: true });
  expect(v.node.textContent).toContain('Kazanım rozeti senin');
  await v.done();
});
