// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

/** Test sayfası: three big next steps; the first one asks the teacher to confirm the questions suit the class; results per class, question and outcome. */
const calls: Array<[string, string, any]> = [];
let checked: any = null;
const detail = () => ({ ok: true, checked, test: { id: 'd1', title: 'Paragraf testi', type: 'WORKSHEET', gradeLevel: 8, subject: 'Türkçe', teacher: 'Ayşe', status: 'PUBLISHED', questionCount: 2, locked: true, canAssign: true, doc: { id: 'd1' } },
  deliveries: [{ round: 1, sentAt: '2026-11-20 09:00:00', dueAt: '2026-11-27', classes: ['8/A'], total: 2, done: 1, average: 50, students: [{ name: 'Ali Yılmaz', className: '8/A', done: true, percent: 50 }, { name: 'Ece Kaya', className: '8/A', done: false, percent: null }] }],
  questions: [{ no: 1, outcome: 'Okuduğunu anlama', stem: 'Bir?', correctRate: 100, answered: 1 }, { no: 2, outcome: 'Sözcükte anlam', stem: 'İki?', correctRate: 0, answered: 1 }],
  outcomes: [{ title: 'Sözcükte anlam', correctRate: 0 }, { title: 'Okuduğunu anlama', correctRate: 100 }], optical: { count: 0, average: null } });
vi.mock('../src/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'TEACHER' } }) }));
vi.mock('../src/api', () => ({ api: async (url: string, init?: any) => { calls.push([init?.method || 'GET', url, init?.body]); if (url.endsWith('/check')) { checked = { by: 'Ayşe', at: '2026-11-27 10:00:00' }; return { ok: true, checked }; } return detail(); } }));
vi.mock('../src/components/StudioPreview', () => ({ StudioPreview: () => null }));
vi.mock('../src/components/StudioOpticalScan', () => ({ StudioOpticalScan: () => null }));
vi.mock('../src/components/StudioDownloads', () => ({ StudioDownloads: () => createElement('span', { id: 'downloads' }) }));
vi.mock('../src/components/StudioHomeworkAssign', () => ({ StudioHomeworkAssign: (p: any) => createElement('span', { id: 'assign', 'data-round': p.round || '' }) }));
import { TestDetail } from '../src/pages/TestDetail';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const roots: any[] = [];
afterEach(async () => { for (const r of roots.splice(0)) await act(async () => r.unmount()); document.body.innerHTML = ''; calls.length = 0; checked = null; });
const btn = (n: Element, t: string) => [...n.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(t)) as HTMLButtonElement;
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

it('asks for the confirmation once, then opens "Başka sınıfa ödev ver" as a new round; shows how it went', async () => {
  const node = document.createElement('div'); document.body.append(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(MemoryRouter, { initialEntries: ['/soru-havuzu/testlerim/d1'] }, createElement(Routes, null, createElement(Route, { path: '/soru-havuzu/testlerim/:testId', element: createElement(TestDetail) })))));
  await tick();
  expect(node.querySelector('h1')?.textContent).toBe('Paragraf testi');
  expect(node.textContent).toContain('Sınıf ortalaması %50');
  expect([...node.querySelectorAll('.td-bars b')].map((b) => b.textContent)).toEqual(['%100', '%0']);
  expect(node.querySelector('.td-outcomes li')?.textContent).toContain('Sözcükte anlam');
  await act(async () => { btn(node, 'Öğrencileri göster').click(); });
  expect([...node.querySelectorAll('.td-students b')].map((b) => b.textContent)).toEqual(['%50', 'Çözmedi']);
  await act(async () => { btn(node, 'Başka sınıfa ödev ver').click(); });
  expect(node.querySelector('[role=dialog]')?.textContent).toContain('testi gönderme sorumluluğu öğretmene aittir');
  const go = btn(node, 'Onayla ve devam et');
  expect(go.disabled).toBe(true);
  await act(async () => { (node.querySelector('.tcd-check input') as HTMLInputElement).click(); });
  await act(async () => { btn(node, 'Onayla ve devam et').click(); });
  await tick(); await tick();
  expect(calls).toContainEqual(['POST', '/api/teacher-tests/d1/check', JSON.stringify({ confirm: true })]);
  expect(node.querySelector('[role=dialog]')).toBeNull();
  expect(node.querySelector('#assign')?.getAttribute('data-round')).toBe('NEXT');
  expect(node.textContent).toContain('Kontrol edildi · Ayşe');
  await act(async () => { btn(node, 'Yazdır').click(); });                      // already confirmed: no dialog
  expect(node.querySelector('[role=dialog]')).toBeNull();
  expect(node.querySelector('#downloads')).not.toBeNull();
});
