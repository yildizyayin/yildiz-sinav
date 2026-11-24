// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

/** Owner (9 Nov): features an institution has not switched on are not offered on role home pages. Synthetic data. */
const state = vi.hoisted(() => ({ api: vi.fn(), features: [] as string[] }));
vi.mock('../src/api', async () => ({ ...(await vi.importActual<any>('../src/api')), api: state.api }));
vi.mock('../src/auth', () => ({ useAuth: () => ({ user: { id: 't1', role: 'TEACHER', institution_id: 'school' } }) }));
import { TeacherStandardHome } from '../src/pages/StandardRoleHomes';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
async function render() {
  state.api.mockImplementation(async (url: string) => url === '/api/platform/features' ? { features: state.features.map((feature_key) => ({ feature_key, effective_enabled: 1 })) } : {});
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
  await act(async () => root.render(createElement(MemoryRouter, {}, createElement(TeacherStandardHome))));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return { node, done: async () => { await act(async () => root.unmount()); node.remove(); } };
}
it('hides the assignment tile while assignments are off and shows it once they are on', async () => {
  state.features = []; let v = await render();
  expect(v.node.querySelector('a[href="/assignments"]')).toBeNull();
  expect(v.node.querySelector('a[href="/classes"]')).not.toBeNull();
  await v.done();
  state.features = ['ASSIGNMENTS']; v = await render();
  expect(v.node.querySelector('a[href="/assignments"]')).not.toBeNull();
  await v.done();
});
