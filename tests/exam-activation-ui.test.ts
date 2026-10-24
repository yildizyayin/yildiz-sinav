// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ExamDetail } from '../src/pages/ExamDetail';
import { ExamDefinitions } from '../src/pages/ExamDefinitions';
import { ApiError } from '../src/api';

const state = vi.hoisted(() => ({ api: vi.fn(), role: 'SUPER_ADMIN' }));
vi.mock('../src/api', async (importOriginal) => ({ ...await importOriginal<typeof import('../src/api')>(), api: state.api, qs: () => '' }));
vi.mock('../src/auth', () => ({ useAuth: () => ({ user: { role: state.role } }) }));
let root: Root, container: HTMLDivElement;
let status: string, ready: boolean;
function action(text: string) { return [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === text)!; }
async function render() {
  await act(async () => root.render(createElement(MemoryRouter, { initialEntries: ['/exam-center/synthetic-exam'] },
    createElement(Routes, {}, createElement(Route, { path: '/exam-center/:examId', element: createElement(ExamDetail) })) )));
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  state.role = 'SUPER_ADMIN'; status = 'DRAFT'; ready = true;
  state.api.mockReset();
  state.api.mockImplementation(async (path: string, options?: RequestInit) => {
    if (options?.method === 'PATCH') { status = 'ACTIVE'; return { ok: true }; }
    if (path.endsWith('/schedule')) return { schedule: { result_freeze_status: 'OPEN' } };
    return { exam: { id: 'synthetic-exam', title: 'Synthetic exam', status, owner_type: 'CENTRAL' }, subjects: [], booklets: [{ code: 'A' }], readiness: { ready_to_publish: ready, blockers: ready ? [] : [{ code: 'ANSWER_KEYS_INCOMPLETE', message: 'B kitapçığında 5 cevap eksik.' }] } };
  });
  vi.stubGlobal('confirm', vi.fn(() => true));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it('explains a blocked draft and prevents evaluation until it is ready', async () => {
  ready = false; await render();
  expect(container.textContent).toContain('B kitapçığında 5 cevap eksik.');
  expect(action('Sınavı aktifleştir').disabled).toBe(false);
  await act(async () => action('Sınavı aktifleştir').click());
  expect(globalThis.confirm).not.toHaveBeenCalled();
  expect(container.querySelector('a[href*="fix=ANSWER_KEYS_INCOMPLETE"]')).not.toBeNull();
  expect(container.querySelector('a[href*="mode=upload"]')).toBeNull();
  expect(state.api.mock.calls.every(([, options]) => !options?.method)).toBe(true);
});
it('activates only after a deliberate action and leaves results unpublished', async () => {
  await render();
  expect(status).toBe('DRAFT');
  await act(async () => action('Sınavı aktifleştir').click());
  expect(state.api).toHaveBeenCalledWith('/api/exam-definitions/synthetic-exam/status', { method: 'PATCH', body: JSON.stringify({ status: 'ACTIVE' }) });
  expect(container.textContent).toContain('Değerlendirmeye açık');
  expect(container.querySelector('a[href*="mode=upload"]')).not.toBeNull();
  expect(action('Şimdi yayınla').disabled).toBe(true);
  expect(state.api.mock.calls.some(([path]) => path.endsWith('/publish'))).toBe(false);
});
it('retains the draft and displays the server failure on rejected activation', async () => {
  await render();
  state.api.mockImplementationOnce(async () => { throw new Error('Kurum dağıtımı eksik.'); });
  await act(async () => action('Sınavı aktifleştir').click());
  expect(container.textContent).toContain('Kurum dağıtımı eksik.');
  expect(status).toBe('DRAFT');
  expect(container.querySelector('a[href*="mode=upload"]')).toBeNull();
});
it('does not offer central exam activation to an institution manager', async () => {
  state.role = 'INSTITUTION_MANAGER'; await render();
  expect(action('Sınavı aktifleştir')).toBeUndefined();
});
it('opens the requested draft for editing and preserves its original card and scoring profile', async () => {
  state.api.mockImplementation(async (path: string, options?: RequestInit) => {
    if (options?.method === 'PATCH') return { ok: true };
    if (path.includes('/options')) return { subjects: [], outcomes: [], institutions: [], scoringVersions: [{ id: 'default-rule', rule_code: 'SCHOOL_100' }, { id: 'saved-rule', rule_code: 'CUSTOM_EXAM' }] };
    if (path === '/api/exam-definitions') return { exams: [] };
    if (path.startsWith('/api/exam-content')) return { assets: [], videos: [] };
    return { exam: { id: 'synthetic-exam', title: 'Original stored exam', academic_year: '2025-2026', exam_date: '2026-05-10', grade_level: 7, exam_type: 'STANDARD', owner_type: 'CENTRAL', publisher_name: 'Synthetic publisher', session_label: 'Session', status: 'DRAFT', scoring_rule_version_id: 'saved-rule' }, subjects: [], booklets: [], answerKey: [], institutions: [], readiness: { ready_to_publish: false } };
  });
  await act(async () => root.render(createElement(MemoryRouter, { initialEntries: ['/exam-definitions?examId=synthetic-exam'] }, createElement(ExamDefinitions))));
  expect(container.textContent).toContain('Original stored exam');
  await act(async () => action('Kartı güncelle').click());
  const write = state.api.mock.calls.find(([, options]) => options?.method === 'PATCH');
  expect(write).toBeTruthy();
  expect(JSON.parse(write![1].body)).toMatchObject({ title: 'Original stored exam', examDate: '2026-05-10', publisherName: 'Synthetic publisher', scoringRuleVersionId: 'saved-rule' });
});


it('shows current server blockers when a ready detail receives a 409', async () => {
  await render();
  state.api.mockRejectedValueOnce(new ApiError(409, {code:'EXAM_NOT_READY',message:'Kurum dağıtımı eksik.',details:{ready_to_publish:false,blockers:[{code:'INSTITUTION_ASSIGNMENT_REQUIRED',message:'Kurum dağıtımı eksik.'}]}}));
  await act(async () => action('Sınavı aktifleştir').click());
  expect(container.textContent).toContain('Kurum dağıtımı eksik.');
  expect(container.querySelector('a[href*="fix=INSTITUTION_ASSIGNMENT_REQUIRED"]')).not.toBeNull();
  expect(status).toBe('DRAFT');
});

it('keeps a cancelled activation read-only', async () => {
  vi.stubGlobal('confirm',vi.fn(()=>false)); await render();
  await act(async () => action('Sınavı aktifleştir').click());
  expect(state.api.mock.calls.every(([,options])=>!options?.method)).toBe(true);
});

it('shows blockers outside general and routes scoring fixes to the saved profile', async () => {
  state.api.mockImplementation(async (path:string) => {
    if(path.includes('/options')) return {subjects:[],outcomes:[],institutions:[],scoringVersions:[{id:'saved',rule_code:'SCHOOL_100'}]};
    if(path==='/api/exam-definitions') return {exams:[]};
    if(path.startsWith('/api/exam-content')) return {assets:[],videos:[]};
    return {exam:{id:'synthetic-exam',title:'Stored',academic_year:'2026-2027',grade_level:7,exam_type:'STANDARD',owner_type:'CENTRAL',status:'DRAFT',scoring_rule_version_id:'saved'},subjects:[],booklets:[],answerKey:[],institutions:[],readiness:{ready_to_publish:false,blockers:[{code:'SCORING_VERIFICATION_REQUIRED',message:'Puanlama doğrulanmalı.'}]}};
  });
  await act(async () => root.render(createElement(MemoryRouter,{initialEntries:['/exam-definitions?examId=synthetic-exam']},createElement(ExamDefinitions))));
  await act(async () => action('Belgeler ve optik').click());
  await act(async () => action('Sınavı aktifleştir').click());
  const fixes=[...container.querySelectorAll('button')].filter(b=>b.textContent==='Düzelt');
  const visible=fixes.find(b=>!b.closest('[hidden]'))!;
  expect(visible).toBeTruthy();
  await act(async () => visible.click());
  expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Sınav bilgileri');
  expect(state.api.mock.calls.every(([,options])=>!options?.method)).toBe(true);
});


it('sends only one activation while the first request is still pending', async () => {
  await render();
  let finish!: (value: unknown) => void;
  state.api.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => { action('Sınavı aktifleştir').click(); action('Sınavı aktifleştir').click(); });
  expect(state.api.mock.calls.filter(([,options]) => options?.method === 'PATCH')).toHaveLength(1);
  expect(action('Sınavı aktifleştir').disabled).toBe(true);
  await act(async () => finish({ok:true}));
});
