// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

/** Akıllı tahta: question → class choice → answer lights up → solution step by step → solution video in the board; presenter keys move between questions. */
const lesson = { test: { id: 'doc1', title: 'Kuvvet testi' }, items: [
  { position: 1, id: 'q1', stem: 'Kapıyı çeken kuvvet hangisidir?', answer: 'B', options: [{ label: 'A', text: 'İtme', image: null }, { label: 'B', text: 'Çekme', image: null }], images: [{ id: 'img1', url: '/api/board/doc1/media/img1', alt: 'Kapı şeması' }], solution: 'x', steps: ['Kol kendine doğru gelir.', 'Bu bir çekmedir.'], solutionVideo: { kind: 'FILE', url: '/api/board/doc1/media/vid1' }, outcome: { code: 'FB.5.2.1', title: 'Kuvveti tanımlama' }, topicVideo: { url: '/api/board/doc1/topic/o1', seconds: 190 } },
  { position: 2, id: 'q2', stem: 'İkinci soru?', answer: 'A', options: [{ label: 'A', text: 'bir', image: null }, { label: 'B', text: 'iki', image: null }], images: [], solution: null, steps: [], solutionVideo: null, outcome: null, topicVideo: null },
] };
vi.mock('../src/api', () => ({ api: async () => lesson }));
(globalThis as any).fetch = vi.fn(async () => new Response('x'));
import { SmartBoard } from '../src/pages/SmartBoard';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const roots: any[] = [];
afterEach(async () => { for (const r of roots.splice(0)) await act(async () => r.unmount()); document.body.innerHTML = ''; });
const btn = (n: Element, t: string) => [...n.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(t)) as HTMLButtonElement;

it('runs a whole question on the board', async () => {
  const node = document.createElement('div'); document.body.append(node);
  const root = createRoot(node); roots.push(root);
  await act(async () => root.render(createElement(MemoryRouter, { initialEntries: ['/board/doc1'] }, createElement(Routes, null, createElement(Route, { path: '/board/:documentId', element: createElement(SmartBoard) })))));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  expect(node.querySelector('.sb-stem')?.textContent).toBe('Kapıyı çeken kuvvet hangisidir?');
  expect(node.querySelector('.sb-img img')?.getAttribute('src')).toBe('/api/board/doc1/media/img1');
  expect((globalThis as any).fetch).toHaveBeenCalledWith('/api/board/doc1/media/vid1', expect.anything());   // videos fetched ahead
  // the class chooses A, the teacher reveals: B lights up, A is marked wrong
  await act(async () => { ([...node.querySelectorAll('.sb-opt')][0] as HTMLButtonElement).click(); });
  expect(node.querySelector('.sb-opt.sel b')?.textContent).toBe('A');
  await act(async () => { btn(node, 'Cevabı göster').click(); });
  expect(node.querySelector('.sb-opt.right b')?.textContent).toBe('B');
  expect(node.querySelector('.sb-opt.wrong b')?.textContent).toBe('A');
  // solution step by step
  await act(async () => { btn(node, 'Çözümü başlat').click(); });
  expect([...node.querySelectorAll('.sb-solution li')].map((l) => l.textContent)).toEqual(['Kol kendine doğru gelir.']);
  await act(async () => { btn(node, 'Sonraki adım').click(); });
  expect(node.querySelectorAll('.sb-solution li')).toHaveLength(2);
  // the solution video plays in the board
  await act(async () => { btn(node, 'Çözüm videosu').click(); });
  expect(node.querySelector('.sb-video video')?.getAttribute('src')).toBe('/api/board/doc1/media/vid1');
  await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
  expect(node.querySelector('.sb-video')).toBeNull();
  await act(async () => { btn(node, 'Konuyu hatırlat').click(); });
  expect(node.querySelector('.sb-video video')?.getAttribute('src')).toBe('/api/board/doc1/topic/o1');
  await act(async () => { btn(node.querySelector('.sb-video')!, '').click(); });
  // presenter clicker: next question, everything resets
  await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown' })); });
  expect(node.querySelector('.sb-stem')?.textContent).toBe('İkinci soru?');
  expect(node.querySelector('.sb-opt.right')).toBeNull();
  expect(btn(node, 'Çözüm videosu')).toBeUndefined();
  await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' })); });
  expect(node.querySelector('.sb-dots button.on')?.textContent).toBe('1');
  // thinking time and pen
  await act(async () => { btn(node, '30 sn').click(); });
  expect(node.querySelector('.sb-timer')?.textContent).toBe('0:30');
  await act(async () => { (node.querySelector('.sb-pens button') as HTMLButtonElement).click(); });
  expect(node.querySelector('.sb.inking')).not.toBeNull();
  await act(async () => { btn(node, 'Kalemi bırak').click(); });
  expect(node.querySelector('.sb.inking')).toBeNull();
});
