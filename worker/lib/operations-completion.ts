import type { AuthUser,CapacityJobMessage,Env } from '../types';
import { all,audit,badRequest,forbidden,json,one,uuid } from './db';

const CAPACITY_CONFIRMATION='RUN_100K_STAGING';
const CAPACITY_TARGET=100_000;
const CAPACITY_CHUNK_SIZE=100;
export const CAPACITY_PROFILES={SMALL:{institutions:2,students:45,chunkSize:100},REGIONAL:{institutions:2500,students:96500,chunkSize:500},NATIONAL:{institutions:15000,students:1000000,chunkSize:1000}} as const;

export function buildCapacityChunks(runId:string,targetCount=CAPACITY_TARGET,chunkSize=CAPACITY_CHUNK_SIZE):CapacityJobMessage[]{
 const chunks:CapacityJobMessage[]=[];
 for(let startNo=1,chunkNo=0;startNo<=targetCount;startNo+=chunkSize,chunkNo++)chunks.push({kind:'CAPACITY_TEST_CHUNK',runId,chunkNo,startNo,rowCount:Math.min(chunkSize,targetCount-startNo+1)});
 return chunks;
}

async function batchStatements(env:Env,statements:D1PreparedStatement[]){for(let i=0;i<statements.length;i+=80)await env.DB.batch(statements.slice(i,i+80))}

