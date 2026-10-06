import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {expect,it} from 'vitest';
import {cohortReportClassScope} from '../worker/lib/cohort-report-class-scope';
import {handlePrivateCohortReport,consumePrivateCohortReports,dispatchPrivateCohortReports} from '../worker/lib/private-cohort-report';

function fixture(){
 const db=new DatabaseSync(':memory:');
 const dir=new URL('../migrations/',import.meta.url);
 for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync(new URL(name,dir),'utf8'));
 db.exec(`INSERT INTO institutions(id,name,code) VALUES('school','Synthetic','SYNTH'),('foreign','Foreign','OTHER');
 INSERT INTO institution_seasons(id,institution_id,academic_year) VALUES('season','school','2026-2027'),('next','school','2027-2028');
 INSERT INTO classes(id,institution_id,season_id,grade_level,section,name) VALUES('class','school','season',7,'A','7A'),('other','school','season',7,'B','7B');
 INSERT INTO users(id,institution_id,role,display_name,password_hash,password_salt) VALUES('guide','school','GUIDANCE_TEACHER','Synthetic','hash','salt');
 INSERT INTO teacher_assignments(id,user_id,institution_id,season_id,class_id,assignment_type) VALUES('assignment','guide','school','season','class','GUIDANCE');`);
 const prepare=(sql:string,args:any[]=[]):any=>({sql,args,bind:(...v:any[])=>prepare(sql,v),first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({success:true,results:db.prepare(sql).all(...args)}),run:async()=>({success:true,meta:{changes:Number(db.prepare(sql).run(...args).changes)}})});
 const objects=new Map<string,string>();let gets=0;const sent:any[]=[];
 const bucket={put:async(k:string,v:string)=>objects.set(k,v),get:async(k:string)=>{gets++;return objects.has(k)?{text:async()=>objects.get(k)!}:null;},delete:async(k:string)=>{objects.delete(k)},list:async({prefix,limit}:any)=>{const keys=[...objects.keys()].filter(k=>k.startsWith(prefix));return {objects:keys.slice(0,limit).map(key=>({key})),truncated:keys.length>limit}}};
 const env:any={DB:{prepare,batch:async(stmts:any[])=>{db.exec('BEGIN');try{const out=stmts.map(s=>{const statement=db.prepare(s.sql);if(statement.columns().length)return {success:true,results:statement.all(...s.args),meta:{changes:0}};return {success:true,results:[],meta:{changes:Number(statement.run(...s.args).changes)}}});db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}},COHORT_REPORTS_ENABLED:'true',COHORT_REPORT_QUEUE_NAME:'anunex-cohort-reports-staging',COHORT_REPORT_QUEUE:{send:async(x:any)=>{sent.push(x)}},REPORT_EXPORT_FILES:bucket};
 const user:any={id:'guide',role:'GUIDANCE_TEACHER',institution_id:'school'};
 const selection={institutionId:'school',classId:'class',academicYear:'2026-2027',sources:['MINI_GAME'],examIds:[],repeatPolicy:'LATEST'};
 const create=async(requestId='request-0001')=>{const r=await handlePrivateCohortReport(new Request('https://test/api/private-cohort-reports',{method:'POST',body:JSON.stringify({...selection,requestId,confirmedReport:true})}),env,user);expect(r!.status).toBe(202);return (await r!.json() as any).jobId as string};
 const read=(id:string,actor=user)=>handlePrivateCohortReport(new Request(`https://test/api/private-cohort-reports/${id}/result`),env,actor);
 return {db,env,user,selection,objects,sent,create,read,gets:()=>gets};
}

it('pins the assigned season and rejects another class, institution and withdrawn assignment',async()=>{
 const f=fixture();try{
  const selected:any={...f.selection};expect(await cohortReportClassScope(f.env,f.user,selected)).toEqual({id:'class',seasonId:'season',academicYear:'2026-2027'});expect(selected.seasonId).toBe('season');
  expect(await cohortReportClassScope(f.env,f.user,{...selected,classId:'other'})).toBeUndefined();expect(await cohortReportClassScope(f.env,f.user,{...selected,institutionId:'foreign'})).toBeUndefined();
  f.db.exec("UPDATE teacher_assignments SET active=0");expect(await cohortReportClassScope(f.env,f.user,selected)).toBeUndefined();
  f.db.exec("UPDATE teacher_assignments SET active=1; UPDATE classes SET season_id='next' WHERE id='class'");expect(await cohortReportClassScope(f.env,f.user,selected)).toBeUndefined();
 }finally{f.db.close()}
});

