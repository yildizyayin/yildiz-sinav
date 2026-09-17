import { describe,expect,it,vi } from 'vitest';
import type { Env } from '../worker/types';
import { chooseNibiruModelDecision,classifyNibiruWorkload,probeNibiruModels,runNibiruInference } from '../worker/lib/nibiru-model-router';
import { routeNibiruSpecialist } from '../worker/lib/nibiru-specialists';

const env={} as Env;

function decision(role:any,intent:any,message:string){
 const route=routeNibiruSpecialist({role},message);
 return chooseNibiruModelDecision(env,{role},intent,message,route);
}

function decisionWithEnv(environment:Env,role:any,intent:any,message:string){
 const route=routeNibiruSpecialist({role},message);
 return chooseNibiruModelDecision(environment,{role},intent,message,route);
}

describe('Nibiru multi-AI router',()=>{
 it('uses fast model for common factual requests',()=>{
  const d=decision('STUDENT','LATEST_EXAM','Son sınavım nasıl geçti?');
  expect(d.workload).toBe('FAST_FACT');
  expect(d.candidates[0].family).toBe('FAST');
 });
 it('keeps high-volume Education Coach on the fast lane',()=>{
  const d=decision('STUDENT','TODAY_PLAN','Bugün ne çalışayım?');
  expect(d.workload).toBe('COACHING');
  expect(d.candidates.map(x=>x.family)).toEqual(['FAST','META','NVIDIA']);
 });
 it('uses Meta first for human-like guidance language',()=>{
  const d=decision('STUDENT','GENERAL_ACADEMIC','YKS hedefime ulaşmak için nasıl ilerlemeliyim?');
  expect(d.workload).toBe('GUIDANCE');
  expect(d.candidates[0].family).toBe('META');
 });
 it('uses NVIDIA first for quantitative multi-step tutoring',()=>{
  const d=decision('STUDENT','GENERAL_ACADEMIC','Bu matematik problemini neden yanlış yaptım, adım adım çözer misin?');
  expect(d.workload).toBe('SUBJECT_REASONING');
  expect(d.candidates[0].family).toBe('NVIDIA');
 });
 it('uses Meta first for regular subject explanations',()=>{
  const d=decision('STUDENT','GENERAL_ACADEMIC','Türkçe paragrafta ana düşünceyi anlatır mısın?');
  expect(d.workload).toBe('SUBJECT_EXPLANATION');
  expect(d.candidates[0].family).toBe('META');
 });
 it('uses Meta for parent-friendly explanation',()=>{
  const d=decision('PARENT','STUDENT_GENERAL','Çocuğumun gelişimini açıklar mısın?');
  expect(d.workload).toBe('PARENT_EXPLANATION');
  expect(d.candidates[0].family).toBe('META');
 });
 it('uses NVIDIA for institution-level analysis',()=>{
  const d=decision('INSTITUTION_MANAGER','INSTITUTION_SUMMARY','Kurumumdaki akademik düşüşün nedenlerini analiz et');
  expect(d.workload).toBe('INSTITUTION_ANALYSIS');
  expect(d.candidates[0].family).toBe('NVIDIA');
 });
 it('never shares personalized model cache by default',()=>{
  const d=decision('STUDENT','GENERAL_ACADEMIC','Matematikte nasıl gidiyorum?');
  expect(d.skipCache).toBe(true);
  expect(d.gatewayId).toBe('default');
 });
 it('supports cost-protection mode',()=>{
  const fastEnv={NIBIRU_ROUTER_MODE:'FAST_ONLY'} as Env;
  const route=routeNibiruSpecialist({role:'STUDENT'},'Bu matematik problemini adım adım çöz');
  const d=chooseNibiruModelDecision(fastEnv,{role:'STUDENT'},'GENERAL_ACADEMIC','Bu matematik problemini adım adım çöz',route);
  expect(d.candidates).toHaveLength(1);
  expect(d.candidates[0].family).toBe('FAST');
 });
 it('keeps model IDs configurable without changing routing policy',()=>{
  const customEnv={NIBIRU_FAST_MODEL:'fast/x',NIBIRU_META_MODEL:'meta/y',NIBIRU_REASONING_MODEL:'nvidia/z'} as Env;
  const route=routeNibiruSpecialist({role:'STUDENT'},'Bu matematik problemini neden yanlış yaptım?');
  const d=chooseNibiruModelDecision(customEnv,{role:'STUDENT'},'GENERAL_ACADEMIC','Bu matematik problemini neden yanlış yaptım?',route);
  expect(d.candidates.map(x=>x.model)).toEqual(['nvidia/z','meta/y','fast/x']);
 });
 it('keeps the specialist and workload sticky when the intent is unchanged',()=>{
  const route=routeNibiruSpecialist({role:'STUDENT'},'Bu matematik problemini adım adım çöz');
  const d=chooseNibiruModelDecision(env,{role:'STUDENT'},'GENERAL_ACADEMIC','Bu matematik problemini adım adım çöz',route,{specialist:'EDUCATION_COACH',workload:'COACHING'});
  expect(d.specialist).toBe('EDUCATION_COACH');
  expect(d.workload).toBe('COACHING');
  expect(d.candidates[0].family).toBe('FAST');
 });
 it('keeps newly catalogued Workers AI models opt-in',()=>{
  const optionalEnv={NIBIRU_EXPERIMENTAL_MODELS:'ON'} as Env;
  const coaching=chooseNibiruModelDecision(optionalEnv,{role:'STUDENT'},'TODAY_PLAN','Bugün ne çalışayım?',routeNibiruSpecialist({role:'STUDENT'},'Bugün ne çalışayım?'));
  expect(coaching.candidates.map(x=>x.family)).toEqual(['FAST','DEEPSEEK','META','NVIDIA']);
  const subject=chooseNibiruModelDecision(optionalEnv,{role:'STUDENT'},'GENERAL_ACADEMIC','Türkçe paragrafı anlatır mısın?',routeNibiruSpecialist({role:'STUDENT'},'Türkçe paragrafı anlatır mısın?'));
  expect(subject.candidates.map(x=>x.family)).toEqual(['META','DEEPSEEK','QWEN','NVIDIA','FAST']);
 });
 it('only adds Groq as a configured fallback for heavy workloads',()=>{
  const groqEnv={NIBIRU_GROQ_API_KEY:'test-key'} as Env;
  const reasoning=decisionWithEnv(groqEnv,'STUDENT','GENERAL_ACADEMIC','Bu matematik problemini neden yanlış yaptım, adım adım çözer misin?');
  expect(reasoning.candidates.map(x=>x.family)).toEqual(['NVIDIA','META','GROQ','FAST']);
  const guidance=chooseNibiruModelDecision(groqEnv,{role:'STUDENT'},'GENERAL_ACADEMIC','YKS hedefime nasıl ilerlemeliyim?',routeNibiruSpecialist({role:'STUDENT'},'YKS hedefime nasıl ilerlemeliyim?'));
  expect(guidance.candidates.some(x=>x.family==='GROQ')).toBe(false);
 });
 it('calls Groq through its OpenAI-compatible endpoint in non-production',async()=>{
  const fetchMock=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({choices:[{message:{content:'OK'}}]})});
  vi.stubGlobal('fetch',fetchMock);
  const env={ENVIRONMENT:'staging',NIBIRU_GROQ_API_KEY:'test-key'} as Env;
  const d=decisionWithEnv(env,'STUDENT','GENERAL_ACADEMIC','Bu matematik problemini neden yanlış yaptım, adım adım çözer misin?');
  const result=await runNibiruInference(env,d,[{role:'user',content:'Soru'}]);
  expect(result.text).toBe('OK');
  expect(fetchMock).toHaveBeenCalledWith('https://api.groq.com/openai/v1/chat/completions',expect.objectContaining({method:'POST'}));
  vi.unstubAllGlobals();
 });
 it('falls back to direct Workers AI when the Gateway transport is unavailable',async()=>{
  const calls:any[]=[];
  const ai={
   run:async(model:any,_input:any,options?:any)=>{
    calls.push({model,options});
    if(options?.gateway)throw new Error('gateway unavailable');
    return{response:'OK'};
   },
  };
  const env={AI:ai,NIBIRU_AI_GATEWAY_ID:'default'} as Env;
  const d=decision('STUDENT','GENERAL_ACADEMIC','Türkçe paragrafı anlatır mısın?');
  const result=await runNibiruInference(env,d,[{role:'user',content:'Bağlantı testi'}]);
  expect(result.text).toBe('OK');
  expect(result.directFallbackUsed).toBe(true);
  expect(result.attempts[0].transport).toBe('direct');
  expect(calls).toHaveLength(2);
 });

 it('probes FAST, META and NVIDIA providers independently',async()=>{
  const ai={run:async(_model:any,_input:any,_options?:any)=>({response:'OK'})};
  const result=await probeNibiruModels({AI:ai,NIBIRU_AI_GATEWAY_ID:'default'} as Env);
  expect(result.ok).toBe(true);
  expect(result.results.map(x=>x.family)).toEqual(['FAST','META','NVIDIA']);
  expect(result.results.every(x=>x.ok&&x.transport==='gateway')).toBe(true);
 });

});
