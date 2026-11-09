// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

/** Parent home: per child, last exam, week, attendance — only through parent-scoped endpoints. Synthetic data. */
const state = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../src/api', async () => ({ ...(await vi.importActual<any>('../src/api')), api: state.api }));
vi.mock('../src/auth', () => ({ useAuth: () => ({ user: { id: 'par', role: 'PARENT', display_name: 'Ayşe Veli' } }) }));
import { ParentGlassHome } from '../src/pages/ParentGlassHome';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

it('switches between children and asks for each child with its own id', async () => {
  state.api.mockImplementation(async (url: string) => {
    if (url === '/api/dashboard') return { children: [{ id: 'c1', name: 'ELİF DEMİR' }, { id: 'c2', name: 'CAN DEMİR' }] };
    if (url === '/api/school/attendance/my') return { children: [{ student: { id: 'c1' }, summary: { PRESENT: 12, ABSENT: 1 } }] };
    if (url.startsWith('/api/platform/exam-center/results')) return { results: url.includes('c1') ? [{ id: 'e1', title: 'Deneme', net: 55.5, score: 400 }] : [] };
    if (url.startsWith('/api/parent/weekly-summary')) return { summary: { exam_count: 0 }, developing: [] };
    return {};
  });
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
  await act(async () => root.render(createElement(MemoryRouter, {}, createElement(ParentGlassHome))));
  await flush(); await flush();
  expect(node.textContent).toContain('Elif nasıl gidiyor?');
  expect(node.textContent).toContain('55,5');
  expect(node.textContent).toContain('Gelmedi');
  expect(state.api).toHaveBeenCalledWith('/api/platform/exam-center/results?studentId=c1');
  const can = [...node.querySelectorAll('button')].find((b) => b.textContent === 'Can')!;
  await act(async () => { can.click(); }); await flush(); await flush();
  expect(state.api).toHaveBeenCalledWith('/api/platform/exam-center/results?studentId=c2');
  expect(node.textContent).toContain('Can nasıl gidiyor?');
  expect(node.textContent).toContain('Henüz yayınlanmış bir sınav sonucu yok.');
  await act(async () => root.unmount()); node.remove();
});
