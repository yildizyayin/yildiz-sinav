import { describe,expect,it } from 'vitest';
import type { Env } from '../worker/types';
import { chooseNibiruModelDecision,classifyNibiruWorkload } from '../worker/lib/nibiru-model-router';
import { routeNibiruSpecialist } from '../worker/lib/nibiru-specialists';

const env={} as Env;

function decision(role:any,intent:any,message:string){
 const route=routeNibiruSpecialist({role},message);
 return chooseNibiruModelDecision(env,{role},intent,message,route);
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
});
