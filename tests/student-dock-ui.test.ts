// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { StudentDock } from '../src/components/StudentDock';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
async function render(items: { to: string }[], onMenu = vi.fn()) {
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
  await act(async () => root.render(createElement(MemoryRouter, {}, createElement(StudentDock, { items, onMenu }))));
  return { node, onMenu, done: async () => { await act(async () => root.unmount()); node.remove(); } };
}
it('offers the main student places and opens the full menu', async () => {
  const v = await render([{ to: '/' }, { to: '/my-results' }, { to: '/question-practice' }, { to: '/nibiru' }]);
  expect(v.node.querySelector('a[href="/my-results"]')).not.toBeNull();
  expect(v.node.querySelector('a[href="/question-practice"]')).not.toBeNull();
  await act(async () => { (v.node.querySelector('button') as HTMLButtonElement).click(); });
  expect(v.onMenu).toHaveBeenCalledTimes(1);
  await v.done();
});
it('leaves out Soru Çöz when the institution has the question bank off', async () => {
  const v = await render([{ to: '/' }, { to: '/my-results' }, { to: '/nibiru' }]);
  expect(v.node.querySelector('a[href="/question-practice"]')).toBeNull();
  expect(v.node.querySelectorAll('a').length).toBe(3);
  await v.done();
});
