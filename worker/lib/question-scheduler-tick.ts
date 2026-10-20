import type {Env} from '../types';

/**
 * A009 scheduler reliability helpers.
 *
 * reserveScheduledJob: a job whose budget reservation was written on an earlier
 * tick but which was never claimed (the run returned or was cut off before the
 * claim) stays REQUESTED with attempt_count=0. Treating the existing reservation
 * as "skip" stalled the agent forever, so the same untouched job now proceeds on
 * its existing reservation. The budget trigger only counts a job's first
 * reservation, so this never double-reserves, and the runner's claim keeps
 * concurrent ticks from running the job twice.
 */
export type ReservationOutcome='RESERVED'|'ALREADY_RESERVED'|'SKIPPED'|'DENIED';
const AI_REVIEW_COUNT=`(SELECT count(*) FROM question_bank WHERE owner_type='PLATFORM' AND origin_kind IN ('AI','AI_GENERATED','AI_DRAFT','NIBIRU','NIBIRU_AI') AND review_status='REVIEW')`;

export async function reserveScheduledJob(env:Env,jobId:string,reviewSlots:number):Promise<ReservationOutcome>{
 try{
  const reservation=await env.DB.prepare(`INSERT OR IGNORE INTO question_agent_pilot_reservations(job_id,question_count)
   SELECT id,question_count FROM question_generation_jobs
   WHERE id=? AND status='REQUESTED' AND attempt_count=0 AND question_count BETWEEN 1 AND 10
   AND question_count+${AI_REVIEW_COUNT}
   +COALESCE((SELECT sum(r.question_count) FROM question_agent_pilot_reservations r JOIN question_generation_jobs j ON j.id=r.job_id WHERE j.status IN ('REQUESTED','RUNNING')),0)<=?`).bind(jobId,reviewSlots).run();
  if(Number(reservation.meta?.changes||0)===1)return 'RESERVED';
 }catch{
  return 'DENIED';
 }
 const existing=await env.DB.prepare(`SELECT 1 ok FROM question_agent_pilot_reservations r JOIN question_generation_jobs j ON j.id=r.job_id
  WHERE r.job_id=? AND r.question_count=j.question_count AND j.status='REQUESTED' AND j.attempt_count=0
  AND j.question_count+${AI_REVIEW_COUNT}<=?`).bind(jobId,reviewSlots).first<{ok:number}>();
 return existing?.ok===1?'ALREADY_RESERVED':'SKIPPED';
}

/** A job blocks new work only while it is queued or holds a live lease. */
export const PENDING_JOB_SQL=`(status='REQUESTED' OR (status='RUNNING' AND lease_until>?))`;

export async function recordSchedulerTick(env:Env,outcome:string,jobId:string|null=null,detail?:unknown){
 try{
  await env.DB.prepare(`INSERT INTO question_scheduler_status(id,last_tick_at,outcome,job_id,detail_json) VALUES('autonomous',?,?,?,?)
   ON CONFLICT(id) DO UPDATE SET last_tick_at=excluded.last_tick_at,outcome=excluded.outcome,job_id=excluded.job_id,detail_json=excluded.detail_json`)
   .bind(new Date().toISOString(),outcome.slice(0,80),jobId,detail===undefined?null:JSON.stringify(detail).slice(0,2000)).run();
 }catch{/* status is observability only; never break the scheduler */}
}
