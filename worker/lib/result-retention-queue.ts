import type {AuthUser,Env} from '../types';
import {all,forbidden,json,uuid} from './db';
import {sweepRetiredResultArtifactJob} from './result-artifact-retention';

type Kind='COHORT_PURGE'|'ARTIFACT_SWEEP';
interface Work {schemaVersion:1;kind:Kind;administrationId:string;token:string}
type PurgePage=(env:Env,id:string)=>Promise<Response>;
function work(body:any):body is Work{
 return body&&typeof body==='object'&&!Array.isArray(body)&&Object.keys(body).length===4&&body.schemaVersion===1&&['COHORT_PURGE','ARTIFACT_SWEEP'].includes(body.kind)&&typeof body.administrationId==='string'&&body.administrationId.length>0&&body.administrationId.length<=200&&typeof body.token==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(body.token);
}
const active=(env:Env)=>env.RESULT_RETENTION_QUEUE_ENABLED==='true'&&!!env.RESULT_RETENTION_QUEUE;
async function failed(env:Env,job:Work,code:string){
 await env.DB.prepare(`UPDATE result_retention_queue_jobs SET status='ERROR',failure_count=failure_count+1,last_error_code=?,updated_at=CURRENT_TIMESTAMP WHERE kind=? AND administration_id=? AND dispatch_token=?`).bind(code,job.kind,job.administrationId,job.token).run();
}
async function send(env:Env,job:Work,delaySeconds=0){
 try{await env.RESULT_RETENTION_QUEUE!.send(job,{delaySeconds})}
 catch(error){await failed(env,job,'RESULT_RETENTION_SEND_FAILED');throw error}
}

// The DB is the durable outbox. A send lost after reservation is rediscovered
// after 15 minutes; rotating tokens makes delayed older deliveries harmless.
export async function dispatchResultRetentionQueue(env:Env){
 if(env.RESULT_RETENTION_QUEUE_ENABLED==='true'&&!env.RESULT_RETENTION_QUEUE)throw Error('RESULT_RETENTION_QUEUE_NOT_CONFIGURED');
 if(!active(env))return {enabled:false,dispatched:0,failed:0};
 // A crash can follow the final source commit but precede the queue status
 // update. Reconcile completed/withdrawn sources without repeating deletion.
 await env.DB.prepare(`UPDATE result_retention_queue_jobs SET status='DONE',next_dispatch_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE status<>'DONE' AND (
  (kind='COHORT_PURGE' AND NOT EXISTS(SELECT 1 FROM exam_administrations ea WHERE ea.id=result_retention_queue_jobs.administration_id AND ea.channel='RESULT_NETWORK' AND ea.status IN ('PUBLISHED','ARCHIVED') AND ea.retention_due_at IS NOT NULL AND ea.retention_due_at<=CURRENT_TIMESTAMP))
  OR (kind='ARTIFACT_SWEEP' AND EXISTS(SELECT 1 FROM result_artifact_retirements r WHERE r.administration_id=result_retention_queue_jobs.administration_id AND r.sweep_version=1 AND r.last_sweep_at IS NOT NULL AND r.next_sweep_at>=datetime(r.last_sweep_at,'+1 day') AND r.next_sweep_at>CURRENT_TIMESTAMP))
 )`).run();
 const candidates=await all<{kind:Kind;administration_id:string}>(env.DB.prepare(`SELECT kind,administration_id FROM (
  SELECT 'COHORT_PURGE' kind,ea.id administration_id FROM exam_administrations ea WHERE ea.channel='RESULT_NETWORK' AND ea.status IN ('PUBLISHED','ARCHIVED') AND ea.retention_due_at IS NOT NULL AND ea.retention_due_at<=CURRENT_TIMESTAMP
  UNION ALL SELECT 'ARTIFACT_SWEEP',r.administration_id FROM result_artifact_retirements r WHERE r.next_sweep_at<=CURRENT_TIMESTAMP AND ?=1
 ) source WHERE NOT EXISTS(SELECT 1 FROM result_retention_queue_jobs q WHERE q.kind=source.kind AND q.administration_id=source.administration_id AND q.next_dispatch_at>CURRENT_TIMESTAMP)
 ORDER BY administration_id,kind LIMIT 100`).bind(env.RESULT_ARTIFACT_CLEANUP_ENABLED==='true'&&env.RESULT_FILES?1:0));
 let dispatched=0,errors=0;
 for(const candidate of candidates){
  const job:Work={schemaVersion:1,kind:candidate.kind,administrationId:candidate.administration_id,token:uuid('rrq')};
  const claimed=await env.DB.prepare(`INSERT INTO result_retention_queue_jobs(kind,administration_id,dispatch_token,status,next_dispatch_at) VALUES(?,?,?,'PENDING',datetime('now','+15 minutes'))
   ON CONFLICT(kind,administration_id) DO UPDATE SET dispatch_token=excluded.dispatch_token,status='PENDING',next_dispatch_at=excluded.next_dispatch_at,last_dispatched_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE result_retention_queue_jobs.next_dispatch_at<=CURRENT_TIMESTAMP`).bind(job.kind,job.administrationId,job.token).run();
  if(!claimed.meta?.changes)continue;
  try{await send(env,job);dispatched++}catch{errors++}
 }
 return {enabled:true,dispatched,failed:errors};
}

