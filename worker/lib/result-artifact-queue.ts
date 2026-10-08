import type {AuthUser,Env} from '../types';
import {all,forbidden,json,uuid} from './db';
import {prepareResultArtifacts} from './result-artifacts';
import {verifyResultArtifactPage} from './result-artifact-verification';
type Kind='PREPARE'|'VERIFY';
interface Work {schemaVersion:1;kind:Kind;administrationId:string;snapshotVersion:number;sourceGeneration:number;token:string}
const enabled=(env:Env)=>env.RESULT_ARTIFACT_QUEUE_ENABLED==='true'&&env.RESULT_ARTIFACT_BACKGROUND_ENABLED==='true'&&env.RESULT_ARTIFACTS_ENABLED==='true'&&env.RESULT_ARTIFACT_CLEANUP_ENABLED==='true'&&env.RESULT_RETENTION_QUEUE_ENABLED==='true'&&!!env.RESULT_RETENTION_QUEUE&&!!env.RESULT_FILES&&!!env.RESULT_ARTIFACT_QUEUE;
function valid(body:any):body is Work{return body&&typeof body==='object'&&!Array.isArray(body)&&Object.keys(body).length===6&&body.schemaVersion===1&&['PREPARE','VERIFY'].includes(body.kind)&&typeof body.administrationId==='string'&&body.administrationId.length>0&&body.administrationId.length<=200&&Number.isSafeInteger(body.snapshotVersion)&&body.snapshotVersion>0&&Number.isSafeInteger(body.sourceGeneration)&&body.sourceGeneration>0&&typeof body.token==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(body.token)}
const bindings=(job:Work)=>[job.kind,job.administrationId,job.snapshotVersion,job.sourceGeneration,job.token];
async function error(env:Env,job:Work,code:string){await env.DB.prepare("UPDATE result_artifact_queue_jobs SET status='ERROR',last_error_code=?,updated_at=CURRENT_TIMESTAMP WHERE kind=? AND administration_id=? AND snapshot_version=? AND source_generation=? AND dispatch_token=? AND status<>'DONE'").bind(code,...bindings(job)).run()}
async function send(env:Env,job:Work){try{await env.RESULT_ARTIFACT_QUEUE!.send(job,{delaySeconds:0})}catch{await error(env,job,'RESULT_ARTIFACT_QUEUE_SEND_FAILED');throw Error('RESULT_ARTIFACT_QUEUE_SEND_FAILED')}}
async function source(env:Env,job:Work){
 const table=job.kind==='PREPARE'?'result_artifact_preparation_jobs':'result_artifact_verifications';
 const state=job.kind==='PREPARE'?'RUNNING':'VERIFYING';
 return env.DB.prepare(`SELECT s.participant_cursor,s.actor_user_id,s.next_attempt_at FROM ${table} s JOIN exam_administrations ea ON ea.id=s.administration_id JOIN result_artifact_preparation_jobs p ON p.administration_id=s.administration_id AND p.snapshot_version=s.snapshot_version WHERE s.administration_id=? AND s.snapshot_version=? AND s.source_generation=? AND s.status=? AND p.source_generation=s.source_generation AND p.status=? AND ea.channel='RESULT_NETWORK' AND ea.status='PUBLISHED' AND ea.published_snapshot_version=s.snapshot_version AND NOT EXISTS(SELECT 1 FROM result_artifact_retirements r WHERE r.administration_id=ea.id AND r.retired_through_version>=s.snapshot_version)`).bind(job.administrationId,job.snapshotVersion,job.sourceGeneration,state,job.kind==='PREPARE'?'RUNNING':'PREPARED').first<any>();
}
export async function dispatchResultArtifactQueue(env:Env){
 if(env.RESULT_ARTIFACT_QUEUE_ENABLED==='true'&&!env.RESULT_ARTIFACT_QUEUE)throw Error('RESULT_ARTIFACT_QUEUE_NOT_CONFIGURED');
 if(!enabled(env))return {enabled:false,dispatched:0};
 await env.DB.prepare(`UPDATE result_artifact_queue_jobs SET status='DONE',updated_at=CURRENT_TIMESTAMP WHERE status<>'DONE' AND NOT EXISTS(
 SELECT 1 FROM result_artifact_preparation_jobs p JOIN exam_administrations ea ON ea.id=p.administration_id WHERE p.administration_id=result_artifact_queue_jobs.administration_id AND p.snapshot_version=result_artifact_queue_jobs.snapshot_version AND p.source_generation=result_artifact_queue_jobs.source_generation AND ea.channel='RESULT_NETWORK' AND ea.status='PUBLISHED' AND ea.published_snapshot_version=p.snapshot_version AND NOT EXISTS(SELECT 1 FROM result_artifact_retirements r WHERE r.administration_id=ea.id AND r.retired_through_version>=p.snapshot_version) AND ((result_artifact_queue_jobs.kind='PREPARE' AND p.status='RUNNING') OR (result_artifact_queue_jobs.kind='VERIFY' AND p.status='PREPARED' AND EXISTS(SELECT 1 FROM result_artifact_verifications v WHERE v.administration_id=p.administration_id AND v.snapshot_version=p.snapshot_version AND v.source_generation=p.source_generation AND v.status='VERIFYING')))
 )`).run();
 const candidates=await all<any>(env.DB.prepare(`SELECT * FROM (
 SELECT 'PREPARE' kind,administration_id,snapshot_version,source_generation,participant_cursor,next_attempt_at FROM result_artifact_preparation_jobs WHERE status='RUNNING'
 UNION ALL SELECT 'VERIFY',administration_id,snapshot_version,source_generation,participant_cursor,next_attempt_at FROM result_artifact_verifications WHERE status='VERIFYING' AND ?=1
 ) s WHERE (s.next_attempt_at IS NULL OR s.next_attempt_at<=CURRENT_TIMESTAMP) AND NOT EXISTS(SELECT 1 FROM result_artifact_queue_jobs q WHERE q.kind=s.kind AND q.administration_id=s.administration_id AND q.snapshot_version=s.snapshot_version AND q.source_generation=s.source_generation AND q.next_dispatch_at>CURRENT_TIMESTAMP AND q.status<>'DONE') ORDER BY administration_id,kind LIMIT 100`).bind(env.RESULT_ARTIFACT_VERIFICATION_ENABLED==='true'?1:0));
 let dispatched=0;
 for(const row of candidates){
  const job:Work={schemaVersion:1,kind:row.kind,administrationId:row.administration_id,snapshotVersion:row.snapshot_version,sourceGeneration:row.source_generation,token:uuid('raq')};
  const live=await source(env,job);if(!live)continue;
  const result=await env.DB.prepare(`INSERT INTO result_artifact_queue_jobs(kind,administration_id,snapshot_version,source_generation,dispatch_token,page_cursor,status,next_dispatch_at) VALUES(?,?,?,?,?,?,'PENDING',datetime('now','+15 minutes')) ON CONFLICT(kind,administration_id,snapshot_version,source_generation) DO UPDATE SET dispatch_token=excluded.dispatch_token,page_cursor=excluded.page_cursor,status='PENDING',next_dispatch_at=excluded.next_dispatch_at,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP WHERE result_artifact_queue_jobs.next_dispatch_at<=CURRENT_TIMESTAMP OR result_artifact_queue_jobs.status='DONE'`).bind(job.kind,job.administrationId,job.snapshotVersion,job.sourceGeneration,job.token,live.participant_cursor).run();
  if(!result.meta?.changes)continue;try{await send(env,job);dispatched++}catch{/* durable watchdog reservation remains */}
 }
 return {enabled:true,dispatched};
}
export async function consumeResultArtifactQueue(batch:MessageBatch,env:Env){
 for(const message of batch.messages){
  if(!enabled(env)){message.retry({delaySeconds:300});continue}
  const job=message.body;if(!valid(job)){message.ack();continue}
  if(job.kind==='VERIFY'&&env.RESULT_ARTIFACT_VERIFICATION_ENABLED!=='true'){message.retry({delaySeconds:300});continue}
  const attemptToken=uuid('artifact-attempt');
  try{
   const ticket=await env.DB.prepare('SELECT page_cursor,status FROM result_artifact_queue_jobs WHERE kind=? AND administration_id=? AND snapshot_version=? AND source_generation=? AND dispatch_token=?').bind(...bindings(job)).first<any>();
   if(!ticket||ticket.status==='DONE'){message.ack();continue}
   let live=await source(env,job);
   if(!live){await env.DB.prepare("UPDATE result_artifact_queue_jobs SET status='DONE',updated_at=CURRENT_TIMESTAMP WHERE kind=? AND administration_id=? AND snapshot_version=? AND source_generation=? AND dispatch_token=?").bind(...bindings(job)).run();message.ack();continue}
   if(live.next_attempt_at&&Date.parse(live.next_attempt_at.replace(' ','T')+'Z')>Date.now()){message.retry({delaySeconds:300});continue}
   // A source page may have committed before transport bookkeeping crashed.
   // Only the matching cursor/token can process a new page under the exam lock.
   if(live.participant_cursor===ticket.page_cursor){
    const expectation={expectedGeneration:job.sourceGeneration,expectedCursor:ticket.page_cursor,queueToken:job.token};
    const response=job.kind==='PREPARE'?await prepareResultArtifacts(new Request('https://internal/prepare',{method:'POST',body:JSON.stringify({expectedSnapshotVersion:job.snapshotVersion,managed:true,attemptToken,...expectation})}),env,{id:live.actor_user_id,role:'SUPER_ADMIN'} as AuthUser,job.administrationId):await verifyResultArtifactPage(env,job.administrationId,job.snapshotVersion,expectation);
    if(!response.ok){
     const payload:any=await response.json().catch(()=>null),code=payload?.error?.code;
     const brief=['EXAM_OPERATION_BUSY','EXAM_OPERATION_OWNERSHIP_LOST','RESULT_ARTIFACT_QUEUE_STALE'].includes(code);
     if(job.kind==='PREPARE'&&!brief){
      const safe=['RESULT_ARTIFACT_SOURCE_INCOMPLETE','RESULT_ARTIFACT_SOURCE_INVALID','RESULT_ARTIFACT_MANIFEST_CONFLICT'].includes(code)?code:'RESULT_ARTIFACT_PREPARATION_FAILED';
      await env.DB.prepare("UPDATE result_artifact_preparation_jobs SET failure_count=failure_count+1,last_error_code=?,next_attempt_at=datetime('now','+5 minutes') WHERE administration_id=? AND snapshot_version=? AND source_generation=? AND status='RUNNING' AND attempt_token=?").bind(safe,job.administrationId,job.snapshotVersion,job.sourceGeneration,attemptToken).run();
     }
     await error(env,job,'RESULT_ARTIFACT_QUEUE_PAGE_FAILED');message.retry({delaySeconds:brief?30:300});continue
    }
   }
   live=await source(env,job);
   const next:Work={...job,token:uuid('raq')};
   const result=await env.DB.prepare("UPDATE result_artifact_queue_jobs SET dispatch_token=?,page_cursor=?,status=?,next_dispatch_at=datetime('now','+15 minutes'),last_error_code=NULL,processed_pages=processed_pages+1,updated_at=CURRENT_TIMESTAMP WHERE kind=? AND administration_id=? AND snapshot_version=? AND source_generation=? AND dispatch_token=? AND status<>'DONE'").bind(live?next.token:job.token,live?.participant_cursor??ticket.page_cursor,live?'PENDING':'DONE',...bindings(job)).run();
   if(result.meta?.changes&&live)await send(env,next);
   message.ack();
  }catch{
   try{
    if(job.kind==='PREPARE')await env.DB.prepare("UPDATE result_artifact_preparation_jobs SET failure_count=failure_count+1,last_error_code='RESULT_ARTIFACT_PREPARATION_FAILED',next_attempt_at=datetime('now','+5 minutes') WHERE administration_id=? AND snapshot_version=? AND source_generation=? AND status='RUNNING' AND attempt_token=?").bind(job.administrationId,job.snapshotVersion,job.sourceGeneration,attemptToken).run();
    await error(env,job,'RESULT_ARTIFACT_QUEUE_PROCESS_FAILED');
   }catch{}
   message.retry({delaySeconds:300});
  }
 }
}
export async function resultArtifactQueueDiagnostics(env:Env,user:AuthUser){
 if(user.role!=='SUPER_ADMIN')return forbidden();
 const rows=await all<any>(env.DB.prepare('SELECT kind,administration_id,snapshot_version,source_generation,status,next_dispatch_at,last_error_code,processed_pages,updated_at FROM result_artifact_queue_jobs ORDER BY updated_at DESC LIMIT 101'));
 return json({ok:true,enabled:enabled(env),configured:!!env.RESULT_ARTIFACT_QUEUE,jobs:rows.slice(0,100),hasMore:rows.length>100,rolloutReady:false});
}
