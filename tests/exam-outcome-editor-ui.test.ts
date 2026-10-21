// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ExamOutcomeEditor } from '../src/components/ExamOutcomeEditor';
import { ExamSaveReview, reviewExamInputs } from '../src/components/ExamSaveReview';
const state = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../src/api', () => ({ api: state.api }));
let root: Root, container: HTMLDivElement;
const catalog=[{id:'out-1',subject_id:'math',code:'M.7.1',title:'Rasyonel sayıları karşılaştırır.'},{id:'out-2',subject_id:'math',code:'M.7.2',title:'Rasyonel sayılarla işlem yapar.'}];
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.append(container);root=createRoot(container);state.api.mockReset();state.api.mockImplementation(async(path:string, options?:RequestInit)=>{
 if(path.endsWith('/outcome-catalog')) return {outcomes:catalog};
 if(path.endsWith('/outcome-match-preview')) return {matches:[{subjectId:'math',questionNo:1,reason:'AMBIGUOUS',suggestions:catalog}]};
 if(options?.method==='PUT') return {ok:true};
 return {revision:4,outcomeMode:'OPTIONAL',questions:[{id:'q1',subject_id:'math',subject_name:'Matematik',question_no:1,outcome_ids:[],references:[{publisherTitle:'Sayıları karşılaştırır.'}]}]};
});});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const button=(text:string)=>[...container.querySelectorAll('button')].find(b=>b.textContent?.trim()===text)!;
it('shows manual verified catalog and keeps strict policy off independently of imported references',async()=>{
 await act(async()=>root.render(createElement(ExamOutcomeEditor,{examId:'active-exam'})));
 expect(container.textContent).toContain('M.7.1');
 expect((container.querySelector('input[type=checkbox]') as HTMLInputElement).checked).toBe(false);
 expect(container.textContent).toContain('Matematik');
 const select=container.querySelector('select[multiple]') as HTMLSelectElement;
 await act(async()=>{select.options[0].selected=true;select.dispatchEvent(new Event('change',{bubbles:true}));});
 await act(async()=>button('Kazanımları kaydet').click());
 const write=state.api.mock.calls.find(([,options])=>options?.method==='PUT');
 expect(write?.[0]).toBe('/api/exam-definitions/active-exam/outcome-mappings');
 expect(JSON.parse(write![1].body)).toEqual({expectedRevision:4,mappings:[{questionId:'q1',outcomeIds:['out-1']}],outcomeMode:'OPTIONAL'});
 expect(state.api.mock.calls.some(([path])=>path.includes('/answer-key')||path.includes('reopen-results'))).toBe(false);
});
it('presents ambiguous candidates without automatically selecting one',async()=>{
 await act(async()=>root.render(createElement(ExamOutcomeEditor,{examId:'published-exam'})));
 await act(async()=>button('Otomatik eşleştir').click());
 expect(container.textContent).toContain('Birden fazla aday var');
 expect((container.querySelector('select[multiple]') as HTMLSelectElement).selectedOptions.length).toBe(0);
 await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent?.startsWith('Öneri: M.7.2 · '))!.click());
 expect((container.querySelector('select[multiple]') as HTMLSelectElement).value).toBe('out-2');
});
it('keeps failed saves visible and never claims success',async()=>{
 await act(async()=>root.render(createElement(ExamOutcomeEditor,{examId:'active-exam'})));
 state.api.mockImplementationOnce(async()=>{throw new Error('Kazanımlar değişti. Güncel eşleştirmeleri yeniden açın.');});
 await act(async()=>button('Kazanımları kaydet').click());
 expect(container.querySelector('[role=alert]')?.textContent).toContain('Kazanımlar değişti');
 expect(container.textContent).not.toContain('Kazanım eşleştirmeleri kaydedildi.');
});
it('reviews each booklet independently and allows creation with optional outcome warnings',async()=>{
 const review=reviewExamInputs([{subjectId:'math',questionCount:2,optionCount:4}], 'A,B,C,D', [{subjectId:'math',bookletCode:'A',answers:'AB'},{subjectId:'math',bookletCode:'B',answers:'CE'},{subjectId:'math',bookletCode:'C',answers:'DC'},{subjectId:'math',bookletCode:'D',answers:'AA'}],[]);
 expect(review.keyChecks.map(k=>k.complete)).toEqual([true,false,true,true]);
 const confirm=vi.fn();await act(async()=>root.render(createElement(ExamSaveReview,{review,strict:false,busy:false,onCancel:vi.fn(),onConfirm:confirm})));
 expect(container.querySelectorAll('.exam-review-check.ok')).toHaveLength(3);
 expect(container.querySelectorAll('.exam-review-check.error')).toHaveLength(1);
 expect(container.querySelectorAll('.exam-review-check.warn')).toHaveLength(1);
 await act(async()=>button('Yine de oluştur').click());expect(confirm).toHaveBeenCalledOnce();
});
it('shows chosen outcomes as removable chips, counts unsaved changes, and a reopened editor shows what was saved',async()=>{
 let stored:string[]=[];
 state.api.mockImplementation(async(path:string,options?:RequestInit)=>{
  if(path.endsWith('/outcome-catalog'))return {outcomes:catalog.map((o,i)=>({...o,unit:i?'2. Ünite':'1. Ünite'}))};
  if(options?.method==='PUT'){stored=JSON.parse(String(options.body)).mappings[0].outcomeIds;return {ok:true};}
  return {revision:1,outcomeMode:'OPTIONAL',questions:[{id:'q1',subject_id:'math',subject_name:'Matematik',question_no:1,outcome_ids:[...stored],references:[]}]};
 });
 await act(async()=>root.render(createElement(ExamOutcomeEditor,{examId:'e'})));
 expect([...container.querySelectorAll('optgroup')].map(g=>g.label)).toEqual(['1. Ünite','2. Ünite']);
 const select=container.querySelector('select[multiple]') as HTMLSelectElement;
 await act(async()=>{select.options[0].selected=true;select.options[1].selected=true;select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect([...container.querySelectorAll('.exam-outcome-chip')].map(c=>c.firstChild!.textContent)).toEqual(['M.7.1','M.7.2']);
 expect(container.textContent).toContain('1 soruda kaydedilmemiş değişiklik');
 await act(async()=>(container.querySelector('button[aria-label="M.7.1 kazanımını kaldır"]') as HTMLButtonElement).click());
 await act(async()=>button('Kazanımları kaydet').click());
 expect(stored).toEqual(['out-2']);
 expect(container.textContent).not.toContain('kaydedilmemiş');
 await act(async()=>root.unmount());root=createRoot(container);
 await act(async()=>root.render(createElement(ExamOutcomeEditor,{examId:'e'})));
 expect([...container.querySelectorAll('.exam-outcome-chip')].map(c=>c.firstChild!.textContent)).toEqual(['M.7.2']);
});
it('A029: an exam with results says before saving that results are re-analysed, and after saving how many', async () => {
 state.api.mockImplementation(async (path: string, options?: RequestInit) => {
  if (path.endsWith('/outcome-catalog')) return { outcomes: catalog };
  if (options?.method === 'PUT') return { ok: true, revision: 3, participantCount: 42, scoresChanged: false };
  return { revision: 2, resultCount: 42, appPublished: true, networkPublished: true, outcomeMode: 'OPTIONAL', questions: [{ id: 'q1', subject_id: 'math', subject_name: 'Matematik', question_no: 1, outcome_ids: [], references: [] }] };
 });
 await act(async () => root.render(createElement(ExamOutcomeEditor, { examId: 'evaluated' })));
 const note = container.querySelector('[role=note]')!.textContent!;
 expect(note).toContain('42 sonucu var');
 expect(note).toContain('puan, net ve sıralama değişmez');
 expect(note).toContain('Sonuç ağı, siz yayını güncelleyene kadar önceki analizi gösterir');
 await act(async () => button('Kazanımları kaydet').click());
 const status = container.querySelector('.alert.success')!.textContent!;
 expect(status).toContain('42 katılımcının kazanım analizi yeniden yapıldı (analiz sürümü 3)');
 expect(status).toContain('Sonuç ağında eski analiz kalır');
});
it('A029: an exam without results shows no re-analysis note', async () => {
 await act(async () => root.render(createElement(ExamOutcomeEditor, { examId: 'fresh' })));
 expect(container.querySelector('[role=note]')).toBeNull();
 await act(async () => button('Kazanımları kaydet').click());
 expect(container.querySelector('.alert.success')!.textContent).toBe('Kazanım eşleştirmeleri kaydedildi.');
});
