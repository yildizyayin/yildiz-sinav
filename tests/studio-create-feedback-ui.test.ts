// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({api:vi.fn(),role:'SUPER_ADMIN'}));
vi.mock('../src/api',async()=>{const real=await vi.importActual<any>('../src/api');return {...real,api:mocks.api};});
vi.mock('../src/auth',()=>({useAuth:()=>({user:{id:'u',role:mocks.role,institution_id:mocks.role==='SUPER_ADMIN'?null:'instX'}})}));
vi.mock('react-router-dom',()=>({Link:(p:any)=>createElement('a',p),useSearchParams:()=>[new URLSearchParams(),()=>{}]}));
vi.mock('../src/components/QuestionCardIntelligence',()=>({QuestionCardIntelligence:()=>null}));
vi.mock('../src/components/QuestionEditorialDesign',()=>({QuestionEditorialDesign:()=>null}));
vi.mock('../src/components/QuestionDataVisual',()=>({QuestionDataVisual:()=>null}));
vi.mock('../src/components/QuestionContentEditor',()=>({QuestionContentEditor:()=>null}));
vi.mock('../src/components/QuestionPoolCoverage',()=>({QuestionPoolCoverage:()=>null}));
import {ContentCenter} from '../src/pages/ContentCenter';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;

const posts:any[]=[];
beforeEach(()=>{posts.length=0;mocks.role='SUPER_ADMIN';mocks.api.mockReset();mocks.api.mockImplementation(async(url:string,init?:any)=>{
 if(url==='/api/institutions')return {institutions:[{id:'instX',name:'Yıldız Koleji'},{id:'instY',name:'Başka Kurum'}]};
 if(url.startsWith('/api/platform/studio/branding/logo'))return {institutionName:url.includes('instX')?'Yıldız Koleji':null,hasLogo:false};
 if(url==='/api/platform/studio'&&init?.method==='POST'){const body=JSON.parse(init.body);posts.push(body);if(body.questionCount>5)throw new Error('İstenen 20 soruya uygun soru havuzu bulunamadı; yalnız 3 soru seçilebildi.');return {selectedQuestions:5,requestedQuestions:5,bookletCodes:['A','B']};}
 if(url.startsWith('/api/platform/studio'))return {documents:[]};
 if(url.startsWith('/api/platform/questions'))return {questions:[]};
 return {};
});});

async function open(){
 const node=document.createElement('div'),root=createRoot(node);document.body.append(node);
 await act(async()=>root.render(createElement(ContentCenter)));
 const btn=(t:string)=>[...node.querySelectorAll('button')].find(b=>b.textContent!.includes(t)) as HTMLButtonElement;
 await act(async()=>btn('Studio').click());
 const setValue=async(el:HTMLInputElement|HTMLSelectElement,value:string)=>act(async()=>{const proto=el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(el,value);el.dispatchEvent(new Event(el instanceof HTMLSelectElement?'change':'input',{bubbles:true}));});
 const labelled=(text:string)=>[...node.querySelectorAll('label')].find(l=>l.textContent!.startsWith(text))!.querySelector('input,select') as any;
 return {node,btn,setValue,labelled,close:async()=>{await act(async()=>root.unmount());node.remove();}};
}

it('asks a Super Admin to choose the institution and explains why creation is disabled, next to the button',async()=>{
 const f=await open();try{
  await f.setValue(f.labelled('Başlık'),'Deneme 1');
  const create=f.btn('Taslak oluştur');
  expect(create.disabled).toBe(true);
  expect(f.node.querySelector('.studio-create-action')!.textContent).toContain('hangi kurum için');
  expect([...f.labelled('Kurum').querySelectorAll('option')].map((o:any)=>o.textContent)).toEqual(['Kurum seçin','Yıldız Koleji','Başka Kurum']);
  await f.setValue(f.labelled('Kurum'),'instX');
  expect(f.btn('Taslak oluştur').disabled).toBe(false);
  await f.setValue(f.labelled('Soru sayısı'),'5');
  await act(async()=>f.btn('Taslak oluştur').click());
  expect(posts[0]).toMatchObject({institutionId:'instX',title:'Deneme 1',questionCount:5});
  const status=f.node.querySelector('.studio-create-action .alert.success')!;
  expect(status.textContent).toContain('Belge taslağı oluşturuldu · 5/5 soru');
 }finally{await f.close();}
});

it('shows a server refusal right under the button instead of only at the top of the page',async()=>{
 const f=await open();try{
  await f.setValue(f.labelled('Başlık'),'Deneme 2');await f.setValue(f.labelled('Kurum'),'instX');
  await act(async()=>f.btn('Taslak oluştur').click());
  const alert=f.node.querySelector('.studio-create-action .alert.error')!;
  expect(alert.textContent).toContain('yalnız 3 soru seçilebildi');
 }finally{await f.close();}
});

it('does not ask institution managers to pick an institution',async()=>{
 mocks.role='INSTITUTION_MANAGER';
 const f=await open();try{
  expect([...f.node.querySelectorAll('label')].some(l=>l.textContent!.startsWith('Kurum (zorunlu)'))).toBe(false);
  await f.setValue(f.labelled('Başlık'),'Deneme 3');await f.setValue(f.labelled('Soru sayısı'),'5');
  await act(async()=>f.btn('Taslak oluştur').click());
  expect(posts[0].institutionId).toBeUndefined();
  expect(mocks.api.mock.calls.some(([u]:any)=>u==='/api/institutions')).toBe(false);
 }finally{await f.close();}
});
