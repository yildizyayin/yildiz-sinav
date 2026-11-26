// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

/** Gizem Dosyası: each clue opens with a server-checked question; the student rules suspects out; the play is sent once. */
const calls: [string, any][] = [];
vi.mock('../src/api', () => ({
  api: async (url: string, init: any) => {
    const body = JSON.parse(init.body); calls.push([url, body]);
    if (url.endsWith('/check')) return { ok: true, correct: body.response.answer === 'A', partial: 0, key: { correct: 'A' }, explanation: 'Çünkü A.' };
    return { session: { id: 'case-s', status: 'SUBMITTED', correct: 2, itemCount: 3, xp: 23 }, items: [] };
  },
}));
import { UniverseArcade, arcadeGame } from '../src/components/universe/UniverseArcade';
import { caseFor } from '../src/components/universe/mysteryCases';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; calls.length = 0; });
const q = (seq: number) => ({ seq, kind: 'QUESTION', repeat: false, content: { stem: `Soru ${seq}`, options: [{ key: 'A', text: 'bir' }, { key: 'B', text: 'iki' }] } });
const data = { session: { id: 'case-s', template: { kind: 'CHOICE', title: 'Bilgi Görevi' }, outcome: { id: 'o', code: 'M.5.1.1', title: 'Doğal sayılar' }, gradeLevel: 5, itemCount: 3, timed: false, secondsPerItem: null }, items: [q(1), q(2), q(3)] };

it('opens the mystery only for question plays asked as a case', () => {
  expect(arcadeGame(data as any, 'mystery')).toBe('mystery');
  expect(arcadeGame(data as any)).toBe('meteor');
  expect(arcadeGame({ ...data, items: [q(1), q(2)] } as any, 'mystery')).toBe('meteor');
});

it('plays a whole case: question, clue, the student’s own elimination, accusation, and one submit', async () => {
  const c = caseFor('case-s');
  const node = document.createElement('div'); document.body.append(node);
  await act(async () => createRoot(node).render(createElement(MemoryRouter, null, createElement(UniverseArcade, { data: data as any, onDone: () => undefined, style: 'mystery' }))));
  const click = async (el: Element | null | undefined) => { await act(async () => { (el as HTMLElement).click(); }); };
  const btn = (t: string) => [...node.querySelectorAll('button')].find((b) => b.textContent?.includes(t));
  const sus = (id: string) => node.querySelector(`button[aria-label^="${c.suspects.find((s) => s.id === id)!.name}"]`);
  expect(node.textContent).toContain(c.title);
  expect(node.textContent).toContain('M.5.1.1');
  for (let k = 0; k < 3; k++) {
    await click(node.querySelector(`.gm-opt[aria-label="${k === 1 ? 'B' : 'A'}) ${k === 1 ? 'iki' : 'bir'}"]`));
    expect(calls.at(-1)).toEqual([`/api/student-standard/universe/sessions/case-s/items/${k + 1}/check`, { response: { answer: k === 1 ? 'B' : 'A' } }]);
    await click(btn('İpucunu aç'));
    expect(node.textContent).toContain(c.clues[k].found);
    if (c.clues[k].rulesOut) {
      await click(sus(c.culprit));                                   // the culprit fits the clue: not ruled out
      expect(node.querySelector('.gm-sus.out')?.getAttribute('aria-label') ?? '').not.toContain(c.suspects.find((s) => s.id === c.culprit)!.name);
      await click(sus(c.clues[k].rulesOut!));
      expect(sus(c.clues[k].rulesOut!)?.getAttribute('aria-label')).toContain('elendi');
    } else {
      await click(sus(c.culprit));
    }
  }
  expect(node.textContent).toContain('Vaka çözüldü!');
  expect(node.textContent).toContain('★☆☆');                         // two wrong guesses cost two of the student's own stars
  await click(btn('Dosyayı kapat'));
  const submits = calls.filter(([u]) => u.endsWith('/submit'));
  expect(submits).toHaveLength(1);
  expect(submits[0][1].answers).toEqual([{ seq: 1, response: { answer: 'A' } }, { seq: 2, response: { answer: 'B' } }, { seq: 3, response: { answer: 'A' } }]);
  expect(node.textContent).toContain('Bu oyunla çalıştığın kazanım');
});
