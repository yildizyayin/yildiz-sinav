// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

/** Öğrenme Evreni PR-4: the karne line shows the learning stage and the delayed-review hint. Synthetic data only. */
const row = (p: any) => ({ outcomeId: p.id, code: p.code, title: p.title, subjectName: 'Matematik', status: p.status, uniqueQuestions: 9, target: 30, targetProgress: 0.3, attempts: 9, correct: 9, wrong: 0, blank: 0,
  recent: { days: 30, uniqueQuestions: 0, rate: null }, bySource: {}, ...p });
vi.mock('../src/api', () => ({ qs: () => '', api: async (path: string) => path.endsWith('/outcome-evidence') ? { ok: true, rules: { target: 30, learned: { days: 30, minQuestions: 8, minRate: 0.8 } }, recommendations: [], outcomes: [
  row({ id: 'o1', code: 'M.8.1.1', title: 'Üslü ifadeler', status: 'LEARNED', stage: 'LEARNED', stageLabel: 'Öğrenildi', reviewDue: true }),
  row({ id: 'o2', code: 'M.8.1.2', title: 'Bilimsel gösterim', status: 'DEVELOPING', stage: 'CONSOLIDATING', stageLabel: 'Pekiştiriyor', reviewDue: false }),
] } : { interventions: [] } }));
import { UnifiedOutcomeReport } from '../src/components/UnifiedOutcomeReport';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; });

it('shows the stage chips for the current view', async () => {
  const node = document.createElement('div'); document.body.append(node);
  await act(async () => createRoot(node).render(createElement(MemoryRouter, null, createElement(UnifiedOutcomeReport, { studentId: 's1', role: 'STUDENT' }))));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  const chips = [...node.querySelectorAll('.unified-chip')].map((c) => [c.className, c.textContent]);
  expect(chips).toEqual(expect.arrayContaining([['unified-chip stage-learned', 'Öğrenildi · tekrar zamanı'], ['unified-chip stage-consolidating', 'Pekiştiriyor']]));
});
