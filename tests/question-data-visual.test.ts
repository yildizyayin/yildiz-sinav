// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect} from 'vitest';
import {QuestionDataVisual,wrapVisualLabel} from '../src/components/QuestionDataVisual';
import {editorialQuestion} from './fixtures/editorial-question';
import {visualBlock} from '../worker/lib/question-editorial';
it('renders source data accessibly without exporting private reasoning or executing markup',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const node=document.createElement('div'),root=createRoot(node),p=editorialQuestion();const block=visualBlock(p.editorial as any)!;expect(block.payload).not.toHaveProperty('readingPurpose');(block.payload as any).rows[0][0]='<script>bad()</script>';
 await act(async()=>root.render(createElement(QuestionDataVisual,{blocks:[{id:'b',placement:'STEM',payload:block.payload}]})));expect(node.querySelectorAll('tbody tr')).toHaveLength(2);expect(node.querySelector('script')).toBeNull();expect(node.textContent).toContain('<script>bad()</script>');
 await act(async()=>root.render(createElement(QuestionDataVisual,{blocks:[{placement:'STEM',payload:{schemaVersion:1,kind:'TABLE',columns:['a','b'],rows:['invalid']}}]})));expect(node.querySelector('table')).toBeNull();await act(async()=>root.unmount());
});
it('shows every bar and exact accessible values with a zero baseline',async()=>{
 const node=document.createElement('div'),root=createRoot(node);await act(async()=>root.render(createElement(QuestionDataVisual,{blocks:[{id:'g',placement:'STEM',payload:{schemaVersion:1,kind:'BAR_CHART',title:'Üretim',unit:'adet',categories:['Birinci','İkinci'],values:[10,20]}}]})));expect(node.querySelectorAll('svg rect')).toHaveLength(2);expect(node.textContent).toContain('Birinci: 10 adet');expect(node.querySelector('svg title')?.textContent).toContain('İkinci: 20');expect(node.querySelector('svg text')?.textContent).toBe('0');await act(async()=>root.unmount());
});

it('preserves long category labels and vector geometry without ellipses or invalid numeric bars',async()=>{
 const label='Uzun kategori adı olan Ankara Bilim ve Teknoloji Merkezi';expect(wrapVisualLabel(label).join(' ')).toBe(label);
 const node=document.createElement('div'),root=createRoot(node);const payload={schemaVersion:1,kind:'BAR_CHART',title:'Veri',categories:[label,'Diğer'],values:[0,1000000000]};
 await act(async()=>root.render(createElement(QuestionDataVisual,{blocks:[{placement:'STEM',payload}]})));expect(node.querySelectorAll('tspan').length).toBeGreaterThan(2);expect(node.querySelector('svg')?.getAttribute('viewBox')).toContain('720');expect(node.querySelector('svg')?.textContent).not.toContain('…');expect(node.querySelectorAll('rect')[0].getAttribute('height')).toBe('0');
 await act(async()=>root.render(createElement(QuestionDataVisual,{blocks:[{placement:'STEM',payload:{...payload,values:[0,Infinity]}}]})));expect(node.querySelector('svg')).toBeNull();await act(async()=>root.unmount());
});
