// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

/** Soru Havuzu for teachers and institutions (owner, 27 Nov 2026): two choices; Testlerim with two big actions per card,
 *  the rest behind ⋯; a manager sees every teacher's tests with a teacher filter. */
const calls: Array<[string, string]> = [];
let role = 'TEACHER';
let tests: any[] = [];
vi.mock('../src/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role } }) }));
vi.mock('../src/api', () => ({
  api: async (url: string, init?: any) => {
    calls.push([init?.method || 'GET', url]);
    if (url === '/api/teacher-tests') return { ok: true, tests };
    if (url.endsWith('/copy')) { tests = [{ ...tests[1], id: 'copy1', title: 'Ay’ın evreleri (kopya)', kind: 'DRAFT', locked: false, homework: null }, ...tests]; return { ok: true, id: 'copy1', title: 'Ay’ın evreleri (kopya)' }; }
    if (init?.method === 'DELETE') return { ok: true, removed: 'ARCHIVED', message: 'Test listeden kaldırıldı; öğrenci sonuçları korunuyor.' };
    return {};
  },
}));
vi.mock('../src/components/StudioPreview', () => ({ StudioPreview: () => createElement('div', { id: 'preview' }, 'önizleme') }));
vi.mock('../src/components/StudioOpticalScan', () => ({ StudioOpticalScan: () => createElement('div', { id: 'scan' }) }));
vi.mock('../src/components/StudioDownloads', () => ({ StudioDownloads: () => createElement('span', { id: 'downloads' }, 'Kitapçık A') }));
vi.mock('../src/components/StudioHomeworkAssign', () => ({ StudioHomeworkAssign: () => createElement('span', { id: 'assign' }) }));
import { TestLibrary } from '../src/pages/TestLibrary';
import { QuestionPoolHome } from '../src/pages/QuestionPoolHome';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const roots: any[] = [];
afterEach(async () => { for (const r of roots.splice(0)) await act(async () => r.unmount()); document.body.innerHTML = ''; calls.length = 0; role = 'TEACHER'; });
const doc = (id: string) => ({ id, title: id, document_type: 'WORKSHEET', config_json: '{}' });
const base = () => [
  { id: 'd1', title: 'Kuvvet testi', type: 'WORKSHEET', gradeLevel: 5, subject: 'Fen Bilimleri', kind: 'DRAFT', status: 'READY', questionCount: 10, booklets: ['A'], updatedAt: '2026-11-26 15:40:00', homework: null, opticalResults: 0, locked: false, mine: true, teacher: { id: 'u1', name: 'Ayşe Yılmaz' }, doc: doc('d1') },
  { id: 'd2', title: 'Ay’ın evreleri', type: 'WORKSHEET', gradeLevel: 5, subject: 'Fen Bilimleri', kind: 'HOMEWORK', status: 'PUBLISHED', questionCount: 8, booklets: ['A'], updatedAt: '2026-11-24 09:00:00', homework: { total: 24, done: 18, dueAt: '2026-11-27' }, opticalResults: 0, locked: true, mine: true, teacher: { id: 'u1', name: 'Ayşe Yılmaz' }, doc: doc('d2') },
  { id: 'd3', title: 'Işık testi', type: 'WORKSHEET', gradeLevel: 6, subject: 'Fen Bilimleri', kind: 'HOMEWORK', status: 'PUBLISHED', questionCount: 12, booklets: ['A'], updatedAt: '2026-11-14 09:00:00', homework: { total: 28, done: 27, dueAt: null }, opticalResults: 0, locked: true, mine: false, teacher: { id: 'u2', name: 'Mehmet Demir' }, doc: doc('d3') },
];
async function mount(el: any) {
  const node = document.createElement('div'); document.body.append(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(MemoryRouter, null, el)));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return node;
}
const btn = (node: Element, t: string) => [...node.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(t)) as HTMLButtonElement;
const card = (node: Element, title: string) => [...node.querySelectorAll('.mt-card')].find((c) => c.querySelector('h2')?.textContent === title)!;

