// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

/** Nibiru denemesi page: choose 10/20, answer, see the result by outcome; shortages are said plainly. Synthetic data only. */
const calls: any[] = [];
let startReply: any;
vi.mock('../src/api', () => ({ api: async (path: string, init?: any) => {
  calls.push([path, init?.method || 'GET', init?.body ? JSON.parse(init.body) : null]);
  if (path === '/api/student-standard/universe/map') return { subjects: [{ id: 'mat', name: 'Matematik' }] };
  if (path === '/api/student-standard/universe/exams' && !init) return { exams: [] };
  if (path === '/api/student-standard/universe/exams') { if (startReply instanceof Error) throw startReply; return startReply; }
  if (path.endsWith('/submit')) return { exam: { id: 'x1', status: 'SUBMITTED', questionCount: 10, correct: 1, blank: 9, scorePercent: 10 }, outcomes: [{ id: 'o1', code: 'M.8.1.1', title: 'Üslü', subjectName: 'Matematik', correct: 1, total: 10 }],
    items: [{ seq: 1, outcome: { code: 'M.8.1.1' }, stem: 'Soru 1', options: [], assets: [], blocks: [], answer: 'A', correct: true, key: 'A', solution: null }] };
  return {};
} }));
import { NibiruExam } from '../src/pages/NibiruExam';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; calls.length = 0; });
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount() { const node = document.createElement('div'); document.body.append(node); await act(async () => createRoot(node).render(createElement(MemoryRouter, null, createElement(NibiruExam)))); await flush(); return node; }
const click = async (node: HTMLElement, text: string) => { const b = [...node.querySelectorAll('button')].find((x) => x.textContent?.includes(text))!; await act(async () => { b.click(); }); await flush(); };

it('says how many questions exist when there are too few', async () => {
  startReply = Object.assign(new Error('Bu deneme için daha önce görmediğin yeterli onaylı soru henüz yok.'), { details: { available: 6, needed: 10 } });
  const node = await mount();
  await click(node, '10 soruluk deneme');
  expect(node.textContent).toContain('Şu an 6 uygun soru var.');
});

it('runs a 10-question exam and shows the result by outcome', async () => {
  startReply = { exam: { id: 'x1', status: 'READY', questionCount: 10 }, items: Array.from({ length: 10 }, (_, k) => ({ seq: k + 1, outcome: { code: 'M.8.1.1', subjectName: 'Matematik' }, stem: `Soru ${k + 1}`, options: [{ key: 'A', text: '8' }, { key: 'B', text: '9' }], assets: [], blocks: [] })) };
  const node = await mount();
  await click(node, '20 soruluk deneme');
  expect(calls.find((c) => c[1] === 'POST')[2]).toMatchObject({ questionCount: 20, subjectId: null });
  expect(node.textContent).toContain('0/10 cevaplandı');
  await act(async () => { (node.querySelector('.uv-opt') as HTMLButtonElement).click(); });
  expect(node.textContent).toContain('1/10 cevaplandı');
  await click(node, 'Denemeyi bitir');
  const sent = calls.find((c) => c[0].endsWith('/submit'))[2].answers;
  expect(sent).toHaveLength(10);
  expect(sent[0]).toEqual({ seq: 1, answer: 'A' });
  expect(sent[1]).toEqual({ seq: 2, answer: '' });
  expect(node.textContent).toContain('1/10 doğru');
  expect(node.textContent).toContain('karnene soru çözme olarak işlendi');
});
