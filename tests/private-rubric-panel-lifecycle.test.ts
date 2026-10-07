// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {PrivateRubricExportPanel} from '../src/components/PrivateRubricExportPanel';
const mock=vi.hoisted(()=>({api:vi.fn()}));
vi.mock('../src/api',()=>({api:mock.api,qs:(v:any)=>{const p=new URLSearchParams();for(const [k,x] of Object.entries(v))if(x!=null)p.set(k,String(x));return p.size?'?'+p:''}}));
let root:Root,container:HTMLDivElement;
function deferred(){let resolve!:(v:any)=>void,reject!:(e:Error)=>void;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
const job=(jobId:string)=>({jobId,status:'QUEUED',parts:[],observationCount:0,partCount:0});
async function render(studentId='A'){await act(async()=>root.render(createElement(PrivateRubricExportPanel,{studentId,userId:'teacher',view:'current',enrollmentId:''})))}
async function settle(fn:()=>void){await act(async()=>{fn();await Promise.resolve()})}
function button(text:string){const found=[...container.querySelectorAll('button')].find(x=>x.textContent===text);expect(found,`Missing ${text}`).toBeTruthy();return found!}
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;mock.api.mockReset();mock.api.mockResolvedValue({enabled:true,jobs:[]});container=document.createElement('div');document.body.append(container);root=createRoot(container)});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks()});

it('does not overwrite the current job with an old prepare completion after A/B/A',async()=>{
 const old=deferred();let lists=0;mock.api.mockImplementation((_path:string,options:any)=>options?.method==='POST'?old.promise:Promise.resolve({enabled:true,jobs:++lists===3?[job('current')]:[]}));
 await render();await settle(()=>button('Arka planda hazırla').click());await render('B');await render('A');await settle(()=>old.resolve({...job('old'),status:'READY',message:'STALE EXPORT'}));expect(container.textContent).not.toContain('STALE EXPORT');expect(button('Durumu yenile').disabled).toBe(false);
});
it('clears the previous scope capability and busy state while the next scope loads',async()=>{
 const pending=deferred(),write=deferred();await render();mock.api.mockImplementation((_path:string,options:any)=>options?.method==='POST'?write.promise:pending.promise);await settle(()=>button('Arka planda hazırla').click());await render('B');expect(container.textContent).not.toContain('Kaydediliyor');expect(button('Arka planda hazırla').disabled).toBe(true);await settle(()=>pending.resolve({enabled:false,jobs:[]}));await settle(()=>write.resolve(job('old')));expect(container.textContent).toContain('henüz açık değil');expect(container.textContent).not.toContain('Hazırlama sırasına alındı');
});
it('does not let an old refresh failure erase the newly loaded A job',async()=>{
 const refresh=deferred();mock.api.mockImplementation((path:string)=>path.includes('/old')?refresh.promise:Promise.resolve({enabled:true,jobs:[job(path.includes('studentId=A')?'old':'B')]}));await render();await settle(()=>button('Durumu yenile').click());await render('B');mock.api.mockImplementation(()=>Promise.resolve({enabled:true,jobs:[job('new')]}));await render('A');await settle(()=>refresh.reject(new Error('old denied')));expect(container.textContent).not.toContain('old denied');expect(button('Durumu yenile').disabled).toBe(false);
});
it('keeps the same request ID for retry and replaces it only for a new export',async()=>{
 const bodies:any[]=[];mock.api.mockImplementation((_path:string,options:any)=>{if(!options?.method)return Promise.resolve({enabled:true,jobs:[]});bodies.push(JSON.parse(options.body));return bodies.length===1?Promise.reject(new Error('temporary')):Promise.resolve(job('ready'))});await render();await settle(()=>button('Arka planda hazırla').click());await settle(()=>button('Arka planda hazırla').click());expect(bodies[1].requestId).toBe(bodies[0].requestId);await settle(()=>button('Yeni çıktı hazırla').click());await settle(()=>button('Arka planda hazırla').click());expect(bodies[2].requestId).not.toBe(bodies[1].requestId);
});
