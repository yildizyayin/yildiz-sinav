export const SOLVER_BACKUP_ID='independent-solver-diagnostic-20261016-v1-independent-backup-v1';
export const SOLVER_JSON_TRANSPORT_ID='independent-solver-diagnostic-20261016-v1-json-object-v1';
import type {Env,AuthUser} from '../types';
import {one,json} from './db';
import {sha256} from './question-team-policy';
import {pipelineDiagnosticPermitted,pipelineSourceValid} from './question-pipeline-correction';
import {STRATEGY_ASSEMBLY_ID} from './question-pipeline-strategy-verification';
import {parseDrafts,bankHasDuplicate} from './question-generation-runner';
import {verifyQuestionDrafts} from './question-generation-validation';
import {questionOriginalityCandidates} from './question-originality-search';
import {questionAiFailure} from './question-ai-failure';
export const SOLVER_CONTRACT_FIX_ID='independent-solver-diagnostic-20261016-v1-chat-contract-v1';
export const SOLVER_DIAGNOSTIC_ID='independent-solver-diagnostic-20261016-v1';
/** One fixed-candidate recheck after operational unavailability, never after a
 * semantic rejection. Keeps the old failure immutable and cannot publish. */
export async function diagnoseIndependentSolver(env:Env,user:AuthUser,contractFix=false,objectTransport=false,backup=false){
 const diagnosticId=backup?SOLVER_BACKUP_ID:objectTransport?SOLVER_JSON_TRANSPORT_ID:contractFix?SOLVER_CONTRACT_FIX_ID:SOLVER_DIAGNOSTIC_ID;
 if(!await pipelineDiagnosticPermitted(env,user))return json({ok:false,error:{code:'BOUNDED_STAGING_TEAM_REQUIRED'}},409);
 const prior=await one<any>(env.DB.prepare('SELECT * FROM question_verifier_calibrations WHERE id=?').bind(diagnosticId));
 if(prior)return json({ok:true,reused:true,diagnostic:prior});
 const original=await one<any>(env.DB.prepare('SELECT * FROM question_verifier_calibrations WHERE id=?').bind(STRATEGY_ASSEMBLY_ID));
 let source:any;try{source=JSON.parse(original?.verification_json??'null')}catch{}
 if(original?.status!=='BLOCKED'||source?.passed!==false||source?.verification?.unavailable!==true||source?.sourceUnchanged!==true||source?.pureLlmEditorial!==false||source?.construction!=='AI_SOURCE_WITH_DETERMINISTIC_STRATEGY_EDITOR'||source?.candidateHash!==await sha256(JSON.stringify(source?.question??null)))return json({ok:false,error:{code:'IMMUTABLE_UNAVAILABLE_CANDIDATE_REQUIRED'}},409);
 if(contractFix||objectTransport||backup){
  const previous=await one<any>(env.DB.prepare('SELECT * FROM question_verifier_calibrations WHERE id=?').bind(backup?SOLVER_JSON_TRANSPORT_ID:objectTransport?SOLVER_CONTRACT_FIX_ID:SOLVER_DIAGNOSTIC_ID));
  let failure:any;try{failure=JSON.parse(previous?.verification_json??'null')}catch{}
  if(previous?.status!=='BLOCKED'||failure?.stage!=='BLOCKED_DEPENDENCY'||failure?.candidateHash!==source.candidateHash||failure?.sourceHash!==await sha256(original.verification_json)||(objectTransport||backup?failure?.verification?.blindSolves?.[0]?.providerCode!==3046:!['AI_TIMEOUT','PROVIDER_INTERNAL_ERROR','PROVIDER_REQUEST_REJECTED'].includes(failure?.verification?.blindSolves?.[0]?.diagnosticCode)))return json({ok:false,error:{code:'RECORDED_OPERATIONAL_DIAGNOSTIC_REQUIRED'}},409);
 }
 const drafts=parseDrafts({questions:[source.question]},1,5,true,'TEXT');
 if(!drafts||!await pipelineSourceValid(env,source.source))return json({ok:false,error:{code:'CANDIDATE_SOURCE_INVALID'}},409);
 const report:any={diagnosticId,sourceId:STRATEGY_ASSEMBLY_ID,sourceHash:await sha256(original.verification_json),candidateHash:source.candidateHash,question:source.question,source:source.source,construction:source.construction,pureLlmEditorial:false,protocolFix:contractFix,objectTransport,backup,selectedVerifier:backup?'@cf/meta/llama-3.3-70b-instruct-fp8-fast':env.QUESTION_GENERATION_VERIFIER_MODEL,previousDiagnosticId:backup?SOLVER_JSON_TRANSPORT_ID:objectTransport?SOLVER_CONTRACT_FIX_ID:contractFix?SOLVER_DIAGNOSTIC_ID:null,stage:'VERIFYING',newProducerCalls:0,modelEditorCalls:0,questionBankWrites:0,pilotQuotaChanged:false,benchmarkOnly:true,humanApproved:false,rightsApproved:false,publisherQualityCertified:false};
 const claim=await env.DB.prepare("INSERT OR IGNORE INTO question_verifier_calibrations(id,status,verification_json) VALUES(?,'RUNNING',?)").bind(diagnosticId,JSON.stringify(report)).run();
 if(Number(claim.meta?.changes)!==1)return json({ok:false,error:{code:'SOLVER_DIAGNOSTIC_ALREADY_CLAIMED'}},409);
 try{
  const context={producerModel:'@cf/zai-org/glm-4.7-flash',authorModels:['@cf/openai/gpt-oss-120b','@cf/qwen/qwen3-30b-a3b-fp8','@cf/zai-org/glm-4.7-flash'],gradeLevel:5,academicYear:source.source.academic_year,outcomeCode:source.source.outcome_code,outcomeTitle:source.source.outcome_title,qualityProfile:'EDITORIAL_V1',presentation:'TEXT',taskFocus:'NAT_INVERSE_STEPS',originalityCandidates:await questionOriginalityCandidates(env,drafts)};
  report.verification=await verifyQuestionDrafts(backup?{...env,QUESTION_GENERATION_VERIFIER_MODEL:'@cf/meta/llama-3.3-70b-instruct-fp8-fast',QUESTION_GENERATION_FALLBACK_VERIFIER_MODEL:undefined}:env,context,drafts);
  report.duplicate=report.verification.ok?await bankHasDuplicate(env,source.source,drafts):null;
  const unchanged=await one<any>(env.DB.prepare('SELECT verification_json FROM question_verifier_calibrations WHERE id=?').bind(STRATEGY_ASSEMBLY_ID));
  report.sourceUnchanged=unchanged?.verification_json===original.verification_json;
  report.passed=report.verification.ok===true&&report.duplicate===false&&report.sourceUnchanged&&await pipelineSourceValid(env,source.source);
  report.stage=report.passed?'VERIFIED_CANDIDATE':report.verification.unavailable?'BLOCKED_DEPENDENCY':'REJECTED_CANDIDATE';
 }catch(error){report.passed=false;report.stage='BLOCKED_DEPENDENCY';report.failure=questionAiFailure(error);}
 await env.DB.prepare("UPDATE question_verifier_calibrations SET status=?,verification_json=?,completed_at=CURRENT_TIMESTAMP WHERE id=? AND status='RUNNING'").bind(report.passed?'PASS':'BLOCKED',JSON.stringify(report),diagnosticId).run();
 return json({ok:true,...report});
}
