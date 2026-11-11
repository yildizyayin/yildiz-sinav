// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

/** D panels: the Evren summary cards on teacher and manager homes; hidden while Öğrenme Evreni is off. */
let features = new Set<string>(['LEARNING_UNIVERSE']);
vi.mock('../src/lib/useFeatures', () => ({ useFeatures: () => features }));
vi.mock('../src/api', () => ({ api: async (path: string) => path.endsWith('/tasks')
  ? { tasks: [{ id: 't1', outcome: { code: 'M.8.1.1', title: 'Üslü ifadeler' }, className: '8/A', recipients: 24, done: 9 }] }
  : { ok: true, enabled: true, days: 7, plays: 41, students: 18, avgPercent: 72.5, nibiruExams: 6, tasks: { active: 2, recipients: 48, done: 20 }, contentWaiting: 3 } }));
import { UniverseStaffSummary } from '../src/components/UniverseStaffSummary';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; features = new Set(['LEARNING_UNIVERSE']); });
async function mount(mode: 'TEACHER' | 'MANAGER') { const node = document.createElement('div'); document.body.append(node); await act(async () => createRoot(node).render(createElement(MemoryRouter, null, createElement(UniverseStaffSummary, { mode })))); await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); return node; }

it('teacher: open tasks and how many finished', async () => {
  const node = await mount('TEACHER');
  expect(node.textContent).toContain('1 açık görev · 9 / 24 öğrenci tamamladı');
  expect(node.querySelector('a')?.getAttribute('href')).toBe('/evren-gorevleri');
});
it('manager: the institution week', async () => {
  const node = await mount('MANAGER');
  expect(node.textContent).toContain('41 oyun · 18 öğrenci · ortalama %72.5');
  expect(node.textContent).toContain('3 kurum etkinliği onayınızı bekliyor');
});
it('nothing while Öğrenme Evreni is off', async () => {
  features = new Set();
  expect((await mount('MANAGER')).textContent).toBe('');
});
