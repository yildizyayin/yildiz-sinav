// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

/** Owner (10 Nov 2026): grades without an LGS/YKS target see their chosen interests, not a target dead end. */
const state = vi.hoisted(() => ({ home: {} as any }));
vi.mock('../src/api', async () => ({ ...(await vi.importActual<any>('../src/api')), api: async (url: string) => {
  if (url === '/api/platform/features') return { features: [{ feature_key: 'QUESTION_BANK', effective_enabled: 1 }] };
  if (url === '/api/student-standard/home-context') return state.home;
  return { exams: [], outcomes: [] };
} }));
vi.mock('../src/auth', () => ({ useAuth: () => ({ user: { id: 'stu', role: 'STUDENT', institution_id: 'school' } }) }));
import { StudentStandardHome } from '../src/pages/StudentStandardHome';
import { gradeProfile } from '../src/lib/gradeProfile';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
async function render() {
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
  await act(async () => root.render(createElement(MemoryRouter, {}, createElement(StudentStandardHome))));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return { text: node.textContent || '', done: async () => { await act(async () => root.unmount()); node.remove(); } };
}
it('a 7th grader sees the dream profession card, never "choose your school"', async () => {
  state.home = { profile: gradeProfile(7), countdown: { enabled: false, days: null }, targets: [], professions: [] };
  let v = await render();
  expect(v.text).toContain('Hayalindeki meslek');
  expect(v.text).toContain('Henüz seçmedin');
  expect(v.text).not.toContain('Hedef okulunu');
  expect(v.text).not.toContain('gün kaldı');
  await v.done();
  state.home = { ...state.home, professions: [{ title: 'Mühendis', motivation_title: 'Geleceğin mühendisi' }] };
  v = await render();
  expect(v.text).toContain('Mühendis');
  expect(v.text).toContain('Geleceğin mühendisi');
  await v.done();
});
it('an 8th grader keeps the target card with the LGS countdown', async () => {
  state.home = { profile: gradeProfile(8), countdown: { enabled: true, label: 'LGS', days: 215 }, targets: [], professions: [] };
  const v = await render();
  expect(v.text).toContain('215gün kaldı');
  expect(v.text).toContain('Hedefin');
  expect(v.text).not.toContain('Hayalindeki meslek');
  await v.done();
});
