import type {Env,AuthUser} from '../types';
import {one,json} from './db';
import {sha256,questionTeamPaused} from './question-team-policy';
import {PIPELINE_TRIAL_ID} from './question-pipeline-trial';
import {editQuestionPacket,readEditorPacket,QUESTION_EDITOR_MODEL} from './question-ai-editor';
import {parseDrafts,bankHasDuplicate} from './question-generation-runner';
import {verifyQuestionDrafts,readAiJson} from './question-generation-validation';
import {questionOriginalityCandidates} from './question-originality-search';
export const PIPELINE_CORRECTION_ID=PIPELINE_TRIAL_ID+'-correction-v1';
export const PIPELINE_EDITOR_COMPARISON_ID=PIPELINE_TRIAL_ID+'-glm-editor-v1';
const alternativeEditor='@cf/zai-org/glm-4.7-flash';
const writer='@cf/openai/gpt-oss-120b',reviewer='@cf/nvidia/nemotron-3-120b-a12b';
const context=(source:any,editor=QUESTION_EDITOR_MODEL)=>({producerModel:editor,sourceModel:QUESTION_EDITOR_MODEL,originalAuthorModel:writer,revisionOfEditorModel:QUESTION_EDITOR_MODEL,authorModels:[writer,QUESTION_EDITOR_MODEL,...(editor===QUESTION_EDITOR_MODEL?[]:[editor])],gradeLevel:5,academicYear:source.academic_year,outcomeCode:source.outcome_code,outcomeTitle:source.outcome_title,qualityProfile:'EDITORIAL_V1',presentation:'TEXT',taskFocus:'NAT_INVERSE_STEPS'});
async function permitted(env:Env,user:AuthUser){return !!env.AI&&env.QUESTION_GENERATION_ENABLED==='true'&&env.QUESTION_GENERATION_VERIFICATION_ENABLED==='true'&&user.role==='SUPER_ADMIN'&&env.ENVIRONMENT==='staging'&&env.QUESTION_GENERATION_MODEL===writer&&(env as any).QUESTION_EDITOR_MODEL===QUESTION_EDITOR_MODEL&&env.QUESTION_GENERATION_VERIFIER_MODEL===reviewer&&(env as any).QUESTION_AUTO_EDITOR_ENABLED==='true'&&(env as any).QUESTION_BLIND_SOLVE_ENABLED==='true'&&Number((env as any).QUESTION_AI_DAILY_NEURON_LIMIT)===10000&&!await questionTeamPaused(env,['GENERATOR','VERIFIER','ORIGINALITY']);}
async function sourceValid(env:Env,s:any){return !!await one<any>(env.DB.prepare("SELECT o.id FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE o.id=? AND o.code=? AND o.title=? AND o.active=1 AND cv.id=? AND cv.verified=1 AND cv.source_url=? AND cv.academic_year=? AND cv.program_version=? AND cv.grade_level=5 AND o.grade_level=5 AND o.subject_id=? AND EXISTS(SELECT 1 FROM learning_nodes n WHERE n.id='ln_'||o.id AND n.active=1 AND n.node_type='OUTCOME' AND n.grade_level=5 AND n.subject_id=o.subject_id AND n.academic_year=cv.academic_year)").bind(s.outcome_id,s.outcome_code,s.outcome_title,s.curriculum_version_id,s.source_url,s.academic_year,s.program_version,s.subject_id));}
export async function preparePipelineCorrection(env:Env,user:AuthUser,comparison=false){
 const correctionId=comparison?PIPELINE_EDITOR_COMPARISON_ID:PIPELINE_CORRECTION_ID,editorModel=comparison?alternativeEditor:QUESTION_EDITOR_MODEL;
 if(!await permitted(env,user))return json({ok:false,error:{code:'BOUNDED_STAGING_TEAM_REQUIRED'}},409);
 const prior=await one<any>(env.DB.prepare('SELECT * FROM question_verifier_calibrations WHERE id=?').bind(correctionId));
 if(prior){const report=JSON.parse(prior.verification_json??'null');return json({ok:true,reused:true,prepared:prior.status==='RUNNING'&&report?.stage==='PREPARED',correction:prior});}
 if(comparison){const previous=await one<any>(env.DB.prepare('SELECT status,verification_json FROM question_verifier_calibrations WHERE id=?').bind(PIPELINE_CORRECTION_ID));if(previous?.status!=='BLOCKED'||JSON.parse(previous.verification_json)?.error!=='EDITOR_OUTPUT_INVALID')return json({ok:false,error:{code:'RECORDED_EDITOR_FAILURE_REQUIRED'}},409);}
 const original=await one<any>(env.DB.prepare('SELECT * FROM question_verifier_calibrations WHERE id=?').bind(PIPELINE_TRIAL_ID));
 const source=JSON.parse(original?.verification_json??'null');
 if(original?.status!=='BLOCKED'||source?.producerCalls!==1||source.editorCalls!==1||source.editor?.questions?.length!==1||source.editorHash!==await sha256(JSON.stringify(source.editor))||!await sourceValid(env,source.source))return json({ok:false,error:{code:'FIXED_CORRECTION_SOURCE_REQUIRED'}},409);
 const report:any={correctionId,sourceTrialId:PIPELINE_TRIAL_ID,sourceTrialHash:await sha256(original.verification_json),sourceEditorHash:source.editorHash,source:source.source,stage:'EDITING',newProducerCalls:0,additionalEditorPasses:1,cumulativeProducerCalls:1,cumulativeEditorPasses:comparison?3:2,editorModel,modelComparison:comparison,previousCorrectionId:comparison?PIPELINE_CORRECTION_ID:null,questionBankWrites:0,pilotQuotaChanged:false,autonomousFirstPass:false,humanApproved:false,rightsApproved:false};
 const claim=await env.DB.prepare("INSERT OR IGNORE INTO question_verifier_calibrations(id,status,verification_json) VALUES(?,'RUNNING',?)").bind(correctionId,JSON.stringify(report)).run();
 if(Number(claim.meta?.changes)!==1)return json({ok:false,error:{code:'CORRECTION_ALREADY_CLAIMED'}},409);
 const save=async()=>env.DB.prepare("UPDATE question_verifier_calibrations SET verification_json=? WHERE id=? AND status='RUNNING'").bind(JSON.stringify(report),correctionId).run();
 try{
  const ai=env.AI!,observed={...env,AI:{run:async(model:any,input:any)=>{const raw:any=await ai.run(model,input);report.editorObserved={packet:readEditorPacket(raw,model),usage:raw?.usage??{},protocolKeys:raw&&typeof raw==='object'?Object.keys(raw):[],finishReason:raw?.choices?.[0]?.finish_reason??null,alternateJson:readAiJson({response:raw?.choices?.[0]?.message?.reasoning_content})};await save();return raw;}} as any};
  report.edited=await editQuestionPacket({...observed,QUESTION_EDITOR_MODEL:editorModel} as any,source.editor.questions,context(source.source,editorModel));if(JSON.stringify(report.edited.questions)===JSON.stringify(source.editor.questions))throw Error('EDITOR_DID_NOT_REVISE_SOURCE');report.editedHash=await sha256(JSON.stringify(report.edited));report.stage='PREPARED';await save();
  return json({ok:true,prepared:true,correctionId});
 }catch(e){report.error=e instanceof Error?e.message:'EDITOR_FAILED';report.stage='FAILED';await env.DB.prepare("UPDATE question_verifier_calibrations SET status='BLOCKED',verification_json=?,completed_at=CURRENT_TIMESTAMP WHERE id=? AND status='RUNNING'").bind(JSON.stringify(report),correctionId).run();return json({ok:true,passed:false,...report});}
}
export async function verifyPipelineCorrection(env:Env,user:AuthUser,comparison=false){
 const correctionId=comparison?PIPELINE_EDITOR_COMPARISON_ID:PIPELINE_CORRECTION_ID;
 if(!await permitted(env,user))return json({ok:false,error:{code:'BOUNDED_STAGING_TEAM_REQUIRED'}},409);
 const record=await one<any>(env.DB.prepare('SELECT * FROM question_verifier_calibrations WHERE id=?').bind(correctionId)),report=JSON.parse(record?.verification_json??'null');
 if(record?.status!=='RUNNING'||report?.stage!=='PREPARED')return json({ok:true,reused:true,correction:record});
 if(report.editedHash!==await sha256(JSON.stringify(report.edited))||!await sourceValid(env,report.source))return json({ok:false,error:{code:'CORRECTION_CONTEXT_CHANGED'}},409);
 const old=record.verification_json;report.stage='VERIFYING';const claimed=await env.DB.prepare("UPDATE question_verifier_calibrations SET verification_json=? WHERE id=? AND status='RUNNING' AND verification_json=?").bind(JSON.stringify(report),correctionId,old).run();
 if(Number(claimed.meta?.changes)!==1)return json({ok:false,error:{code:'CORRECTION_VERIFICATION_ALREADY_CLAIMED'}},409);
 try{
  const drafts=parseDrafts({questions:report.edited.questions},1,5,true,'TEXT');if(!drafts)throw Error('CORRECTION_PACKET_INVALID');
  report.verification=await verifyQuestionDrafts(env,{...context(report.source,report.editorModel??QUESTION_EDITOR_MODEL),originalityCandidates:await questionOriginalityCandidates(env,drafts)},drafts);
  report.duplicate=report.verification.ok?await bankHasDuplicate(env,{...report.source} as any,drafts):null;
  report.passed=report.verification.ok===true&&report.duplicate===false&&await sourceValid(env,report.source);report.stage=report.passed?'VERIFIED_CANDIDATE':'REJECTED_CANDIDATE';
 }catch(e){report.passed=false;report.error=e instanceof Error?e.message:'VERIFICATION_FAILED';report.stage='FAILED';}
 await env.DB.prepare("UPDATE question_verifier_calibrations SET status=?,verification_json=?,completed_at=CURRENT_TIMESTAMP WHERE id=? AND status='RUNNING'").bind(report.passed?'PASS':'BLOCKED',JSON.stringify(report),correctionId).run();
 return json({ok:true,...report});
}
