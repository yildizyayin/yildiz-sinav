import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {expect,it} from 'vitest';
import {cohortReportClassScope} from '../worker/lib/cohort-report-class-scope';
import {cohortLearningReport} from '../worker/lib/cohort-learning-report';
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
  const sentBefore=f.sent.length;expect((await handlePrivateCohortReport(new Request('https://test/api/private-cohort-reports',{method:'POST',body:JSON.stringify({...f.selection,requestId:'disabled-request',confirmedReport:true})}),f.env,f.user))!.status).toBe(503);expect(f.sent.length).toBe(sentBefore);expect(f.db.prepare('SELECT count(*) n FROM private_cohort_report_jobs').get()!.n).toBe(1);delete f.env.COHORT_REPORTS_ENABLED;expect((await (await handlePrivateCohortReport(new Request('https://test/api/private-cohort-reports'),f.env,f.user))!.json() as any).enabled).toBe(false);
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

it('invalidates prepared reports on guidance assignment insert, update and delete',async()=>{
 const f=fixture();try{
  await f.create();const revision=()=>Number(f.db.prepare("SELECT revision FROM cohort_report_revisions WHERE institution_id='school'").get()?.revision||0);const before=revision();
  f.db.exec("INSERT INTO teacher_assignments(id,user_id,institution_id,season_id,class_id,assignment_type) VALUES('extra','guide','school','season','class','GUIDANCE')");expect(revision()).toBe(before+1);
  f.db.exec("UPDATE teacher_assignments SET active=0 WHERE id='extra'");expect(revision()).toBe(before+2);
  f.db.exec("DELETE FROM teacher_assignments WHERE id='extra'");expect(revision()).toBe(before+3);
 }finally{f.db.close()}
});

it('does not invalidate cohort sources for unrelated subject-only assignment changes',async()=>{
 const f=fixture();try{
  await f.create();const revision=()=>Number(f.db.prepare("SELECT revision FROM cohort_report_revisions WHERE institution_id='school'").get()?.revision||0);const before=revision();
  f.db.exec("INSERT INTO teacher_assignments(id,user_id,institution_id,season_id,class_id,assignment_type) VALUES('subject-only','guide','school','season','class','SUBJECT'); UPDATE teacher_assignments SET active=0 WHERE id='subject-only'; DELETE FROM teacher_assignments WHERE id='subject-only'");expect(revision()).toBe(before);
 }finally{f.db.close()}
});

it('increments both institution generations when guidance authority moves away and back',async()=>{
 const f=fixture();try{
  await f.create();const revision=(institution:string)=>Number(f.db.prepare('SELECT revision FROM cohort_report_revisions WHERE institution_id=?').get(institution)?.revision||0);const school=revision('school'),foreign=revision('foreign');
  f.db.exec("UPDATE teacher_assignments SET institution_id='foreign' WHERE id='assignment'");expect(revision('school')).toBe(school+1);expect(revision('foreign')).toBe(foreign+1);
  f.db.exec("UPDATE teacher_assignments SET institution_id='school' WHERE id='assignment'");expect(revision('school')).toBe(school+2);expect(revision('foreign')).toBe(foreign+2);
 }finally{f.db.close()}
});

it('fences all prepared statuses but stops generation churn after expiration',async()=>{
 const f=fixture();try{
  const id=await f.create();const revision=()=>Number(f.db.prepare("SELECT revision FROM cohort_report_revisions WHERE institution_id='school'").get()?.revision||0);const before=revision();
  for(const [n,status] of ['QUEUED','RUNNING','READY'].entries()){f.db.prepare('UPDATE private_cohort_report_jobs SET status=? WHERE id=?').run(status,id);f.db.exec("UPDATE teacher_assignments SET active=1-active WHERE id='assignment'");expect(revision()).toBe(before+n+1);}
  f.db.prepare("UPDATE private_cohort_report_jobs SET expires_at=datetime('now','-1 minute') WHERE id=?").run(id);f.db.exec("UPDATE teacher_assignments SET active=1-active WHERE id='assignment'");expect(revision()).toBe(before+3);
 }finally{f.db.close()}
});

