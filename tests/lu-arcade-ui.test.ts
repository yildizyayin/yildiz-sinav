// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

/** Öğrenme Evreni animasyonlu oyunlar (owner, 25 Nov 2026): each answer checked at once, the outcome shown, sent once. */
const calls: [string, any][] = [];
vi.mock('../src/api', () => ({
  api: async (url: string, init: any) => {
    const body = JSON.parse(init.body); calls.push([url, body]);
    if (url.endsWith('/check')) return body.response.answer ? { ok: true, correct: body.response.answer === 'A', partial: 0, key: { correct: 'A' }, explanation: '2 × 2 × 2 = 8' }
      : { ok: true, correct: true, partial: 1, key: { order: body.response.order }, explanation: null };
    return { session: { id: 's', status: 'SUBMITTED', correct: 1, itemCount: 2, xp: 20 }, items: [] };
  },
}));
import { UniverseArcade, arcadeGame } from '../src/components/universe/UniverseArcade';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; calls.length = 0; });

const outcome = { id: 'o1', code: 'M.5.1.1', title: 'Üslü ifadeler' };
const q = (seq: number) => ({ seq, kind: 'QUESTION', repeat: false, content: { stem: `2³ kaçtır? (${seq})`, options: [{ key: 'A', text: '8' }, { key: 'B', text: '6' }] } });
const data = (kind: string, items: any[]) => ({ session: { id: 's', template: { kind, title: 'Bilgi Görevi' }, outcome, gradeLevel: 5, itemCount: items.length, timed: false, secondsPerItem: null }, items });

it('runs only where every item fits the animated game', () => {
  expect(arcadeGame(data('CHOICE', [q(1)]))).toBe('meteor');
  expect(arcadeGame(data('ORDER', [{ seq: 1, kind: 'SEQUENCE', content: { items: [] } }]))).toBe('rocket');
  expect(arcadeGame(data('MATCH', [{ seq: 1, kind: 'PAIRS', content: { left: [], right: [] } }]))).toBe('sky');
  expect(arcadeGame(data('MEMORY', [{ seq: 1, kind: 'PAIRS', content: { mode: 'MEMORY' } }]))).toBe(null);
  expect(arcadeGame(data('FINAL', [q(1), { seq: 2, kind: 'CLOZE', content: {} }]))).toBe(null);
});

it('checks a meteor at once, shows the outcome and the explanation, then submits once', async () => {
  const node = document.createElement('div'); document.body.append(node);
  const root = createRoot(node);
  await act(async () => root.render(createElement(MemoryRouter, null, createElement(UniverseArcade, { data: data('CHOICE', [q(1), q(2)]), onDone: () => undefined }))));
  expect(node.textContent).toContain('M.5.1.1');
  const click = async (el: Element | null | undefined) => { await act(async () => { (el as HTMLElement).click(); }); };
  const btn = (txt: string) => [...node.querySelectorAll('button')].find((b) => b.textContent?.includes(txt));
  await click(node.querySelector('button[aria-label="B) 6"]'));
  expect(calls[0]).toEqual(['/api/student-standard/universe/sessions/s/items/1/check', { response: { answer: 'B' } }]);
  expect(node.textContent).toContain('2 × 2 × 2 = 8');
  expect(node.querySelector('.reveal')?.getAttribute('aria-label')).toBe('A) 8');
  await click(btn('Devam'));
  await click(node.querySelector('button[aria-label="A) 8"]'));
  await click(btn('Bitir'));
  const submits = calls.filter(([u]) => u.endsWith('/submit'));
  expect(submits).toHaveLength(1);
  expect(submits[0][1].answers).toEqual([{ seq: 1, response: { answer: 'B' } }, { seq: 2, response: { answer: 'A' } }]);
  expect(node.textContent).toContain('Bu oyunla çalıştığın kazanım');
  expect(node.textContent).toContain('karnene işlendi');
});

it('builds a rocket in order and checks the whole order once', async () => {
  const node = document.createElement('div'); document.body.append(node);
  const root = createRoot(node);
  const seq = { seq: 1, kind: 'SEQUENCE', repeat: false, content: { prompt: 'Sırala', items: [{ id: 'y', text: 'İkinci' }, { id: 'x', text: 'Birinci' }] } };
  await act(async () => root.render(createElement(MemoryRouter, null, createElement(UniverseArcade, { data: data('ORDER', [seq]), onDone: () => undefined }))));
  const click = async (el: Element | null | undefined) => { await act(async () => { (el as HTMLElement).click(); }); };
  const btn = (txt: string) => [...node.querySelectorAll('button')].find((b) => b.textContent?.trim() === txt || b.textContent?.includes(txt));
  await click(node.querySelector('.ua-part:nth-child(2)'));
  await click(node.querySelector('.ua-part:nth-child(1)'));
  await click(btn('Kontrol et'));
  expect(calls[0]).toEqual(['/api/student-standard/universe/sessions/s/items/1/check', { response: { order: ['x', 'y'] } }]);
  expect(node.textContent).toContain('Roket yörüngede');
});
