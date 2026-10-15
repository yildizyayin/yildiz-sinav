import type {Env,AuthUser} from '../types';
import {one,json} from './db';
import {editQuestionPacket} from './question-ai-editor';
import {handleQuestionEditorialRepair} from './question-editorial-repair';
const id='editor-transport-20261015-v1';
const sourceJob='qgj_d03f2a96-db7f-4c5f-9d80-84ee2b913121';
/** One staging-only protocol observation. Never edits a job or certifies question quality. */
export async function diagnoseEditorProtocol(env:Env,user:AuthUser){
 if(user.role!=='SUPER_ADMIN'||env.ENVIRONMENT!=='staging')return json({ok:false,error:{code:'STAGING_ADMIN_REQUIRED'}},403);
 const prior=await one<any>(env.DB.prepare('SELECT * FROM question_verifier_calibrations WHERE id=?').bind(id));
 if(prior)return json({ok:true,reused:true,diagnostic:prior});
 const response=await handleQuestionEditorialRepair(new Request('https://internal.invalid/source'),env,user,sourceJob);
 const source:any=await response.json();
 if(!response.ok||!source.repairable)return json({ok:false,error:{code:'DIAGNOSTIC_SOURCE_UNAVAILABLE'}},409);
 const job=await one<any>(env.DB.prepare('SELECT * FROM question_generation_jobs WHERE id=?').bind(sourceJob));
 const audit=await one<any>(env.DB.prepare('SELECT details_json FROM audit_logs WHERE id=?').bind(source.sourceAuditId));
 const claimed=await env.DB.prepare("INSERT OR IGNORE INTO question_verifier_calibrations(id,status) VALUES(?,'RUNNING')").bind(id).run();
 if(Number(claimed.meta?.changes)!==1)return json({ok:false,error:{code:'DIAGNOSTIC_ALREADY_CLAIMED'}},409);
 const result:any={diagnosticOnly:true,qualitySuccess:false,sourceJob,sourceHash:source.sourceHash,questionJobsChanged:false,humanApproved:false};
 const ai=env.AI;
 try{
  const observed={...env,AI:{run:async(model:any,input:any)=>{
   const raw:any=await ai!.run(model,input);result.model=model;result.rawKeys=raw&&typeof raw==='object'?Object.keys(raw):[];
   result.rawOutput=JSON.stringify(raw).slice(0,18000);return raw;
  }} as any};
  const edited=await editQuestionPacket(observed,source.drafts,{sourceModel:JSON.parse(audit.details_json).model,presentation:job.presentation,gradeLevel:job.grade_level,outcomeCode:job.outcome_code,outcomeTitle:job.outcome_title,academicYear:job.academic_year,taskFocus:job.task_focus});
  result.packetShapeAccepted=true;result.usage=edited.usage;
 }catch(e){result.packetShapeAccepted=false;result.error=e instanceof Error?e.message:'EDITOR_FAILED';}
 await env.DB.prepare("UPDATE question_verifier_calibrations SET status=?,verification_json=?,completed_at=CURRENT_TIMESTAMP WHERE id=? AND status='RUNNING'").bind(result.packetShapeAccepted?'PASS':'BLOCKED',JSON.stringify(result),id).run();
 return json({ok:true,result});
}
