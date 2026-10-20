// @vitest-environment happy-dom
import {act,createElement,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({api:vi.fn(),done:vi.fn()}));
vi.mock('../src/api',async()=>{const real=await vi.importActual<any>('../src/api');return {...real,api:mocks.api};});
import {QuestionBatchReview,BATCH_CHUNK} from '../src/components/QuestionBatchReview';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;

const labels={answerAndSolution:'Cevap',curriculum:'Program',ageAppropriate:'Yaş',originalityAndRights:'Hak'};
const q=(id:string,extra:any={})=>({id,review_status:'REVIEW',origin_kind:'AI_GENERATED',review_revision:3,reviewContext:[{outcomeId:'o'}],...extra});
beforeEach(()=>{vi.clearAllMocks();mocks.api.mockImplementation(async(_url:string,init:any)=>{const body=JSON.parse(init.body);return {ok:true,succeeded:body.items.length,results:body.items.map((i:any)=>({id:i.id,ok:true}))};});});

async function fixture(questions:any[],initial:string[]=[]){
 const node=document.createElement('div'),root=createRoot(node);document.body.append(node);
 function Host(){const [ids,setIds]=useState(new Set(initial));return createElement(QuestionBatchReview,{questions,selectedIds:ids,setSelectedIds:setIds,checkLabels:labels,onDone:mocks.done});}
 await act(async()=>root.render(createElement(Host)));
 const click=async(el:Element)=>act(async()=>{(el as HTMLElement).click();});
 const button=(text:string)=>[...node.querySelectorAll('button')].find(b=>b.textContent!.includes(text)) as HTMLButtonElement;
 const type=async(el:Element,value:string)=>act(async()=>{const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});
 return {node,click,button,type,close:async()=>{await act(async()=>root.unmount());node.remove();}};
}

it('select-all picks only questions still in review',async()=>{
 const f=await fixture([q('a'),q('b',{review_status:'APPROVED'}),q('c')]);try{
  expect(f.node.textContent).toContain('incelemede 2 soru · 0 seçili');
  await f.click(f.button('tümünü seç'));
  expect(f.node.textContent).toContain('incelemede 2 soru · 2 seçili');
 }finally{await f.close();}
});

it('keeps approval disabled until the checklist and justifications are completed once, then sends each question with its own revision and context',async()=>{
 const f=await fixture([q('a'),q('b')],['a','b']);try{
  expect(f.button('soruyu onayla').disabled).toBe(true);
  for(const box of f.node.querySelectorAll('.batch-review-checks input'))await f.click(box);
  expect(f.button('soruyu onayla').disabled).toBe(true);
  await f.click(f.button('Standart gerekçeleri doldur'));
  expect(f.button('soruyu onayla').disabled).toBe(false);
  await f.click(f.button('soruyu onayla'));
  expect(mocks.api).toHaveBeenCalledTimes(1);
  const [url,init]=mocks.api.mock.calls[0];
  expect(url).toBe('/api/question-bank-standard/review-batch');
  const body=JSON.parse(init.body);
  expect(body.status).toBe('APPROVED');
  expect(body.items).toEqual([{id:'a',expectedRevision:3,expectedContext:[{outcomeId:'o'}]},{id:'b',expectedRevision:3,expectedContext:[{outcomeId:'o'}]}]);
  expect(Object.values(body.checks)).toEqual([true,true,true,true]);
  expect(body.qualityReview.duplicateDisposition).toBe('NO_REPETITION_FOUND');
  expect(mocks.done).toHaveBeenCalledWith('2 soru onaylandı.');
 }finally{await f.close();}
});

it('splits large selections into server-sized chunks and lists failed questions with reasons',async()=>{
 const many=Array.from({length:BATCH_CHUNK+3},(_,i)=>q(`q${i}`));
 mocks.api.mockImplementation(async(_url:string,init:any)=>{const body=JSON.parse(init.body);return {ok:true,succeeded:body.items.length-(body.items.some((i:any)=>i.id==='q1')?1:0),results:body.items.map((i:any)=>i.id==='q1'?{id:'q1',ok:false,code:'COPYRIGHT_BLOCKED'}:{id:i.id,ok:true})};});
 const f=await fixture(many,many.map(x=>x.id));try{
  for(const box of f.node.querySelectorAll('.batch-review-checks input'))await f.click(box);
  await f.click(f.button('Standart gerekçeleri doldur'));
  await f.click(f.button('soruyu onayla'));
  expect(mocks.api).toHaveBeenCalledTimes(2);
  expect(JSON.parse(mocks.api.mock.calls[0][1].body).items).toHaveLength(BATCH_CHUNK);
  expect(JSON.parse(mocks.api.mock.calls[1][1].body).items).toHaveLength(3);
  expect(f.node.textContent).toContain('Kısıtlı telif (RESTRICTED)');
  expect(mocks.done).toHaveBeenCalledWith(`${BATCH_CHUNK+2} soru onaylandı; 1 soru işlenmedi (aşağıda nedenleri).`);
  expect(f.node.textContent).toContain('1 seçili');
 }finally{await f.close();}
});

it('requires a note to reject but can send to correction without the approval checklist',async()=>{
 const f=await fixture([q('a')],['a']);try{
  expect(f.button('Reddet').disabled).toBe(true);
  await f.click(f.button('Düzeltmeye gönder'));
  expect(JSON.parse(mocks.api.mock.calls[0][1].body)).toMatchObject({status:'DRAFT',items:[{id:'a'}]});
 }finally{await f.close();}
 const g=await fixture([q('b')],['b']);try{
  await g.type(g.node.querySelector('.batch-review-note input')!,'Bilimsel hata');
  expect(g.button('Reddet').disabled).toBe(false);
  await g.click(g.button('Reddet'));
  expect(JSON.parse(mocks.api.mock.calls[1][1].body)).toMatchObject({status:'REJECTED',note:'Bilimsel hata'});
 }finally{await g.close();}
});
