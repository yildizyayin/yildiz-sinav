// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({api:vi.fn(),params:new URLSearchParams(),setParams:vi.fn()}));
vi.mock('../src/api',async()=>{const real=await vi.importActual<any>('../src/api');return {...real,api:mocks.api};});
vi.mock('../src/auth',()=>({useAuth:()=>({user:{id:'u1',role:'INSTITUTION_MANAGER',institution_id:'instX'}})}));
vi.mock('react-router-dom',()=>({Link:(p:any)=>createElement('a',p),useNavigate:()=>()=>{},useSearchParams:()=>[mocks.params,(next:any)=>{mocks.setParams(next);mocks.params=new URLSearchParams(typeof next==='function'?next(mocks.params):next);}]}));
vi.mock('../src/components/ExamReadiness',()=>({ExamReadiness:()=>null}));
vi.mock('../src/components/ExamOutcomeEditor',()=>({ExamOutcomeEditor:()=>null}));
vi.mock('../src/components/ExamChannelNotice',()=>({ExamChannelNotice:()=>null}));
import {ExamDefinitions} from '../src/pages/ExamDefinitions';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;

const examRow={id:'ex1',title:'TYT Deneme 1',exam_type:'STANDARD',grade_level:7,academic_year:'2026-2027',publisher_name:'ANUNEX',session_label:'1. Oturum',description:'',owner_type:'INSTITUTION',institution_id:'instX',status:'DRAFT',outcome_mode:'OPTIONAL'};
beforeEach(()=>{localStorage.clear();mocks.params=new URLSearchParams();mocks.setParams.mockReset();mocks.api.mockReset();mocks.api.mockImplementation(async(url:string)=>{
 if(url.startsWith('/api/exam-definitions/options'))return {subjects:[{id:'tur',name:'Türkçe',code:'TUR'}],scoringVersions:[],institutions:[],outcomes:[]};
 if(url==='/api/exam-definitions')return {exams:[examRow]};
 if(url==='/api/exam-definitions/ex1')return {exam:examRow,booklets:[{code:'A'}],subjects:[],answerKey:[],institutions:[]};
 if(url.startsWith('/api/exam-content/'))return {assets:[],videos:[]};
 return {};
});});

async function mount(){
 const node=document.createElement('div'),root=createRoot(node);document.body.append(node);
 await act(async()=>root.render(createElement(ExamDefinitions)));
 const labelled=(t:string)=>[...node.querySelectorAll('label')].find(l=>l.textContent!.startsWith(t))?.querySelector('input,select,textarea') as any;
 const set=async(el:any,v:string)=>act(async()=>{Object.getOwnPropertyDescriptor(el instanceof HTMLSelectElement?HTMLSelectElement.prototype:el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(el,v);el.dispatchEvent(new Event(el instanceof HTMLSelectElement?'change':'input',{bubbles:true}));});
 const btn=(t:string)=>[...node.querySelectorAll('button')].find(b=>b.textContent!.trim().startsWith(t)) as HTMLButtonElement;
 return {node,labelled,set,btn,unmount:async()=>{await act(async()=>root.unmount());node.remove();}};
}

it('moving to the answer-key step of a new exam does not crash the page',async()=>{
 const f=await mount();try{
  await f.set(f.labelled('Yayınevi adı'),'ANUNEX');await f.set(f.labelled('Sınav adı'),'Deneme');await f.set(f.labelled('Oturum / bölüm'),'1. Oturum');
  await act(async()=>f.btn('Devam').click());
  expect(f.node.textContent).toContain('Cevap anahtarı');expect(f.node.querySelector('#exam-answer-key')).toBeTruthy();
 }finally{await f.unmount();}
});

it('names exactly which card fields are missing and marks them',async()=>{
 const f=await mount();try{
  await f.set(f.labelled('Sınav adı'),'Deneme');await f.set(f.labelled('Eğitim yılı'),'2026');
  await act(async()=>f.btn('Devam').click());
  expect(f.node.textContent).toContain('Sınav kartında eksik: Yayınevi adı, Eğitim yılı (ör. 2026-2027), Oturum / bölüm.');
  expect(f.labelled('Yayınevi adı').getAttribute('aria-invalid')).toBe('true');expect(f.labelled('Sınav adı').getAttribute('aria-invalid')).toBeNull();
  expect(f.node.querySelector('#exam-answer-key')).toBeNull();
 }finally{await f.unmount();}
});

it('keeps an unsaved card across a refresh, and can be cleared',async()=>{
 const f=await mount();
 await f.set(f.labelled('Yayınevi adı'),'ANUNEX');await f.set(f.labelled('Sınav adı'),'Yarım kalan deneme');await f.set(f.labelled('Oturum / bölüm'),'2. Oturum');
 await act(async()=>{await new Promise(r=>setTimeout(r,450));});
 await f.unmount();
 const g=await mount();try{
  expect(g.labelled('Sınav adı').value).toBe('Yarım kalan deneme');expect(g.labelled('Oturum / bölüm').value).toBe('2. Oturum');
  expect(g.node.textContent).toContain('Kaydedilmemiş sınav taslağınız geri yüklendi');expect(g.node.textContent).toContain('yeniden eklenmeli');
  await act(async()=>g.btn('Taslağı temizle').click());
  expect(g.labelled('Sınav adı').value).toBe('');
  await act(async()=>{await new Promise(r=>setTimeout(r,450));});
  expect(localStorage.getItem('anunex.examDraft.u1')).toBeNull();
 }finally{await g.unmount();}
});

it('the open exam is kept in the address so a refresh reopens it, and closing removes it',async()=>{
 mocks.params=new URLSearchParams('examId=ex1');
 const f=await mount();try{
  expect(mocks.api.mock.calls.some(([u]:any)=>u==='/api/exam-definitions/ex1')).toBe(true);
  await act(async()=>{await new Promise(r=>setTimeout(r,50));});
  expect(f.node.textContent).toContain('Sınav listesine dön');
  await act(async()=>f.btn('Sınav listesine dön').click());
  expect(mocks.params.get('examId')).toBeNull();
 }finally{await f.unmount();}
 mocks.params=new URLSearchParams();
 const g=await mount();try{
  const row=[...g.node.querySelectorAll('button')].find(b=>b.textContent!.includes('Görüntüle')) as HTMLElement;
  expect(row).toBeTruthy();mocks.api.mock.calls.length=0;await act(async()=>row.click());expect(mocks.params.get('examId')).toBe('ex1');
  expect(mocks.api.mock.calls.filter(([u]:any)=>u==='/api/exam-definitions/ex1')).toHaveLength(1);
 }finally{await g.unmount();}
});