it('Soru Havuzu shows only the two choices, and how many tests wait', async () => {
  tests = base();
  const node = await mount(createElement(QuestionPoolHome));
  expect([...node.querySelectorAll('a.qph-tile')].map((a) => [a.querySelector('strong')?.textContent, a.getAttribute('href')])).toEqual([['Test Hazırla', '/content-center'], ['Testlerim', '/soru-havuzu/testlerim']]);
  expect(node.textContent).toContain('1 test yarım kaldı');
  role = 'INSTITUTION_MANAGER';
  for (const r of roots.splice(0)) await act(async () => r.unmount());
  expect((await mount(createElement(QuestionPoolHome))).textContent).toContain('Kurumun testleri');
});

it('gives each card two big actions and keeps the rest behind ⋯', async () => {
  tests = base().slice(0, 2);
  const node = await mount(createElement(TestLibrary));
  expect(node.querySelector('h1')?.textContent).toBe('Testlerim');
  expect(node.querySelector('.mt-filter')).toBeNull();
  expect([...card(node, 'Kuvvet testi').querySelectorAll('.mt-big')].map((b) => b.textContent)).toEqual(['Devam et', 'Ödev ver / Yazdır']);
  expect([...card(node, 'Ay’ın evreleri').querySelectorAll('.mt-big')].map((b) => b.textContent)).toEqual(['Kopyala ve düzenle', 'Tekrar kullan']);
  expect(node.querySelector('[role=menu]')).toBeNull();
  await act(async () => { (card(node, 'Ay’ın evreleri').querySelector('.mt-dots') as HTMLButtonElement).click(); });
  expect([...node.querySelectorAll('[role=menuitem]')].map((m) => m.textContent)).toEqual(['Tahtada aç', 'Kopyala ve düzenle', 'Optik okut', 'Listeden kaldır']);
  await act(async () => { btn(node.querySelector('[role=menu]')!, 'Listeden kaldır').click(); });
  expect(calls.some(([m]) => m === 'DELETE')).toBe(false);                              // asks first
  await act(async () => { btn(card(node, 'Ay’ın evreleri'), 'Kaldır').click(); });
  expect(calls).toContainEqual(['DELETE', '/api/teacher-tests/d2']);
  expect(node.textContent).toContain('öğrenci sonuçları korunuyor');
  await act(async () => { btn(card(node, 'Kuvvet testi'), 'Ödev ver / Yazdır').click(); });
  expect(card(node, 'Kuvvet testi').querySelector('#downloads')).not.toBeNull();
  expect(card(node, 'Kuvvet testi').querySelector('#assign')).not.toBeNull();
  await act(async () => { btn(card(node, 'Kuvvet testi'), 'Devam et').click(); });
  expect(node.querySelector('#preview')).not.toBeNull();
});

it('lets the institution manager see every teacher’s tests and filter by teacher', async () => {
  role = 'INSTITUTION_MANAGER'; tests = base();
  const node = await mount(createElement(TestLibrary));
  expect(node.querySelector('h1')?.textContent).toBe('Kurumun testleri');
  expect(node.querySelectorAll('.mt-card')).toHaveLength(3);
  expect(card(node, 'Işık testi').textContent).toContain('Mehmet Demir');
  const sel = node.querySelector('.mt-filter select') as HTMLSelectElement;
  expect([...sel.options].map((o) => o.textContent)).toEqual(['Tüm öğretmenler', 'Ayşe Yılmaz', 'Mehmet Demir']);
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(sel, 'u2'); sel.dispatchEvent(new Event('change', { bubbles: true })); });
  expect([...node.querySelectorAll('.mt-card h2')].map((h) => h.textContent)).toEqual(['Işık testi']);
  expect([...node.querySelectorAll('[role=tab]')].map((b) => b.textContent)).toEqual(['Tümü 1', 'Yarım kalanlar 0', 'Gönderilenler 1']);
});
