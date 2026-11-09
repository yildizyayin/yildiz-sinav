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

it('shows the latest published result with its change, ranks and lesson nets', async () => {
  state.features = ['QUESTION_BANK']; state.days = 120;
  const base = state.api.getMockImplementation()!;
  state.api.mockImplementation(async (url: string) => {
    if (url === '/api/platform/exam-center/results') return { results: [
      { id: 'e2', snapshot_version: 1, title: 'Deneme 2', net: 40.5, score: 350.25, institution_rank: 4, institution_count: 50, class_rank: 2, class_count: 20 },
      { id: 'e1', snapshot_version: 1, title: 'Deneme 1', net: 38, score: 330 },
    ] };
    if (url === '/api/platform/exam-center/e2/result') return { result: { subjects: [{ subject: 'Matematik', net: 12, correct_count: 13, wrong_count: 4, blank_count: 3 }] } };
    if (url === '/api/platform/exam-center/e1/result') return { result: { subjects: [{ subject: 'Matematik', net: 10, correct_count: 11, wrong_count: 4, blank_count: 5 }] } };
    if (url === '/api/dashboard') return { developing: [{ id: 'o1', title: 'Kesirler', subject_name: 'Matematik', evidence_count: 6, correct_count: 2 }] };
    return base(url);
  });
  const v = await render();
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  const text = v.node.textContent || '';
  expect(text).toContain('40,5');
  expect(text).toContain('2,5 net');
  expect(text).toContain('4 / 50');
  expect(text).toContain('2 / 20');
  expect(text).toContain('Matematik');
  expect(text).toContain('/ 20');
  expect(text).toContain('Kesirler');
  await v.done();
});
