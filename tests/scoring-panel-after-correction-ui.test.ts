// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,expect,it,vi} from 'vitest';

/**
 * Owner (9 Nov, ÇAP): after "Düzeltme" is opened, the Puanlama profili section offers the profiles at once — before
 * this it kept saying "kilitlidir" until the page was reloaded. Synthetic data only.
 */
const mocks=vi.hoisted(()=>({api:vi.fn(),params:new URLSearchParams('examId=ex1'),open:false}));
vi.mock('../src/api',async()=>{const real=await vi.importActual<any>('../src/api');return {...real,api:mocks.api};});
vi.mock('../src/auth',()=>({useAuth:()=>({user:{id:'admin',role:'SUPER_ADMIN'}})}));
vi.mock('react-router-dom',()=>({Link:(p:any)=>createElement('a',p),useNavigate:()=>()=>{},useSearchParams:()=>[mocks.params,()=>{}]}));
vi.mock('../src/components/ExamReadiness',()=>({ExamReadiness:()=>null}));
vi.mock('../src/components/ExamOutcomeEditor',()=>({ExamOutcomeEditor:()=>null}));
vi.mock('../src/components/ExamChannelNotice',()=>({ExamChannelNotice:()=>null}));
import {ExamDefinitions} from '../src/pages/ExamDefinitions';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;

const exam={id:'ex1',title:'Sentetik TYT',exam_type:'TYT',grade_level:12,academic_year:'2026-2027',publisher_name:'Sentetik',session_label:'Tek',description:'',owner_type:'CENTRAL',institution_id:null,status:'ACTIVE',outcome_mode:'OPTIONAL',scoring_rule_version_id:'srv_net'};
beforeEach(()=>{mocks.open=false;mocks.api.mockReset();mocks.api.mockImplementation(async(url:string,opts?:RequestInit)=>{
 if(url.startsWith('/api/exam-definitions/options'))return {subjects:[],scoringVersions:[],institutions:[],outcomes:[]};
 if(url==='/api/exam-definitions')return {exams:[exam]};
 if(url.endsWith('/correction')){ if(opts?.method==='POST'){mocks.open=true;return {ok:true};} return {open:mocks.open,correctionOpen:mocks.open,canOpen:true,pending:[],students:207}; }
 if(url.endsWith('/scoring-profile'))return {current:'srv_net',correctionOpen:mocks.open,options:[{id:'srv_net',rule_name:'TYT Deneme Neti',academic_year:'2026-2027',version:'v1'},{id:'srv_osym',rule_name:'ÖSYM TYT',academic_year:'2026-2027',version:'v1'}]};
 if(url==='/api/exam-definitions/ex1')return {exam,booklets:[{code:'A'}],subjects:[],answerKey:[],institutions:[],editable:false,correctionOpen:mocks.open,readiness:{ready_to_publish:true,blockers:[]}};
 if(url.startsWith('/api/exam-content/'))return {assets:[],videos:[]};
 return {};
});});

it('opening Düzeltme unlocks the scoring profile choice without a page reload', async()=>{
 const node=document.createElement('div'),root=createRoot(node);document.body.append(node);
 await act(async()=>root.render(createElement(ExamDefinitions)));
 await act(async()=>{await new Promise(r=>setTimeout(r,0));});
 const set=async(el:any,v:string)=>act(async()=>{Object.getOwnPropertyDescriptor(el instanceof HTMLSelectElement?HTMLSelectElement.prototype:el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(el,v);el.dispatchEvent(new Event(el instanceof HTMLSelectElement?'change':'input',{bubbles:true}));});
 expect(node.textContent).toContain('puanlama profili kilitlidir');
 await act(async()=>(node.querySelector('button[role=switch]') as HTMLButtonElement).click());
 await set(node.querySelector('.ect-confirm textarea'),'Puanlama ÖSYM TYT tahminine geçiriliyor.');
 await act(async()=>([...node.querySelectorAll('button')].find(b=>b.textContent!.includes('Evet, düzeltmeye aç')) as HTMLButtonElement).click());
 await act(async()=>{await new Promise(r=>setTimeout(r,0));});
 expect(node.textContent).not.toContain('puanlama profili kilitlidir');
 const select=[...node.querySelectorAll('label')].find(l=>l.textContent!.startsWith('Yeni profil'))?.querySelector('select') as HTMLSelectElement;
 expect([...select.options].map(o=>o.textContent)).toContain('ÖSYM TYT · 2026-2027 v1');
 await act(async()=>root.unmount());node.remove();
});
