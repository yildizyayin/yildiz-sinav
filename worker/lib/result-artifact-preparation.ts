import type {AuthUser,Env} from '../types';
import {all,badRequest,forbidden,json,uuid} from './db';
import {withExamOperationLock} from './exam-operation-lock';
import {prepareResultArtifacts} from './result-artifacts';
export async function startResultArtifactPreparation(request:Request,env:Env,user:AuthUser,id:string){
 if(user.role!=='SUPER_ADMIN')return forbidden();
 if(env.RESULT_ARTIFACT_BACKGROUND_ENABLED!=='true'||env.RESULT_ARTIFACTS_ENABLED!=='true'||env.RESULT_ARTIFACT_CLEANUP_ENABLED!=='true'||env.RESULT_RETENTION_QUEUE_ENABLED!=='true'||!env.RESULT_RETENTION_QUEUE||!env.RESULT_FILES)return badRequest('Arka plan dosya hazırlama etkin değil.','RESULT_ARTIFACT_BACKGROUND_DISABLED');
 const body:any=await request.json().catch(()=>({})),version=body.expectedSnapshotVersion;
 if(!Number.isSafeInteger(version)||version<1|| (body.restart!==undefined&&typeof body.restart!=='boolean'))return badRequest('Güncel yayın sürümü gereklidir.');
 const row=await env.DB.prepare("SELECT exam_id FROM exam_administrations WHERE id=? AND channel='RESULT_NETWORK'").bind(id).first<{exam_id:string}>();
 if(!row)return json({ok:false,error:{code:'ADMINISTRATION_NOT_FOUND',message:'Sınav yönetimi bulunamadı.'}},404);
 return withExamOperationLock(env,row.exam_id,'RESULT_ARTIFACT_JOB_START',async env=>{
  const current=await env.DB.prepare("SELECT id FROM exam_administrations ea WHERE id=? AND channel='RESULT_NETWORK' AND status='PUBLISHED' AND published_snapshot_version=? AND NOT EXISTS(SELECT 1 FROM result_artifact_retirements r WHERE r.administration_id=ea.id AND r.retired_through_version>=?)").bind(id,version,version).first();
  if(!current)return json({ok:false,error:{code:'RESULT_PUBLICATION_STATE_CHANGED',message:'Yayın veya sürüm değişti.'}},409);
  await env.DB.batch([
   env.DB.prepare(`INSERT INTO result_artifact_preparation_jobs(administration_id,snapshot_version,actor_user_id,status) VALUES(?,?,?,'RUNNING') ON CONFLICT(administration_id,snapshot_version) DO UPDATE SET actor_user_id=excluded.actor_user_id,status='RUNNING',participant_cursor='',prepared_count=0,last_attempted_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE ?=1`).bind(id,version,user.id,body.restart===true?1:0),
   env.DB.prepare("INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,NULL,'RESULT_ARTIFACT_JOB_REQUESTED','exam_administration',?,?)").bind(uuid('aud'),user.id,id,JSON.stringify({version,restart:body.restart===true})),
  ]);
  const job=await env.DB.prepare('SELECT status,prepared_count,updated_at FROM result_artifact_preparation_jobs WHERE administration_id=? AND snapshot_version=?').bind(id,version).first();
  return json({ok:true,job,snapshotVersion:version,rolloutReady:false});
 });
}
// Small scheduled pilot driver. A future producer queue must meet capacity SLOs.
export async function advanceResultArtifactPreparation(env:Env){
 if(env.RESULT_ARTIFACT_BACKGROUND_ENABLED!=='true'||env.RESULT_ARTIFACTS_ENABLED!=='true'||env.RESULT_ARTIFACT_CLEANUP_ENABLED!=='true'||env.RESULT_RETENTION_QUEUE_ENABLED!=='true'||!env.RESULT_RETENTION_QUEUE||!env.RESULT_FILES)return;
 const jobs=await all<any>(env.DB.prepare("SELECT administration_id,snapshot_version,actor_user_id FROM result_artifact_preparation_jobs WHERE status='RUNNING' ORDER BY COALESCE(last_attempted_at,'0000-01-01'),administration_id LIMIT 2"));
 for(const job of jobs){
  try{
   await prepareResultArtifacts(new Request('https://internal/prepare',{method:'POST',body:JSON.stringify({expectedSnapshotVersion:job.snapshot_version,managed:true})}),env,{id:job.actor_user_id,role:'SUPER_ADMIN'} as AuthUser,job.administration_id);
  }catch{/* No provider details or student data in scheduler logs; progress remains retryable. */}
 }
}

export async function readResultArtifactPreparation(env:Env,user:AuthUser,id:string){
 if(user.role!=='SUPER_ADMIN')return forbidden();
 if(env.RESULT_ARTIFACT_BACKGROUND_ENABLED!=='true')return badRequest('Arka plan dosya hazırlama etkin değil.','RESULT_ARTIFACT_BACKGROUND_DISABLED');
 const jobs=await all<any>(env.DB.prepare('SELECT snapshot_version,status,prepared_count,last_attempted_at,updated_at FROM result_artifact_preparation_jobs WHERE administration_id=? ORDER BY snapshot_version DESC LIMIT 11').bind(id));
 return json({ok:true,jobs:jobs.slice(0,10),hasMore:jobs.length>10,rolloutReady:false});
}
