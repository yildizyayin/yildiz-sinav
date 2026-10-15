// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {afterEach,it,expect,vi} from 'vitest';
vi.mock('../src/api',async()=>({...await vi.importActual('../src/api'),api:vi.fn()}));
vi.mock('../src/auth',()=>({useAuth:vi.fn(()=>({user:{id:'super',role:'SUPER_ADMIN'}}))}));
import {api} from '../src/api';
import {useAuth} from '../src/auth';
import {QuestionTeam} from '../src/pages/QuestionTeam';
let root:ReturnType<typeof createRoot>|undefined,node:HTMLElement|undefined;
afterEach(async()=>{if(root)await act(async()=>root!.unmount());node?.remove();root=undefined;vi.clearAllMocks();});
const data={environment:'staging',asOf:'2026-10-14T11:00:00Z',controlsEnabled:true,control:{paused:0,revision:7},roster:[{key:'GENERATOR',name:'Soru üretimi',status:'READY',model:'producer',paused:false,controlRevision:3,activeJobs:0}],budget:{cap:50,reserved:45,remaining:5},usage:{reportedTokens:500},scheduler:{executionEnabled:false,ready:false,reasons:[]},questionCounts:{REVIEW:10},jobs:[],questions:[],activity:[],controlEvents:[],videoProof:{technicalVerified:true,studentVideoCount:0}};
async function render(){(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;node=document.createElement('div');document.body.append(node);root=createRoot(node);await act(async()=>root!.render(createElement(MemoryRouter,{},createElement(QuestionTeam))));return node;}
it('uses live capacity and revision-bound pause while leaving automatic execution off',async()=>{
 vi.mocked(api).mockImplementation(async(path,options)=>{if(options?.method==='PATCH')return {ok:true} as any;if(String(path).endsWith('/production'))return {campaign:{status:'PAUSED',revision:0,reserved_questions:0,draft_cap:500000,last_tick_at:null,last_result_json:null},quality:{allowed:false,passed:0,total:4,verifierCalibration:'BLOCKED'},limits:{dailyAiNeuronLimit:10000},verifiedOutcomes:2,automaticEnabled:false} as any;return (String(path).includes('/team?')?data:String(path).includes('coverage')?{items:[]}:{jobs:[],narrationConfigured:false}) as any;});
 const n=await render();expect(n.textContent).toContain('45 / 50');expect(n.textContent).toContain('Kapalı');expect([...n.querySelectorAll('button')].find(b=>b.textContent?.includes('Sınırlı sürekli üretimi başlat'))?.disabled).toBe(true);const pause=[...n.querySelectorAll('button')].find(b=>b.textContent?.includes('Ekibi duraklat'))!;await act(async()=>pause.click());const call=vi.mocked(api).mock.calls.find(([,o])=>o?.method==='PATCH')!;expect(JSON.parse(String(call[1]?.body))).toEqual({agentKey:'TEAM',paused:true,expectedRevision:7});expect(vi.mocked(api).mock.calls.some(([p])=>String(p).includes('/run'))).toBe(false);
});
it('does not expose team records or make API requests to other roles',async()=>{
 vi.mocked(useAuth).mockReturnValueOnce({user:{id:'t',role:'TEACHER'}} as any);const n=await render();expect(n.textContent).toContain('yalnız Süper Admin');expect(api).not.toHaveBeenCalled();
});
