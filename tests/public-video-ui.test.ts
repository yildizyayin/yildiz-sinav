// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

/** video.anunex.com/c/<kod>: the solution video at once, the topic video when there is one, a kind message for a code not yet public. */
(globalThis as any).fetch = vi.fn(async (url: string) => url.includes('K7M2QPA')
  ? new Response(JSON.stringify({ ok: true, video: { code: 'K7M2QPA', gradeLevel: 5, subject: 'Fen Bilimleri', outcome: { code: 'FB.5.2.1', title: 'Kuvveti tanır' }, hasTopic: true } }), { status: 200 })
  : new Response(JSON.stringify({ ok: false, error: { code: 'VIDEO_NOT_PUBLIC', message: 'Bu sorunun çözüm videosu henüz yayında değil. Biraz sonra yeniden dene.' } }), { status: 404 }));
import { PublicVideo } from '../src/pages/PublicVideo';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const roots: any[] = [];
afterEach(async () => { for (const r of roots.splice(0)) await act(async () => r.unmount()); document.body.innerHTML = ''; });
async function mount(path: string) {
  const node = document.createElement('div'); document.body.append(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Routes, null, createElement(Route, { path: '/c/:code', element: createElement(PublicVideo) }), createElement(Route, { path: '*', element: createElement(PublicVideo) })))));
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  return node;
}

it('plays the solution, offers the topic video', async () => {
  const node = await mount('/c/k7m2qpa');
  expect(node.querySelector('h1')?.textContent).toBe('Kuvveti tanır');
  expect(node.querySelector('video')?.getAttribute('src')).toBe('/api/public/video/K7M2QPA/solution');
  await act(async () => { ([...node.querySelectorAll('.pv-tabs button')][1] as HTMLButtonElement).click(); });
  expect(node.querySelector('video')?.getAttribute('src')).toBe('/api/public/video/K7M2QPA/topic');
});

it('says kindly when a code is not public yet, and lets a code be typed on the bare address', async () => {
  expect((await mount('/c/R4XN8TB')).textContent).toContain('henüz yayında değil');
  const bare = await mount('/');
  expect(bare.querySelector('h1')?.textContent).toBe('Çözüm videosunu aç');
  expect(bare.querySelector('input')).not.toBeNull();
});
