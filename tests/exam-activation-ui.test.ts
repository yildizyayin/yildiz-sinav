// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ExamDetail } from '../src/pages/ExamDetail';
import { ExamDefinitions } from '../src/pages/ExamDefinitions';

const state = vi.hoisted(() => ({ api: vi.fn(), role: 'SUPER_ADMIN' }));
vi.mock('../src/api', () => ({ api: state.api, qs: () => '' }));
vi.mock('../src/auth', () => ({ useAuth: () => ({ user: { role: state.role } }) }));
let root: Root, container: HTMLDivElement;
let status: string, ready: boolean;
let blockers: Array<{code:string;message:string}>;
function action(text: string) { return [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === text)!; }
async function render() {
  await act(async () => root.render(createElement(MemoryRouter, { initialEntries: ['/exam-center/synthetic-exam'] },
    createElement(Routes, {}, createElement(Route, { path: '/exam-center/:examId', element: createElement(ExamDetail) })) )));
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  state.role = 'SUPER_ADMIN'; status = 'DRAFT'; ready = true;
  blockers = [{ code: 'INCOMPLETE_ANSWER_KEY', message: 'B kitapçığında 5 cevap eksik.' }];
  state.api.mockReset();
  state.api.mockImplementation(async (path: string, options?: RequestInit) => {
    if (options?.method === 'PATCH') { status = 'ACTIVE'; return { ok: true }; }
    if (path.endsWith('/schedule')) return { schedule: { result_freeze_status: 'OPEN' } };
    return { exam: { id: 'synthetic-exam', title: 'Synthetic exam', status, owner_type: 'CENTRAL' }, subjects: [], booklets: [{ code: 'A' }], readiness: { ready_to_publish: ready, blockers: ready ? [] : blockers } };
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
  expect(container.textContent).toContain('Önce aktifleştirme');
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

it('keeps activation blockers visible on another detail tab and links every blocker to its editor', async () => {
  ready = false;
  const targets: Record<string,string> = { SUBJECTS_REQUIRED:'key', BOOKLETS_REQUIRED:'key', QUESTION_STRUCTURE_INCOMPLETE:'key', ANSWER_KEYS_INCOMPLETE:'key', SCORING_VERIFICATION_REQUIRED:'general', OUTCOMES_REQUIRED:'outcomes', INSTITUTION_ASSIGNMENT_REQUIRED:'key' };
  blockers = Object.keys(targets).map(code => ({code,message:code}));
  await render();
  await act(async () => action('Uygulama ve yayın').click());
  expect(action('Sınavı aktifleştir').closest('[hidden]')).toBeNull();
  for (const [code,section] of Object.entries(targets)) {
    const link = container.querySelector(`a[aria-label="Düzelt: ${code}"]`)!;
    expect(link.closest('[hidden]')).toBeNull();
    expect(link.getAttribute('href')).toContain(`examId=synthetic-exam&section=${section}&focus=exam-`);
  }
});
it('shows fresh 409 blockers and a nonempty fallback when the server message is empty', async () => {
  await render();
  state.api.mockImplementationOnce(async () => { throw {status:409,message:'',details:{ready_to_publish:false,blockers:[{code:'INSTITUTION_ASSIGNMENT_REQUIRED',message:'Yeni kurum dağıtımı eksik.'}]}}; });
  await act(async () => action('Sınavı aktifleştir').click());
  expect(container.textContent).toContain('Sınav aktifleştirilemedi.');
  expect(container.textContent).toContain('Yeni kurum dağıtımı eksik.');
  expect(container.querySelector('a[aria-label="Düzelt: Yeni kurum dağıtımı eksik."]')?.getAttribute('href')).toContain('focus=exam-institution-assignment');
  expect(status).toBe('DRAFT');
});
async function renderBlockedDefinition(section='content', isReady=false) {
  state.api.mockImplementation(async (path: string, options?: RequestInit) => {
    if(options?.method === 'PATCH') return {ok:true};
    if(path.includes('/options')) return {subjects:[],outcomes:[],institutions:[],scoringVersions:[]};
    if(path === '/api/exam-definitions') return {exams:[]};
    if(path.startsWith('/api/exam-content')) return {assets:[],videos:[]};
    return {exam:{id:'synthetic-exam',title:'Blocked draft',academic_year:'2026-2027',grade_level:7,exam_type:'STANDARD',owner_type:'CENTRAL',status:'DRAFT'},subjects:[],booklets:[],answerKey:[],institutions:[],readiness:{ready_to_publish:isReady,blockers}};
  });
  await act(async () => root.render(createElement(MemoryRouter,{initialEntries:[`/exam-definitions?examId=synthetic-exam&section=${section}`]},createElement(ExamDefinitions))));
}
it('explains blocked activation from any definitions tab without sending PATCH', async () => {
  blockers=[{code:'ANSWER_KEYS_INCOMPLETE',message:'A kitapçığı eksik.'},{code:'SCORING_VERIFICATION_REQUIRED',message:'Profil eksik.'},{code:'INSTITUTION_ASSIGNMENT_REQUIRED',message:'Kurum eksik.'}];
  await renderBlockedDefinition();
  expect(action('Sınavı aktifleştir').disabled).toBe(false);
  expect(container.querySelector('button[aria-label="Düzelt: A kitapçığı eksik."]')?.closest('[hidden]')).toBeNull();
  await act(async () => action('Sınavı aktifleştir').click());
  expect(state.api.mock.calls.some(([,options])=>options?.method==='PATCH')).toBe(false);
  await act(async () => (container.querySelector('button[aria-label="Düzelt: A kitapçığı eksik."]') as HTMLButtonElement).click());
  expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Cevap anahtarı');
  await act(async () => (container.querySelector('button[aria-label="Düzelt: Profil eksik."]') as HTMLButtonElement).click());
  expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Sınav bilgileri');
  await act(async () => (container.querySelector('button[aria-label="Düzelt: Kurum eksik."]') as HTMLButtonElement).click());
  expect(container.querySelector('#exam-institution-assignment')).not.toBeNull();
  expect(container.querySelector('#exam-institution-assignment')?.closest('[hidden]')).toBeNull();
});
it('displays a definitions activation conflict without changing the draft', async () => {
  blockers=[];await renderBlockedDefinition('general',true);
  state.api.mockImplementationOnce(async()=>{throw {status:409,message:'Cevap anahtarı değişti.',details:{ready_to_publish:false,blockers:[{code:'ANSWER_KEYS_INCOMPLETE',message:'B anahtarı eksik.'}]}};});
  await act(async()=>action('Sınavı aktifleştir').click());
  expect(container.textContent).toContain('Cevap anahtarı değişti.');
  expect(container.textContent).toContain('B anahtarı eksik.');
  expect(container.querySelector('button[aria-label="Düzelt: B anahtarı eksik."]')).not.toBeNull();
});
