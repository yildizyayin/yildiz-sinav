// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ResultStudentEntrance} from '../src/components/ResultStudentEntrance';
let container:HTMLDivElement,root:Root,media:EventTarget&{matches:boolean},disconnect:ReturnType<typeof vi.fn>;
beforeEach(()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();
 container=document.createElement('div');document.body.append(container);root=createRoot(container);
 media=Object.assign(new EventTarget(),{matches:false});vi.stubGlobal('matchMedia',()=>media);
 disconnect=vi.fn();vi.stubGlobal('ResizeObserver',class{observe(){}disconnect=disconnect;});
 vi.stubGlobal('requestAnimationFrame',vi.fn(()=>17));vi.stubGlobal('cancelAnimationFrame',vi.fn());
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({setTransform:vi.fn(),clearRect:vi.fn()} as any);
 vi.spyOn(HTMLDialogElement.prototype,'showModal').mockImplementation(function(this:HTMLDialogElement){this.open=true;});
 vi.spyOn(HTMLDialogElement.prototype,'close').mockImplementation(function(this:HTMLDialogElement){this.open=false;});
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});
const render=async()=>{await act(async()=>root.render(createElement(ResultStudentEntrance,{grade:8})));};
it('bypasses the modal and particle renderer when reduced motion is already enabled',async()=>{
 media.matches=true;await render();expect(container.querySelector('dialog')).toBeNull();expect(requestAnimationFrame).not.toHaveBeenCalled();
});
it('exits automatically within the short welcome interval and stops decorative work',async()=>{
 await render();expect(container.querySelector('dialog')?.open).toBe(true);
 await act(async()=>vi.advanceTimersByTime(1500));expect(container.querySelector('dialog')).not.toBeNull();
 await act(async()=>vi.advanceTimersByTime(100));expect(container.querySelector('dialog')).toBeNull();
 expect(cancelAnimationFrame).toHaveBeenCalledWith(17);expect(disconnect).toHaveBeenCalledOnce();
});
it.each(['skip','escape','motion'])('dismisses immediately on %s and releases the animation',async(action)=>{
 await render();await act(async()=>{
  if(action==='skip')container.querySelector('button')!.click();
  else if(action==='escape')window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
  else{media.matches=true;media.dispatchEvent(new Event('change'));}
 });
 expect(container.querySelector('dialog')).toBeNull();expect(cancelAnimationFrame).toHaveBeenCalledWith(17);expect(disconnect).toHaveBeenCalledOnce();
});
