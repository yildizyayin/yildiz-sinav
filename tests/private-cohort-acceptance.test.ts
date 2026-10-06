import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {expect,it} from 'vitest';
import {cohortReportClassScope} from '../worker/lib/cohort-report-class-scope';
import {frozenPracticeReport} from '../worker/lib/frozen-practice-report';
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
  const id=await f.create();expect(JSON.parse(String(f.db.prepare('SELECT selection_json FROM private_cohort_report_jobs WHERE id=?').get(id)!.selection_json)).seasonId).toBe('season');const key=`report-exports/${id}/ready.json`;f.objects.set(key,'{"ok":true}');f.db.prepare("UPDATE private_cohort_report_jobs SET status='READY',object_key=? WHERE id=?").run(key,id);
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
  const before=f.db.prepare('SELECT status,lease_token,lease_until,step_no,enrollment_cursor FROM private_cohort_report_jobs WHERE id=?').get(id);
  let ack=0,retry=0;await consumePrivateCohortReports({messages:[{body:{schemaVersion:1,jobId:id},ack:()=>ack++,retry:()=>retry++}]} as any,f.env);expect(ack).toBe(1);expect(retry).toBe(0);expect(f.objects.size).toBe(0);expect(f.db.prepare('SELECT status,lease_token,lease_until,step_no,enrollment_cursor FROM private_cohort_report_jobs WHERE id=?').get(id)).toEqual(before);
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

function messageFor(jobId:string){let ack=0,retry=0;return {batch:{messages:[{body:{schemaVersion:1,jobId},ack:()=>ack++,retry:()=>retry++}]} as any,ack:()=>ack,retry:()=>retry};}

for(const policy of ['FIRST','LATEST'] as const)it(`preserves ${policy} across 5001 events and all durable phases without double-counting`,async()=>{
 const f=fixture();try{
  f.db.exec("INSERT INTO student_entities(id,first_name,last_name,normalized_name) VALUES('student','Synthetic','Student','synthetic'); INSERT INTO student_enrollments(id,student_id,institution_id,season_id,class_id,grade_level,created_at) VALUES('enrollment','student','school','season','class',7,'2026-09-01 00:00:00')");
  const insert=f.db.prepare("INSERT INTO assessment_runs(id,institution_id,student_id,source_type,source_id,status,metadata_json,completed_at) VALUES(?,'school','student','QUESTION_BANK','question','SCORED',?,'2026-10-01 12:00:00')");
  const raw:any[]=[];
  for(let n=0;n<5001;n++){const id='run'+String(n).padStart(5,'0');const metadata_json=JSON.stringify({frozenEvidence:{policy:'QUESTION_PRACTICE_READ_CONTEXT_V1',academicYear:'2026-2027',questionId:'question',contentDigest:'a'.repeat(64),enrollmentId:'enrollment',seasonId:'season',gradeLevel:7,status:n===0?'WRONG':n===5000?'CORRECT':'BLANK',outcomeRefs:[{verified:1,outcomeId:'outcome',subjectId:'math',curriculumVersionId:'frozen-cv',academicYear:'2026-2027',gradeLevel:7,programVersion:'synthetic'}]}});insert.run(id,metadata_json);raw.push({id,metadata_json,source_type:'QUESTION_BANK',source_id:'question',status:'SCORED',completed_at:'2026-10-01 12:00:00'});}
  f.selection.sources=['QUESTION_BANK'];f.selection.repeatPolicy=policy;const id=await f.create();let calls=0,observedFrame=false;const phases=new Set<string>();
  while(calls++<40){const m=messageFor(id);await consumePrivateCohortReports(m.batch,f.env);expect(m.retry()).toBe(0);expect(m.ack()).toBe(1);const job=f.db.prepare('SELECT * FROM private_cohort_report_jobs WHERE id=?').get(id)!;observedFrame ||= !!job.pending_json;if(job.pending_json)phases.add(JSON.parse(String(job.pending_json)).phase);if(job.status==='READY')break;expect(job.status).toBe('QUEUED');}
  expect(calls).toBeLessThan(40);expect(calls).toBeGreaterThan(20);expect(observedFrame).toBe(true);expect([...phases].sort()).toEqual(['CLEAN','PICKS','READ']);
  const job=f.db.prepare('SELECT * FROM private_cohort_report_jobs WHERE id=?').get(id)!;expect(job.status).toBe('READY');expect(job.processed_enrollments).toBe(1);expect(job.processed_events).toBe(5001);expect(job.pending_json).toBeNull();expect(f.db.prepare('SELECT count(*) n FROM private_cohort_practice_picks').get()!.n).toBe(0);
  const response=await f.read(id);expect(response!.status).toBe(200);const report:any=await response!.json();const expected=frozenPracticeReport(raw,'2026-2027',null,policy);
  expect(report.groups).toHaveLength(1);expect(report.groups[0]).toMatchObject({correct:policy==='LATEST'?1:0,wrong:policy==='FIRST'?1:0,blank:0});expect(report.groups[0]).toMatchObject({correct:expected.groups[0].correct,wrong:expected.groups[0].wrong,blank:expected.groups[0].blank,evidenceCount:1,participatingEnrollmentCount:1});
  expect(report.sourceCoverage.find((x:any)=>x.sourceType==='QUESTION_BANK')).toMatchObject({rowCount:5001,excluded:{repeatedAttempts:5000}});
 }finally{f.db.close()}
},20000);

