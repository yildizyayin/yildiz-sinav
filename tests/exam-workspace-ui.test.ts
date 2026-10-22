// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ExamCenterHub } from '../src/pages/ExamCenterHub';
import { ExamDetail } from '../src/pages/ExamDetail';
const state=vi.hoisted(()=>({api:vi.fn(),role:'SUPER_ADMIN'}));
vi.mock('../src/api',()=>({api:state.api,qs:()=>''}));
vi.mock('../src/auth',()=>({useAuth:()=>({user:{role:state.role}})}));
let root:Root,container:HTMLDivElement;
const exam={id:'exam-1',title:'TYT Deneme 1',exam_type:'TYT',academic_year:'2026-2027',grade_level:12,status:'ACTIVE',owner_type:'CENTRAL'};
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;state.role='SUPER_ADMIN';state.api.mockReset();state.api.mockImplementation(async(path:string)=>{
 if(path.endsWith('/catalog'))return {exams:[{...exam,booklet_codes:'A,B',participant_count:45}]};
 if(path.endsWith('/channels'))return {savedRevision:4,channels:[{channel:'RESULT_NETWORK',status:'PENDING_UPDATE'}]};
 if(path.endsWith('/schedule'))return {schedule:{result_freeze_status:'PUBLISHED'}};
 if(path.endsWith('/outcome-catalog'))return {outcomes:[]};
 if(path.endsWith('/outcome-mappings'))return {revision:1,questions:[]};
 return {exam,subjects:[],booklets:[{code:'A'},{code:'B'}],readiness:{ready_to_publish:true}};
 });container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
async function render(path:string){await act(async()=>root.render(createElement(MemoryRouter,{initialEntries:[path]},createElement(Routes,{},createElement(Route,{path:'/exam-center',element:createElement(ExamCenterHub)}),createElement(Route,{path:'/exam-center/:examId',element:createElement(ExamDetail)}),createElement(Route,{path:'/exam-channels',element:createElement('p',{},'Kanal yönetimi')})))));}
const button=(text:string)=>[...container.querySelectorAll('button')].find(b=>b.textContent?.trim()===text)!;
it('uses a compact searchable table with no planet hero',async()=>{await render('/exam-center');expect(container.querySelector('.exam-mars-hero')).toBeNull();expect(container.querySelector('table')).not.toBeNull();expect(container.textContent).toContain('TYT Deneme 1');const input=container.querySelector('input')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'not found');input.dispatchEvent(new Event('input',{bubbles:true}));});expect(container.querySelector('a[href="/exam-channels"]')).not.toBeNull();});
it('opens published outcome editing without reopening results and shows pending publication review',async()=>{await render('/exam-center/exam-1');expect(container.textContent).toContain('Sonuç yayını güncel değil');await act(async()=>button('Kazanımlar').click());expect(container.textContent).toContain('Kazanım eşleştirmeleri');expect(state.api.mock.calls.some(([path])=>path.endsWith('/outcome-catalog'))).toBe(true);expect(state.api.mock.calls.some(([,o])=>o?.method)).toBe(false);});
it('moves an active exam to the explicit trash scope with a reversible endpoint',async()=>{await render('/exam-center/exam-1?action=trash');expect(container.querySelector('[role=dialog]')).not.toBeNull();const select=container.querySelector('[role=dialog] select') as HTMLSelectElement;await act(async()=>{select.value='BOTH';select.dispatchEvent(new Event('change',{bubbles:true}));});await act(async()=>button('Çöp kutusuna taşı').click());expect(state.api).toHaveBeenCalledWith('/api/admin/exams/exam-1/trash',{method:'POST',body:JSON.stringify({scope:'BOTH'})});expect(state.api.mock.calls.some(([,o])=>o?.method==='DELETE')).toBe(false);});
it('does not offer channel or trash management to institution managers',async()=>{state.role='INSTITUTION_MANAGER';await render('/exam-center/exam-1?action=trash');expect(container.querySelector('[role=dialog]')).toBeNull();expect(container.querySelector('a[href^="/exam-channels"]')).toBeNull();expect(state.api.mock.calls.some(([path])=>path.includes('/api/admin/'))).toBe(false);});
it('A032: status labels, closed and archive filters, and a hint when the app channel is down',async()=>{
 state.api.mockImplementation(async(path:string)=>{
  if(path.includes('/catalog?archived=1'))return {exams:[{...exam,id:'old',title:'Eski Deneme',status:'ARCHIVED',participant_count:3}]};
  if(path.endsWith('/catalog'))return {exams:[{...exam,booklet_codes:'A',participant_count:45},{...exam,id:'c',title:'Kapanan Deneme',status:'CLOSED',participant_count:9,app_channel_status:'ARCHIVED'}]};
  return {};
 });
 await render('/exam-center');
 expect(container.textContent).toContain('Kapandı');expect(container.textContent).not.toContain('CLOSED');
 expect(container.textContent).toContain('Kurumlara yayında değil');
 const select=container.querySelector('select')!;
 await act(async()=>{select.value='CLOSED';select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(container.textContent).toContain('Kapanan Deneme');expect(container.textContent).not.toContain('TYT Deneme 1');
 await act(async()=>{select.value='ARCHIVED';select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(state.api.mock.calls.some(([path])=>path.endsWith('/catalog?archived=1'))).toBe(true);
 expect(container.textContent).toContain('Eski Deneme');expect(container.textContent).toContain('Arşivde');
 expect([...container.querySelectorAll('a')].some(a=>a.getAttribute('href')==='/exam-center/old')).toBe(true);
});
