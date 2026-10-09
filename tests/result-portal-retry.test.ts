// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ApiError} from '../src/api';
import {ResultPortal} from '../src/pages/ResultPortal';
const calls=vi.hoisted(()=>({api:vi.fn()}));
vi.mock('../src/api',async importOriginal=>({...await importOriginal<typeof import('../src/api')>(),api:calls.api}));
vi.mock('../src/components/NibiruMark',()=>({NibiruMark:()=>null}));
vi.mock('../src/pages/ResultNetworkAdmin',()=>({ResultNetworkAdmin:()=>null}));
vi.mock('../src/pages/ResultOperatorWorkspace',()=>({ResultOperatorWorkspace:()=>null}));
vi.mock('../src/components/Turnstile',()=>({Turnstile:({onToken}:any)=>createElement('button',{type:'button',onClick:()=>onToken('synthetic-token')},'Test robot doğrulaması')}));
let root:Root,container:HTMLDivElement;
const summary={ok:true,student:{name:'Sentetik Öğrenci',institution:'Sentetik Kurum',gradeLevel:7},exams:[],tips:[],unavailableSnapshotExamIds:[]};
async function settle(task:()=>void){await act(async()=>{task();await Promise.resolve();await Promise.resolve()})}
function button(text:string){const b=[...container.querySelectorAll('button')].find(x=>x.textContent?.includes(text));expect(b,'Missing button: '+text).toBeTruthy();return b!}
function input(label:string,value:string){const field=[...container.querySelectorAll('label')].find(x=>x.textContent?.startsWith(label))!.querySelector('input')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}))}
function submit(){container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))}
async function reachVerify(){
 await act(async()=>root.render(createElement(ResultPortal)));
 await settle(()=>button('Öğrenci Sonuç').click());
 await settle(()=>input('Kurum','Sentetik'));
 await act(async()=>{await vi.advanceTimersByTimeAsync(300)});
 await settle(()=>button('Sentetik Kurum').click());
 await settle(()=>input('Ad soyad','Sentetik Öğrenci'));
 await settle(()=>input('Öğrenci numarası','1001'));
 await settle(()=>{const select=container.querySelector('select')!;select.value='7';select.dispatchEvent(new Event('change',{bubbles:true}))});
 await settle(()=>button('Test robot doğrulaması').click());
 await settle(submit);
 expect(container.textContent).toContain('Sonuç erişim kodunu gir');
 await settle(()=>input('Kişisel erişim kodu','12345678'));
}
beforeEach(()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});calls.api.mockReset();
 calls.api.mockImplementation((path:string)=>{
  if(path.endsWith('/config'))return Promise.resolve({turnstileSiteKey:'synthetic'});
  if(path.includes('/institutions?'))return Promise.resolve({institutions:[{code:'99999001',name:'Sentetik Kurum',city:'Sentetik',district:'Sentetik'}]});
  if(path.endsWith('/lookup'))return Promise.resolve({found:true,challengeId:'synthetic-challenge'});
  if(path.endsWith('/verify'))return Promise.resolve({ok:true});
  return Promise.resolve(summary);
 });
 container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.useRealTimers();vi.restoreAllMocks()});
it('retries only the result GET after a successful one-use code and a busy response',async()=>{
 const base=calls.api.getMockImplementation()!;let reads=0;
 calls.api.mockImplementation((path:string,o:any)=>path.endsWith('/student')?(++reads===1?Promise.reject(new ApiError(503,{code:'RESULT_CAPACITY_BUSY',message:'Sentetik yoğunluk'})):Promise.resolve(summary)):base(path,o));
 await reachVerify();await settle(submit);
 expect(container.textContent).toContain('ERİŞİM DOĞRULANDI');
 expect(container.textContent).toContain('Sentetik yoğunluk');
 expect(button('saniye sonra').disabled).toBe(true);
 for(let tick=0;tick<3;tick++){await act(async()=>{await vi.advanceTimersByTimeAsync(1000)});if(tick<2)expect(button('saniye sonra').disabled).toBe(true)}
 await settle(()=>button('Sonuçları yeniden getir').click());
 expect(container.textContent).toContain('ÖĞRENCİ SONUÇ MERKEZİ');
 expect(calls.api.mock.calls.filter(([p])=>p.endsWith('/verify'))).toHaveLength(1);
 expect(calls.api.mock.calls.filter(([p])=>p.endsWith('/student'))).toHaveLength(2);
});
it('returns to fresh lookup rather than retrying an expired result session',async()=>{
 const base=calls.api.getMockImplementation()!;
 calls.api.mockImplementation((path:string,o:any)=>path.endsWith('/student')?Promise.reject(new ApiError(401,{code:'RESULT_SESSION_REQUIRED',message:'Sentetik oturum süresi doldu'})):base(path,o));
 await reachVerify();await settle(submit);
 expect(container.textContent).toContain('Kurum ve öğrenci bilgilerin');
 expect(container.textContent).toContain('Sentetik oturum süresi doldu');
 expect(container.textContent).not.toContain('Sonuçları yeniden getir');
 expect(calls.api.mock.calls.filter(([p])=>p.endsWith('/verify'))).toHaveLength(1);
});
it('does not publish a late result after the student leaves and starts a new flow',async()=>{
 const base=calls.api.getMockImplementation()!;let resolve!:(value:any)=>void;
 const pending=new Promise(r=>{resolve=r});
 calls.api.mockImplementation((path:string,o:any)=>path.endsWith('/student')?pending:base(path,o));
 await reachVerify();await settle(submit);
 const read=calls.api.mock.calls.find(([p])=>p.endsWith('/student'))!;
 await settle(()=>button('Sonuç türleri').click());
 expect(read[1].signal.aborted).toBe(true);
 await settle(()=>button('Öğrenci Sonuç').click());
 await settle(()=>resolve(summary));
 expect(container.textContent).toContain('Kurum ve öğrenci bilgilerin');
 expect(container.textContent).not.toContain('ÖĞRENCİ SONUÇ MERKEZİ');
});

it('starts a fresh lookup after challenge expiry without attempting a result read',async()=>{
 const base=calls.api.getMockImplementation()!;
 calls.api.mockImplementation((path:string,o:any)=>path.endsWith('/verify')?Promise.reject(new ApiError(401,{code:'CHALLENGE_EXPIRED',message:'Sentetik kod doğrulama süresi doldu'})):base(path,o));
 await reachVerify();await settle(submit);
 expect(container.textContent).toContain('Kurum ve öğrenci bilgilerin');
 expect(container.textContent).toContain('Sentetik kod doğrulama süresi doldu');
 expect(calls.api.mock.calls.filter(([p])=>p.endsWith('/verify'))).toHaveLength(1);
 expect(calls.api.mock.calls.filter(([p])=>p.endsWith('/student'))).toHaveLength(0);
});
