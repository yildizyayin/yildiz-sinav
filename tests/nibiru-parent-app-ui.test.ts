// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {Nibiru} from '../src/pages/Nibiru';
import {NIBIRU_INSTALL_EVENT} from '../src/components/NibiruInstallGuide';
// owner, 24 Nov 2026: a parent uses Nibiru like WhatsApp — full screen, the child picked at the top, ANUNEX one tap away
const mock=vi.hoisted(()=>({api:vi.fn()}));vi.mock('../src/api',()=>mock);
vi.mock('../src/auth',()=>({useAuth:()=>({user:{id:'p',role:'PARENT',display_name:'Ayşe Yılmaz'}})}));
vi.mock('../src/components/PasskeyAccess',()=>({PasskeyAccess:()=>null}));
vi.mock('../src/components/CoachPlanCard',()=>({CoachPlanCard:()=>null}));
let container:HTMLDivElement,root:Root;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;mock.api.mockReset();mock.api.mockImplementation((url:string,init?:any)=>Promise.resolve(url.includes('/voice/status')?{providers:{standardReady:false}}:url.includes('/identity')?{students:[{id:'s1',name:'Ali Yılmaz',grade_level:7},{id:'s2',name:'Zeynep Yılmaz',grade_level:5}]}:url.includes('/chat')?{answer:'Ali bu hafta iyi gidiyor.',body:init?.body}:{}));container=document.createElement('div');document.body.appendChild(container);root=createRoot(container)});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();document.head.innerHTML=''});
async function render(){await act(async()=>root.render(createElement(MemoryRouter,null,createElement(Nibiru))))}
it('opens as a full-screen conversation with the first child chosen and an ANUNEX button',async()=>{
 await render();
 expect(container.querySelector('.nbx')).toBeTruthy();
 expect(container.textContent).toContain('Günaydın Ayşe'.slice(-4));
 const anunex=container.querySelector('a.nbx-anunex')!;expect(anunex.getAttribute('href')).toBe('/');expect(anunex.textContent).toContain('ANUNEX');
 const tabs=Array.from(container.querySelectorAll('.nbx-kids button'));expect(tabs.map(t=>t.textContent)).toEqual(['Ali · 7. sınıf','Zeynep · 5. sınıf']);expect(tabs[0].getAttribute('aria-selected')).toBe('true');
 await act(async()=>(tabs[1] as HTMLButtonElement).click());
 const box=container.querySelector('textarea')!;await act(async()=>{const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!;set.call(box,'Nasıl gidiyor?');box.dispatchEvent(new Event('input',{bubbles:true}))});
 await act(async()=>(container.querySelector('button[aria-label="Gönder"]') as HTMLButtonElement).click());
 const chat=mock.api.mock.calls.find(c=>String(c[0]).includes('/api/nibiru/chat'))!;expect(JSON.parse(chat[1].body).studentId).toBe('s2');
});
it('announces itself as the Nibiru app and shows the add-to-home-screen steps',async()=>{
 await render();
 expect(document.head.querySelector('link[rel="manifest"]')?.getAttribute('href')).toBe('/nibiru.webmanifest');
 expect(document.head.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content')).toBe('Nibiru');
 await act(async()=>window.dispatchEvent(new Event(NIBIRU_INSTALL_EVENT)));
 expect(container.textContent).toContain('Nibiru’yu telefonuna ekle');
 expect(container.textContent).toMatch(/Ana ekrana ekle|Ana Ekrana Ekle/);
});
