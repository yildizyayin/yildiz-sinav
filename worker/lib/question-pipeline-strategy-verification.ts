import type {Env,AuthUser} from '../types';
import {one,json} from './db';
import {sha256} from './question-team-policy';
import {PIPELINE_EDITOR_TRANSPORT_RETRY_ID,pipelineDiagnosticPermitted,pipelineSourceValid} from './question-pipeline-correction';
import {assembleInverseStrategies} from './question-strategy-assembly';
import {mechanicalDraftIssues,outcomeDraftIssues,taskFocusIssues,verifyQuestionDrafts} from './question-generation-validation';
import {editorialIssues} from './question-editorial';
import {questionOriginalityCandidates} from './question-originality-search';
import {bankHasDuplicate} from './question-generation-runner';
export const STRATEGY_ASSEMBLY_ID=PIPELINE_EDITOR_TRANSPORT_RETRY_ID+'-strategy-assembly-v1';
/** Fixed-source, one-time independent review. No author/editor call, slot change,
 * bank write or publication. Programmatic editing is explicit in the evidence. */
export async function verifyStrategyAssembly(env:Env,user:AuthUser){
 if(!await pipelineDiagnosticPermitted(env,user))return json({ok:false,error:{code:'BOUNDED_STAGING_TEAM_REQUIRED'}},409);
 const prior=await one<any>(env.DB.prepare('SELECT * FROM question_verifier_calibrations WHERE id=?').bind(STRATEGY_ASSEMBLY_ID));
 if(prior)return json({ok:true,reused:true,assembly:prior});
 const record=await one<any>(env.DB.prepare('SELECT * FROM question_verifier_calibrations WHERE id=?').bind(PIPELINE_EDITOR_TRANSPORT_RETRY_ID));
 let source:any;try{source=JSON.parse(record?.verification_json??'null')}catch{}
 const q=source?.editorObserved?.packet?.questions?.[0];
 const context={producerModel:'@cf/zai-org/glm-4.7-flash',authorModels:['@cf/openai/gpt-oss-120b','@cf/qwen/qwen3-30b-a3b-fp8','@cf/zai-org/glm-4.7-flash'],gradeLevel:5,academicYear:source?.source?.academic_year,outcomeCode:source?.source?.outcome_code,outcomeTitle:source?.source?.outcome_title,qualityProfile:'EDITORIAL_V1',presentation:'TEXT',taskFocus:'NAT_INVERSE_STEPS'};
 if(record?.status!=='BLOCKED'||source?.error!=='EDITOR_OUTPUT_INVALID'||source?.editorObserved?.packet?.questions?.length!==1||!q||!await pipelineSourceValid(env,source.source))return json({ok:false,error:{code:'RECORDED_MATH_SOURCE_REQUIRED'}},409);
 const issues=[...mechanicalDraftIssues(q),...outcomeDraftIssues(q,context),...taskFocusIssues(q,context),...editorialIssues(q,'TEXT')];
 if(issues.length!==1||issues[0]!=='INVERSE_STRATEGY_DECISION_REQUIRED')return json({ok:false,error:{code:'ONLY_STRATEGY_STRUCTURE_MAY_BE_REPAIRED',issues}},409);
 const assembled=assembleInverseStrategies(q);
 if(!assembled)return json({ok:false,error:{code:'EXACT_STRATEGY_ASSEMBLY_UNSUPPORTED'}},409);
 const report:any={assemblyId:STRATEGY_ASSEMBLY_ID,sourceId:PIPELINE_EDITOR_TRANSPORT_RETRY_ID,sourceHash:await sha256(record.verification_json),source:source.source,sourceQuestion:q,...assembled,candidateHash:await sha256(JSON.stringify(assembled.question)),stage:'VERIFYING',newProducerCalls:0,modelEditorCalls:0,questionBankWrites:0,pilotQuotaChanged:false,benchmarkOnly:true,publisherQualityCertified:false,humanApproved:false,rightsApproved:false};
 const claim=await env.DB.prepare("INSERT OR IGNORE INTO question_verifier_calibrations(id,status,verification_json) VALUES(?,'RUNNING',?)").bind(STRATEGY_ASSEMBLY_ID,JSON.stringify(report)).run();
 if(Number(claim.meta?.changes)!==1)return json({ok:false,error:{code:'ASSEMBLY_ALREADY_CLAIMED'}},409);
 try{
  report.verification=await verifyQuestionDrafts(env,{...context,originalityCandidates:await questionOriginalityCandidates(env,[assembled.question])},[assembled.question]);
  report.duplicate=report.verification.ok?await bankHasDuplicate(env,source.source,[assembled.question]):null;
  const unchanged=await one<any>(env.DB.prepare('SELECT verification_json FROM question_verifier_calibrations WHERE id=?').bind(PIPELINE_EDITOR_TRANSPORT_RETRY_ID));
  report.sourceUnchanged=unchanged?.verification_json===record.verification_json;
  report.passed=report.verification.ok===true&&report.duplicate===false&&report.sourceUnchanged&&await pipelineSourceValid(env,source.source);
  report.stage=report.passed?'VERIFIED_CANDIDATE':'REJECTED_CANDIDATE';
 }catch(e){report.passed=false;report.stage='FAILED';report.error=e instanceof Error?e.message:'ASSEMBLY_VERIFICATION_FAILED';}
 await env.DB.prepare("UPDATE question_verifier_calibrations SET status=?,verification_json=?,completed_at=CURRENT_TIMESTAMP WHERE id=? AND status='RUNNING'").bind(report.passed?'PASS':'BLOCKED',JSON.stringify(report),STRATEGY_ASSEMBLY_ID).run();
 return json({ok:true,...report});
}
