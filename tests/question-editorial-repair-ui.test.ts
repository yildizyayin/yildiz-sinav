// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
vi.mock('../src/api',()=>({api:vi.fn()}));
import {api} from '../src/api';
import {QuestionEditorialRepair} from '../src/components/QuestionEditorialRepair';
import {editorialQuestion} from './fixtures/editorial-question';
it('submits a complete packet against the frozen actual source and does not call generation or human approval',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const node=document.createElement('div'),root=createRoot(node),q:any=editorialQuestion();q.editorial.visual.values=[84];const source={repairable:true,presentation:'TABLE',sourceAuditId:'actual-audit',sourceHash:'a'.repeat(64),attemptCount:3,drafts:[q]};vi.mocked(api).mockImplementation(async(_path,options)=>options?.method==='POST'?{ok:true}:source as any);const saved=vi.fn(async()=>{});
 try{await act(async()=>root.render(createElement(QuestionEditorialRepair,{jobId:'job',onSaved:saved,onClose:()=>{}})));const button=[...node.querySelectorAll('button')].find(b=>b.textContent?.startsWith('Paketi kaydet'))!;expect(button.disabled).toBe(true);
 await act(async()=>{[...node.querySelectorAll('button')].find(b=>b.textContent?.includes('grafik alanlarını temizle'))!.click()});const field=[...node.querySelectorAll('textarea')].at(-1)!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(field,'Tablo dışındaki grafik alanları kaynak paket korunarak düzeltildi.');field.dispatchEvent(new Event('input',{bubbles:true}));});expect(button.disabled).toBe(false);await act(async()=>button.click());
 const post=vi.mocked(api).mock.calls.find(([,o])=>o?.method==='POST')!;expect(post[0]).toBe('/api/question-bank-standard/generation-jobs/job/repair');const b=JSON.parse(String(post[1]?.body));expect(b).toMatchObject({expectedSourceAuditId:'actual-audit',expectedSourceHash:'a'.repeat(64)});expect(b.drafts[0].editorial.visual.values).toEqual([]);expect(b).not.toHaveProperty('humanApproved');expect(saved).toHaveBeenCalledOnce();expect(vi.mocked(api).mock.calls.some(([p])=>String(p).endsWith('/run')||String(p).endsWith('/review'))).toBe(false);
 }finally{await act(async()=>root.unmount());vi.clearAllMocks()}
});
