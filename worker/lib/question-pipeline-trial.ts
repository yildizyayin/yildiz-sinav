import type {Env,AuthUser} from '../types';
import {one,json} from './db';
import {sha256,questionTeamPaused} from './question-team-policy';
import {generationAuthorInput,generationAuthorRequest,parseDrafts,bankHasDuplicate} from './question-generation-runner';
import {readAiJson,verifyQuestionDrafts} from './question-generation-validation';
import {editQuestionPacket,QUESTION_EDITOR_MODEL} from './question-ai-editor';
import {questionOriginalityCandidates} from './question-originality-search';
import curriculum from '../../data/question-pilot-math5-curriculum.json';
export const PIPELINE_TRIAL_ID='editorial-pipeline-20261015-v1';
const writer='@cf/openai/gpt-oss-120b',reviewer='@cf/nvidia/nemotron-3-120b-a12b';
/** One fresh, non-publishing chain trial using the last existing pilot slot.
 * Separate evidence type: never rewrites old failed jobs or fabricates a job. */
export async function runEditorialPipelineTrial(env:Env,user:AuthUser){
 if(user.role!=='SUPER_ADMIN'||env.ENVIRONMENT!=='staging')return json({ok:false,error:{code:'STAGING_ADMIN_REQUIRED'}},403);
 const prior=await one<any>(env.DB.prepare('SELECT * FROM question_verifier_calibrations WHERE id=?').bind(PIPELINE_TRIAL_ID));
 if(prior)return json({ok:true,reused:true,trial:prior});
 if(!env.AI||env.QUESTION_GENERATION_ENABLED!=='true'||env.QUESTION_GENERATION_VERIFICATION_ENABLED!=='true'||(env as any).QUESTION_AUTO_EDITOR_ENABLED!=='true'||(env as any).QUESTION_BLIND_SOLVE_ENABLED!=='true'||env.QUESTION_GENERATION_MODEL!==writer||(env as any).QUESTION_EDITOR_MODEL!==QUESTION_EDITOR_MODEL||env.QUESTION_GENERATION_VERIFIER_MODEL!==reviewer||Number((env as any).QUESTION_AI_DAILY_NEURON_LIMIT)!==10000)return json({ok:false,error:{code:'BOUNDED_DISTINCT_TEAM_REQUIRED'}},409);
 const quality=await one<any>(env.DB.prepare("SELECT status,verification_json FROM question_verifier_calibrations WHERE id='independent-quality-20261015-v1-distractor-proof-v1'"));
 let proof:any;try{proof=JSON.parse(quality?.verification_json??'null')}catch{}
 if(quality?.status!=='PASS'||proof?.passed!==true||proof?.verifier!==reviewer)return json({ok:false,error:{code:'QUALITY_BENCHMARK_REQUIRED'}},409);
 const aiDay=await one<any>(env.DB.prepare('SELECT * FROM question_ai_budget_days WHERE day=?').bind(new Date().toISOString().slice(0,10)));
 if(aiDay&&Math.min(10000,aiDay.limit_neurons)-aiDay.charged_neurons-aiDay.held_neurons<5000)return json({ok:false,error:{code:'TRIAL_DAILY_AI_BUDGET_INSUFFICIENT'}},409);
 if(await questionTeamPaused(env,['GENERATOR','VERIFIER','ORIGINALITY']))return json({ok:false,error:{code:'QUESTION_TEAM_PAUSED'}},409);
 const readSource=()=>one<any>(env.DB.prepare(`SELECT o.id outcome_id,o.code outcome_code,o.title outcome_title,o.subject_id,o.grade_level,cv.id curriculum_version_id,cv.academic_year,cv.program_version,cv.source_url FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE o.code='MAT.5.1.2' AND o.active=1 AND o.grade_level=5 AND cv.grade_level=5 AND cv.verified=1 AND cv.academic_year=? AND cv.program_version=? AND cv.source_url=? AND EXISTS(SELECT 1 FROM learning_nodes n WHERE n.id='ln_'||o.id AND n.active=1 AND n.node_type='OUTCOME' AND n.grade_level=o.grade_level AND n.subject_id=o.subject_id AND n.academic_year=cv.academic_year) LIMIT 1`).bind(curriculum.academicYear,curriculum.programVersion,curriculum.sourceUrl));
 const source=await readSource();
 if(!source||source.outcome_title!==curriculum.outcomes[1].title)return json({ok:false,error:{code:'VERIFIED_TRIAL_SOURCE_REQUIRED'}},409);
 const budget=await one<any>(env.DB.prepare("SELECT * FROM question_agent_pilot_budget WHERE id='pilot_50'"));
 if(budget?.question_cap!==50||budget.reserved_count!==49)return json({ok:false,error:{code:'LAST_PILOT_SLOT_UNAVAILABLE'}},409);
 const report:any={trialId:PIPELINE_TRIAL_ID,benchmarkOnly:true,questionCount:1,stage:'CLAIMED',source,models:{writer,editor:QUESTION_EDITOR_MODEL,reviewer},pilotBefore:49,pilotAfter:50,producerCalls:0,editorCalls:0,questionBankWrites:0,humanApproved:false,rightsApproved:false,publisherQualityCertified:false};
 const claimed=await env.DB.batch([
  env.DB.prepare("INSERT INTO question_verifier_calibrations(id,status,verification_json) VALUES(?,'RUNNING',?)").bind(PIPELINE_TRIAL_ID,JSON.stringify(report)),
  env.DB.prepare("UPDATE question_agent_pilot_budget SET reserved_count=reserved_count+1 WHERE id='pilot_50' AND reserved_count=49 AND question_cap=50"),
 ]).catch(()=>null);
 if(!claimed)return json({ok:false,error:{code:'TRIAL_ALREADY_CLAIMED_OR_STORAGE_UNAVAILABLE'}},409);
 const checkpoint=async()=>{await env.DB.prepare("UPDATE question_verifier_calibrations SET verification_json=? WHERE id=? AND status='RUNNING'").bind(JSON.stringify(report),PIPELINE_TRIAL_ID).run();};
 const runnable=async()=>{if(await questionTeamPaused(env,['GENERATOR','VERIFIER','ORIGINALITY']))throw Error('QUESTION_TEAM_PAUSED');};
 try{
  if(Number(claimed[1].meta?.changes)!==1)throw Error('PILOT_SLOT_RACE_LOST');
  await env.DB.prepare("INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,NULL,'QUESTION_PIPELINE_TRIAL_RESERVATION','question_pipeline_trial',?,?)").bind('aud_'+PIPELINE_TRIAL_ID,user.id,PIPELINE_TRIAL_ID,JSON.stringify({questionCount:1,budget:'pilot_50',before:49,after:50,oldJobsChanged:false})).run();
  const job={...source,id:PIPELINE_TRIAL_ID,question_count:1,quality_profile:'EDITORIAL_V1',task_focus:'NAT_INVERSE_STEPS',presentation:'TEXT'};
  const history=await one<any>(env.DB.prepare("SELECT COALESCE(json_group_array(json_object('stemText',stem_text,'solutionText',solution_text)),'[]') previous_json FROM (SELECT substr(q.stem_text,1,500) stem_text,substr(q.solution_text,1,600) solution_text FROM question_bank q JOIN question_learning_links l ON l.question_id=q.id WHERE l.node_id=? AND q.owner_type='PLATFORM' ORDER BY q.created_at DESC,q.id DESC LIMIT 4)").bind('ln_'+source.outcome_id));
  const previousDrafts=JSON.parse(history?.previous_json??'[]'),context={producerModel:writer,authorModels:[writer,QUESTION_EDITOR_MODEL],gradeLevel:5,academicYear:source.academic_year,outcomeCode:source.outcome_code,outcomeTitle:source.outcome_title,qualityProfile:'EDITORIAL_V1',presentation:'TEXT',taskFocus:'NAT_INVERSE_STEPS',previousDrafts,previousQuestions:previousDrafts.map((q:any)=>q.stemText)};
  const input=generationAuthorInput(job,context,context.previousQuestions,previousDrafts,PIPELINE_TRIAL_ID);
  if(new TextEncoder().encode(input).length>16384)throw Error('AUTHOR_INPUT_TOO_LARGE');
  await runnable();report.stage='AUTHOR';report.producerCalls=1;await checkpoint();
  let timer:ReturnType<typeof setTimeout>|undefined,raw:any;
  try{raw=await Promise.race([env.AI.run(writer as any,generationAuthorRequest(job,writer,input,true,'TEXT') as any),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('AUTHOR_TIMEOUT')),90000);})]);}finally{if(timer!==undefined)clearTimeout(timer);}
  const parsed=readAiJson(raw);report.author={questions:parsed?.questions??null,usage:raw?.usage??{}};report.authorHash=await sha256(JSON.stringify(report.author));await checkpoint();
  if(!Array.isArray(parsed?.questions)||parsed.questions.length!==1)throw Error('AUTHOR_PACKET_INVALID');
  await runnable();report.stage='EDITOR';report.editorCalls=1;await checkpoint();
  const edited=await editQuestionPacket(env,parsed.questions,{...context,sourceModel:writer});report.editor={...edited,sourceHash:report.authorHash};report.editorHash=await sha256(JSON.stringify(report.editor));await checkpoint();
  const drafts=parseDrafts({questions:edited.questions},1,5,true,'TEXT');if(!drafts)throw Error('EDITED_PACKET_INVALID');
  await runnable();report.stage='INDEPENDENT_REVIEW';await checkpoint();
  const originalityCandidates=await questionOriginalityCandidates(env,drafts);
  report.verification=await verifyQuestionDrafts(env,{...context,producerModel:QUESTION_EDITOR_MODEL,originalityCandidates},drafts);await checkpoint();
  await runnable();if(report.verification.ok&&JSON.stringify(await readSource())!==JSON.stringify(source))throw Error('SOURCE_CONTEXT_CHANGED');
  report.duplicate=report.verification.ok?await bankHasDuplicate(env,job as any,drafts):null;
  report.passed=report.verification.ok===true&&report.duplicate===false;
  report.stage=report.passed?'VERIFIED_CANDIDATE':'REJECTED_CANDIDATE';
 }catch(e){report.passed=false;report.error=e instanceof Error?e.message:'PIPELINE_TRIAL_FAILED';report.failedStage=report.stage;report.stage='FAILED';}
 await env.DB.prepare("UPDATE question_verifier_calibrations SET status=?,verification_json=?,completed_at=CURRENT_TIMESTAMP WHERE id=? AND status='RUNNING'").bind(report.passed?'PASS':'BLOCKED',JSON.stringify(report),PIPELINE_TRIAL_ID).run();
 return json({ok:true,...report});
}