export async function consumeResultRetentionQueue(batch:MessageBatch,env:Env,purgePage:PurgePage){
 for(const message of batch.messages){
  if(!active(env)){message.retry({delaySeconds:300});continue}
  const job=message.body;
  if(!work(job)){message.ack();continue}
  try{
   const current=await env.DB.prepare(`SELECT status FROM result_retention_queue_jobs WHERE kind=? AND administration_id=? AND dispatch_token=?`).bind(job.kind,job.administrationId,job.token).first<{status:string}>();
   if(!current||current.status==='DONE'){message.ack();continue}
   let more=false,delay=0,pageProcessed=true;
   if(job.kind==='COHORT_PURGE'){
    const response=await purgePage(env,job.administrationId);
    if(response.status===409){message.retry({delaySeconds:30});continue}
    if(response.status!==200)throw Error('RESULT_RETENTION_PAGE_FAILED');
    const result=await response.json() as any;more=!!result.hasMore;pageProcessed=!result.skipped;
   }else{
    const result=await sweepRetiredResultArtifactJob(env,job.administrationId,true);
    if(!result.active&&result.hasMore){message.retry({delaySeconds:result.delaySeconds});continue}
    more=result.hasMore;delay=result.delaySeconds;pageProcessed=result.active;
   }
   // Record successful pages and rotate before sending a continuation. If the
   // send fails, the durable new token remains for the scheduled watchdog.
   const next:Work={schemaVersion:1,kind:job.kind,administrationId:job.administrationId,token:uuid('rrq')};
   const updated=await env.DB.prepare(`UPDATE result_retention_queue_jobs SET dispatch_token=?,status=?,next_dispatch_at=datetime('now',?),last_processed_at=CURRENT_TIMESTAMP,processed_pages=processed_pages+?,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP WHERE kind=? AND administration_id=? AND dispatch_token=? AND status<>'DONE'`).bind(more?next.token:job.token,more?'PENDING':'DONE',more?'+15 minutes':'+0 minutes',pageProcessed?1:0,job.kind,job.administrationId,job.token).run();
   if(updated.meta?.changes&&more)await send(env,next,delay);
   message.ack();
  }catch{
   try{await failed(env,job,'RESULT_RETENTION_PROCESS_FAILED')}catch{/* durable source remains discoverable */}
   message.retry({delaySeconds:300});
  }
 }
}

export async function resultRetentionQueueDiagnostics(env:Env,user:AuthUser):Promise<Response>{
 if(user.role!=='SUPER_ADMIN')return forbidden();
 const rows=await all<any>(env.DB.prepare(`SELECT kind,administration_id,status,next_dispatch_at,last_dispatched_at,last_processed_at,processed_pages,failure_count,last_error_code,updated_at FROM result_retention_queue_jobs ORDER BY CASE status WHEN 'ERROR' THEN 0 WHEN 'PENDING' THEN 1 ELSE 2 END,updated_at,kind,administration_id LIMIT 101`));
 const counts=await env.DB.prepare(`SELECT count(*) total,SUM(status='PENDING') pending,SUM(status='ERROR') errors,SUM(status='DONE') done,SUM(status<>'DONE' AND next_dispatch_at<=CURRENT_TIMESTAMP) redispatch_due FROM result_retention_queue_jobs`).first();
 return json({ok:true,enabled:active(env),featureEnabled:env.RESULT_RETENTION_QUEUE_ENABLED==='true',configured:!!env.RESULT_RETENTION_QUEUE,jobs:rows.slice(0,100),hasMore:rows.length>100,counts},200);
}
