// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {Nibiru} from '../src/pages/Nibiru';
const mock=vi.hoisted(()=>({api:vi.fn()}));vi.mock('../src/api',()=>mock);
vi.mock('../src/auth',()=>({useAuth:()=>({user:{id:'student',role:'STUDENT'}})}));
vi.mock('../src/components/PasskeyAccess',()=>({PasskeyAccess:()=>null}));
vi.mock('../src/components/CoachPlanCard',()=>({CoachPlanCard:()=>null}));
let container:HTMLDivElement,root:Root,synth:any;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;mock.api.mockReset();mock.api.mockImplementation((url:string)=>Promise.resolve(url.includes('/voice/status')?{providers:{standardReady:false}}:{students:[]}));container=document.createElement('div');document.body.append(container);root=createRoot(container);synth=new EventTarget();synth.getVoices=()=>[];synth.cancel=vi.fn();synth.speak=vi.fn();Object.defineProperty(window,'speechSynthesis',{configurable:true,value:synth});vi.stubGlobal('SpeechSynthesisUtterance',class{constructor(public text:string){}onstart:any;onend:any;onerror:any;voice:any;lang='';});Element.prototype.scrollIntoView=vi.fn()});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();vi.restoreAllMocks()});
async function render(){await act(async()=>root.render(createElement(MemoryRouter,null,createElement(Nibiru))))}
it('explains why listening is unavailable without a Turkish device voice',async()=>{await render();expect(container.textContent).toContain('yerel Türkçe ses bulunamadı');const listen=Array.from(container.querySelectorAll('button')).find(b=>b.textContent?.includes('Dinle'));expect(listen?.disabled).toBe(true)});
it('reacts to late voices, speaks only on click and stops on unmount',async()=>{
 await render();synth.getVoices=()=>[{lang:'tr-TR',localService:true}];await act(async()=>synth.dispatchEvent(new Event('voiceschanged')));expect(synth.speak).not.toHaveBeenCalled();
 const listen=Array.from(container.querySelectorAll('button')).find(b=>b.textContent?.includes('Dinle'))!;expect(listen.disabled).toBe(false);await act(async()=>listen.click());expect(synth.speak).toHaveBeenCalledOnce();expect(container.textContent).toContain('Durdur');const utterance=synth.speak.mock.calls[0][0];expect(utterance.voice.localService).toBe(true);
 await act(async()=>root.unmount());expect(utterance.onend).toBeNull();expect(synth.cancel).toHaveBeenCalled();root=createRoot(container);
});
it('does not use remote Turkish browser voices',async()=>{synth.getVoices=()=>[{lang:'tr-TR',localService:false}];await render();expect(container.textContent).toContain('yerel Türkçe ses bulunamadı');expect(synth.speak).not.toHaveBeenCalled()});
