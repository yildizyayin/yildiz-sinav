// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it } from 'vitest';
import { MasteryCard, OwnRecord, Stars } from '../src/components/universe/MasteryStars';

/** Ustalık Yıldızları ve Kendi Rekorun: the student's own stars and record, said kindly; a dim star links to a review. */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; });
async function mount(el: any) { const node = document.createElement('div'); document.body.append(node); await act(async () => createRoot(node).render(createElement(MemoryRouter, null, el))); return node; }
const base = { correct: 3, total: 4, bestBefore: 50, plays: 2, stars: 2, starsLabel: 'Pekiştirme', dim: false };

it('names the stars for a screen reader', async () => {
  const node = await mount(createElement(Stars, { n: 3, dim: true }));
  expect(node.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('3/3 yıldız · Ustalık · tekrar zamanı');
  expect(node.querySelectorAll('path.on')).toHaveLength(3);
});

it('tells the student how today compares with their own last play, kindly either way', async () => {
  let node = await mount(createElement(OwnRecord, { p: { ...base, rate: 75, first: false, previous: { correct: 2, total: 4, rate: 50 }, change: 25, newBest: true } }));
  expect(node.textContent).toContain('Kendi rekorunu kırdın!');
  expect(node.textContent).toContain('Geçen sefer %50, bugün %75: 25 puan gelişim!');
  node = await mount(createElement(OwnRecord, { p: { ...base, rate: 25, first: false, previous: { correct: 3, total: 4, rate: 75 }, change: -50, newBest: false } }));
  expect(node.textContent).toContain('Bazı günler zor geçer');
  expect(node.textContent).not.toContain('rekorunu kırdın');
  node = await mount(createElement(OwnRecord, { p: { ...base, rate: 50, first: true, previous: null, change: null, newBest: false, plays: 1 } }));
  expect(node.textContent).toContain('Bu kazanımdaki ilk oyunun: %50');
});

it('counts the student’s own stars by level and links a dim one to a review', async () => {
  const play = (o: string, g: string) => `/evren/oyna?outcome=${o}&template=${g}`;
  const node = await mount(createElement(MasteryCard, { play, mastery: { byStars: [5, 3, 2, 1], stars: 10, max: 33, reviewDue: [{ id: 'o1', code: 'M.5.1.1', title: 'Doğal sayılar', game: 'LU_CHOICE' }] } }));
  expect(node.textContent).toContain('10 / 33');
  expect([...node.querySelectorAll('.ms-levels strong')].map((s) => s.textContent)).toEqual(['3', '2', '1']);
  expect(node.querySelector('.ms-review a')?.getAttribute('href')).toBe('/evren/oyna?outcome=o1&template=LU_CHOICE&mode=REVIEW');
  expect(node.textContent).toContain('yalnız kendi ilerlemen');
});
