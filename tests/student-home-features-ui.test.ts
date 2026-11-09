// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

/**
 * Owner (9 Nov): features an institution has not switched on stay out of the student's way, and a student without a
 * target sees an invitation instead of an empty countdown. Synthetic data only.
 */
const state = vi.hoisted(() => ({ api: vi.fn(), features: [] as string[], days: null as number | null }));
vi.mock('../src/api', async () => ({ ...(await vi.importActual<any>('../src/api')), api: state.api }));
vi.mock('../src/auth', () => ({ useAuth: () => ({ user: { id: 'stu', role: 'STUDENT', institution_id: 'school' } }) }));
import { StudentStandardHome } from '../src/pages/StudentStandardHome';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => { state.api.mockReset(); state.api.mockImplementation(async (url: string) => {
  if (url === '/api/platform/features') return { features: state.features.map((feature_key) => ({ feature_key, effective_enabled: 1 })) };
  if (url === '/api/student-standard/home-context') return { countdown: state.days == null ? null : { label: 'LGS', days: state.days }, targets: [] };
  return { exams: [], outcomes: [] };
}); });
async function render() {
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
  await act(async () => root.render(createElement(MemoryRouter, {}, createElement(StudentStandardHome))));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return { node, done: async () => { await act(async () => root.unmount()); node.remove(); } };
}
it('hides switched-off features and invites to set a target', async () => {
  state.features = ['QUESTION_BANK']; state.days = null;
  const v = await render();
  expect(v.node.querySelector('a[href="/assignments"]')).toBeNull();
  expect(v.node.querySelector('a[href="/question-practice"]')).not.toBeNull();
  expect(v.node.textContent).toContain('Hedefini belirle');
  expect(v.node.textContent).not.toContain('gün kaldı');
  await v.done();
});
it('shows the countdown and switched-on features', async () => {
  state.features = ['QUESTION_BANK', 'ASSIGNMENTS']; state.days = 214;
  const v = await render();
  expect(v.node.querySelector('a[href="/assignments"]')).not.toBeNull();
  expect(v.node.textContent).toContain('214gün kaldı');
  await v.done();
});
