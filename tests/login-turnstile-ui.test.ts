// @vitest-environment happy-dom
import {act,createElement,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({api:vi.fn(),post:vi.fn(),refresh:vi.fn(),navigate:vi.fn(),token:null as null|((s:string)=>void),mounts:0}));
vi.mock('../src/api',async()=>{const real=await vi.importActual<any>('../src/api');return {...real,api:mocks.api,post:mocks.post};});
vi.mock('../src/auth',()=>({useAuth:()=>({user:null,refresh:mocks.refresh})}));
vi.mock('react-router-dom',()=>({useNavigate:()=>mocks.navigate}));
vi.mock('../src/components/Turnstile',()=>({Turnstile:({onToken}:any)=>{useEffect(()=>{mocks.token=onToken;mocks.mounts++;},[onToken]);return null;}}));
vi.mock('../src/components/AnunexCosmos',()=>({AnunexCosmos:()=>null}));
vi.mock('../src/components/AnunexBrand',()=>({AnunexBrand:()=>null}));
vi.mock('../src/components/NibiruMark',()=>({NibiruMark:()=>null}));
import {Login} from '../src/pages/Login';
beforeEach(()=>{vi.clearAllMocks();mocks.token=null;mocks.mounts=0;mocks.api.mockResolvedValue({productName:'Fixture',turnstileSiteKey:'fixture-sitekey'});mocks.refresh.mockResolvedValue(undefined);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;});
async function fixture(){
 const node=document.createElement('div'),root=createRoot(node);document.body.append(node);
 await act(async()=>root.render(createElement(Login)));
 const input=async(selector:string,value:string)=>act(async()=>{const el=node.querySelector(selector)!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});
 await input('input[autocomplete=username]','fixture-user');await input('input[type=password]','fixture-password');
 return {node,submit:()=>node.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})),button:()=>node.querySelector('button.primary') as HTMLButtonElement,close:async()=>{await act(async()=>root.unmount());node.remove();}};
}
it('blocks missing/expired challenges in both button and submit handler without calling login',async()=>{
 const f=await fixture();try{
  expect(f.button().disabled).toBe(true);expect(f.node.textContent).toContain('Güvenlik doğrulaması bekleniyor.');
  await act(async()=>f.submit());expect(mocks.post).not.toHaveBeenCalled();
  await act(async()=>mocks.token!('fixture-token'));expect(f.button().disabled).toBe(false);
  await act(async()=>mocks.token!(''));await act(async()=>f.submit());expect(f.button().disabled).toBe(true);expect(mocks.post).not.toHaveBeenCalled();
 }finally{await f.close();}
});
it('consumes a challenge once, prevents simultaneous submissions, and requires a fresh widget response after failure',async()=>{
 let reject:(e:Error)=>void=()=>{};mocks.post.mockImplementationOnce(()=>new Promise((_,r)=>{reject=r;})).mockResolvedValueOnce({ok:true});
 const f=await fixture();try{
  await act(async()=>mocks.token!('fixture-token-1'));await act(async()=>{f.submit();f.submit();});expect(mocks.post).toHaveBeenCalledTimes(1);expect(mocks.post.mock.calls[0][1].turnstileToken).toBe('fixture-token-1');expect(f.button().disabled).toBe(true);
  await act(async()=>reject(new Error('fixture failure')));expect(mocks.mounts).toBe(2);expect(f.button().disabled).toBe(true);
  await act(async()=>f.submit());expect(mocks.post).toHaveBeenCalledTimes(1);
  await act(async()=>mocks.token!('fixture-token-2'));await act(async()=>f.submit());expect(mocks.post).toHaveBeenCalledTimes(2);expect(mocks.post.mock.calls[1][1].turnstileToken).toBe('fixture-token-2');expect(mocks.refresh).toHaveBeenCalledTimes(1);expect(mocks.navigate).toHaveBeenCalledWith('/');
 }finally{await f.close();}
});