function seedRevisionSources(f:ReturnType<typeof fixture>){
 f.db.exec(`INSERT INTO student_entities(id,first_name,last_name,normalized_name) VALUES('student','Synthetic','Student','synthetic');
 INSERT INTO student_enrollments(id,student_id,institution_id,season_id,class_id,grade_level,created_at) VALUES('enrollment','student','school','season','class',7,'2026-09-01 00:00:00');
 INSERT INTO subjects(id,code,name) VALUES('math','SYNTH_MATH','Synthetic math');
 INSERT INTO curriculum_versions(id,academic_year,grade_level,program_version,authority,verified,program_code) VALUES('cv','2026-2027',7,'Synthetic','MEB',1,'SCHOOL');
 INSERT INTO outcomes(id,curriculum_version_id,subject_id,grade_level,code,title,official) VALUES('outcome','cv','math',7,'SYNTH.1','Synthetic output',1);
 INSERT INTO exams(id,owner_type,institution_id,academic_year,title,exam_type) VALUES('exam','INSTITUTION','school','2026-2027','Synthetic exam','CUSTOM');
 INSERT INTO exam_participants(id,exam_id,institution_id,season_id,student_id,name_snapshot,participant_status) VALUES('participant','exam','school','season','student','Synthetic','ACTIVE');
 INSERT INTO assignments(id,institution_id,season_id,created_by,title) VALUES('homework','school','season','guide','Synthetic task'),('foreign-task','foreign',NULL,'guide','Foreign task');
 INSERT INTO assignment_items(id,assignment_id,item_type) VALUES('item','homework','TASK');
 INSERT INTO assessment_runs(id,institution_id,student_id,source_type,status) VALUES('run','school','student','EXTERNAL','SCORED');
 INSERT INTO assessment_responses(id,run_id,student_id) VALUES('response','run','student');
 INSERT INTO game_sessions(id,student_id,game_code,score,xp_earned,created_at) VALUES('game','student','SYNTHETIC',70,10,'2026-10-01 12:00:00');
 DELETE FROM frozen_game_session_evidence WHERE session_id='game';`);
}
const sourceMutations=[
 ['snapshot',"INSERT INTO exam_result_snapshots(id,exam_id,participant_id,snapshot_version,institution_id) VALUES('snapshot','exam','participant',1,'school')","UPDATE exam_result_snapshots SET net=1 WHERE id='snapshot'","DELETE FROM exam_result_snapshots WHERE id='snapshot'",false],
 ['participant',"INSERT INTO exam_participants(id,exam_id,institution_id,name_snapshot,participant_status) VALUES('extra-participant','exam','school','Synthetic','UNRESOLVED')","UPDATE exam_participants SET name_snapshot='Changed' WHERE id='extra-participant'","DELETE FROM exam_participants WHERE id='extra-participant'",false],
 ['practice run',"INSERT INTO assessment_runs(id,institution_id,source_type,status) VALUES('extra-run','school','QUESTION_BANK','SCORED')","UPDATE assessment_runs SET status='CANCELLED' WHERE id='extra-run'","DELETE FROM assessment_runs WHERE id='extra-run'",false],
 ['foy',"INSERT INTO frozen_foy_response_evidence(response_id,run_id,student_id,institution_id,enrollment_id,season_id,academic_year,grade_level,outcome_refs_json,result_status,context_valid) VALUES('response','run','student','school','enrollment','season','2026-2027',7,'[]','CORRECT',0)","UPDATE frozen_foy_response_evidence SET result_status='WRONG' WHERE response_id='response'","DELETE FROM frozen_foy_response_evidence WHERE response_id='response'",false],
 ['game',"INSERT INTO frozen_game_session_evidence(session_id,student_id,institution_id,enrollment_id,season_id,academic_year,grade_level,game_code,context_valid,score,xp_earned) VALUES('game','student','school','enrollment','season','2026-2027',7,'SYNTHETIC',0,70,10)","UPDATE frozen_game_session_evidence SET score=80 WHERE session_id='game'","DELETE FROM frozen_game_session_evidence WHERE session_id='game'",false],
 ['assignment',"INSERT INTO assignments(id,institution_id,created_by,title) VALUES('extra-task','school','guide','Synthetic task')","UPDATE assignments SET title='Changed' WHERE id='extra-task'","DELETE FROM assignments WHERE id='extra-task'",false],
 ['mini test',"INSERT INTO coach_mini_tests(id,assignment_id,assignment_item_id,student_id,outcome_id,question_count) VALUES('mini','homework','item','student','outcome',5)","UPDATE coach_mini_tests SET status='PASSED' WHERE id='mini'","DELETE FROM coach_mini_tests WHERE id='mini'",false],
 ['delivery profile',"INSERT INTO exam_delivery_profiles(exam_id) VALUES('exam')","UPDATE exam_delivery_profiles SET snapshot_version=1 WHERE exam_id='exam'","DELETE FROM exam_delivery_profiles WHERE exam_id='exam'",true],
] as const;
for(const [name,insert,update,remove,global] of sourceMutations)it(`invalidates ready download on ${name} insert/update/delete and stops after expiration`,async()=>{
 const f=fixture();try{
  seedRevisionSources(f);const revision=()=>Number(global?f.db.prepare('SELECT revision FROM cohort_report_global_revision WHERE id=1').get()!.revision:f.db.prepare("SELECT revision FROM cohort_report_revisions WHERE institution_id='school'").get()?.revision||0);
  for(const [n,sql] of [insert,update,remove].entries()){
   const id=await f.create('matrix-request-'+n),key=`report-exports/${id}/ready.json`;f.objects.set(key,'{}');f.db.prepare("UPDATE private_cohort_report_jobs SET status='READY',object_key=? WHERE id=?").run(key,id);
   const before=revision();f.db.exec(sql);expect(revision()).toBe(before+1);const gets=f.gets();expect((await f.read(id))!.status).toBe(409);expect(f.gets()).toBe(gets);
  }
  f.db.exec("UPDATE private_cohort_report_jobs SET expires_at=datetime('now','-1 minute')");const before=revision();f.db.exec(insert);expect(revision()).toBe(before);expect(f.db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
 }finally{f.db.close()}
});

for(const policy of ['FIRST','LATEST'] as const)it(`matches synchronous mixed-source totals across pages with ${policy} Unicode ties`,async()=>{
 const f=fixture();try{
  seedRevisionSources(f);const refs=[{verified:1,outcomeId:'outcome',subjectId:'math',curriculumVersionId:'cv',academicYear:'2026-2027',gradeLevel:7,programVersion:'Synthetic'}];
  f.db.prepare("INSERT INTO frozen_foy_response_evidence(response_id,run_id,student_id,institution_id,enrollment_id,season_id,academic_year,grade_level,subject_id,curriculum_version_id,program_version,outcome_refs_json,result_status,context_valid,observed_at) VALUES('response','run','student','school','enrollment','season','2026-2027',7,'math','cv','Synthetic',?,'CORRECT',1,'2026-10-01 12:00:00')").run(JSON.stringify(refs));
  f.db.exec("INSERT INTO frozen_game_session_evidence(session_id,student_id,institution_id,enrollment_id,season_id,academic_year,grade_level,game_code,context_valid,subject_id,curriculum_version_id,program_version,score,xp_earned,observed_at) VALUES('game','student','school','enrollment','season','2026-2027',7,'SYNTHETIC',1,'math','cv','Synthetic',70,10,'2026-10-01 12:00:00')");
  const add=(id:string,questionId:string,status:string)=>f.db.prepare("INSERT INTO assessment_runs(id,institution_id,student_id,source_type,source_id,status,metadata_json,completed_at) VALUES(?,'school','student','QUESTION_BANK',?,'SCORED',?,'2026-10-01 12:00:00')").run(id,questionId,JSON.stringify({frozenEvidence:{policy:'QUESTION_PRACTICE_READ_CONTEXT_V1',academicYear:'2026-2027',questionId,contentDigest:'a'.repeat(64),enrollmentId:'enrollment',seasonId:'season',gradeLevel:7,status,outcomeRefs:refs}}));
  for(let n=0;n<252;n++)add('practice-'+String(n).padStart(3,'0'),'soru-İ-'+n,n%2?'WRONG':'CORRECT');add('tie-𐀀','same-question','CORRECT');add('tie-\ue000','same-question','WRONG');
  const scope=await cohortReportClassScope(f.env,f.user,{...f.selection});const expectedResponse=await cohortLearningReport(f.env,f.user,new URL('https://test/?academicYear=2026-2027&sources=QUESTION_BANK,FOY,MINI_GAME&repeatPolicy='+policy),scope!);expect(expectedResponse.status).toBe(200);const expected:any=await expectedResponse.json();
  for(let n=0;n<4747;n++)add('repeat-'+String(n).padStart(4,'0'),'soru-İ-'+(n%252),n%2?'WRONG':'CORRECT');
  f.selection.sources=['QUESTION_BANK','FOY','MINI_GAME'];f.selection.repeatPolicy=policy;const id=await f.create();let calls=0;
  while(calls++<40){const message=messageFor(id);await consumePrivateCohortReports(message.batch,f.env);expect(message.retry()).toBe(0);if(f.db.prepare('SELECT status FROM private_cohort_report_jobs WHERE id=?').get(id)!.status==='READY')break;}
  expect(calls).toBeLessThan(40);expect(calls).toBeGreaterThan(20);const report:any=await (await f.read(id))!.json();
  expect(report.groups).toHaveLength(1);expect(report.groups[0]).toMatchObject({correct:policy==='FIRST'?128:127,wrong:policy==='FIRST'?126:127,blank:0,evidenceCount:254,participatingEnrollmentCount:1});
  expect(report.groups[0]).toMatchObject({correct:expected.groups[0].correct,wrong:expected.groups[0].wrong,evidenceCount:expected.groups[0].evidenceCount,accuracyPercent:expected.groups[0].accuracyPercent});
  expect(report.gameGroups).toMatchObject([{sessionCount:1,averageScore:70,totalXp:10,participatingEnrollmentCount:1}]);expect(report.gameGroups[0]).toMatchObject(expected.gameGroups[0]);expect(report.sourceCoverage.find((c:any)=>c.sourceType==='QUESTION_BANK')).toMatchObject({rowCount:5001,excluded:{repeatedAttempts:4748}});expect(report.officialScore).toBeNull();expect(report.nationalRank).toBeNull();
 }finally{f.db.close()}
},20000);

for(const [name,insert,update,remove] of [
 ['enrollment',"INSERT INTO student_enrollments(id,student_id,institution_id,season_id,class_id,grade_level) VALUES('extra-enrollment','extra-student','school','season','class',7)","UPDATE student_enrollments SET status='LEFT' WHERE id='extra-enrollment'","DELETE FROM student_enrollments WHERE id='extra-enrollment'"],
 ['season',"INSERT INTO institution_seasons(id,institution_id,academic_year) VALUES('extra-season','school','2028-2029')","UPDATE institution_seasons SET status='CLOSED' WHERE id='extra-season'","DELETE FROM institution_seasons WHERE id='extra-season'"],
 ['class',"INSERT INTO classes(id,institution_id,season_id,grade_level,section,name) VALUES('extra-class','school','season',7,'C','7C')","UPDATE classes SET active=0 WHERE id='extra-class'","DELETE FROM classes WHERE id='extra-class'"],
] as const)it(`invalidates ready reports on ${name} creation, change and removal`,async()=>{
 const f=fixture();try{
  seedRevisionSources(f);f.db.exec("INSERT INTO student_entities(id,first_name,last_name,normalized_name) VALUES('extra-student','Extra','Synthetic','extra')");
  for(const [n,sql] of [insert,update,remove].entries()){
   const id=await f.create('scope-crud-'+n),key=`report-exports/${id}/ready.json`;f.objects.set(key,'{}');f.db.prepare("UPDATE private_cohort_report_jobs SET status='READY',object_key=? WHERE id=?").run(key,id);
   const before=Number(f.db.prepare("SELECT revision FROM cohort_report_revisions WHERE institution_id='school'").get()?.revision||0);f.db.exec(sql);expect(Number(f.db.prepare("SELECT revision FROM cohort_report_revisions WHERE institution_id='school'").get()!.revision)).toBe(before+1);
   const gets=f.gets();expect((await f.read(id))!.status).toBe(409);expect(f.gets()).toBe(gets);
  }
  expect(f.db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
 }finally{f.db.close()}
});

for(const [name,initial,move,back] of [
 ['enrollment','',"UPDATE student_enrollments SET institution_id='foreign' WHERE id='enrollment'","UPDATE student_enrollments SET institution_id='school' WHERE id='enrollment'"],
 ['season',"INSERT INTO institution_seasons(id,institution_id,academic_year) VALUES('movable-season','school','2028-2029')","UPDATE institution_seasons SET institution_id='foreign' WHERE id='movable-season'","UPDATE institution_seasons SET institution_id='school' WHERE id='movable-season'"],
 ['class',"INSERT INTO classes(id,institution_id,season_id,grade_level,section,name) VALUES('movable-class','school','season',7,'C','7C')","UPDATE classes SET institution_id='foreign' WHERE id='movable-class'","UPDATE classes SET institution_id='school' WHERE id='movable-class'"],
 ['snapshot',sourceMutations[0][1],"UPDATE exam_result_snapshots SET institution_id='foreign' WHERE id='snapshot'","UPDATE exam_result_snapshots SET institution_id='school' WHERE id='snapshot'"],
 ['participant',sourceMutations[1][1],"UPDATE exam_participants SET institution_id='foreign' WHERE id='extra-participant'","UPDATE exam_participants SET institution_id='school' WHERE id='extra-participant'"],
 ['practice run',sourceMutations[2][1],"UPDATE assessment_runs SET institution_id='foreign' WHERE id='extra-run'","UPDATE assessment_runs SET institution_id='school' WHERE id='extra-run'"],
 ['foy',sourceMutations[3][1],"UPDATE frozen_foy_response_evidence SET institution_id='foreign' WHERE response_id='response'","UPDATE frozen_foy_response_evidence SET institution_id='school' WHERE response_id='response'"],
 ['game',sourceMutations[4][1],"UPDATE frozen_game_session_evidence SET institution_id='foreign' WHERE session_id='game'","UPDATE frozen_game_session_evidence SET institution_id='school' WHERE session_id='game'"],
 ['assignment',sourceMutations[5][1],"UPDATE assignments SET institution_id='foreign' WHERE id='extra-task'","UPDATE assignments SET institution_id='school' WHERE id='extra-task'"],
 ['mini test',sourceMutations[6][1],"UPDATE coach_mini_tests SET assignment_id='foreign-task' WHERE id='mini'","UPDATE coach_mini_tests SET assignment_id='homework' WHERE id='mini'"],
] as const)it(`invalidates both generations when ${name} moves between institutions`,async()=>{
 const f=fixture();try{
  seedRevisionSources(f);if(initial)f.db.exec(initial);const id=await f.create(),key=`report-exports/${id}/ready.json`;f.objects.set(key,'{}');f.db.prepare("UPDATE private_cohort_report_jobs SET status='READY',object_key=? WHERE id=?").run(key,id);
  const revision=(school:string)=>Number(f.db.prepare('SELECT revision FROM cohort_report_revisions WHERE institution_id=?').get(school)?.revision||0);const a=revision('school'),b=revision('foreign');
  f.db.exec(move);expect(revision('school')).toBe(a+1);expect(revision('foreign')).toBe(b+1);const gets=f.gets();expect((await f.read(id))!.status).toBe(409);expect(f.gets()).toBe(gets);
  f.db.exec(back);expect(revision('school')).toBe(a+2);expect(revision('foreign')).toBe(b+2);expect((await f.read(id))!.status).toBe(409);expect(f.gets()).toBe(gets);expect(f.db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
 }finally{f.db.close()}
});

for(const paged of [false,true])it(`combines all five sources with ${paged?'paged':'fast'} processing and excludes foreign/nonparticipant data`,async()=>{
 const f=fixture();try{
  seedRevisionSources(f);f.db.exec(`INSERT INTO student_entities(id,first_name,last_name,normalized_name) VALUES('second','Second','Synthetic','second'),('absent','Absent','Synthetic','absent'),('foreign-student','Foreign','Synthetic','foreign');
 INSERT INTO institution_seasons(id,institution_id,academic_year) VALUES('foreign-season','foreign','2026-2027');
 INSERT INTO classes(id,institution_id,season_id,grade_level,section,name) VALUES('foreign-class','foreign','foreign-season',7,'A','Foreign 7A');
 INSERT INTO student_enrollments(id,student_id,institution_id,season_id,class_id,grade_level,created_at) VALUES('second-enrollment','second','school','season','class',7,'2026-09-01'),('absent-enrollment','absent','school','season','class',7,'2026-09-01'),('foreign-enrollment','foreign-student','foreign','foreign-season','foreign-class',7,'2026-09-01');`);
  const refs=[{verified:1,outcomeId:'outcome',subjectId:'math',curriculumVersionId:'cv',academicYear:'2026-2027',gradeLevel:7,programVersion:'Synthetic'}];
  for(const [student,enrollment,season,institution,status] of [['student','enrollment','season','school','CORRECT'],['second','second-enrollment','season','school','WRONG'],['foreign-student','foreign-enrollment','foreign-season','foreign','CORRECT']]){
   const id='practice-'+student,questionId='question-'+student;f.db.prepare("INSERT INTO assessment_runs(id,institution_id,student_id,source_type,source_id,status,metadata_json,completed_at) VALUES(?,?,?,'QUESTION_BANK',?,'SCORED',?,'2026-10-01 12:00:00')").run(id,institution,student,questionId,JSON.stringify({frozenEvidence:{policy:'QUESTION_PRACTICE_READ_CONTEXT_V1',academicYear:'2026-2027',questionId,contentDigest:'a'.repeat(64),enrollmentId:enrollment,seasonId:season,gradeLevel:7,status,outcomeRefs:refs}}));
  }
  const evidence=[{questionId:'exam-question',status:'CORRECT',outcomeRefs:refs}];
  f.db.prepare("INSERT INTO exam_result_snapshots(id,exam_id,participant_id,snapshot_version,student_id,institution_id,grade_level,payload_json) VALUES('snapshot','exam','participant',1,'student','school',7,?)").run(JSON.stringify({schemaVersion:1,questionEvidencePolicy:'NATIVE_STATUS_AND_CURRICULUM_AT_FREEZE_V1',exam:{exam_id:'exam',academic_year:'2026-2027'},questionEvidence:evidence}));
  f.db.exec("INSERT INTO exam_delivery_profiles(exam_id,result_freeze_status,snapshot_version,published_at) VALUES('exam','PUBLISHED',1,'2026-10-01 12:00:00'); INSERT INTO coach_mini_tests(id,assignment_id,assignment_item_id,student_id,outcome_id,question_count,status,submitted_at) VALUES('mini','homework','item','student','outcome',5,'PASSED','2026-10-01 12:00:00')");
  f.db.exec("UPDATE coach_mini_tests SET selection_mode='NEW' WHERE id='mini'");
  const miniEvidence={policy:'MINI_TEST_CONTENT_AT_START_V1',academicYear:'2026-2027',enrollmentId:'enrollment',seasonId:'season',gradeLevel:7,questionEvidence:['CORRECT','CORRECT','WRONG','WRONG','BLANK'].map((status,n)=>({questionId:'mini-question-'+n,status,outcomeRefs:refs}))};
  f.db.prepare("INSERT INTO assessment_runs(id,institution_id,student_id,source_type,source_id,assignment_id,status,metadata_json,completed_at) VALUES('mini','school','student','MINI_TEST','mini','homework','SCORED',?,'2026-10-01 12:00:00')").run(JSON.stringify({selectionMode:'NEW',practiceOnly:false,miniEvidence}));
  f.db.prepare("INSERT INTO frozen_foy_response_evidence(response_id,run_id,student_id,institution_id,enrollment_id,season_id,academic_year,grade_level,subject_id,curriculum_version_id,program_version,outcome_refs_json,result_status,context_valid,observed_at) VALUES('response','run','student','school','enrollment','season','2026-2027',7,'math','cv','Synthetic',?,'CORRECT',1,'2026-10-01 12:00:00')").run(JSON.stringify(refs));
  f.db.exec("INSERT INTO frozen_game_session_evidence(session_id,student_id,institution_id,enrollment_id,season_id,academic_year,grade_level,game_code,context_valid,subject_id,curriculum_version_id,program_version,score,xp_earned,observed_at) VALUES('game','student','school','enrollment','season','2026-2027',7,'SYNTHETIC',1,'math','cv','Synthetic',70,10,'2026-10-01 12:00:00')");
  f.db.exec("INSERT INTO exam_participants(id,exam_id,institution_id,season_id,student_id,name_snapshot,participant_status) VALUES('foreign-participant','exam','foreign','foreign-season','foreign-student','Foreign synthetic','ACTIVE'); INSERT INTO assignment_items(id,assignment_id,item_type) VALUES('foreign-item','foreign-task','TASK'); INSERT INTO coach_mini_tests(id,assignment_id,assignment_item_id,student_id,outcome_id,question_count,status,selection_mode,submitted_at) VALUES('foreign-mini','foreign-task','foreign-item','foreign-student','outcome',5,'PASSED','NEW','2026-10-01 12:00:00')");
  f.db.prepare("INSERT INTO exam_result_snapshots(id,exam_id,participant_id,snapshot_version,student_id,institution_id,grade_level,payload_json) VALUES('foreign-snapshot','exam','foreign-participant',1,'foreign-student','foreign',7,?)").run(JSON.stringify({schemaVersion:1,questionEvidencePolicy:'NATIVE_STATUS_AND_CURRICULUM_AT_FREEZE_V1',exam:{exam_id:'exam',academic_year:'2026-2027'},questionEvidence:evidence}));
  f.db.prepare("INSERT INTO assessment_runs(id,institution_id,student_id,source_type,source_id,assignment_id,status,metadata_json,completed_at) VALUES('foreign-mini','foreign','foreign-student','MINI_TEST','foreign-mini','foreign-task','SCORED',?,'2026-10-01 12:00:00')").run(JSON.stringify({selectionMode:'NEW',practiceOnly:false,miniEvidence:{...miniEvidence,enrollmentId:'foreign-enrollment',seasonId:'foreign-season',questionEvidence:miniEvidence.questionEvidence.map(q=>({...q,status:'CORRECT'}))}}));
  f.db.exec("INSERT INTO assessment_runs(id,institution_id,student_id,source_type,status) VALUES('foreign-run','foreign','foreign-student','EXTERNAL','SCORED'); INSERT INTO assessment_responses(id,run_id,student_id) VALUES('foreign-response','foreign-run','foreign-student'); INSERT INTO game_sessions(id,student_id,game_code,score,xp_earned,created_at) VALUES('foreign-game','foreign-student','SYNTHETIC',100,50,'2026-10-01 12:00:00'); DELETE FROM frozen_game_session_evidence WHERE session_id='foreign-game'");
  f.db.prepare("INSERT INTO frozen_foy_response_evidence(response_id,run_id,student_id,institution_id,enrollment_id,season_id,academic_year,grade_level,subject_id,curriculum_version_id,program_version,outcome_refs_json,result_status,context_valid,observed_at) VALUES('foreign-response','foreign-run','foreign-student','foreign','foreign-enrollment','foreign-season','2026-2027',7,'math','cv','Synthetic',?,'CORRECT',1,'2026-10-01 12:00:00')").run(JSON.stringify(refs));
  f.db.exec("INSERT INTO frozen_game_session_evidence(session_id,student_id,institution_id,enrollment_id,season_id,academic_year,grade_level,game_code,context_valid,subject_id,curriculum_version_id,program_version,score,xp_earned,observed_at) VALUES('foreign-game','foreign-student','foreign','foreign-enrollment','foreign-season','2026-2027',7,'SYNTHETIC',1,'math','cv','Synthetic',100,50,'2026-10-01 12:00:00')");
  f.selection.sources=['EXAM','QUESTION_BANK','MINI_TEST','FOY','MINI_GAME'];f.selection.examIds=['exam'];
  const scope=await cohortReportClassScope(f.env,f.user,{...f.selection});const normal:any=await (await cohortLearningReport(f.env,f.user,new URL('https://test/?academicYear=2026-2027&sources=EXAM,QUESTION_BANK,MINI_TEST,FOY,MINI_GAME&examIds=exam'),scope!)).json();expect(normal.groups[0]).toMatchObject({correct:5,wrong:3,blank:1,evidenceCount:9,participatingEnrollmentCount:2});
  const manager:any={...f.user,role:'INSTITUTION_MANAGER'};const managerResponse=await cohortLearningReport(f.env,manager,new URL('https://test/?academicYear=2026-2027&sources=EXAM,QUESTION_BANK,MINI_TEST,FOY,MINI_GAME&examIds=exam'));expect(managerResponse.status).toBe(200);const managerReport:any=await managerResponse.json();expect(managerReport.groups).toHaveLength(1);expect(managerReport.groups[0]).toMatchObject({correct:5,wrong:3,blank:1,evidenceCount:9,participatingEnrollmentCount:2});expect(managerReport.gameGroups).toMatchObject([{sessionCount:1,averageScore:70,totalXp:10}]);expect(managerReport.sourceCoverage.map((c:any)=>[c.sourceType,c.rowCount]).sort()).toEqual([['EXAM',1],['FOY',1],['MINI_GAME',1],['MINI_TEST',1],['QUESTION_BANK',2]]);
  if(paged){const insert=f.db.prepare("INSERT INTO assessment_runs(id,institution_id,student_id,source_type,source_id,status,metadata_json,completed_at) SELECT ?,'school','student','QUESTION_BANK',source_id,status,metadata_json,completed_at FROM assessment_runs WHERE id='practice-student'");for(let n=0;n<5001;n++)insert.run('paged-repeat-'+String(n).padStart(4,'0'));const limited=await cohortLearningReport(f.env,manager,new URL('https://test/?academicYear=2026-2027&sources=EXAM,QUESTION_BANK,MINI_TEST,FOY,MINI_GAME&examIds=exam'));expect(limited.status).toBe(400);expect(await limited.json()).toMatchObject({error:{code:'REPORT_SCOPE_TOO_LARGE'}});}
  const id=await f.create();let calls=0;const phases=new Set<string>();while(calls++<80){const message=messageFor(id);await consumePrivateCohortReports(message.batch,f.env);expect(message.retry()).toBe(0);expect(message.ack()).toBe(1);const job=f.db.prepare('SELECT status,pending_json FROM private_cohort_report_jobs WHERE id=?').get(id)!;if(job.pending_json)phases.add(JSON.parse(String(job.pending_json)).phase);if(job.status==='READY')break;expect(job.status).toBe('QUEUED');}expect(calls).toBeLessThan(80);if(paged){expect(calls).toBeGreaterThan(20);expect([...phases].sort()).toEqual(['CLEAN','PICKS','READ']);}else expect(calls).toBe(1);

  const response=await f.read(id);expect(response!.status).toBe(200);const report:any=await response!.json();expect(report.groups).toHaveLength(1);expect(report.groups[0]).toMatchObject({correct:5,wrong:3,blank:1,evidenceCount:9,participatingEnrollmentCount:2,accuracyPercent:55.56});
  expect(report.groups[0].sourceBreakdown.map((p:any)=>p.sourceType).sort()).toEqual(['EXAM','FOY','MINI_TEST','QUESTION_BANK']);expect(report.gameGroups).toMatchObject([{sessionCount:1,averageScore:70,participatingEnrollmentCount:1}]);expect(report.sourceCoverage.find((c:any)=>c.sourceType==='QUESTION_BANK').rowCount).toBe(paged?5003:2);expect(f.db.prepare('SELECT processed_enrollments FROM private_cohort_report_jobs WHERE id=?').get(id)!.processed_enrollments).toBe(3);
  expect(report.officialScore).toBeNull();expect(report.nationalRank).toBeNull();if(paged)expect(report.sourceCoverage.find((c:any)=>c.sourceType==='QUESTION_BANK').excluded.repeatedAttempts).toBe(5001);expect(f.db.prepare('SELECT count(*) n FROM private_cohort_practice_picks').get()!.n).toBe(0);
 }finally{f.db.close()}
},30000);
