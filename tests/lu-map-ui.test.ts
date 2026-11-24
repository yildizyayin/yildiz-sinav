// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

/** Öğrenme Evreni PR-3: the map page — three looks by age group, missions link to the player, empty outcomes say so. */
let payload: any;
vi.mock('../src/api', () => ({ api: async () => payload }));
import { UniverseHome } from '../src/pages/UniverseHome';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; });

const base = (group: string, extra: any = {}) => ({
  ok: true, student: { gradeLevel: group === 'A' ? 5 : group === 'B' ? 8 : 11, academicYear: '2027-2028', designGroup: group },
  xp: { total: 230, level: 2, toNext: 170 }, week: { done: 2, goal: 5 }, reviewAfterDays: 7,
  missions: [{ type: 'DISCOVER', outcomeId: 'o1', title: 'Üslü ifadeler', code: 'M.8.1.1', game: 'LU_CHOICE' }],
  summary: { outcomes: 2, playable: 1, learned: 0 },
  subjects: [{ id: 'mat', name: 'Matematik', planets: [{ name: 'Üslü ifadeler', discovered: false, learned: 0, playable: 1, outcomes: [
    { id: 'o1', code: 'M.8.1.1', title: 'Üslü ifadelerle işlem yapar.', stage: 'NO_DATA', stageLabel: 'Veri yetersiz', games: [{ code: 'LU_CHOICE', kind: 'CHOICE', title: 'Bilgi Yıldızı' }], reviewDue: false },
    { id: 'o2', code: 'M.8.1.2', title: 'Bilimsel gösterim.', stage: 'NO_DATA', stageLabel: 'Veri yetersiz', games: [], reviewDue: false }] }] }],
  ...extra,
});
async function mount(data: any) {
  payload = data;
  const node = document.createElement('div'); document.body.append(node);
  await act(async () => createRoot(node).render(createElement(MemoryRouter, null, createElement(UniverseHome))));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return node;
}

it('renders the age-group look, a mission link to the player and an honest empty state', async () => {
  for (const g of ['A', 'B', 'C']) {
    const node = await mount(base(g));
    expect(node.querySelector('.um')?.getAttribute('data-group')).toBe(g);
    document.body.innerHTML = '';
  }
  const node = await mount(base('B'));
  expect(node.querySelector('a.um-mission')?.getAttribute('href')).toBe('/evren/oyna?outcome=o1&template=LU_CHOICE');
  expect(node.textContent).toContain('Bu hafta 2/5');
  const head = node.querySelector('.um-planet-head') as HTMLButtonElement;
  expect(head.getAttribute('aria-expanded')).toBe('false');
  await act(async () => { head.click(); });
  expect(head.getAttribute('aria-expanded')).toBe('true');
  expect([...node.querySelectorAll('a.um-game')].map((a) => a.textContent)).toEqual(['Bilgi Yıldızı']);
  expect(node.textContent).toContain('Bu kazanım için onaylı etkinlik hazırlanıyor.');
  expect(node.querySelector('[disabled], .locked')).toBeNull();
});

it('says so when there are no missions or no verified program', async () => {
  let node = await mount(base('C', { missions: [], summary: { outcomes: 2, playable: 0, learned: 0 } }));
  expect(node.textContent).toContain('onaylı etkinlikler hazırlandıkça');
  document.body.innerHTML = '';
  node = await mount(base('B', { missions: [], subjects: [], summary: { outcomes: 0, playable: 0, learned: 0 } }));
  expect(node.textContent).toContain('doğrulanmış MEB programı henüz yüklenmedi');
});

it('the student menu leads to the universe; the old hard-coded games page is gone', () => {
  const layout = readFileSync('src/components/Layout.tsx', 'utf8'), app = readFileSync('src/App.tsx', 'utf8');
  expect(layout).toContain("{ to: '/evren', label: 'Öğrenme Evreni', icon: Orbit, feature:'LEARNING_UNIVERSE' }");
  expect(app).toContain('<Route path="student-games" element={<Navigate to="/evren" replace/>}/>');
  expect(app).not.toContain('StudentGames');
});
