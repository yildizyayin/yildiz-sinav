// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

/** Testlerim page: tabs by what happened to a test; a draft is deleted after a confirm; a sent test is copied, never edited in place. */
const calls: Array<[string, string]> = [];
let tests: any[] = [];
vi.mock('../src/api', () => ({
  api: async (url: string, init?: any) => {
    calls.push([init?.method || 'GET', url]);
    if (url === '/api/teacher-tests') return { ok: true, tests };
    if (url.endsWith('/copy')) { tests = [{ ...tests[1], id: 'copy1', title: 'Ay’ın evreleri (kopya)', kind: 'DRAFT', locked: false, homework: null }, ...tests]; return { ok: true, id: 'copy1', title: 'Ay’ın evreleri (kopya)' }; }
    if (init?.method === 'DELETE') return { ok: true, removed: 'DELETED', message: 'Taslak silindi.' };
    return {};
  },
}));
vi.mock('../src/components/StudioPreview', () => ({ StudioPreview: () => createElement('div', { id: 'preview' }, 'önizleme') }));
vi.mock('../src/components/StudioOpticalScan', () => ({ StudioOpticalScan: () => null }));
vi.mock('../src/components/StudioDownloads', () => ({ StudioDownloads: () => createElement('span', { id: 'downloads' }, 'Kitapçık A') }));
vi.mock('../src/components/StudioHomeworkAssign', () => ({ StudioHomeworkAssign: () => null }));
import { MyTests } from '../src/pages/MyTests';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const roots: any[] = [];
afterEach(async () => { for (const r of roots.splice(0)) await act(async () => r.unmount()); document.body.innerHTML = ''; calls.length = 0; });
const doc = (id: string) => ({ id, title: id, document_type: 'WORKSHEET', config_json: '{}' });
const base = () => [
  { id: 'd1', title: 'Kuvvet taslağı', type: 'WORKSHEET', gradeLevel: 5, subject: 'Fen Bilimleri', kind: 'DRAFT', status: 'DRAFT', questionCount: 10, booklets: ['A'], updatedAt: '2026-11-26 15:40:00', homework: null, opticalResults: 0, locked: false, doc: doc('d1') },
  { id: 'd2', title: 'Ay’ın evreleri', type: 'WORKSHEET', gradeLevel: 5, subject: 'Fen Bilimleri', kind: 'HOMEWORK', status: 'PUBLISHED', questionCount: 8, booklets: ['A'], updatedAt: '2026-11-24 09:00:00', homework: { total: 24, done: 18, dueAt: '2026-11-27' }, opticalResults: 0, locked: true, doc: doc('d2') },
  { id: 'd3', title: '1. Dönem 1. Yazılı', type: 'WRITTEN_EXAM', gradeLevel: 5, subject: 'Fen Bilimleri', kind: 'PRINTED', status: 'READY', questionCount: 20, booklets: ['A', 'B'], updatedAt: '2026-11-20 09:00:00', homework: null, opticalResults: 12, locked: true, doc: doc('d3') },
];
async function mount() {
  const node = document.createElement('div'); document.body.append(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(MemoryRouter, null, createElement(MyTests))));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return node;
}
const btn = (node: Element, t: string) => [...node.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(t)) as HTMLButtonElement;

it('shows every test by what happened to it, with the homework ring', async () => {
  tests = base();
  const node = await mount();
  expect([...node.querySelectorAll('[role=tab]')].map((b) => b.textContent)).toEqual(['Tümü 3', 'Taslaklar 1', 'Ödevler 1', 'Yazdırılanlar 1']);
  expect(node.querySelector('.mt-ring')?.getAttribute('aria-label')).toBe('24 öğrenciden 18 çözdü');
  expect(node.textContent).toContain('12 optik sonuç');
  expect(node.querySelectorAll('.mt-note')).toHaveLength(2);                       // the two sent tests say why they are not edited in place
  await act(async () => { btn(node, 'Taslaklar').click(); });
  expect([...node.querySelectorAll('.mt-card h2')].map((h) => h.textContent)).toEqual(['Kuvvet taslağı']);
  expect(node.querySelector('a[href="/board/d1"]')).not.toBeNull();
  await act(async () => { btn(node, 'Devam et').click(); });
  expect(node.querySelector('#preview')).not.toBeNull();
});

it('deletes a draft only after the confirm, and copies a sent test into a new draft', async () => {
  tests = base();
  const node = await mount();
  const card = (title: string) => [...node.querySelectorAll('.mt-card')].find((c) => c.querySelector('h2')?.textContent === title)!;
  await act(async () => { btn(card('Kuvvet taslağı'), 'Sil').click(); });
  expect(calls.some(([m]) => m === 'DELETE')).toBe(false);
  expect(card('Kuvvet taslağı').textContent).toContain('kalıcı olarak silinir');
  await act(async () => { btn(card('Kuvvet taslağı'), 'Evet, sil').click(); });
  expect(calls).toContainEqual(['DELETE', '/api/teacher-tests/d1']);
  expect(node.textContent).toContain('Taslak silindi.');
  expect(node.textContent).not.toContain('Kuvvet taslağı');
  expect(btn(card('Ay’ın evreleri'), 'Listeden kaldır')).toBeTruthy();
  await act(async () => { btn(card('Ay’ın evreleri'), 'Kopyala ve düzenle').click(); await new Promise((r) => setTimeout(r, 0)); });
  expect(calls).toContainEqual(['POST', '/api/teacher-tests/d2/copy']);
  expect(node.querySelector('.mt-card.fresh h2')?.textContent).toBe('Ay’ın evreleri (kopya)');
  expect(node.textContent).toContain('İlk testin öğrenci cevapları korunuyor');
  await act(async () => { btn(card('1. Dönem 1. Yazılı'), 'Yazdır').click(); });
  expect(card('1. Dönem 1. Yazılı').querySelector('#downloads')).not.toBeNull();
});