it('releases a failed object write for retry and completes exactly once on redelivery',async()=>{
 const f=fixture();try{
  const id=await f.create();const original=f.env.REPORT_EXPORT_FILES.put;let fail=true;f.env.REPORT_EXPORT_FILES.put=async(...args:any[])=>{if(fail){fail=false;throw new Error('synthetic storage interruption')}return original(...args)};
  const first=messageFor(id);await consumePrivateCohortReports(first.batch,f.env);expect(first.retry()).toBe(1);expect(first.ack()).toBe(0);const interrupted=f.db.prepare('SELECT * FROM private_cohort_report_jobs WHERE id=?').get(id)!;expect(interrupted.lease_token).toBeNull();expect(interrupted.step_no).toBe(0);expect(interrupted.object_key).toBeNull();expect(f.objects.size).toBe(0);
  const second=messageFor(id);await consumePrivateCohortReports(second.batch,f.env);expect(second.ack()).toBe(1);expect(second.retry()).toBe(0);const finished=f.db.prepare('SELECT * FROM private_cohort_report_jobs WHERE id=?').get(id)!;expect(finished.status).toBe('READY');expect(finished.step_no).toBe(1);expect(f.objects.size).toBe(1);
  const duplicate=messageFor(id);await consumePrivateCohortReports(duplicate.batch,f.env);expect(duplicate.ack()).toBe(1);expect(f.objects.size).toBe(1);expect(f.db.prepare('SELECT step_no FROM private_cohort_report_jobs WHERE id=?').get(id)!.step_no).toBe(1);
 }finally{f.db.close()}
});

it('rejects a source mutation after object upload and removes its unpublished object',async()=>{
 const f=fixture();try{
  const id=await f.create();const original=f.env.REPORT_EXPORT_FILES.put;f.env.REPORT_EXPORT_FILES.put=async(...args:any[])=>{await original(...args);f.db.exec("UPDATE classes SET name='Mutated during upload' WHERE id='class'")};
  const message=messageFor(id);await consumePrivateCohortReports(message.batch,f.env);expect(message.ack()).toBe(1);expect(message.retry()).toBe(0);expect(f.objects.size).toBe(0);const job=f.db.prepare('SELECT * FROM private_cohort_report_jobs WHERE id=?').get(id)!;expect(job.status).toBe('FAILED');expect(job.error_code).toBe('REPORT_SOURCE_CHANGED');expect(job.step_no).toBe(0);expect(job.object_key).toBeNull();
 }finally{f.db.close()}
});

it('keeps a newer lease and cursor intact when an older worker finishes uploading',async()=>{
 const f=fixture();try{
  const id=await f.create();const original=f.env.REPORT_EXPORT_FILES.put;f.env.REPORT_EXPORT_FILES.put=async(...args:any[])=>{await original(...args);f.db.prepare("UPDATE private_cohort_report_jobs SET lease_token='new-worker',lease_until=datetime('now','+2 minutes'),enrollment_cursor='new-cursor',step_no=7 WHERE id=?").run(id)};
  const message=messageFor(id);await consumePrivateCohortReports(message.batch,f.env);expect(message.ack()).toBe(1);expect(f.objects.size).toBe(0);expect(f.db.prepare('SELECT status,lease_token,enrollment_cursor,step_no FROM private_cohort_report_jobs WHERE id=?').get(id)).toMatchObject({status:'RUNNING',lease_token:'new-worker',enrollment_cursor:'new-cursor',step_no:7});
 }finally{f.db.close()}
});
