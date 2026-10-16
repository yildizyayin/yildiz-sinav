import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {calibrationBaseline} from '../worker/lib/question-calibration-fixture';
import {blindSolveIssues,scientificSourceNumbers} from '../worker/lib/question-blind-solve';
const q=calibrationBaseline as any;
function proof(){return {sourceNumbers:scientificSourceNumbers(q),answer:'C',optionChecks:['A','B','C','D'].map(label=>({label,correct:label==='C',reason:'Gerçek kaynak verilerinden hesaplandı.'})),calculations:[{left:280,op:'CEIL_DIV',right:40,result:7},{left:7,op:'MUL',right:120,result:840},{left:280,op:'CEIL_DIV',right:55,result:6},{left:6,op:'MUL',right:150,result:900},{left:280,op:'CEIL_DIV',right:70,result:4},{left:4,op:'MUL',right:180,result:720}]};}
it('accepts recomputed source arithmetic, independent key and per-option evidence',()=>{expect(blindSolveIssues(q,proof())).toEqual([]);const p=proof();p.sourceNumbers=Object.fromEntries(Object.entries(p.sourceNumbers).reverse());expect(blindSolveIssues(q,p)).toEqual([]);});
it('rejects contradictory source data even if every editorial score would be high',()=>{const wrong=structuredClone(q);wrong.editorial.visual.rows[2][2]='380';expect(blindSolveIssues(wrong,proof())).toContain('BLIND_SOLUTION_INVALID');const p=proof();p.sourceNumbers=scientificSourceNumbers(wrong);expect(blindSolveIssues(wrong,p)).toContain('BLIND_UNSOURCED_OPERAND');expect(blindSolveIssues(wrong,p)).toContain('BLIND_UNUSED_VISUAL_NUMBER');});
it('rejects unsupported arithmetic, answer-key mismatch and unexamined options',()=>{const p=proof();p.calculations[0].result=8;expect(blindSolveIssues(q,p)).toContain('BLIND_ARITHMETIC_INVALID');const p2=proof();p2.answer='A';expect(blindSolveIssues(q,p2)).toContain('BLIND_ANSWER_DISAGREEMENT');p2.optionChecks.pop();expect(blindSolveIssues(q,p2)).toContain('BLIND_SOLUTION_INVALID');});

it('derives the whole package count from a checked positive division without admitting arbitrary inputs',()=>{const p=proof();p.calculations[1]={left:280,op:'DIV',right:55,result:280/55};p.calculations[2]={left:7,op:'MUL',right:120,result:840};expect(blindSolveIssues(q,p)).toEqual([]);p.calculations[3].left=8;expect(blindSolveIssues(q,p)).toContain('BLIND_UNSOURCED_OPERAND');});

it('accepts actual public place-value components instead of treating them as invented operands',()=>{const fixture=JSON.parse(readFileSync(new URL('./fixtures/reading-place-value-proof.json',import.meta.url),'utf8'));const sources=scientificSourceNumbers(fixture.question);expect(Object.values(sources)).toContain(4000000000);expect(Object.values(sources)).toContain(500000);expect(Object.values(sources)).toContain(891);expect(blindSolveIssues(fixture.question,{...fixture.evidence,sourceNumbers:sources})).toEqual([]);});

import {independentlySolve} from '../worker/lib/question-blind-solve';
import {questionAiFailure} from '../worker/lib/question-ai-failure';
it('retains safe failure categories while dropping arbitrary provider text and fields',()=>{
 const error=Object.assign(Error('Gateway: 3045: Unknown internal error; secret=do-not-persist'),{status:503,authorization:'do-not-persist'});
 expect(questionAiFailure(error)).toEqual({diagnosticCode:'PROVIDER_INTERNAL_ERROR',providerCode:3045,httpStatus:503});
 expect(JSON.stringify(questionAiFailure(error))).not.toContain('do-not-persist');
 expect(questionAiFailure(Error('BLIND_SOLVER_TIMEOUT')).diagnosticCode).toBe('AI_TIMEOUT');
 expect(questionAiFailure(Error('QUESTION_DAILY_AI_BUDGET_EXHAUSTED')).diagnosticCode).toBe('DAILY_AI_BUDGET');
 expect(questionAiFailure({status:429,message:'Too many requests'}).diagnosticCode).toBe('PROVIDER_RATE_LIMIT');
 expect(questionAiFailure({status:401}).diagnosticCode).toBe('PROVIDER_AUTH_ERROR');
 expect(questionAiFailure({status:400}).diagnosticCode).toBe('PROVIDER_REQUEST_REJECTED');
 expect(questionAiFailure(null).diagnosticCode).toBe('PROVIDER_FAILED');
});
it('keeps provider unavailability distinct from a wrong answer and does not retry',async()=>{
 let calls=0;const env:any={AI:{run:async()=>{calls++;throw Error('3045: Unknown internal error; do-not-persist');}}};
 const result=await independentlySolve(env,q,'@cf/nvidia/nemotron-3-120b-a12b');
 expect(result).toMatchObject({ok:false,issues:['BLIND_SOLVER_UNAVAILABLE'],diagnosticCode:'PROVIDER_INTERNAL_ERROR',providerCode:3045,keyHidden:true,solutionHidden:true});
 expect(calls).toBe(1);expect(JSON.stringify(result)).not.toContain('do-not-persist');
});

import {questionResponseFormat} from '../worker/lib/question-ai-schema';
it('uses the model-specific Chat Completions schema envelope without changing the scientific schema',()=>{
 const schema={type:'object',additionalProperties:false,properties:{answer:{type:'string',enum:['A','B']}}};
 expect(questionResponseFormat('@cf/nvidia/nemotron-3-120b-a12b',schema,'blind_solution')).toEqual({type:'json_schema',json_schema:{name:'blind_solution',schema,strict:true}});
 expect(questionResponseFormat('@cf/qwen/qwen3-30b-a3b-fp8',schema,'unchanged')).toEqual({type:'json_schema',json_schema:schema});
});
it('classifies documented account, capacity and timeout errors from numeric codes without leaking text',()=>{
 for(const [code,expected] of [[3036,'PROVIDER_DAILY_ALLOCATION'],[3040,'PROVIDER_CAPACITY'],[3007,'PROVIDER_TIMEOUT'],[3008,'PROVIDER_ABORTED'],[5035,'PROVIDER_PAID_PLAN_REQUIRED'],[5018,'PROVIDER_AUTH_ERROR'],[5007,'PROVIDER_REQUEST_REJECTED']] as const){
  expect(questionAiFailure(Error(`${code}: hidden-provider-text`))).toMatchObject({providerCode:code,diagnosticCode:expected});
 }
});

import {vi} from 'vitest';
it('allows the reasoned Nemotron call to continue beyond90s but stops it at the bounded240s deadline',async()=>{
 vi.useFakeTimers();try{
  const env:any={AI:{run:async()=>new Promise(()=>{})}};let settled=false;
  const task=independentlySolve(env,q,'@cf/nvidia/nemotron-3-120b-a12b');task.then(()=>settled=true);
  await vi.advanceTimersByTimeAsync(90000);expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(150000);expect(await task).toMatchObject({ok:false,diagnosticCode:'AI_TIMEOUT',issues:['BLIND_SOLVER_UNAVAILABLE']});
 }finally{vi.useRealTimers();}
});
