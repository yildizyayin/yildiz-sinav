// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

/** Test Hazırla (owner, 27 Nov 2026): one screen to make a test; "Testin hazır" with Başka soru / Çıkar; the check is asked once before print, board or homework; the printed paper shows the institution. */
const calls: Array<[string, string, any]> = [];
let brand: any = { institutionId: 'school', institutionName: 'Yıldız Koleji', hasLogo: false, canUpload: false };
let checked: any = null;
let items = [
  { position: 1, id: 'q1', stem: 'Kuvvet nedir?', options: [{ label: 'A', text: 'İtme' }, { label: 'B', text: 'Renk' }], band: 'EASY', outcomes: 'FB.5.2.1' },
  { position: 2, id: 'q2', stem: 'Sürtünme nerede vardır?', options: [{ label: 'A', text: 'Her yerde' }, { label: 'B', text: 'Hiçbir yerde' }], band: 'MEDIUM', outcomes: 'FB.5.2.2' },
];
vi.mock('../src/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'TEACHER' } }) }));
vi.mock('../src/api', () => ({
  api: async (url: string, init?: any) => {
    calls.push([init?.method || 'GET', url, init?.body ? JSON.parse(init.body) : null]);
    if (url.startsWith('/api/platform/studio/catalog')) {
      const q = new URL(url, 'https://x').searchParams;
      if (q.get('outcomeCodes') || q.get('questionCount')) return { available: q.get('outcomeCodes') === 'FB.5.1.1' ? 0 : 40, bands: {} };
      if (!q.get('subjectId')) return { subjects: [{ id: 'sub_fen', name: 'Fen Bilimleri', approved: 60 }] };
      return { outcomes: [
        { code: 'FB.5.1.1', title: 'Güneş’in yapısını açıklar.', unit: '1. Ünite: Gökyüzündeki Komşularımız Ve Biz', topic: '', academicYear: '2027-2028', approved: 0 },
        { code: 'FB.5.2.1', title: 'Kuvveti tanır.', unit: '2. Ünite: Kuvveti Tanıyalım', topic: '', academicYear: '2027-2028', approved: 25 },
        { code: 'FB.5.2.2', title: 'Sürtünmeyi açıklar.', unit: '2. Ünite: Kuvveti Tanıyalım', topic: '', academicYear: '2027-2028', approved: 20 },
      ] };
    }
    if (url === '/api/platform/studio' && init?.method === 'POST') return { ok: true, id: 'std_new' };
    if (url === '/api/teacher-tests/branding') return brand;
    if (url === '/api/teacher-tests/t1') return { test: { id: 't1', title: 'Kuvveti Tanıyalım · Ünite testi', type: 'WORKSHEET', gradeLevel: 5, subject: 'Fen Bilimleri', status: 'DRAFT', locked: false, doc: { id: 't1', config_json: '{"bookletCodes":["A","B"]}' } }, checked, deliveries: [] };
    if (url.includes('/items')) return { items };
    if (url.endsWith('/swap')) { items = [{ ...items[0], id: 'q9', stem: 'Yeni soru' }, items[1]]; return { ok: true, to: 'q9' }; }
    if (url.endsWith('/remove-question')) { items = [items[0]]; return { ok: true }; }
    if (url.endsWith('/check')) { checked = { by: 'Ayşe', at: 'now' }; return { ok: true }; }
    if (url.endsWith('/print')) return { ok: true };
    return {};
  },
}));
import { TestPrepare } from '../src/pages/TestPrepare';
import { TestReady } from '../src/pages/TestReady';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const roots: any[] = [];
afterEach(async () => { for (const r of roots.splice(0)) await act(async () => r.unmount()); document.body.innerHTML = ''; calls.length = 0; checked = null; });
const settle = async () => { for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 300)); }); };
async function mount(path: string) {
  const node = document.createElement('div'); document.body.append(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Routes, null,
    createElement(Route, { path: '/soru-havuzu/hazirla', element: createElement(TestPrepare) }),
    createElement(Route, { path: '/soru-havuzu/hazirla/:testId', element: createElement(TestReady) }),
    createElement(Route, { path: '/board/:id', element: createElement('div', { id: 'board' }) })))));
  await settle();
  return node;
}
const btn = (node: Element, t: string) => [...node.querySelectorAll('button')].find((b) => b.textContent?.includes(t)) as HTMLButtonElement;

