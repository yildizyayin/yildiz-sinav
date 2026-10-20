// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({api:vi.fn(),read:null as any,version:'ANUNEX-OPTICAL-2'}));
vi.mock('../src/api',async()=>{const real=await vi.importActual<any>('../src/api');return {...real,api:mocks.api};});
vi.mock('../src/lib/omrEngine',()=>({parseRuntimeTemplate:(t:any)=>t,imageFileToImageData:async()=>({width:1,height:1,data:[]}),readOmrImage:()=>mocks.read}));
import {ApiError} from '../src/api';
import {StudioOpticalScan} from '../src/components/StudioOpticalScan';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;

const doc={id:'doc',title:'Deneme',institution_id:'instX',config_json:'{"bookletCodes":["A","B"]}'};
let submitResponses:any[]=[];const posted:any[]=[];
beforeEach(()=>{mocks.version='ANUNEX-OPTICAL-2';posted.length=0;submitResponses=[];mocks.api.mockReset();mocks.api.mockImplementation(async(url:string,init?:any)=>{
 if(url.includes('/optical-template'))return {template:{optical:{pageWidthMm:210,version:mocks.version}}};
 if(url.startsWith('/api/students'))return {students:[{id:'s1',first_name:'Ada',last_name:'Yılmaz',student_number:'101'}]};
 if(url.includes('/optical-submit')){posted.push(JSON.parse(init.body));const next=submitResponses.shift();if(next instanceof Error)throw next;return next;}
 return {};
});});

async function open(){
 const node=document.createElement('div'),root=createRoot(node);document.body.append(node);
 await act(async()=>root.render(createElement(StudioOpticalScan,{document:doc,onClose:()=>{}})));
 const sel=(label:string)=>[...node.querySelectorAll('label')].find(l=>l.textContent!.startsWith(label))!.querySelector('select,input') as any;
 const change=async(el:any,value:string)=>act(async()=>{Object.getOwnPropertyDescriptor(el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event(el instanceof HTMLSelectElement?'change':'input',{bubbles:true}));});
 const photo=async()=>act(async()=>{const input=sel('Optik fotoğrafı');Object.defineProperty(input,'files',{value:[new File([new Uint8Array(4)],'a.jpg')],configurable:true});input.dispatchEvent(new Event('change',{bubbles:true}));});
 const btn=(t:string)=>[...node.querySelectorAll('button')].find(b=>b.textContent!.includes(t)) as HTMLButtonElement;
 return {node,sel,change,photo,btn,close:async()=>{await act(async()=>root.unmount());node.remove();}};
}

it('shows what was read and saves it for the chosen student',async()=>{
 mocks.read={booklet:'A',answers_by_subject:{GENEL:'AB_'},confidence:.9,issues:[],fiducialsFound:4};
 submitResponses=[{correct:2,total:3,blank:1,score:2/3,booklet:'A',replaced:false}];
 const f=await open();try{
  await f.change(f.sel('Öğrenci'),'s1');await f.photo();
  expect(f.node.textContent).toContain('Okunan kitapçık: A');expect(f.node.textContent).toContain('3:–');
  await act(async()=>f.btn('için sonucu kaydet').click());
  expect(posted[0]).toEqual({studentId:'s1',booklet:'A',readBooklet:'A',answers:'AB_'});
  expect(f.node.textContent).toContain('Sonuç kaydedildi · Kitapçık A · 2/3 doğru · 1 boş');
 }finally{await f.close();}
});

it('requires the teacher to confirm an unreadable booklet mark before saving',async()=>{
 mocks.read={booklet:undefined,answers_by_subject:{GENEL:'ABC'},confidence:.8,issues:['Kitapçık: 1. hane boş.'],fiducialsFound:4};
 submitResponses=[{correct:3,total:3,blank:0,score:1,booklet:'A',replaced:false}];
 const f=await open();try{
  await f.change(f.sel('Öğrenci'),'s1');await f.photo();
  expect(f.btn('için sonucu kaydet').disabled).toBe(true);
  await act(async()=>(f.node.querySelector('.studio-optical-read input[type=checkbox]') as HTMLInputElement).click());
  await act(async()=>f.btn('için sonucu kaydet').click());
  expect(posted[0]).toMatchObject({confirmBooklet:true,readBooklet:null});
 }finally{await f.close();}
});

it('offers an explicit, reasoned replacement when the student was already scanned',async()=>{
 mocks.read={booklet:'A',answers_by_subject:{GENEL:'ABC'},confidence:.9,issues:[],fiducialsFound:4};
 submitResponses=[new ApiError(409,{code:'ALREADY_SCANNED',message:'Bu öğrencinin optiği daha önce okutuldu.',details:{previous:{score:.5}}} as any),{correct:3,total:3,blank:0,score:1,booklet:'A',replaced:true}];
 const f=await open();try{
  await f.change(f.sel('Öğrenci'),'s1');await f.photo();
  await act(async()=>f.btn('için sonucu kaydet').click());
  expect(f.node.textContent).toContain('daha önce okutuldu');
  expect(f.btn('Önceki sonucun yerine kaydet').disabled).toBe(true);
  await f.change(f.sel('Gerekçe'),'yanlış öğrenci seçildi');
  await act(async()=>f.btn('Önceki sonucun yerine kaydet').click());
  expect(posted[1]).toMatchObject({replace:true,replaceReason:'yanlış öğrenci seçildi'});
  expect(f.node.textContent).toContain('Önceki sonuç değiştirildi');
 }finally{await f.close();}
});

it('asks to reprint when the stored sheet is the old small-marker form, and explains how to take the photo',async()=>{
 const f=await open();try{
  expect(f.node.textContent).toContain('dört köşedeki siyah kare kadrajda');
  expect(f.node.textContent).not.toContain('eski sürümle');
 }finally{await f.close();}
 mocks.version='ANUNEX-OPTICAL-1';
 const g=await open();try{expect(g.node.textContent).toContain('eski sürümle üretilmiş');}finally{await g.close();}
});
