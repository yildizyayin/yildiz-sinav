// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({api:vi.fn(),locked:false}));
vi.mock('../src/api',async()=>{const real=await vi.importActual<any>('../src/api');return {...real,api:mocks.api};});
import {StudioPreview} from '../src/components/StudioPreview';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;

let current='a';const posted:any[]=[];
beforeEach(()=>{current='a';posted.length=0;mocks.locked=false;mocks.api.mockReset();mocks.api.mockImplementation(async(url:string,init?:any)=>{
 if(url.includes('/swap')){posted.push(JSON.parse(init.body));current='good';return {from:'a',to:'good',sameOutcome:true,sameDifficulty:true,invalidatedPdfs:true};}
 return {booklet:'A',locked:mocks.locked,results:mocks.locked?3:0,printed:true,items:[{position:1,id:current,stem:current==='a'?'Eski soru kökü':'Yeni soru kökü',options:[{label:'A',text:'bir'},{label:'B',text:'iki'}],correctAnswer:'B',band:'MEDIUM',outcomes:'T.5.1.1'}]};
});});
const doc={id:'doc',title:'Deneme',config_json:'{"bookletCodes":["A","B"]}'};
async function mount(){const node=document.createElement('div'),root=createRoot(node);document.body.append(node);await act(async()=>root.render(createElement(StudioPreview,{document:doc,onClose:()=>{}})));
 const btn=(t:string)=>[...node.querySelectorAll('button')].find(b=>b.textContent!.includes(t)) as HTMLButtonElement;return {node,btn,close:async()=>{await act(async()=>root.unmount());node.remove();}};}

it('shows the booklet with outcome, difficulty and the correct option, swaps in place and warns that printed PDFs are now invalid',async()=>{
 const f=await mount();try{
  expect(f.node.textContent).toContain('Eski soru kökü');expect(f.node.textContent).toContain('T.5.1.1');expect(f.node.textContent).toContain('Orta');
  expect(f.node.querySelector('.studio-preview-options li.correct')!.textContent).toContain('iki');
  expect(f.node.textContent).toContain('PDF\'i indirilmiş');
  await act(async()=>f.btn('Değiştir').click());
  expect(posted[0]).toEqual({questionId:'a',sameDifficulty:true});
  expect(f.node.textContent).toContain('Yeni soru kökü');
  expect(f.node.textContent).toContain('1. soru değiştirildi (aynı kazanım, aynı zorluk)');expect(f.node.textContent).toContain('yeniden indirip basın');
 }finally{await f.close();}
});

it('offers no swap once results exist',async()=>{
 mocks.locked=true;const f=await mount();try{
  expect(f.node.textContent).toContain('3 öğrenci sonucu var');expect(f.btn('Değiştir')).toBeUndefined();
 }finally{await f.close();}
});
