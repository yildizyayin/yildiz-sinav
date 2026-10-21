// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({api:vi.fn()}));
vi.mock('../src/api',async()=>{const real=await vi.importActual<any>('../src/api');return {...real,api:mocks.api};});
import {StudioLibrary} from '../src/components/StudioLibrary';
import {StudioTemplates} from '../src/components/StudioTemplates';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;

const calls:any[]=[];
beforeEach(()=>{calls.length=0;mocks.api.mockReset();mocks.api.mockImplementation(async(url:string,init?:any)=>{calls.push([url,init?.method||'GET',init?.body?JSON.parse(init.body):null]);if(url.startsWith('/api/platform/studio/templates')&&!init)return {templates:[{id:'t1',name:'Kurum denemesi',kind:'PRACTICE_EXAM',shared:true,mine:false,config:{questionCount:'40',bookletCodes:'A,B'}}]};return {ok:true};});});
const docs=[{id:'d1',title:'Fiiller taraması',document_type:'WORKSHEET',grade_level:5,subject_id:'tur',subject_name:'Türkçe',question_count:10,status:'READY',config_json:'{"bookletCodes":["A"],"deliveryMode":"PDF_OPTICAL","academicYear":"2027-2028"}',is_mine:1,is_favorite:0},
 {id:'d2',title:'Kesirler denemesi',document_type:'PRACTICE_EXAM',grade_level:6,subject_id:'mat',subject_name:'Matematik',question_count:40,status:'DRAFT',config_json:'{"bookletCodes":["A","B"],"deliveryMode":"PDF"}',is_mine:0,is_favorite:1}];
async function mount(el:any){const node=document.createElement('div'),root=createRoot(node);document.body.append(node);await act(async()=>root.render(el));
 const btn=(t:string)=>[...node.querySelectorAll('button')].find(b=>b.textContent!.includes(t)) as HTMLButtonElement;
 const set=async(el2:any,v:string)=>act(async()=>{Object.getOwnPropertyDescriptor(el2 instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(el2,v);el2.dispatchEvent(new Event(el2 instanceof HTMLSelectElement?'change':'input',{bubbles:true}));});
 const titles=()=>[...node.querySelectorAll('.studio-card h3')].map(h=>h.textContent);return {node,btn,set,titles,close:async()=>{await act(async()=>root.unmount());node.remove();}};}

it('filters the card library by mine, favourites, subject and search, and toggles a favourite',async()=>{
 const changed=vi.fn();const f=await mount(createElement(StudioLibrary,{docs,onPreview:()=>{},onScan:()=>{},onError:()=>{},onChanged:changed}));try{
  expect(f.titles()).toEqual(['Fiiller taraması','Kesirler denemesi']);
  expect(f.node.querySelector('.studio-card')!.textContent).toContain('5. sınıf · Türkçe · 10 soru · A kitapçık');
  await act(async()=>f.btn('Testlerim').click());expect(f.titles()).toEqual(['Fiiller taraması']);
  await act(async()=>f.btn('Favoriler').click());expect(f.titles()).toEqual(['Kesirler denemesi']);
  await act(async()=>f.btn('Tümü').click());
  await f.set(f.node.querySelector('select[aria-label="Ders filtresi"]'),'mat');expect(f.titles()).toEqual(['Kesirler denemesi']);
  await f.set(f.node.querySelector('select[aria-label="Ders filtresi"]'),'');await f.set(f.node.querySelector('input[aria-label="Test ara"]'),'fiil');expect(f.titles()).toEqual(['Fiiller taraması']);
  expect(f.btn('Optik okut')).toBeTruthy();
  await act(async()=>(f.node.querySelector('button[aria-label="Favorilere ekle"]') as HTMLButtonElement).click());
  expect(calls.some(([u,m])=>u==='/api/platform/studio/d1/favorite'&&m==='POST')).toBe(true);expect(changed).toHaveBeenCalled();
  await f.set(f.node.querySelector('input[aria-label="Test ara"]'),'');await act(async()=>f.btn('Favoriler').click());expect(f.titles()).toEqual(['Fiiller taraması','Kesirler denemesi']);
 }finally{await f.close();}
});

it('applies a built-in or saved template and saves the current settings as a private template',async()=>{
 const applied:any[]=[];const f=await mount(createElement(StudioTemplates,{current:{questionCount:'12',gradeLevel:'5'},onApply:(c:any,l:string)=>applied.push([l,c]),needsInstitution:false,canShare:false}));try{
  await act(async()=>f.btn('Telafi').click());expect(applied[0]).toEqual(['Telafi',expect.objectContaining({questionCount:'10',difficultyMix:{EASY:50,MEDIUM:40,HARD:10}})]);
  await act(async()=>f.btn('Kurum denemesi').click());expect(applied[1][1]).toMatchObject({questionCount:'40'});
  expect(f.node.textContent).toContain('kurumla paylaşılan');expect(f.btn('Sil')).toBeUndefined();
  await act(async()=>f.btn('şablon olarak kaydet').click());
  expect(f.node.textContent).not.toContain('Kurumla paylaş');
  await f.set(f.node.querySelector('input[aria-label="Şablon adı"]'),'Benim taramam');
  await act(async()=>f.btn('Kaydet').click());
  expect(calls.find(([u,m])=>u==='/api/platform/studio/templates'&&m==='POST')[2]).toMatchObject({name:'Benim taramam',kind:'TOPIC_SCAN',shared:false,config:{questionCount:'12',gradeLevel:'5'}});
  expect(f.node.textContent).toContain('"Benim taramam" şablonu kaydedildi');
 }finally{await f.close();}
});