it('enforces job ownership and source revision at download, including revoke/regrant',async()=>{
 const f=fixture();try{
  const id=await f.create();const key=`report-exports/${id}/ready.json`;f.objects.set(key,'{"ok":true}');f.db.prepare("UPDATE private_cohort_report_jobs SET status='READY',object_key=? WHERE id=?").run(key,id);
  expect((await f.read(id))!.status).toBe(200);const gets=f.gets();
  expect((await f.read(id,{...f.user,id:'someone-else'}))!.status).toBe(403);expect(f.gets()).toBe(gets);
  f.db.exec('UPDATE teacher_assignments SET active=0');expect((await f.read(id))!.status).toBe(403);
  f.db.exec('UPDATE teacher_assignments SET active=1');expect((await f.read(id))!.status).toBe(409);expect(f.gets()).toBe(gets);
  expect(Number(f.db.prepare("SELECT revision FROM cohort_report_revisions WHERE institution_id='school'").get()!.revision)).toBe(2);
 }finally{f.db.close()}
});

it('rejects forbidden roles, fails closed when disabled, and does not claim a live lease twice',async()=>{
 const f=fixture();try{
  for(const role of ['TEACHER','STUDENT','PARENT'])expect((await handlePrivateCohortReport(new Request('https://test/api/private-cohort-reports'),f.env,{...f.user,role}))!.status).toBe(403);
  const id=await f.create();f.db.prepare("UPDATE private_cohort_report_jobs SET status='RUNNING',lease_token='live',lease_until=datetime('now','+2 minutes') WHERE id=?").run(id);
  let ack=0,retry=0;await consumePrivateCohortReports({messages:[{body:{schemaVersion:1,jobId:id},ack:()=>ack++,retry:()=>retry++}]} as any,f.env);expect(ack).toBe(1);expect(retry).toBe(0);expect(f.objects.size).toBe(0);
  f.env.COHORT_REPORTS_ENABLED='false';expect((await handlePrivateCohortReport(new Request('https://test/api/private-cohort-reports'),f.env,f.user))!.status).toBe(200);expect((await f.read(id))!.status).toBe(503);
 }finally{f.db.close()}
});

it('denies expired downloads immediately and drains bounded objects and temporary picks while disabled',async()=>{
 const f=fixture();try{
  const id=await f.create();f.db.prepare("UPDATE private_cohort_report_jobs SET status='READY',expires_at=datetime('now','-1 minute'),aggregate_json='{}',pending_json='{}' WHERE id=?").run(id);
  for(let n=0;n<7;n++)f.objects.set(`report-exports/${id}/${n}.json`,'{}');
  const insert=f.db.prepare('INSERT INTO private_cohort_practice_picks VALUES(?,?,?,?,?,?,?)');for(let n=0;n<501;n++)insert.run(id,'enrollment',String(n),1,'run','order','{}');
  expect((await f.read(id))!.status).toBe(410);expect(f.gets()).toBe(0);f.env.COHORT_REPORTS_ENABLED='false';
  await dispatchPrivateCohortReports(f.env);expect(f.objects.size).toBe(2);expect(f.db.prepare('SELECT count(*) n FROM private_cohort_practice_picks').get()!.n).toBe(251);expect(f.db.prepare('SELECT cleanup_done FROM private_cohort_report_jobs').get()!.cleanup_done).toBe(0);
  await dispatchPrivateCohortReports(f.env);expect(f.objects.size).toBe(0);expect(f.db.prepare('SELECT count(*) n FROM private_cohort_practice_picks').get()!.n).toBe(1);
  await dispatchPrivateCohortReports(f.env);const job=f.db.prepare('SELECT * FROM private_cohort_report_jobs').get()!;expect(job.cleanup_done).toBe(1);expect(job.status).toBe('EXPIRED');expect(job.aggregate_json).toBeNull();expect(job.pending_json).toBeNull();expect(job.selection_json).toBe('{}');expect(job.actor_scope_json).toBe('[]');
 }finally{f.db.close()}
});

it('invalidates source changes both before and during private object reads',async()=>{
 const f=fixture();try{
  const id=await f.create();const key=`report-exports/${id}/ready.json`;f.objects.set(key,'{"ok":true}');f.db.prepare("UPDATE private_cohort_report_jobs SET status='READY',object_key=? WHERE id=?").run(key,id);
  const original=f.env.REPORT_EXPORT_FILES.get;
  f.env.REPORT_EXPORT_FILES.get=async(k:string)=>{const result=await original(k);f.db.exec("UPDATE classes SET name='Changed' WHERE id='class'");return result};
  expect((await f.read(id))!.status).toBe(409);expect(f.gets()).toBe(1);
  expect((await f.read(id))!.status).toBe(409);expect(f.gets()).toBe(1);
 }finally{f.db.close()}
});
