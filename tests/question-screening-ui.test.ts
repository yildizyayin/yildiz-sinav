// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it} from 'vitest';
import {ScreeningTag} from '../src/components/QuestionScreening';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;

it('shows the verifier score as a tag that names weak dimensions only when suspicious',async()=>{
 const node=document.createElement('div'),root=createRoot(node);document.body.append(node);
 try{
  await act(async()=>root.render(createElement('div',null,
   createElement(ScreeningTag,{screening:{total:21,max:24,suspicion:3,weakest:['distractorQuality'],rationale:'Çeldirici zayıf'}}),
   createElement(ScreeningTag,{screening:{total:24,max:24,suspicion:0,weakest:[]}}),
   createElement(ScreeningTag,{screening:null}))));
  const tags=node.querySelectorAll('.tag.screening');
  expect(tags).toHaveLength(2);
  expect(tags[0].className).toContain('suspicious');expect(tags[0].textContent).toContain('Kontrol 21/24 · Çeldiriciler');
  expect(tags[0].getAttribute('title')).toContain('Çeldirici zayıf');
  expect(tags[1].className).toContain('clean');expect(tags[1].textContent).toBe(' Kontrol 24/24');
 }finally{await act(async()=>root.unmount());node.remove();}
});

