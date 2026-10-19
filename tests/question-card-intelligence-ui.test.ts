// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
import {QuestionCardIntelligence} from '../src/components/QuestionCardIntelligence';
const mocked=vi.hoisted(()=>({api:vi.fn()}));vi.mock('../src/api',()=>({api:mocked.api}));
const data=(id:string)=>({questionId:id,revision:1,outcomes:[],priorLearning:{references:[],note:'Doğrulanmalı'},difficulty:{level:3},history:{fromYear:2022,toYear:2026,families:[],facts:[],note:'Kayıt yok'},prediction:{note:'Doğrulanmış tahmin modeli yok'}});
it('never presents an old question response after selection changes, and shows retrieval errors explicitly',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;let resolveA:(x:any)=>void=()=>{};mocked.api.mockImplementationOnce(()=>new Promise(r=>{resolveA=r})).mockResolvedValueOnce(data('b')).mockRejectedValueOnce(new Error('Kaynak okunamadı'));
 const node=document.createElement('div'),root=createRoot(node);
 await act(async()=>root.render(createElement(QuestionCardIntelligence,{questionId:'a',revision:1})));
 await act(async()=>root.render(createElement(QuestionCardIntelligence,{questionId:'b',revision:1})));
 await act(async()=>resolveA({...data('a'),priorLearning:{references:['ESKI SORU'],note:''}}));expect(node.textContent).not.toContain('ESKI SORU');expect(node.textContent).toContain('Doğrulanmış tahmin modeli yok');
 await act(async()=>root.render(createElement(QuestionCardIntelligence,{questionId:'c',revision:1})));expect(node.querySelector('[role=alert]')?.textContent).toBe('Kaynak okunamadı');await act(async()=>root.unmount());
});
