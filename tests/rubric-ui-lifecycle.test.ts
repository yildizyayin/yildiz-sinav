// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {RubricObservationReport} from '../src/components/RubricObservationReport';
const calls=vi.hoisted(()=>({api:vi.fn()}));
vi.mock('../src/api',()=>({api:calls.api,qs:()=>''}));
vi.mock('../src/components/PrivateRubricExportPanel',()=>({PrivateRubricExportPanel:()=>null}));
let root:Root,container:HTMLDivElement;
function deferred(){let resolve!:(v:any)=>void,reject!:(e:Error)=>void;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
const rubric={id:'r',enrollment_id:'e',can_observe:1,outcome_code:'O',title:'Synthetic rubric',version_label:'v1',task_instructions:'Observe',criteria:[{id:'c',title:'Action',levels:[{id:'l',label:'Independent'}]}]};
const report=()=>({enrollments:[{id:'e',academic_year:'2026-2027'}],rubrics:[rubric],observations:[]});
async function render(studentId='A'){await act(async()=>root.render(createElement(RubricObservationReport,{studentId,userId:'teacher'})))}
async function settle(task:()=>void){await act(async()=>{task();await Promise.resolve()})}
function button(text:string){const b=[...container.querySelectorAll('button')].find(x=>x.textContent===text);expect(b,`Missing button: ${text}`).toBeTruthy();return b!}
async function selectRubric(){await settle(()=>{const select=container.querySelector('fieldset select') as HTMLSelectElement;select.value='e:r';select.dispatchEvent(new Event('change',{bubbles:true}))})}
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;calls.api.mockReset();calls.api.mockResolvedValue(report());container=document.createElement('div');document.body.append(container);root=createRoot(container)});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();vi.unstubAllGlobals()});

it.each(['success','error'])('ignores the first A load after A/B/A commits: %s',async(mode)=>{
 const old=deferred();calls.api.mockImplementationOnce(()=>old.promise);await render('A');await render('B');await render('A');
 await settle(()=>mode==='error'?old.reject(new Error('old A failure')):old.resolve({...report(),observations:[{id:'invalid old observation'}]}));
 expect(container.textContent).not.toContain('old A failure');expect(container.textContent).toContain('Bu kapsamda yayımlanmış gözlem yok.');
});
it('clears all observation draft text and date on student change',async()=>{
 await render();await selectRubric();const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!;
 for(const textarea of container.querySelectorAll('textarea'))await settle(()=>{setter.call(textarea,'private draft for A');textarea.dispatchEvent(new Event('input',{bubbles:true}))});
 await render('A');expect([...container.querySelectorAll('textarea')].map(x=>x.value)).toEqual(['private draft for A','private draft for A','private draft for A']);
 await settle(()=>{const date=container.querySelector('input[type=date]') as HTMLInputElement;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(date,'2026-01-01');date.dispatchEvent(new Event('input',{bubbles:true}))});expect((container.querySelector('input[type=date]') as HTMLInputElement).value).toBe('2026-01-01');
 await render('B');await selectRubric();expect([...container.querySelectorAll('textarea')].map(x=>x.value)).toEqual(['','','']);expect((container.querySelector('input[type=date]') as HTMLInputElement).value).toBe(new Date().toISOString().slice(0,10));expect((container.querySelector('input[type=checkbox]') as HTMLInputElement).checked).toBe(false);
});
it('does not carry a late pagination error into another student',async()=>{
 const page=deferred();calls.api.mockResolvedValueOnce({...report(),nextCursor:'older'});await render();calls.api.mockImplementationOnce(()=>page.promise);await settle(()=>button('Önceki gözlemleri yükle').click());await render('B');await settle(()=>page.reject(new Error('old page denied')));expect(container.textContent).not.toContain('old page denied');expect((container.querySelector('select') as HTMLSelectElement).disabled).toBe(false);
});
it('does not carry a completed withdrawal into another student or reload it',async()=>{
 const write=deferred();const initial={...report(),canObserve:true,observations:[{id:'obs',observer_id:'teacher',snapshot:{title:'Evidence',versionLabel:'v1',criteria:[]},selections:[],observed_at:'2026-10-01',evidence_note:'Evidence',feedback:'Feedback',next_step:'Next'}]};calls.api.mockImplementation((_path:string,options:any)=>options?.method==='POST'?write.promise:Promise.resolve(initial));
 await render();await settle(()=>button('Bu gözlemi geri çek').click());await settle(()=>{const reason=container.querySelector('textarea')!;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(reason,'Observed evidence should be withdrawn');reason.dispatchEvent(new Event('input',{bubbles:true}))});await settle(()=>button('Gerekçeyle geri çek').click());expect(calls.api.mock.calls.some(([path,o])=>path.endsWith('/withdraw')&&o?.method==='POST')).toBe(true);
 await render('B');const before=calls.api.mock.calls.length;await settle(()=>write.resolve({}));expect(calls.api).toHaveBeenCalledTimes(before);expect(container.textContent).not.toContain('Gözlem geri çekildi;');
});
it('does not publish an old-scope success message or reload into a new student',async()=>{
 const write=deferred();calls.api.mockImplementation((_path:string,options:any)=>options?.method==='POST'?write.promise:Promise.resolve(report()));
 await render();await selectRubric();await settle(()=>{const select=container.querySelectorAll('fieldset select')[1] as HTMLSelectElement;select.value='l';select.dispatchEvent(new Event('change',{bubbles:true}))});await settle(()=>{(container.querySelector('input[type=checkbox]') as HTMLInputElement).click()});
 await settle(()=>button('Gözlemi yayımla').click());expect(calls.api.mock.calls.some(([,o])=>o?.method==='POST')).toBe(true);await render('B');const before=calls.api.mock.calls.length;await settle(()=>write.resolve({}));expect(calls.api).toHaveBeenCalledTimes(before);expect(container.textContent).not.toContain('Gözlem yayımlandı.');expect(button('Seçili kapsamı CSV indir').disabled).toBe(true);
});
it.each(['scope','unmount'])('creates no CSV artifact when export is invalidated by %s',async(kind)=>{
 const page=deferred();const initial={...report(),observations:[{id:'obs',snapshot:{title:'Evidence',versionLabel:'v1',criteria:[]},selections:[],observed_at:'2026-10-01',evidence_note:'Evidence',feedback:'Feedback',next_step:'Next'}]};calls.api.mockResolvedValue(initial);
 await render();calls.api.mockImplementationOnce(()=>page.promise);const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:test');
 await settle(()=>button('Seçili kapsamı CSV indir').click());if(kind==='scope'){await render('B');await render('A')}else await act(async()=>root.unmount());
 await settle(()=>page.resolve(report()));expect(create).not.toHaveBeenCalled();expect(container.textContent).not.toContain('dışa aktarıldı.');
});
