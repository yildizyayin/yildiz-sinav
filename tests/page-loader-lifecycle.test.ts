// @vitest-environment happy-dom
import {act,createElement,lazy,useState} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {PageLoader} from '../src/components/PageLoader';
let root:Root,container:HTMLDivElement;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.append(container);root=createRoot(container)});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks()});
async function render(child:any,key='/reports'){await act(async()=>root.render(createElement(PageLoader,{routeKey:key,children:child})))}
it('shows accessible loading until a deferred page actually resolves',async()=>{
 let resolve!:(v:any)=>void;const Page=lazy(()=>new Promise<any>(r=>{resolve=r}));await render(createElement(Page));expect(container.querySelector('[role=status]')?.textContent).toContain('Sayfa yükleniyor');await act(async()=>resolve({default:()=>createElement('p',null,'Ready page')}));expect(container.textContent).toBe('Ready page');
});
it('preserves mounted page state when only the query changes',async()=>{
 function Counter(){const [n,set]=useState(0);return createElement('button',{onClick:()=>set(n+1)},String(n))}
 await render(createElement(Counter),'/reports?a=1');await act(async()=>container.querySelector('button')!.click());await render(createElement(Counter),'/reports?a=2');expect(container.textContent).toBe('1');
});
it('hides rejected module details and recovers when navigating to another page',async()=>{
 vi.spyOn(console,'error').mockImplementation(()=>{});const Page=lazy(()=>Promise.reject(new Error('private internal URL/token')));await render(createElement(Page));expect(container.querySelector('[role=alert]')).toBeTruthy();expect(container.textContent).not.toContain('private internal');await render(createElement('p',null,'Other page'),'/students');expect(container.textContent).toBe('Other page');
});
