// @vitest-environment happy-dom
import {readFileSync} from 'node:fs';
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it} from 'vitest';
import {GENERATOR_MODEL_ALLOWLIST,selectGeneratorModel} from '../worker/lib/question-generation-runner';
import {GeneratorComparison} from '../src/pages/QuestionTeam';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;

const GLM='@cf/zai-org/glm-4.7-flash',OSS='@cf/openai/gpt-oss-120b',VERIFIER='@cf/nvidia/nemotron-3-120b-a12b';
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');

it('splits jobs deterministically between the two candidate producers over the same period',()=>{
 const env={QUESTION_GENERATION_MODEL:GLM,QUESTION_GENERATION_MODEL_CANDIDATES:`${GLM},${OSS}`,QUESTION_GENERATION_VERIFIER_MODEL:VERIFIER};
 const ids=Array.from({length:200},(_,i)=>`qgj_${i.toString(16).padStart(8,'0')}-test`);
 const picks=ids.map(id=>selectGeneratorModel(env,id));
 expect(new Set(picks)).toEqual(new Set([GLM,OSS]));
 const oss=picks.filter(p=>p===OSS).length;
 expect(oss).toBeGreaterThan(60);expect(oss).toBeLessThan(140);
 expect(ids.map(id=>selectGeneratorModel(env,id))).toEqual(picks);
});

it('never lets the verifier grade itself, ignores unknown models and falls back to the single configured producer',()=>{
 expect(GENERATOR_MODEL_ALLOWLIST).not.toContain(VERIFIER);
 const base={QUESTION_GENERATION_MODEL:GLM,QUESTION_GENERATION_VERIFIER_MODEL:VERIFIER};
 expect(selectGeneratorModel({...base,QUESTION_GENERATION_MODEL_CANDIDATES:`${GLM},${VERIFIER},@cf/unknown/model`},'qgj_a')).toBe(GLM);
 expect(selectGeneratorModel({...base,QUESTION_GENERATION_MODEL_CANDIDATES:''},'qgj_a')).toBe(GLM);
 expect(selectGeneratorModel({QUESTION_GENERATION_MODEL_CANDIDATES:`${OSS},${GLM}`,QUESTION_GENERATION_VERIFIER_MODEL:OSS},'qgj_a')).toBe(GLM);
});

it('production compares both producers while keeping the independent verifier',()=>{
 const config=read('../wrangler.production.jsonc');
 expect(config).toMatch(/"QUESTION_GENERATION_MODEL_CANDIDATES":\s*"@cf\/zai-org\/glm-4\.7-flash,@cf\/openai\/gpt-oss-120b"/);
 expect(config).toMatch(/"QUESTION_GENERATION_VERIFIER_MODEL":\s*"@cf\/nvidia\/nemotron-3-120b-a12b"/);
 expect(read('../migrations/0117_question_generation_job_model.sql')).toMatch(/ALTER TABLE question_generation_jobs ADD COLUMN generator_model TEXT/);
});

it('producer and verifier are both told that cross-subject factual errors invalidate a question',()=>{
 const runner=read('../worker/lib/question-generation-runner.ts'),verifier=read('../worker/lib/question-generation-validation.ts');
 expect(runner).toContain('never build a question on a false natural or scientific premise and never use a scientifically correct explanation as a wrong option');
 expect(verifier).toContain('against established knowledge from ALL subjects');
 expect(verifier).toContain('a distractor that is in fact a correct real-world explanation');
});

it('panel shows per-model yield and human acceptance',async()=>{
 const node=document.createElement('div'),root=createRoot(node);document.body.append(node);
 try{
  await act(async()=>root.render(createElement(GeneratorComparison,{rows:[
   {model:OSS,jobs:4,screened:3,outputInvalid:0,qualityRejected:1,otherFailed:0,humanApproved:2,humanRejected:1},
   {model:'UNRECORDED',jobs:3,screened:1,outputInvalid:1,qualityRejected:1,otherFailed:0,humanApproved:0,humanRejected:1},
  ]})));
  const text=node.textContent||'';
  expect(text).toContain('GPT-OSS 120B (güçlü)');expect(text).toContain('3 (%75)');expect(text).toContain('2 (%50)');
  expect(text).toContain('Kayıtsız (karşılaştırma öncesi)');
 }finally{await act(async()=>root.unmount());node.remove();}
});