it('makes a unit test in one tap with the unit that has questions, and blocks a choice without questions', { timeout: 15000 }, async () => {
  const node = await mount('/soru-havuzu/hazirla');
  expect(node.querySelector('h1')?.textContent).toBe('Ne hazırlıyorsun?');
  expect(node.querySelector('.tp-scope')?.textContent).toContain('5. sınıf · Fen Bilimleri');
  expect([...node.querySelectorAll('.tp-kind strong')].map((x) => x.textContent)).toEqual(['Kazanım Testi', 'Ünite Testi', 'Deneme']);
  expect([...node.querySelectorAll('.tp-unit .tp-unit-name')].map((x) => x.firstChild?.textContent)).toEqual(['Gökyüzündeki Komşularımız Ve Biz', 'Kuvveti Tanıyalım']);
  expect(node.querySelector('.tp-unit.on')?.textContent).toContain('Kuvveti Tanıyalım');            // the first unit with questions
  expect(node.querySelector('.tp-bar')?.textContent).toContain('40 onaylı soru');
  await act(async () => { btn(node, 'Testi hazırla').click(); });
  const post = calls.find(([m, u]) => m === 'POST' && u === '/api/platform/studio')!;
  expect(post[2]).toMatchObject({ title: 'Kuvveti Tanıyalım · Ünite testi', documentType: 'WORKSHEET', gradeLevel: 5, subjectId: 'sub_fen', questionCount: 10, bookletCodes: ['A'], outcomeCodes: ['FB.5.2.1', 'FB.5.2.2'], deliveryMode: 'PDF_OPTICAL' });
});

it('says plainly when a unit has no approved questions yet', { timeout: 15000 }, async () => {
  const node = await mount('/soru-havuzu/hazirla');
  await act(async () => { (node.querySelectorAll('.tp-unit')[0] as HTMLButtonElement).click(); });
  await settle();
  expect(node.querySelector('.tp-bar')?.textContent).toContain('henüz onaylı soru yok');
  expect(btn(node, 'Testi hazırla').disabled).toBe(true);
});

it('replaces or removes a question, asks the check once, and shows the institution on the paper', { timeout: 15000 }, async () => {
  const node = await mount('/soru-havuzu/hazirla/t1');
  expect(node.querySelector('h1')?.textContent).toBe('Kuvveti Tanıyalım · Ünite testi');
  expect(node.querySelectorAll('.tr-list li')).toHaveLength(2);
  await act(async () => { btn(node.querySelector('.tr-list li')!, 'Başka soru').click(); }); await settle();
  expect(node.querySelector('.tr-list li')?.textContent).toContain('Yeni soru');
  await act(async () => { (node.querySelectorAll('.tr-remove')[1] as HTMLButtonElement).click(); }); await settle();
  expect(node.querySelectorAll('.tr-list li')).toHaveLength(1);
  expect(node.querySelector('.tr-remove')).toBeNull();                                               // the last question stays
  await act(async () => { btn(node, 'Yazdır').click(); });
  expect(document.querySelector('[role=dialog]')?.textContent).toContain('Göndermeden önce son bir kontrol');
  const box = document.querySelector('.tcd-check input') as HTMLInputElement;
  await act(async () => { box.click(); });
  await act(async () => { btn(document.body, 'Onayla ve devam et').click(); }); await settle();
  const sheet = document.querySelector('.tr-sheet')!;
  expect(sheet.querySelector('.paper-titles small')?.textContent).toBe('Yıldız Koleji');
  expect(sheet.querySelector('.paper-foot')?.textContent).toContain('Yıldız Koleji');
  expect(sheet.textContent).toContain('Logoyu kurum yöneticiniz Soru Havuzu’ndan yükleyebilir');
  expect([...sheet.querySelectorAll('.pr-btn')].map((b) => b.textContent?.trim())).toEqual(['Kitapçık A (PDF)', 'Kitapçık B (PDF)', 'Cevap anahtarı (öğretmene)']);
  await act(async () => { (sheet.querySelector('.tp-check input') as HTMLInputElement).click(); });
  expect(calls.find(([m, u]) => m === 'PUT' && u.endsWith('/print'))![2]).toEqual({ useInstitution: false, showAnunex: true });
  expect(sheet.querySelector('.paper-titles small')).toBeNull();
  await act(async () => { (document.querySelector('.tr-x') as HTMLButtonElement).click(); });
  expect(node.querySelector('.tr-checkline')?.textContent).toContain('Sorular uygun bulundu');
  await act(async () => { btn(node, 'Tahtada aç').click(); }); await settle();
  expect(document.querySelector('#board')).not.toBeNull();                                           // asked only once
});
