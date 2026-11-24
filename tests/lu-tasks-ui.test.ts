// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

/** Öğrenme Evreni PR-5: the teacher task page and the student's "Öğretmeninden görevler". Synthetic data only. */
const calls: any[] = [];
let mapData: any;
vi.mock('../src/api', () => ({ api: async (path: string, init?: any) => {
  calls.push([path, init?.method || 'GET', init?.body ? JSON.parse(init.body) : null]);
  if (path === '/api/classes') return { classes: [{ id: 'c8a', name: '8/A' }] };
  if (path.startsWith('/api/reporting/universe/task-outcomes')) return { ok: true, className: '8/A', academicYear: '2027-2028', outcomes: [
    { id: 'o1', code: 'M.8.1.1', title: 'Üslü ifadeler', subjectName: 'Matematik', games: [{ code: 'LU_CHOICE', title: 'Bilgi Görevi' }] },
    { id: 'o2', code: 'M.8.1.2', title: 'Bilimsel gösterim', subjectName: 'Matematik', games: [] }] };
  if (path === '/api/reporting/universe/tasks' && init?.method === 'POST') return { ok: true, recipients: 24, skipped: 1 };
  if (path.startsWith('/api/reporting/universe/tasks')) return { ok: true, tasks: [{ id: 't1', outcome: { code: 'M.8.1.1', title: 'Üslü ifadeler' }, template: null, className: '8/A', recipients: 24, done: 9, createdBy: 'Öğretmen' }] };
  if (path === '/api/student-standard/universe/map') return mapData;
  return {};
} }));
import { UniverseTasksStaff } from '../src/pages/UniverseTasksStaff';
import { UniverseHome } from '../src/pages/UniverseHome';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; calls.length = 0; });
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount(el: any) { const node = document.createElement('div'); document.body.append(node); await act(async () => createRoot(node).render(createElement(MemoryRouter, null, el))); await flush(); await flush(); return node; }
const setValue = async (el: HTMLSelectElement | HTMLInputElement, value: string) => { await act(async () => { const proto = Object.getPrototypeOf(el); Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }); };

it('teacher: picks the only class, an outcome and gives the task', async () => {
  const node = await mount(createElement(UniverseTasksStaff));
  expect(node.textContent).toContain('9 / 24 öğrenci tamamladı');
  const outcome = [...node.querySelectorAll('select')].find((s) => s.textContent?.includes('M.8.1.2'))! as HTMLSelectElement;
  expect(outcome.textContent).toContain('(etkinlik hazırlanıyor)');
  await setValue(outcome, 'o1');
  const btn = [...node.querySelectorAll('button')].find((b) => b.textContent === 'Görevi ver')!;
  await act(async () => { btn.click(); }); await flush();
  expect(calls.find((c) => c[0] === '/api/reporting/universe/tasks' && c[1] === 'POST')[2]).toMatchObject({ classId: 'c8a', outcomeId: 'o1', templateCode: null });
  expect(node.textContent).toContain('Görev 24 öğrenciye verildi. 1 öğrenci');
});

it('student: teacher tasks come first; one without content says so and is not a link', async () => {
  mapData = { ok: true, student: { gradeLevel: 8, designGroup: 'B' }, xp: { total: 0, level: 1, toNext: 200 }, week: { done: 0, goal: 5 }, missions: [], summary: { outcomes: 2, playable: 1, learned: 0 }, subjects: [],
    tasks: [{ id: 't1', outcomeId: 'o1', code: 'M.8.1.1', title: 'Üslü ifadeler', teacher: 'Ayşe Öğretmen', dueAt: '2027-03-05', note: 'Cuma derse kadar', game: 'LU_CHOICE', gameTitle: 'Bilgi Görevi' },
      { id: 't2', outcomeId: 'o2', code: 'M.8.1.2', title: 'Bilimsel gösterim', teacher: 'Ayşe Öğretmen', game: null }] };
  const node = await mount(createElement(UniverseHome));
  const cards = [...node.querySelectorAll('.um-mission.task')];
  expect(cards[0].tagName).toBe('A');
  expect(cards[0].getAttribute('href')).toBe('/evren/oyna?outcome=o1&template=LU_CHOICE');
  expect(cards[0].textContent).toContain('Ayşe Öğretmen verdi · son gün 05.03.2027');
  expect(cards[1].tagName).toBe('DIV');
  expect(cards[1].textContent).toContain('Etkinlik hazırlanıyor');
});
