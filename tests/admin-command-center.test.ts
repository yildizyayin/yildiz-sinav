// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {AdminCommandCenter} from '../src/pages/AdminCommandCenter';
const mock=vi.hoisted(()=>({api:vi.fn()}));vi.mock('../src/api',()=>mock);
let container:HTMLDivElement,root:Root;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;mock.api.mockReset();container=document.createElement('div');document.body.append(container);root=createRoot(container)});
afterEach(async()=>{await act(async()=>root.unmount());container.remove()});
async function render(){await act(async()=>root.render(createElement(MemoryRouter,null,createElement(AdminCommandCenter))))}
it('shows unavailable data instead of healthy zero or endless loading when dashboard fails',async()=>{
 mock.api.mockRejectedValue(new Error('Servis kullanılamıyor'));await render();
 expect(container.textContent).toContain('Göstergeler alınamadı');expect(container.textContent).toContain('Durum bilgisi alınamadı');expect(container.textContent).toContain('İşlem kayıtları alınamadı');
 expect(container.textContent).not.toContain('yükleniyor');expect(container.querySelector('.admin-home-count')?.textContent).toBe('—');expect(container.querySelector('.admin-home-summary strong')?.textContent).toBe('—');expect(container.textContent).not.toContain('tanıtım metinleri');
});
it('preserves actual zero and real counts when the summary is available',async()=>{
 mock.api.mockResolvedValue({cards:[{label:'Aktif sınav',value:2}],pending:{scanReview:0,opticalDefinitions:1,activationRequests:0,licenseWarnings:0},institutionSummary:{total:0},systemHealth:[],recentActivity:[]});await render();
 expect(container.querySelector('.admin-home-count')?.textContent).toBe('1');expect(container.querySelector('.admin-home-summary strong')?.textContent).toBe('0');expect(container.textContent).toContain('Henüz işlem kaydı bulunmuyor.');expect(container.textContent).not.toContain('yükleniyor');
});
