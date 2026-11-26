// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

/** Kendi hedefin ve "Ne öğrendim?": the student's own choices, saved with one tap. */
const calls: [string, any][] = [];
vi.mock('../src/api', () => ({ api: async (url: string, init: any) => { const b = JSON.parse(init.body); calls.push([url, b]); return url.endsWith('/goal') ? { ok: true, plays: b.plays, done: 1, reached: b.plays <= 1 } : { ok: true }; } }));
import { DailyGoalCard, Reflection } from '../src/components/universe/Personal';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; calls.length = 0; });
async function mount(el: any) { const node = document.createElement('div'); document.body.append(node); await act(async () => createRoot(node).render(el)); return node; }
const click = async (el: Element | null | undefined) => { await act(async () => { (el as HTMLElement).click(); }); };

it('lets the student pick their own daily goal and shows only their own progress', async () => {
  const node = await mount(createElement(DailyGoalCard, { goal: { plays: null, done: 1, reached: false } }));
  expect(node.textContent).toContain('tutturamadığın gün hiçbir şey kaybetmezsin');
  await click([...node.querySelectorAll('button')].find((b) => b.textContent?.startsWith('2 oyun')));
  expect(calls[0]).toEqual(['/api/student-standard/universe/goal', { plays: 2 }]);
  expect(node.textContent).toContain('1/2');
  expect(node.textContent).toContain('1 oyun daha');
});

it('saves "Ne öğrendim?" with one tap and answers in plain words', async () => {
  const node = await mount(createElement(Reflection, { sessionId: 's1' }));
  await click([...node.querySelectorAll('button')].find((b) => b.textContent === 'Tekrar etmeliyim'));
  expect(calls[0]).toEqual(['/api/student-standard/universe/sessions/s1/reflection', { value: 'AGAIN' }]);
  expect(node.textContent).toContain('yakında tekrar olarak önereceğim');
  expect(node.querySelector('button[aria-pressed="true"]')?.textContent).toBe('Tekrar etmeliyim');
});
