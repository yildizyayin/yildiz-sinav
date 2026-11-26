// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

/** Kaçış Odası: objects open in the student's order with server-checked questions; the door takes the code; one submit. */
const calls: [string, any][] = [];
let payload: any = null;
vi.mock('../src/api', () => ({
  api: async (url: string, init: any) => {
    if (!init) return payload;
    const body = JSON.parse(init.body); calls.push([url, body]);
    if (url.endsWith('/check')) return { ok: true, correct: body.response.answer === 'A', partial: 0, key: { correct: 'A' }, explanation: 'Çünkü A.' };
    return { session: { id: 'room-s', status: 'SUBMITTED', correct: 2, itemCount: 3, xp: 23 }, items: [] };
  },
}));
import { UniverseArcade, arcadeGame } from '../src/components/universe/UniverseArcade';
import { UniverseHome } from '../src/pages/UniverseHome';
import { roomFor } from '../src/components/universe/escapeRooms';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const roots: any[] = [];
afterEach(async () => { for (const r of roots.splice(0)) await act(async () => r.unmount()); document.body.innerHTML = ''; calls.length = 0; });
const q = (seq: number) => ({ seq, kind: 'QUESTION', repeat: false, content: { stem: `Soru ${seq}`, options: [{ key: 'A', text: 'bir' }, { key: 'B', text: 'iki' }] } });
const data = { session: { id: 'room-s', template: { kind: 'CHOICE', title: 'Bilgi Görevi' }, outcome: { id: 'o', code: 'M.5.1.1', title: 'Doğal sayılar' }, gradeLevel: 5, itemCount: 3, timed: false, secondsPerItem: null }, items: [q(1), q(2), q(3)] };
async function mount(el: any) {
  const node = document.createElement('div'); document.body.append(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(MemoryRouter, null, el)));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return node;
}
const click = async (el: Element | null | undefined) => { await act(async () => { (el as HTMLElement).click(); }); };

it('opens the escape room only for question plays asked as a room', () => {
  expect(arcadeGame(data as any, 'escape')).toBe('escape');
  expect(arcadeGame({ ...data, items: [q(1), q(2)] } as any, 'escape')).toBe('meteor');
});

it('plays a whole room: any order, a wrong answer still gives the digit, a wrong code only shakes, one submit', async () => {
  const { room, digits } = roomFor('room-s');
  const node = await mount(createElement(UniverseArcade, { data: data as any, onDone: () => undefined, style: 'escape' }));
  const btn = (t: string) => [...node.querySelectorAll('button')].find((b) => b.textContent?.includes(t));
  const obj = (id: string) => node.querySelector(`button.er-obj[aria-label^="${room.objects.find((o) => o.id === id)!.name}"]`);
  const pad = (n: number) => [...node.querySelectorAll('.er-pad button')].find((b) => b.textContent === String(n));
  expect(node.textContent).toContain(room.title);
  expect(node.textContent).toContain('M.5.1.1');
  expect((pad(1) as HTMLButtonElement).disabled).toBe(true);           // the door waits for all three digits
  const order = [room.objects[2].id, room.objects[0].id, room.objects[1].id];
  for (const [k, id] of order.entries()) {
    await click(obj(id));
    await click(node.querySelector(`.er-opt[aria-label="${k === 1 ? 'B' : 'A'}) ${k === 1 ? 'iki' : 'bir'}"]`));
    if (k === 1) expect(node.textContent).toContain('Doğrusu: A');
    await click(btn('Rakamı al'));
    expect(obj(id)?.getAttribute('aria-label')).toContain(`rakam ${digits[id]}`);
  }
  // the seqs follow the objects, whatever order the student opened them in
  expect(calls.filter(([u]) => u.endsWith('/check')).map(([u]) => u.split('/').at(-2))).toEqual(['3', '1', '2']);
  const right = room.sign.map((id) => digits[id]);
  const wrong = right.map((d) => (d % 9) + 1);
  for (const d of wrong) await click(pad(d));
  expect(node.querySelector('.er-door.shake')).not.toBeNull();
  expect(node.textContent).not.toContain('Kaçtın!');
  await act(async () => { await new Promise((r) => setTimeout(r, 650)); });
  for (const d of right) await click(pad(d));
  expect(node.textContent).toContain('Kaçtın!');
  await click(btn('Odadan çık'));
  const submits = calls.filter(([u]) => u.endsWith('/submit'));
  expect(submits).toHaveLength(1);
  expect(submits[0][1].answers).toEqual([{ seq: 1, response: { answer: 'B' } }, { seq: 2, response: { answer: 'A' } }, { seq: 3, response: { answer: 'A' } }]);
  expect(node.textContent).toContain('Bu oyunla çalıştığın kazanım');
});

const home = (group: string, extra: any = {}) => ({
  ok: true, student: { gradeLevel: group === 'A' ? 5 : 8, academicYear: '2027-2028', designGroup: group },
  xp: { total: 230, level: 2, toNext: 170 }, week: { done: 2, goal: 5 }, reviewAfterDays: 7, missions: [], summary: { outcomes: 1, playable: 1, learned: 0 },
  subjects: [{ id: 'mat', name: 'Matematik', planets: [{ name: 'Sayılar', discovered: false, learned: 0, playable: 1, outcomes: [
    { id: 'o1', code: 'M.5.1.1', title: 'Doğal sayılar', stage: 'DEVELOPING', stageLabel: 'Gelişiyor', games: [{ code: 'LU_CHOICE', kind: 'CHOICE', title: 'Bilgi Yıldızı' }], reviewDue: false }] }] }],
  ...extra,
});

it('the map offers the room next to the case, and Bebek Nibi appears only for grades 4–6', async () => {
  payload = home('A', { planet: { regions: [], total: 12, seeds: 0 }, dailyGoal: { plays: 2, done: 0, reached: false },
    starSummary: { byStars: [0, 0, 0, 0], stars: 0, max: 3, reviewDue: [{ id: 'o1', code: 'M.5.1.1', title: 'Doğal sayılar', game: 'LU_CHOICE' }] } });
  let node = await mount(createElement(UniverseHome));
  expect(node.querySelector('.bn')?.textContent).toContain('Minik Nibi');
  expect(node.querySelector('.bn')?.textContent).toContain('1 kazanımda tekrar zamanı');
  expect(node.querySelector('a.bn-feed')?.getAttribute('href')).toBe('/evren/oyna?outcome=o1&template=LU_CHOICE&mode=REVIEW');
  expect([...node.querySelectorAll('.um-case a')].map((a) => a.getAttribute('href'))).toEqual(['/evren/oyna?outcome=o1&template=LU_CHOICE&style=mystery', '/evren/oyna?outcome=o1&template=LU_CHOICE&style=escape']);
  await click(node.querySelector('.um-planet-head'));
  expect(node.querySelector('a.um-escape')?.getAttribute('href')).toBe('/evren/oyna?outcome=o1&template=LU_CHOICE&style=escape');
  for (const r of roots.splice(0)) await act(async () => r.unmount());
  document.body.innerHTML = '';
  payload = home('B', { planet: { regions: [], total: 12, seeds: 0 } });
  node = await mount(createElement(UniverseHome));
  expect(node.querySelector('.bn')).toBeNull();
});
