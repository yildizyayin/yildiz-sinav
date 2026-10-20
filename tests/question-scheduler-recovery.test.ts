import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {PENDING_JOB_SQL,recordSchedulerTick,reserveScheduledJob} from '../worker/lib/question-scheduler-tick';
import {schedulerTickLabel} from '../src/pages/QuestionTeam';

const migration=(name:string)=>readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8');
function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE question_generation_jobs(id TEXT PRIMARY KEY,academic_year TEXT,status TEXT,attempt_count INTEGER DEFAULT 0,question_count INTEGER,lease_until TEXT);
 CREATE TABLE question_bank(id TEXT PRIMARY KEY,owner_type TEXT,origin_kind TEXT,review_status TEXT);`);
 db.exec(migration('0102_question_agent_pilot_budget.sql'));
 db.exec(migration('0112_question_production_budget_mode.sql'));
 db.exec(`UPDATE question_agent_pilot_budget SET budget_mode='UNLIMITED',question_cap=NULL`);
 db.exec(migration('0116_question_scheduler_status.sql'));
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...a:any[])=>prepare(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}};}});
 const env={DB:{prepare}} as any;
 const reserved=()=>Number((db.prepare(`SELECT reserved_count n FROM question_agent_pilot_budget`).get() as any).n);
 const job=(id:string,status='REQUESTED',extra='')=>db.exec(`INSERT INTO question_generation_jobs(id,academic_year,status,attempt_count,question_count,lease_until) VALUES('${id}','2027-2028','${status}',0,1,${extra||'NULL'})`);
 return {db,env,reserved,job};
}

it('a job reserved on an earlier tick but never claimed proceeds on that reservation instead of stalling forever, without double-reserving',async()=>{
 const f=setup();try{
  f.job('j1');
  const before=f.reserved();
  expect(await reserveScheduledJob(f.env,'j1',10000)).toBe('RESERVED');
  expect(f.reserved()).toBe(before+1);
  // Previous behaviour: INSERT OR IGNORE changed 0 rows → "skipped" on every later tick → permanent stall.
  expect(await reserveScheduledJob(f.env,'j1',10000)).toBe('ALREADY_RESERVED');
  expect(await reserveScheduledJob(f.env,'j1',10000)).toBe('ALREADY_RESERVED');
  expect(f.reserved()).toBe(before+1);
 }finally{f.db.close();}
});

it('still skips claimed, finished or over-capacity jobs',async()=>{
 const f=setup();try{
  f.job('j1');await reserveScheduledJob(f.env,'j1',10000);
  f.db.exec(`UPDATE question_generation_jobs SET status='RUNNING',attempt_count=1 WHERE id='j1'`);
  expect(await reserveScheduledJob(f.env,'j1',10000)).toBe('SKIPPED');
  f.db.exec(`UPDATE question_generation_jobs SET status='REVIEW_READY' WHERE id='j1'`);
  expect(await reserveScheduledJob(f.env,'j1',10000)).toBe('SKIPPED');
  f.job('j2');f.db.exec(`INSERT INTO question_bank VALUES('q1','PLATFORM','AI_GENERATED','REVIEW')`);
  expect(await reserveScheduledJob(f.env,'j2',1)).toBe('SKIPPED');
  expect(await reserveScheduledJob(f.env,'unknown',10000)).toBe('SKIPPED');
 }finally{f.db.close();}
});

it('an expired RUNNING lease no longer blocks new work, while queued and live jobs still do',()=>{
 const f=setup();try{
  const now=new Date().toISOString();
  f.job('stale','RUNNING',`'${new Date(Date.now()-60000).toISOString()}'`);
  const pending=()=>f.db.prepare(`SELECT id FROM question_generation_jobs WHERE academic_year='2027-2028' AND ${PENDING_JOB_SQL}`).all(now).map((r:any)=>r.id);
  expect(pending()).toEqual([]);
  f.job('live','RUNNING',`'${new Date(Date.now()+60000).toISOString()}'`);f.job('queued');
  expect(pending().sort()).toEqual(['live','queued']);
 }finally{f.db.close();}
});

it('records only the latest tick outcome for the panel and never throws when the table is missing',async()=>{
 const f=setup();try{
  await recordSchedulerTick(f.env,'JOB_QUEUED');
  await recordSchedulerTick(f.env,'RUN_REJECTED','j9',{status:409,code:'GENERATION_TEAM_PAUSED'});
  const rows=f.db.prepare('SELECT * FROM question_scheduler_status').all() as any[];
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({id:'autonomous',outcome:'RUN_REJECTED',job_id:'j9'});
  expect(JSON.parse(rows[0].detail_json)).toEqual({status:409,code:'GENERATION_TEAM_PAUSED'});
  f.db.exec('DROP TABLE question_scheduler_status');
  await expect(recordSchedulerTick(f.env,'JOB_RUN')).resolves.toBeUndefined();
 }finally{f.db.close();}
});

it('panel explains each tick outcome in Turkish with the failure code',()=>{
 expect(schedulerTickLabel({outcome:'JOB_RUN'})).toBe('bir soru üretim işi çalıştırıldı');
 expect(schedulerTickLabel({outcome:'RUN_REJECTED',detail:{code:'GENERATION_TEAM_PAUSED'}})).toBe('iş çalıştırılamadı (GENERATION_TEAM_PAUSED)');
 expect(schedulerTickLabel({outcome:'BLOCKED',detail:{reasons:['SERVICE_ACTOR_NOT_VERIFIED']}})).toBe('zamanlayıcı engellendi (SERVICE_ACTOR_NOT_VERIFIED)');
 expect(schedulerTickLabel({outcome:'SOMETHING_NEW'})).toBe('SOMETHING_NEW');
});
