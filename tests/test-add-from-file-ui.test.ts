// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

/** "+ Soru ekle (PDF ya da fotoğraftan)": a rights declaration, then the test moves to Hızlı Test; Testlerim lists Hızlı Testler; the editorial queue decides suggestions. */
const calls: Array<[string, string, any]> = [];
let role = 'TEACHER';
vi.mock('../src/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role } }) }));
vi.mock('../src/api', () => ({
  api: async (url: string, init?: any) => {
    calls.push([init?.method || 'GET', url, init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : null]);
    if (url === '/api/teacher-tests/branding') return { institutionId: 'school', institutionName: 'Yıldız Koleji', hasLogo: false, canUpload: false };
    if (url === '/api/teacher-tests/t1') return { test: { id: 't1', title: 'Kuvvet · Ünite testi', type: 'WORKSHEET', status: 'DRAFT', locked: false, doc: { id: 't1', config_json: '{}' } }, checked: null, deliveries: [] };
    if (url.includes('/items')) return { items: [{ position: 1, id: 'q1', stem: 'Kuvvet nedir?', options: [], band: 'EASY', outcomes: null }] };
    if (url.startsWith('/api/quick-tests/from-studio/')) return { ok: true, id: 'qt9', moved: true };
    if (url === '/api/teacher-tests') return { tests: [], quickTests: [{ id: 'qt9', title: 'Kuvvet · Ünite testi', gradeLevel: 5, subject: 'Fen Bilimleri', questionCount: 4, unanswered: 1, results: 0, updatedAt: '2026-11-27 15:00:00', mine: true, teacher: { id: 'u1', name: 'Ayşe' } }] };
    if (url.startsWith('/api/admin/pool-suggestions?')) return { counts: { PENDING: 1 }, suggestions: [{ id: 's1', institution: 'Yıldız Koleji', teacher: 'Ayşe', gradeLevel: 5, subject: 'Fen', correctAnswer: 'C', note: 'kendi sorum', statement: 'Bu soruyu ben yazdım…', status: 'PENDING', reviewNote: null, questionBankId: null, createdAt: 'x' }] };
    if (url.endsWith('/decide')) return { ok: true };
    return {};
  },
}));
import { TestReady } from '../src/pages/TestReady';
import { TestLibrary } from '../src/pages/TestLibrary';
import { PoolSuggestions } from '../src/components/PoolSuggestions';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const roots: any[] = [];
afterEach(async () => { for (const r of roots.splice(0)) await act(async () => r.unmount()); document.body.innerHTML = ''; calls.length = 0; role = 'TEACHER'; });
async function mount(path: string, el: any) {
  const node = document.createElement('div'); document.body.append(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Routes, null,
    createElement(Route, { path: '/x/:testId', element: el }), createElement(Route, { path: '/quick-tests/:id', element: createElement('div', { id: 'quick' }) }), createElement(Route, { path: '*', element: el })))));
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  return node;
}
const btn = (n: Element, t: string) => [...n.querySelectorAll('button')].find((b) => b.textContent?.includes(t)) as HTMLButtonElement;

it('moves the test to Hızlı Test only after the rights declaration', async () => {
  const node = await mount('/x/t1', createElement(TestReady));
  await act(async () => { btn(node, 'Soru ekle (PDF ya da fotoğraftan)').click(); });
  const sheet = document.querySelector('.tr-sheet')!;
  expect(sheet.textContent).toContain('şimdiki 1 sorusuyla birlikte Hızlı Test’e taşınır');
  const go = btn(sheet, 'Devam et ve kırpmaya başla');
  expect(go.disabled).toBe(true);
  await act(async () => { (sheet.querySelector('.tcd-check input') as HTMLInputElement).click(); });
  await act(async () => { go.click(); await new Promise((r) => setTimeout(r, 20)); });
  expect(calls.find(([m, u]) => m === 'POST' && u === '/api/quick-tests/from-studio/t1')![2]).toEqual({ addCrops: true, rightsDeclared: true });
  expect(document.querySelector('#quick')).not.toBeNull();
});

it('lists Hızlı Testler in Testlerim', async () => {
  const node = await mount('/testlerim', createElement(TestLibrary));
  const sec = node.querySelector('.mt-quick')!;
  expect(sec.textContent).toContain('PDF ya da fotoğraftan hazırlananlar');
  expect(sec.textContent).toContain('1 sorunun cevabı eksik');
  expect(sec.querySelector('a')?.getAttribute('href')).toBe('/quick-tests/qt9');
});

it('lets the editorial team accept with the pool question id or reject with a reason', async () => {
  role = 'SUPER_ADMIN';
  const node = await mount('/admin', createElement(PoolSuggestions));
  const card = node.querySelector('.pool-sugg-card')!;
  expect(card.textContent).toContain('Ayşe');
  expect(btn(card, 'Kabul et').disabled).toBe(true);
  expect(btn(card, 'Reddet').disabled).toBe(true);
  const [qid, note] = [...card.querySelectorAll('input')] as HTMLInputElement[];
  const type = async (el: HTMLInputElement, v: string) => act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
  await type(qid, 'q_123'); await type(note, 'Teşekkürler');
  await act(async () => { btn(card, 'Kabul et').click(); await new Promise((r) => setTimeout(r, 20)); });
  expect(calls.find(([m, u]) => m === 'POST' && u.endsWith('/decide'))![2]).toEqual({ decision: 'ACCEPTED', note: 'Teşekkürler', questionBankId: 'q_123' });
});
