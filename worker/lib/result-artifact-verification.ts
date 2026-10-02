import type {AuthUser,Env} from '../types';
import {all,badRequest,forbidden,json,uuid} from './db';
import {withExamOperationLock} from './exam-operation-lock';
import {inspectResultArtifactReadiness} from './result-artifacts';
function enabled(env:Env){return env.RESULT_ARTIFACT_VERIFICATION_ENABLED==='true'&&env.RESULT_ARTIFACT_BACKGROUND_ENABLED==='true'&&Boolean(env.RESULT_FILES)}
const changed=()=>json({ok:false,error:{code:'RESULT_ARTIFACT_SOURCE_CHANGED',message:'Doğrulama kaynağı değişti; yeniden hazırlayın.'}},409);
export async function startResultArtifactVerification(request:Request,env:Env,user:AuthUser,id:string){
 if(user.role!=='SUPER_ADMIN')return forbidden();
 if(!enabled(env))return badRequest('Dosya doğrulaması etkin değil.','RESULT_ARTIFACT_VERIFICATION_DISABLED');
 const body:any=await request.json().catch(()=>({})),version=body.expectedSnapshotVersion;
 if(!Number.isSafeInteger(version)||version<1||(body.restart!==undefined&&typeof body.restart!=='boolean'))return badRequest('Güncel sürüm gereklidir.');
 const admin=await env.DB.prepare("SELECT exam_id FROM exam_administrations WHERE id=? AND channel='RESULT_NETWORK'").bind(id).first<{exam_id:string}>();
 if(!admin)return changed();
 return withExamOperationLock(env,admin.exam_id,'RESULT_ARTIFACT_VERIFY_START',async env=>{
  const source=await env.DB.prepare(`SELECT p.source_generation,p.prepared_count FROM result_artifact_preparation_jobs p JOIN exam_administrations ea ON ea.id=p.administration_id WHERE p.administration_id=? AND p.snapshot_version=? AND p.status='PREPARED' AND ea.channel='RESULT_NETWORK' AND ea.status='PUBLISHED' AND ea.published_snapshot_version=p.snapshot_version AND NOT EXISTS(SELECT 1 FROM result_artifact_retirements r WHERE r.administration_id=ea.id AND r.retired_through_version>=p.snapshot_version)`).bind(id,version).first<any>();
  if(!source)return changed();
  const count=Number((await env.DB.prepare('SELECT COUNT(*) n FROM result_access_identities WHERE administration_id=?').bind(id).first<any>())?.n||0);
  if(count<1||count!==source.prepared_count)return changed();
  await env.DB.batch([
   env.DB.prepare(`INSERT INTO result_artifact_verifications(administration_id,snapshot_version,source_generation,actor_user_id,status,expected_count) VALUES(?,?,?,?,'VERIFYING',?) ON CONFLICT(administration_id,snapshot_version) DO UPDATE SET source_generation=excluded.source_generation,actor_user_id=excluded.actor_user_id,status='VERIFYING',expected_count=excluded.expected_count,verified_count=0,participant_cursor='',last_error_code=NULL,next_attempt_at=NULL,last_attempted_at=NULL,verified_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE ?=1`).bind(id,version,source.source_generation,user.id,count,body.restart===true?1:0),
   env.DB.prepare("INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,NULL,'RESULT_ARTIFACT_VERIFICATION_REQUESTED','exam_administration',?,?)").bind(uuid('aud'),user.id,id,JSON.stringify({version,generation:source.source_generation,restart:body.restart===true})),
  ]);
  return readResultArtifactVerification(env,user,id);
 });
}
export async function verifyResultArtifactPage(env:Env,id:string,version:number):Promise<Response>{
 if(!enabled(env))return badRequest('Dosya doğrulaması etkin değil.','RESULT_ARTIFACT_VERIFICATION_DISABLED');
 const admin=await env.DB.prepare("SELECT exam_id FROM exam_administrations WHERE id=? AND channel='RESULT_NETWORK'").bind(id).first<{exam_id:string}>();
 if(!admin)return changed();
 return withExamOperationLock(env,admin.exam_id,'RESULT_ARTIFACT_VERIFY_PAGE',async env=>{
  const job=await env.DB.prepare(`SELECT v.* FROM result_artifact_verifications v JOIN result_artifact_preparation_jobs p ON p.administration_id=v.administration_id AND p.snapshot_version=v.snapshot_version WHERE v.administration_id=? AND v.snapshot_version=? AND v.status='VERIFYING' AND p.status='PREPARED' AND p.source_generation=v.source_generation AND (v.next_attempt_at IS NULL OR v.next_attempt_at<=CURRENT_TIMESTAMP)`).bind(id,version).first<any>();
  if(!job)return changed();
  await env.DB.prepare('UPDATE result_artifact_verifications SET last_attempted_at=CURRENT_TIMESTAMP WHERE administration_id=? AND snapshot_version=?').bind(id,version).run();
  const request=new Request('https://internal/audit?expectedSnapshotVersion='+version+'&cursor='+encodeURIComponent(job.participant_cursor));
  const response=await inspectResultArtifactReadiness(request,env,{id:job.actor_user_id,role:'SUPER_ADMIN'} as AuthUser,id,false);
  if(!response.ok){
   await env.DB.prepare("UPDATE result_artifact_verifications SET last_error_code='RESULT_ARTIFACT_AUDIT_UNAVAILABLE',next_attempt_at=datetime('now','+5 minutes') WHERE administration_id=? AND snapshot_version=? AND status='VERIFYING' AND source_generation=?").bind(id,version,job.source_generation).run();
   return response;
  }
  const audit:any=await response.json();
  const total=job.verified_count+audit.page.verified;
  const invalid=audit.page.verified!==audit.page.checked||total>job.expected_count||(!audit.nextCursor&&total!==job.expected_count);
  const status=invalid?'INVALIDATED':audit.nextCursor?'VERIFYING':'VERIFIED';
  const result=await env.DB.batch([
   env.DB.prepare(`UPDATE result_artifact_verifications SET participant_cursor=?,verified_count=?,status=?,last_error_code=?,next_attempt_at=NULL,verified_at=CASE WHEN ?='VERIFIED' THEN CURRENT_TIMESTAMP ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE administration_id=? AND snapshot_version=? AND status='VERIFYING' AND source_generation=? AND participant_cursor=? AND EXISTS(SELECT 1 FROM result_artifact_preparation_jobs p WHERE p.administration_id=? AND p.snapshot_version=? AND p.status='PREPARED' AND p.source_generation=?)`).bind(audit.nextCursor??job.participant_cursor,invalid?job.verified_count:total,status,invalid?'RESULT_ARTIFACT_VERIFICATION_FAILED':null,status,id,version,job.source_generation,job.participant_cursor,id,version,job.source_generation),
   env.DB.prepare(`INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) SELECT ?,?,NULL,'RESULT_ARTIFACT_VERIFICATION_PAGE','exam_administration',?,? WHERE EXISTS(SELECT 1 FROM result_artifact_preparation_jobs WHERE administration_id=? AND snapshot_version=? AND status='PREPARED' AND source_generation=?)`).bind(uuid('aud'),job.actor_user_id,id,JSON.stringify({version,generation:job.source_generation,status,checked:audit.page.checked}),id,version,job.source_generation),
  ]);
  if(!result[0].meta?.changes)return changed();
  return json({ok:true,status,verifiedCount:invalid?job.verified_count:total,rolloutReady:false});
 });
}
export async function readResultArtifactVerification(env:Env,user:AuthUser,id:string){
 if(user.role!=='SUPER_ADMIN')return forbidden();
 if(!enabled(env))return badRequest('Dosya doğrulaması etkin değil.','RESULT_ARTIFACT_VERIFICATION_DISABLED');
 const records=await all<any>(env.DB.prepare(`SELECT v.snapshot_version,v.source_generation,v.status,v.expected_count,v.verified_count,v.last_error_code,v.next_attempt_at,v.verified_at,v.updated_at,CASE WHEN v.status='VERIFIED' AND p.status='PREPARED' AND p.source_generation=v.source_generation AND ea.channel='RESULT_NETWORK' AND ea.status='PUBLISHED' AND ea.published_snapshot_version=v.snapshot_version AND NOT EXISTS(SELECT 1 FROM result_artifact_retirements r WHERE r.administration_id=ea.id AND r.retired_through_version>=v.snapshot_version) THEN 1 ELSE 0 END certificate_current FROM result_artifact_verifications v JOIN result_artifact_preparation_jobs p ON p.administration_id=v.administration_id AND p.snapshot_version=v.snapshot_version JOIN exam_administrations ea ON ea.id=v.administration_id WHERE v.administration_id=? ORDER BY v.snapshot_version DESC LIMIT 11`).bind(id));
 return json({ok:true,records:records.slice(0,10),hasMore:records.length>10,rolloutReady:false,verificationMeaning:'COMPLETED_FULL_COHORT_PASS'});
}
export async function advanceResultArtifactVerification(env:Env){
 if(!enabled(env))return;
 const jobs=await all<any>(env.DB.prepare("SELECT administration_id,snapshot_version FROM result_artifact_verifications WHERE status='VERIFYING' AND (next_attempt_at IS NULL OR next_attempt_at<=CURRENT_TIMESTAMP) ORDER BY COALESCE(last_attempted_at,'0000-01-01'),administration_id LIMIT 2"));
 for(const job of jobs){try{await verifyResultArtifactPage(env,job.administration_id,job.snapshot_version)}catch{/* No raw service/student data logged. Durable cursor remains unchanged. */}}
}
