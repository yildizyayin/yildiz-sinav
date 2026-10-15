import type {AuthUser,Env} from '../types';
import {json,one} from './db';
import {verifyQuestionDrafts,type CheckedDraft} from './question-generation-validation';
import {calibrationBaseline} from './question-calibration-fixture';
export const CALIBRATION_ID='editorial-verifier-20261015-v3';
export function calibrationCases(){
 const baseline=structuredClone(calibrationBaseline) as CheckedDraft;
 const wrongKey=structuredClone(baseline);wrongKey.correctAnswer='A';wrongKey.editorial!.distractors.find(d=>d.label==='A')!.label='C';
 const wrongSolution=structuredClone(baseline);wrongSolution.solutionText=wrongSolution.solutionText.replace('7 × 120 = 840','7 × 120 = 940');
 const wrongTable=structuredClone(baseline);wrongTable.editorial!.visual.rows[2][2]='380';
 return [baseline,wrongKey,wrongSolution,wrongTable];
}
export function calibrationFindings(verification:any){
 const reviews=verification?.reviews??[];
 const findings=['Correct source must pass','Wrong answer key must fail','Incorrect solution arithmetic must fail','Contradictory table must fail'].map((name,index)=>({index,name,passed:reviews.find((r:any)=>r.index===index)?.valid===(index===0)}));
 return {passed:verification?.baselineModel==='@cf/nvidia/nemotron-3-120b-a12b'&&verification?.baselineEditorial===true&&!verification?.unavailable&&reviews.length===4&&findings.every(f=>f.passed),findings};
}
export async function handleVerifierCalibration(request:Request,env:Env,user:AuthUser|null){
 if(!user)return json({ok:false,error:{code:'UNAUTHENTICATED'}},401);
 if(user.role!=='SUPER_ADMIN')return json({ok:false,error:{code:'SUPER_ADMIN_ONLY'}},403);
 const prior=await one<any>(env.DB.prepare('SELECT * FROM question_verifier_calibrations WHERE id=?').bind(CALIBRATION_ID));
 if(request.method==='GET')return json({ok:true,contractVersion:'BLIND_V3_EDITORIAL_READING_V1',calibration:prior??null,createsQuestions:false,humanApproved:false});
 if(request.method!=='POST')return json({ok:false,error:{code:'METHOD_NOT_ALLOWED'}},405);
 if(request.headers.get('Origin')!==new URL(request.url).origin)return json({ok:false,error:{code:'INVALID_ORIGIN'}},403);
 if(env.ENVIRONMENT!=='staging'||!(env as any).QUESTION_AI_DAILY_NEURON_LIMIT)return json({ok:false,error:{code:'BOUNDED_STAGING_CALIBRATION_ONLY'}},409);
 if(prior)return json({ok:true,calibration:prior,reused:true});
 const claim=await env.DB.prepare("INSERT OR IGNORE INTO question_verifier_calibrations(id,status) VALUES(?,'RUNNING')").bind(CALIBRATION_ID).run();
 if(Number(claim.meta?.changes)!==1)return json({ok:false,error:{code:'CALIBRATION_ALREADY_CLAIMED'}},409);
 const context={producerModel:'@cf/openai/gpt-oss-120b',qualityProfile:'EDITORIAL_V1',presentation:'TABLE',gradeLevel:5,outcomeCode:'MAT.5.1.2',outcomeTitle:'Doğal sayılar ve işlemler içeren gerçek yaşam problemlerini çözebilme',academicYear:'2026-2027',taskFocus:'GENERIC'};
 const cases=calibrationCases(),caseVerifications:any[]=[];
 // Separate independent items: duplicates in a batch must not masquerade as scientific rejection.
 for(let i=0;i<cases.length;i+=2)caseVerifications.push(...await Promise.all(cases.slice(i,i+2).map(q=>verifyQuestionDrafts(env,context,[q]))));
 const verification={caseVerifications,baselineModel:caseVerifications[0]?.model,baselineEditorial:!!caseVerifications[0]?.reviews?.[0]?.editorial,unavailable:caseVerifications.some(v=>v.unavailable),reviews:caseVerifications.flatMap((v,i)=>v.reviews?.length===1?[{...v.reviews[0],index:i}]:[])};
 const result=calibrationFindings(verification);
 await env.DB.prepare('UPDATE question_verifier_calibrations SET status=?,findings_json=?,verification_json=?,completed_at=CURRENT_TIMESTAMP WHERE id=?').bind(result.passed?'PASS':'BLOCKED',JSON.stringify(result.findings),JSON.stringify(verification),CALIBRATION_ID).run();
 return json({ok:true,passed:result.passed,findings:result.findings,verification,createsQuestions:false,humanApproved:false});
}
