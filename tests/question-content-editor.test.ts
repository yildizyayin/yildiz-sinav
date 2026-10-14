// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,it,expect,vi} from 'vitest';
vi.mock('../src/api',()=>({api:vi.fn()}));
import {api} from '../src/api';
import {QuestionContentEditor} from '../src/components/QuestionContentEditor';
const nodes:HTMLElement[]=[];
afterEach(()=>{nodes.splice(0).forEach(n=>n.remove());vi.clearAllMocks()});
it('binds edits to the displayed revision and does not carry dirty content to a different question',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const node=document.createElement('div');document.body.append(node);nodes.push(node);const root=createRoot(node);
 const question={id:'q1',review_revision:4,question_type:'MULTIPLE_CHOICE',content_mode:'TEXT',review_status:'REVIEW',stem_text:'Old stem',solution_text:'Old solution',correct_answer:'A',options:['1','2','3','4']};
 const saved=vi.fn(async()=>{});vi.mocked(api).mockResolvedValue({ok:true});
 const render=(q:any)=>act(async()=>root.render(createElement(QuestionContentEditor,{key:q.id+':'+q.review_revision,question:q,onSaved:saved})));
 await render(question);await act(async()=>{(node.querySelector('button') as HTMLButtonElement).click()});
 const fields=node.querySelectorAll('textarea');await act(async()=>{const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!;setter.call(fields[2],'Metin yanlışlığı düzeltildi.');fields[2].dispatchEvent(new Event('input',{bubbles:true}));});
 const save=[...node.querySelectorAll('button')].find(b=>b.textContent?.includes('Kaydet ve'))!;
 expect(save.disabled).toBe(false);await act(async()=>save.click());
 expect(JSON.parse((vi.mocked(api).mock.calls[0][1] as any).body)).toMatchObject({expectedRevision:4,stemText:'Old stem',editNote:'Metin yanlışlığı düzeltildi.'});expect(saved).toHaveBeenCalledTimes(1);
 await render({...question,id:'q2',stem_text:'Second stem'});await act(async()=>{(node.querySelector('button') as HTMLButtonElement).click()});expect((node.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Second stem');expect((node.querySelectorAll('textarea')[2] as HTMLTextAreaElement).value).toBe('');
 await act(async()=>root.unmount());
});
