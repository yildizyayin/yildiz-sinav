// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,it,expect,vi} from 'vitest';
vi.mock('../src/api',async()=>({...await vi.importActual('../src/api'),api:vi.fn()}));
import {api} from '../src/api';
import {QuestionPoolReadiness} from '../src/components/QuestionPoolReadiness';
import {QuestionProductionControl} from '../src/components/QuestionProductionControl';
let root:ReturnType<typeof createRoot>|undefined,node:HTMLElement|undefined;
afterEach(async()=>{if(root)await act(async()=>root!.unmount());node?.remove();root=undefined;vi.clearAllMocks();});
async function render(component:any){(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;node=document.createElement('div');document.body.append(node);root=createRoot(node);await act(async()=>root!.render(component));return node;}
it('shows observed counts without labelling imported programs as ready production',async()=>{
 vi.mocked(api).mockResolvedValue({academicYear:'2027-2028',summary:{importedGrades:8,totalGrades:8,observedOutcomes:177,expectedOutcomes:177,approvedLinkedQuestions:0},campaigns:[],grades:[{grade:5,observedOutcomes:23,expectedOutcomes:23,expectedThemes:7,fullProgramImported:true,approvedLinkedQuestions:0,proofScope:'BOUNDED_SUBCASES'}],note:'Kaynak kaydı kalite onayı değildir.'});
 const n=await render(createElement(QuestionPoolReadiness,{academicYear:'2027-2028'}));expect(n.textContent).toContain('177 / 177');expect(n.textContent).toContain('Toplu üretim kabulü bekliyor');expect(n.textContent).toContain('Özgün soru üretimi ve inceleme');expect(n.textContent).toContain('Henüz oluşturulmadı');
});
it('fails visibly when a report belongs to another year',async()=>{
 vi.mocked(api).mockResolvedValue({academicYear:'2026-2027',summary:{},grades:[]});const n=await render(createElement(QuestionPoolReadiness,{academicYear:'2027-2028'}));expect(n.querySelector('[role=alert]')?.textContent).toContain('seçilen yılla eşleşmiyor');expect(n.textContent).not.toContain('177 / 177');
});
it('does not allow a previous-year campaign to be started from the target-year panel',async()=>{
 vi.mocked(api).mockResolvedValue({campaign:{academic_year:'2026-2027',status:'PAUSED',revision:1,reserved_questions:0,draft_cap:50,last_result_json:null},quality:{allowed:true,passed:4,total:4,verifierCalibration:'PASSED'},limits:{dailyAiNeuronLimit:10000},schemaReady:true,verifiedOutcomes:2});
 const n=await render(createElement(QuestionProductionControl,{academicYear:'2027-2028'}));const button=[...n.querySelectorAll('button')].find(b=>b.textContent?.includes('Sınırlı sürekli üretimi başlat'))!;expect(button.disabled).toBe(true);expect(n.textContent).toContain('Bu kampanya 2026-2027 içindir');await act(async()=>button.click());expect(vi.mocked(api).mock.calls.some(([,o])=>o?.method==='PATCH')).toBe(false);
});
