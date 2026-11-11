// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

/** Öğrenme Evreni PR-2: the shared player collects answers for every kind by click and keyboard; the server grades. */
const sent: any[] = [];
vi.mock('../src/api', () => ({ api: async (_url: string, init: any) => { sent.push(JSON.parse(init.body)); return { session: { id: 's', correct: 0, itemCount: 1 }, items: [] }; } }));
import { UniversePlayer } from '../src/components/universe/UniversePlayer';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; sent.length = 0; });

const session = (items: any[], extra: any = {}) => ({ session: { id: 's', itemCount: items.length, timed: false, secondsPerItem: null, ...extra }, items });
async function mount(data: any) {
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
  await act(async () => root.render(createElement(UniversePlayer, { data, onDone: () => undefined })));
  const click = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click(); }); };
  const byText = (txt: string) => [...node.querySelectorAll('button')].find((b) => b.textContent?.includes(txt)) || null;
  const type = async (input: HTMLInputElement, value: string) => { await act(async () => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!; set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }); };
  return { node, click, byText, type };
}

it('collects a choice, matching pairs, an order, fill-ins and steps, then sends them once', async () => {
  const v = await mount(session([
    { seq: 1, kind: 'QUESTION', repeat: false, content: { stem: '2³?', options: [{ key: 'A', text: '8' }, { key: 'B', text: '6' }] } },
    { seq: 2, kind: 'PAIRS', repeat: false, content: { left: [{ id: 'a', text: '2³' }, { id: 'b', text: '3²' }], right: [{ id: '2', text: '9' }, { id: '1', text: '8' }] } },
    { seq: 3, kind: 'SEQUENCE', repeat: true, content: { items: [{ id: 'y', text: 'İkinci' }, { id: 'x', text: 'Birinci' }] } },
    { seq: 4, kind: 'CLOZE', repeat: false, content: { text: '2³ = [b1]', blanks: [{ id: 'b1' }] } },
    { seq: 5, kind: 'STEPS', repeat: false, content: { problem: '2³·2²', steps: [{ id: 's1', prompt: '2³' }, { id: 's2', prompt: 'Sonuç' }] } },
  ]));
  await v.click(v.byText('8'));
  await v.click(v.byText('Devam'));
  await v.click(v.byText('2³')); await v.click(v.byText('8'));
  await v.click(v.byText('3²')); await v.click(v.byText('9'));
  await v.click(v.byText('Devam'));
  expect(v.node.textContent).toContain('Tekrar: bu içeriği daha önce gördün.');
  await v.click(v.node.querySelector('button[aria-label="Aşağı taşı"]'));
  await v.click(v.byText('Devam'));
  await v.type(v.node.querySelector('input[aria-label="Boşluk b1"]') as HTMLInputElement, '8');
  await v.click(v.byText('Devam'));
  const inputs = v.node.querySelectorAll('.uv-steps input');
  expect((inputs[1] as HTMLInputElement).disabled).toBe(true);           // the next step opens after the previous one
  await v.type(inputs[0] as HTMLInputElement, '8');
  await v.type(v.node.querySelectorAll('.uv-steps input')[1] as HTMLInputElement, '32');
  await v.click(v.byText('Bitir ve gönder'));
  expect(sent).toHaveLength(1);
  expect(sent[0].answers).toEqual([
    { seq: 1, response: { answer: 'A' } },
    { seq: 2, response: { pairs: [['a', '1'], ['b', '2']] } },
    { seq: 3, response: { order: ['x', 'y'] } },
    { seq: 4, response: { blanks: { b1: '8' } } },
    { seq: 5, response: { steps: { s1: '8', s2: '32' } } },
  ]);
});

it('lets the student switch the timer off, and leaves an untouched item blank', async () => {
  const v = await mount(session([{ seq: 1, kind: 'QUESTION', repeat: false, content: { stem: '?', options: [{ key: 'A', text: 'x' }] } }], { timed: true, secondsPerItem: 45 }));
  expect(v.byText('süreyi kapat')).toBeTruthy();
  await v.click(v.byText('süreyi kapat'));
  expect(v.byText('Süre kapalı')).toBeTruthy();
  await v.click(v.byText('Bitir ve gönder'));
  expect(sent[0].answers).toEqual([{ seq: 1, response: null }]);
});

it('marks a point on an image with the keyboard', async () => {
  const v = await mount(session([{ seq: 1, kind: 'HOTSPOT', repeat: false, content: { prompt: 'Göster', image: { url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', width: 4, height: 3, alt: 'Örnek' } } }]));
  const area = v.node.querySelector('.uv-hotspot') as HTMLElement;
  await act(async () => { area.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
  await v.click(v.byText('Bitir ve gönder'));
  expect(sent[0].answers[0].response).toEqual({ x: 0.52, y: 0.5 });
});
