import type {Env,AuthUser} from '../types';
import {one,json} from './db';
import {calibrationCases} from './question-verifier-calibration';
import {verifyQuestionDrafts,type CheckedDraft} from './question-generation-validation';
import {readEditorPacket,QUESTION_EDITOR_MODEL} from './question-ai-editor';
import {sha256} from './question-team-policy';
import observed from '../../data/question-quality-observed-qwen.json';
import invalidNumber from '../../data/question-quality-invalid-number.json';
export const QUALITY_VALIDATION_ID='independent-quality-20261015-v1';
const verifier='@cf/nvidia/nemotron-3-120b-a12b';
export function qualityValidationCases(){
 const context={producerModel:QUESTION_EDITOR_MODEL,authorModels:['@cf/openai/gpt-oss-120b',QUESTION_EDITOR_MODEL],qualityProfile:'EDITORIAL_V1',presentation:'TABLE',gradeLevel:5,outcomeCode:'MAT.5.1.2',outcomeTitle:'Doğal sayılar ve işlemler içeren gerçek yaşam problemlerini çözebilme',academicYear:'2026-2027',taskFocus:'GENERIC'};
 const cases=calibrationCases().map((question,index)=>({key:['correct-table','wrong-key','wrong-arithmetic','wrong-table'][index],expectedPass:index===0,context,question}));
 const reading={...context,presentation:'TEXT',outcomeCode:'MAT.5.1.1',outcomeTitle:'Altı basamaklı sayıları okuma ve yazmayı çok basamaklı sayılara genelleyebilme',taskFocus:'READ_ZERO_PERIODS'};
 cases.push({key:'actual-editor-invalid-distractor-explanations',expectedPass:false,context:reading,question:readEditorPacket(observed,QUESTION_EDITOR_MODEL).questions[0]});
 cases.push({key:'actual-invalid-number-spelling',expectedPass:false,context:{...reading,taskFocus:'GENERIC'},question:invalidNumber as CheckedDraft});
 return cases;
}
export function qualityValidationFindings(results:any[]){
 const cases=qualityValidationCases();
 const findings=cases.map(c=>{const r=results.find(r=>r.key===c.key),v=r?.verification;
  // A timeout, missing scores or unavailable reviewer is NEVER a scientific rejection.
  const actualReview=!!v&&!v.unavailable&&Array.isArray(v.reviews)&&v.reviews.length===1&&v.reviews[0].valid===v.ok&&(v.ok||v.reviews[0].issues?.length>0);
  const expectedModel=v?.model===verifier&&v.blindSolves?.length===1&&v.blindSolves[0].keyHidden===true&&v.blindSolves[0].solutionHidden===true;
  const code=c.key==='wrong-arithmetic'?'INVALID_ARITHMETIC':c.key==='actual-invalid-number-spelling'?'INVALID_TURKISH_COMPOUND_NUMERAL':null;
  const mechanicalOnly=code!==null&&v?.model===null&&v.reviews?.[0]?.issues?.includes(code);
  const editorialEvidence=c.expectedPass||c.key==='actual-editor-invalid-distractor-explanations'?!!v?.reviews?.[0]?.editorial:true;
  const faultMatched=c.key!=='actual-editor-invalid-distractor-explanations'||/çeldirici|seçenek|açıklama|misconception|distractor|yanılgı/iu.test(JSON.stringify([v?.reviews?.[0]?.issues,v?.reviews?.[0]?.editorial?.rationale]));
  return {key:c.key,expectedPass:c.expectedPass,passed:actualReview&&(expectedModel||mechanicalOnly)&&editorialEvidence&&faultMatched&&v.ok===c.expectedPass,...(v?{accepted:v.ok,unavailable:v.unavailable,issues:v.reviews?.[0]?.issues??[]}:{} )};
 });
 return {passed:results.length===cases.length&&new Set(results.map(r=>r.key)).size===cases.length&&findings.every(f=>f.passed),findings};
}
/** Immutable verifier regression test. No question author/editor retry or publishing. */
export async function validateIndependentQuality(env:Env,user:AuthUser){
 if(user.role!=='SUPER_ADMIN'||env.ENVIRONMENT!=='staging')return json({ok:false,error:{code:'STAGING_ADMIN_REQUIRED'}},403);
 if(!env.AI||(env as any).QUESTION_BLIND_SOLVE_ENABLED!=='true'||env.QUESTION_GENERATION_VERIFIER_MODEL!==verifier||!(env as any).QUESTION_AI_DAILY_NEURON_LIMIT)return json({ok:false,error:{code:'BOUNDED_BLIND_VERIFIER_REQUIRED'}},409);
 const prior=await one<any>(env.DB.prepare('SELECT * FROM question_verifier_calibrations WHERE id=?').bind(QUALITY_VALIDATION_ID));
 if(prior)return json({ok:true,reused:true,validation:prior});
 const cases=qualityValidationCases(),sourceHash=await sha256(JSON.stringify(cases));
 const claim=await env.DB.prepare("INSERT OR IGNORE INTO question_verifier_calibrations(id,status) VALUES(?,'RUNNING')").bind(QUALITY_VALIDATION_ID).run();
 if(Number(claim.meta?.changes)!==1)return json({ok:false,error:{code:'QUALITY_VALIDATION_ALREADY_CLAIMED'}},409);
 const results:any[]=[];
 try{for(const c of cases)results.push({key:c.key,verification:await verifyQuestionDrafts(env,c.context,[c.question])});}
 catch(e){results.push({key:'execution-error',error:e instanceof Error?e.message:'VALIDATION_FAILED'});}
 const findings=qualityValidationFindings(results),report={...findings,sourceHash,verifier,results,benchmarkOnly:true,autonomousProductionCertified:false,createsQuestions:false,humanApproved:false};
 await env.DB.prepare('UPDATE question_verifier_calibrations SET status=?,findings_json=?,verification_json=?,completed_at=CURRENT_TIMESTAMP WHERE id=? AND status=\'RUNNING\'').bind(findings.passed?'PASS':'BLOCKED',JSON.stringify(findings.findings),JSON.stringify(report),QUALITY_VALIDATION_ID).run();
 return json({ok:true,...report});
}
