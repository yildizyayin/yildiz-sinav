// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { MyPlanet } from '../src/components/universe/MyPlanet';

/** Benim Gezegenim: pieces with their outcome, seeds, and an honest empty planet. */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; });
async function mount(data: any) { const node = document.createElement('div'); document.body.append(node); await act(async () => createRoot(node).render(createElement(MyPlanet, { data }))); return node; }

it('draws one piece per correct answer, names the outcome and counts seeds', async () => {
  const node = await mount({ total: 3, seeds: 1, regions: [{ subjectId: 'mat', name: 'Matematik', total: 3, seeds: 1, outcomes: 1, pieces: [
    { kind: 'tree', outcomeCode: 'M.5.1.1', outcomeTitle: 'Doğal sayılar' }, { kind: 'tree', outcomeCode: 'M.5.1.1', outcomeTitle: 'Doğal sayılar' }, { kind: 'house', outcomeCode: 'M.5.1.1', outcomeTitle: 'Doğal sayılar' }] }] });
  expect(node.querySelectorAll('.mp-grow')).toHaveLength(3);
  expect(node.querySelector('.mp-grow title')?.textContent).toBe('M.5.1.1 · Doğal sayılar');
  expect(node.textContent).toContain('1 tohum toprakta');
  expect(node.textContent).toContain('Son filizlenenler');
  expect(node.textContent).toContain('3 parça · 1 kazanım');
});

it('says plainly when the planet is still empty', async () => {
  const node = await mount({ total: 0, seeds: 0, regions: [] });
  expect(node.querySelectorAll('.mp-grow')).toHaveLength(0);
  expect(node.textContent).toContain('İlk doğru cevabınla');
});