export async function startCapacityTest(request:Request,env:Env,user:AuthUser){
 if(user.role!=='SUPER_ADMIN')return forbidden('Kapasite testini yalnız Süper Admin başlatabilir.');
 if((env.ENVIRONMENT||'').toLowerCase()!=='staging')return json({ok:false,error:{code:'STAGING_ONLY',message:'100.000 öğrenci kapasite testi yalnız staging ortamında çalıştırılabilir.'}},409);
 if(!env.SCALE_QUEUE)return json({ok:false,error:{code:'SCALE_QUEUE_REQUIRED',message:'SCALE_QUEUE binding yapılandırılmadan canlı kapasite testi başlatılamaz.'}},503);
 const body:any=await request.json().catch(()=>({}));
 if(body.confirmation!==CAPACITY_CONFIRMATION)return badRequest(`Başlatmak için confirmation alanı ${CAPACITY_CONFIRMATION} olmalıdır.`,'CAPACITY_CONFIRMATION_REQUIRED');
 const completed=await one<any>(env.DB.prepare(`SELECT id,status,target_count,processed_count,total_chunks,completed_chunks,started_at,completed_at FROM capacity_test_runs WHERE status='COMPLETED' AND target_count=? AND completed_at>=datetime('now','-30 days') ORDER BY completed_at DESC LIMIT 1`).bind(CAPACITY_TARGET));
 if(completed&&body.force!==true)return json({ok:true,reused:true,runId:completed.id,status:completed.status,targetCount:Number(completed.target_count),processedCount:Number(completed.processed_count),totalChunks:Number(completed.total_chunks),completedChunks:Number(completed.completed_chunks),startedAt:completed.started_at,completedAt:completed.completed_at});
 const active=await one<any>(env.DB.prepare(`SELECT id,status FROM capacity_test_runs WHERE status IN ('ENQUEUEING','QUEUED','RUNNING') ORDER BY started_at DESC LIMIT 1`));
 if(active)return json({ok:false,error:{code:'CAPACITY_TEST_ALREADY_RUNNING',message:'Devam eden bir kapasite testi var.',details:active}},409);
 const runId=uuid('cap'),chunks=buildCapacityChunks(runId);
 await env.DB.prepare(`INSERT INTO capacity_test_runs(id,environment,target_count,chunk_size,total_chunks,status,started_by) VALUES(?,?,?,?,?,'ENQUEUEING',?)`).bind(runId,env.ENVIRONMENT,CAPACITY_TARGET,CAPACITY_CHUNK_SIZE,chunks.length,user.id).run();
 await batchStatements(env,chunks.map(c=>env.DB.prepare(`INSERT INTO capacity_test_chunks(run_id,chunk_no,start_no,row_count) VALUES(?,?,?,?)`).bind(runId,c.chunkNo,c.startNo,c.rowCount)));
 try{
  for(let i=0;i<chunks.length;i+=100)await env.SCALE_QUEUE.sendBatch(chunks.slice(i,i+100).map(body=>({body})));
  await env.DB.prepare(`UPDATE capacity_test_runs SET status='QUEUED',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(runId).run();
 }catch(error){const message=error instanceof Error?error.message:String(error);await env.DB.prepare(`UPDATE capacity_test_runs SET status='FAILED',last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(message.slice(0,500),runId).run();throw error}
 await audit(env.DB,user.id,null,'CAPACITY_TEST_QUEUED','capacity_test',runId,{targetCount:CAPACITY_TARGET,chunkSize:CAPACITY_CHUNK_SIZE,totalChunks:chunks.length,environment:env.ENVIRONMENT});
 return json({ok:true,runId,status:'QUEUED',targetCount:CAPACITY_TARGET,chunkSize:CAPACITY_CHUNK_SIZE,totalChunks:chunks.length},202);
}

export async function capacityTestStatus(env:Env,user:AuthUser){
 if(user.role!=='SUPER_ADMIN')return forbidden();
 const runs=await all<any>(env.DB.prepare(`SELECT id,environment,target_count,chunk_size,total_chunks,completed_chunks,processed_count,failed_chunks,status,started_at,completed_at,last_error,updated_at FROM capacity_test_runs ORDER BY started_at DESC LIMIT 20`));
 return json({ok:true,queueConfigured:Boolean(env.SCALE_QUEUE),environment:env.ENVIRONMENT||null,runs});
}

export async function startCapacityBenchmark(request:Request,env:Env,user:AuthUser){
 if(user.role!=='SUPER_ADMIN')return forbidden('Kapasite testini yalnız Süper Admin başlatabilir.');if((env.ENVIRONMENT||'').toLowerCase()!=='staging')return json({ok:false,error:{code:'STAGING_ONLY',message:'Kapasite kanıtı yalnız staging ortamında çalıştırılır.'}},409);if(!env.SCALE_QUEUE)return json({ok:false,error:{code:'SCALE_QUEUE_REQUIRED',message:'SCALE_QUEUE binding zorunludur.'}},503);
 const body:any=await request.json().catch(()=>({})),profileKey=String(body.profileKey||'').toUpperCase() as keyof typeof CAPACITY_PROFILES,profile=CAPACITY_PROFILES[profileKey];if(!profile)return badRequest('Kapasite profili SMALL, REGIONAL veya NATIONAL olmalıdır.');const confirmation=`RUN_${profileKey}_${profile.students}`;if(body.confirmation!==confirmation)return badRequest(`Başlatmak için confirmation alanı ${confirmation} olmalıdır.`,'CAPACITY_CONFIRMATION_REQUIRED');
 const active=await one<any>(env.DB.prepare(`SELECT id FROM capacity_benchmark_runs WHERE status IN ('ENQUEUEING','QUEUED','RUNNING') LIMIT 1`));if(active)return json({ok:false,error:{code:'CAPACITY_TEST_ALREADY_RUNNING',message:'Devam eden benchmark var.',details:active}},409);
 const runId=uuid('bench'),chunks=buildCapacityChunks(runId,profile.students,profile.chunkSize).map(x=>({...x,kind:'CAPACITY_BENCHMARK_CHUNK' as const}));await env.DB.prepare(`INSERT INTO capacity_benchmark_runs(id,profile_key,institution_target_count,student_target_count,chunk_size,total_chunks,status,environment,started_by) VALUES(?,?,?,?,?,?,'ENQUEUEING',?,?)`).bind(runId,profileKey,profile.institutions,profile.students,profile.chunkSize,chunks.length,env.ENVIRONMENT,user.id).run();await batchStatements(env,chunks.map(c=>env.DB.prepare(`INSERT INTO capacity_benchmark_chunks(run_id,chunk_no,start_no,row_count) VALUES(?,?,?,?)`).bind(runId,c.chunkNo,c.startNo,c.rowCount)));for(let i=0;i<chunks.length;i+=100)await env.SCALE_QUEUE.sendBatch(chunks.slice(i,i+100).map(body=>({body})));await env.DB.prepare(`UPDATE capacity_benchmark_runs SET status='QUEUED' WHERE id=?`).bind(runId).run();await audit(env.DB,user.id,null,'CAPACITY_BENCHMARK_QUEUED','capacity_benchmark',runId,{profileKey,...profile,totalChunks:chunks.length});return json({ok:true,runId,profileKey,...profile,totalChunks:chunks.length,status:'QUEUED'},202);
}

export async function capacityBenchmarkStatus(env:Env,user:AuthUser){if(user.role!=='SUPER_ADMIN')return forbidden();const runs=await all<any>(env.DB.prepare(`SELECT * FROM capacity_benchmark_runs ORDER BY started_at DESC LIMIT 20`));return json({ok:true,environment:env.ENVIRONMENT||null,queueConfigured:Boolean(env.SCALE_QUEUE),profiles:CAPACITY_PROFILES,runs})}

async function processCapacityChunk(env:Env,message:CapacityJobMessage){
 if(message.kind!=='CAPACITY_TEST_CHUNK')throw new Error('UNSUPPORTED_QUEUE_MESSAGE');
 const run=await one<any>(env.DB.prepare(`SELECT id,status,target_count FROM capacity_test_runs WHERE id=?`).bind(message.runId));
 if(!run||run.status==='FAILED'||run.status==='COMPLETED')return;
 const chunk=await one<any>(env.DB.prepare(`SELECT * FROM capacity_test_chunks WHERE run_id=? AND chunk_no=?`).bind(message.runId,message.chunkNo));
 if(!chunk||chunk.status==='COMPLETED')return;
 const started=Date.now();
 await env.DB.batch([
  env.DB.prepare(`UPDATE capacity_test_runs SET status='RUNNING',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('QUEUED','ENQUEUEING')`).bind(message.runId),
  env.DB.prepare(`UPDATE capacity_test_chunks SET status='RUNNING',attempt_count=attempt_count+1,started_at=COALESCE(started_at,CURRENT_TIMESTAMP),last_error=NULL WHERE run_id=? AND chunk_no=?`).bind(message.runId,message.chunkNo),
 ]);
 try{
  const statements:D1PreparedStatement[]=[];
  for(let offset=0;offset<message.rowCount;offset++){
   const syntheticNumber=message.startNo+offset,shard=syntheticNumber%128,payloadHash=`cap-${message.runId}-${String(syntheticNumber).padStart(6,'0')}`;
   statements.push(env.DB.prepare(`INSERT OR IGNORE INTO capacity_test_rows(run_id,synthetic_number,shard,payload_hash) VALUES(?,?,?,?)`).bind(message.runId,syntheticNumber,shard,payloadHash));
  }
  await batchStatements(env,statements);
  const actual=await one<{c:number}>(env.DB.prepare(`SELECT count(*) c FROM capacity_test_rows WHERE run_id=? AND synthetic_number BETWEEN ? AND ?`).bind(message.runId,message.startNo,message.startNo+message.rowCount-1));
  const duration=Date.now()-started;
  await env.DB.batch([
   env.DB.prepare(`UPDATE capacity_test_chunks SET status='COMPLETED',duration_ms=?,completed_at=CURRENT_TIMESTAMP WHERE run_id=? AND chunk_no=? AND status!='COMPLETED'`).bind(duration,message.runId,message.chunkNo),
   env.DB.prepare(`UPDATE capacity_test_runs SET completed_chunks=completed_chunks+1,processed_count=processed_count+?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(Number(actual?.c||0),message.runId),
  ]);
  const progress=await one<any>(env.DB.prepare(`SELECT completed_chunks,total_chunks,processed_count,target_count FROM capacity_test_runs WHERE id=?`).bind(message.runId));
  if(progress&&Number(progress.completed_chunks)>=Number(progress.total_chunks))await env.DB.prepare(`UPDATE capacity_test_runs SET status=CASE WHEN processed_count>=target_count THEN 'COMPLETED' ELSE 'FAILED' END,completed_at=CURRENT_TIMESTAMP,last_error=CASE WHEN processed_count>=target_count THEN NULL ELSE 'ROW_COUNT_MISMATCH' END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(message.runId).run();
 }catch(error){const detail=(error instanceof Error?error.message:String(error)).slice(0,500);await env.DB.batch([env.DB.prepare(`UPDATE capacity_test_chunks SET status='FAILED',last_error=? WHERE run_id=? AND chunk_no=?`).bind(detail,message.runId,message.chunkNo),env.DB.prepare(`UPDATE capacity_test_runs SET failed_chunks=failed_chunks+1,last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(detail,message.runId)]);throw error}
}

async function processBenchmarkChunk(env:Env,message:CapacityJobMessage){const run=await one<any>(env.DB.prepare(`SELECT * FROM capacity_benchmark_runs WHERE id=?`).bind(message.runId));if(!run||['FAILED','COMPLETED'].includes(run.status))return;const chunk=await one<any>(env.DB.prepare(`SELECT * FROM capacity_benchmark_chunks WHERE run_id=? AND chunk_no=?`).bind(message.runId,message.chunkNo));if(!chunk||chunk.status==='COMPLETED')return;const started=Date.now();await env.DB.batch([env.DB.prepare(`UPDATE capacity_benchmark_runs SET status='RUNNING' WHERE id=? AND status IN ('QUEUED','ENQUEUEING')`).bind(message.runId),env.DB.prepare(`UPDATE capacity_benchmark_chunks SET status='RUNNING' WHERE run_id=? AND chunk_no=?`).bind(message.runId,message.chunkNo)]);try{const statements:D1PreparedStatement[]=[];for(let offset=0;offset<message.rowCount;offset++){const n=message.startNo+offset;statements.push(env.DB.prepare(`INSERT OR IGNORE INTO capacity_benchmark_rows(run_id,synthetic_number,institution_shard,result_shard,compact_answer_hash) VALUES(?,?,?,?,?)`).bind(message.runId,n,n%Number(run.institution_target_count),n%256,`compact-${message.runId}-${n}`))}await batchStatements(env,statements);await env.DB.batch([env.DB.prepare(`UPDATE capacity_benchmark_chunks SET status='COMPLETED',duration_ms=? WHERE run_id=? AND chunk_no=? AND status!='COMPLETED'`).bind(Date.now()-started,message.runId,message.chunkNo),env.DB.prepare(`UPDATE capacity_benchmark_runs SET completed_chunks=completed_chunks+1,processed_count=processed_count+? WHERE id=?`).bind(message.rowCount,message.runId)]);await env.DB.prepare(`UPDATE capacity_benchmark_runs SET status='COMPLETED',completed_at=CURRENT_TIMESTAMP WHERE id=? AND completed_chunks>=total_chunks AND processed_count>=student_target_count`).bind(message.runId).run()}catch(error){const detail=(error instanceof Error?error.message:String(error)).slice(0,500);await env.DB.batch([env.DB.prepare(`UPDATE capacity_benchmark_chunks SET status='FAILED' WHERE run_id=? AND chunk_no=?`).bind(message.runId,message.chunkNo),env.DB.prepare(`UPDATE capacity_benchmark_runs SET failed_chunks=failed_chunks+1,last_error=? WHERE id=?`).bind(detail,message.runId)]);throw error}}

export async function processCapacityQueue(batch:MessageBatch<CapacityJobMessage>,env:Env){
 for(const message of batch.messages){try{if(message.body.kind==='CAPACITY_BENCHMARK_CHUNK')await processBenchmarkChunk(env,message.body);else await processCapacityChunk(env,message.body);message.ack()}catch(error){console.error('capacity_test_chunk_failed',error);message.retry({delaySeconds:Math.min(300,Math.max(5,message.attempts*15))})}}
}
