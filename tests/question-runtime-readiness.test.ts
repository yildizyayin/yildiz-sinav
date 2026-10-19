import {it,expect} from 'vitest';
import {runtimeReadiness,inspectQuestionRuntime} from '../scripts/inspect-question-runtime.mjs';
const enabled={QUESTION_GENERATION_ENABLED:true,QUESTION_GENERATION_VERIFICATION_ENABLED:true,QUESTION_AUTOMATED_PILOT_MODE:true,QUESTION_AGENT_DISPATCH_PREVIEW:true,QUESTION_AGENT_EXECUTION_ENABLED:true,QUESTION_TEAM_CONTROLS_ENABLED:true,QUESTION_PILOT_REVIEW_AVAILABLE:true};
const ready={academicYear:'2027-2028',flags:enabled,aiBindingPresent:true,actorVerified:true,remainingBudget:5,reviewCapacity:12,queuedReview:10,verifiedOutcomes:2,teamPaused:false};
it('reports exact missing runtime conditions without inventing budget, review slots or target curriculum',()=>{
 expect(runtimeReadiness(ready)).toEqual({ready:true,reasons:[]});const p=runtimeReadiness({...ready,remainingBudget:null,reviewCapacity:null,actorVerified:null,verifiedOutcomes:0});expect(p.ready).toBe(false);expect(p.reasons).toEqual(expect.arrayContaining(['BUDGET_EXHAUSTED_OR_UNKNOWN','REVIEW_CAPACITY_REQUIRED','SERVICE_ACTOR_NOT_VERIFIED','TARGET_CURRICULUM_REQUIRED']));expect(runtimeReadiness({...ready,queuedReview:12}).reasons).toContain('REVIEW_CAPACITY_REQUIRED');expect(runtimeReadiness({...ready,academicYear:'2026-2027'}).reasons).toContain('TARGET_YEAR_MISMATCH');
});
it('uses only metadata reads and SELECT SQL, suppresses identities/secrets, and distinguishes an unreadable actor',async()=>{
 const calls:any[]=[];const bindings=[{name:'DB',type:'d1',id:'db'},{name:'AI',type:'ai'},{name:'QUESTION_AGENT_SERVICE_ACTOR_ID',type:'secret_text'},{name:'QUESTION_AUTOMATED_ACADEMIC_YEAR',type:'plain_text',text:'2027-2028'},{name:'QUESTION_PILOT_REVIEW_SLOTS',type:'plain_text',text:'12'},...Object.keys(enabled).map(name=>({name,type:'plain_text',text:'true'}))];
 const fetcher=async(url:any,options:any={})=>{calls.push({url,options});let result:any;
 if(url.endsWith('/api/health'))return Response.json({environment:'production'});
 if(url.endsWith('/versions'))result={items:[{id:'v'}]};else if(url.endsWith('/versions/v'))result={resources:{bindings}};else{
  const {sql}=JSON.parse(options.body);expect(sql).toMatch(/^SELECT /);let rows:any[]=[];
  if(sql.includes('sqlite_master'))rows=['question_bank','question_agent_pilot_budget','question_team_control','question_team_agent_control','curriculum_versions','outcomes','question_generation_jobs'].map(name=>({name}));
  else if(sql.includes('question_agent_pilot_budget'))rows=[{question_cap:50,reserved_count:45}];
  else if(sql.includes('FROM question_team_control'))rows=[{paused:0}];
  else if(sql.includes('question_team_agent_control'))rows=['GENERATOR','VERIFIER','ORIGINALITY'].map(agent_key=>({agent_key,paused:0}));
  else if(sql.includes('FROM outcomes'))rows=[{n:2}];
  else if(sql.includes('count(*) n FROM question_bank'))rows=[{n:10}];
  result=[{results:rows}];
 }return Response.json({success:true,result});};
 const p=await inspectQuestionRuntime({fetcher:fetcher as any,account:'account',token:'DO_NOT_EXPOSE'});expect(p).toMatchObject({readOnly:true,actorVerified:null,remainingBudget:5,reviewCapacity:12,ready:false});expect(JSON.stringify(p)).not.toContain('DO_NOT_EXPOSE');expect(JSON.stringify(p)).not.toContain('Authorization');expect(calls.every(c=>!c.url.includes('/ai/'))).toBe(true);
});
it('refuses a demo domain response before reading any Cloudflare state',async()=>{
 let n=0;await expect(inspectQuestionRuntime({fetcher:(async()=>{n++;return Response.json({environment:'staging'})}) as any})).rejects.toThrow('PRODUCTION_DOMAIN_REQUIRED');expect(n).toBe(1);
});
