// @vitest-environment happy-dom
import {act,createElement,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({api:vi.fn()}));
vi.mock('../src/api',async()=>{const real=await vi.importActual<any>('../src/api');return {...real,api:mocks.api};});
import {StudioScopePicker} from '../src/components/StudioScopePicker';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;

const calls:URLSearchParams[]=[];
beforeEach(()=>{vi.useFakeTimers();calls.length=0;mocks.api.mockReset();mocks.api.mockImplementation(async(url:string)=>{
 const p=new URLSearchParams(url.split('?')[1]);calls.push(p);const codes=(p.get('outcomeCodes')||'').split(',').filter(Boolean);
 return {subjects:[{id:'tur',name:'Türkçe',approved:5}],
  outcomes:p.get('subjectId')?[{code:'T.5.1.1',title:'Fiil kiplerini ayırt eder',unit:'1. Ünite',topic:'Fiiller',approved:2},{code:'T.5.1.2',title:'Zaman kayması',unit:'1. Ünite',topic:'Fiiller',approved:0}]:[],
  available:codes.length?2:5,opticalCapacity:44,message:codes.length?'20 soru gerekli, uygun 2 soru var. Havuzu en çok daraltan: "Seçilen 2 kazanım" (5 → 2).':null};
});});

async function mount(){
 const node=document.createElement('div'),root=createRoot(node);document.body.append(node);const seen:any[]=[];
 function Host(){const [v,setV]=useState({academicYear:'2027-2028',gradeLevel:'5',subjectId:'',outcomeCodes:[] as string[]});return createElement(StudioScopePicker,{value:v,onChange:setV,needsInstitution:false,questionCount:20,optionMode:'MIXED',onAvailability:(a:any)=>seen.push(a)});}
 await act(async()=>root.render(createElement(Host)));await act(async()=>{vi.advanceTimersByTime(300);});
 const flush=async()=>act(async()=>{vi.advanceTimersByTime(300);});
 return {node,seen,flush,close:async()=>{await act(async()=>root.unmount());node.remove();vi.useRealTimers();}};
}

it('picks program, grade, subject and outcomes from lists with stock, and reports what is available',async()=>{
 const f=await mount();try{
  expect(calls[0].get('academicYear')).toBe('2027-2028');expect(calls[0].get('gradeLevel')).toBe('5');
  const subject=[...f.node.querySelectorAll('label')].find(l=>l.textContent!.startsWith('Ders'))!.querySelector('select') as HTMLSelectElement;
  expect([...subject.options].map(o=>o.textContent)).toEqual(['Tüm dersler','Türkçe · 5 onaylı']);
  await act(async()=>{subject.value='tur';subject.dispatchEvent(new Event('change',{bubbles:true}));});await f.flush();
  expect(f.node.textContent).toContain('Fiil kiplerini ayırt eder');expect(f.node.textContent).toContain('soru yok');
  const unit=f.node.querySelector('input[aria-label="1. Ünite tamamı"]') as HTMLInputElement;
  await act(async()=>unit.click());await f.flush();
  expect(calls[calls.length-1].get('outcomeCodes')).toBe('T.5.1.1,T.5.1.2');
  expect(f.node.querySelector('.studio-stock')!.className).toContain('short');
  expect(f.node.textContent).toContain('Havuzu en çok daraltan');
  expect(f.seen[f.seen.length-1]).toMatchObject({available:2,loading:false});
 }finally{await f.close();}
});
