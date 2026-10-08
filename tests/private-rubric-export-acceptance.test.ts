import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {expect,it} from 'vitest';
import {handleRubricObservations} from '../worker/lib/rubric-observations';
import {handlePrivateRubricExport,consumePrivateRubricExports,dispatchPrivateRubricExports} from '../worker/lib/private-rubric-export';

function fixture(rubricTitle='Synthetic rubric'){
 const db=new DatabaseSync(':memory:'),dir=new URL('../migrations/',import.meta.url);
 for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync(new URL(name,dir),'utf8'));
 db.exec(`INSERT INTO institutions(id,name,code) VALUES('school','Synthetic','SYNTH');
 INSERT INTO institution_seasons(id,institution_id,academic_year) VALUES('season','school','2026-2027');
 INSERT INTO classes(id,institution_id,season_id,grade_level,section,name) VALUES('class','school','season',7,'A','7A');
 INSERT INTO subjects(id,code,name) VALUES('math','SYNTH_MATH','Synthetic math');
 INSERT INTO student_entities(id,first_name,last_name,normalized_name) VALUES('student','Synthetic','Student','synthetic');
 INSERT INTO student_enrollments(id,student_id,institution_id,season_id,class_id,grade_level) VALUES('enrollment','student','school','season','class',7);
 INSERT INTO users(id,institution_id,role,display_name,password_hash,password_salt) VALUES('teacher','school','TEACHER','Synthetic teacher','hash','salt'),('other-teacher','school','TEACHER','Other teacher','hash','salt');
 INSERT INTO teacher_assignments(id,user_id,institution_id,season_id,class_id,subject_id,assignment_type) VALUES('assignment','teacher','school','season','class','math','SUBJECT'),('other-assignment','other-teacher','school','season','class','math','SUBJECT');
 INSERT INTO curriculum_versions(id,academic_year,grade_level,program_version,authority,verified,program_code) VALUES('cv','2026-2027',7,'SYNTHETIC','MEB',1,'SCHOOL');
 INSERT INTO outcomes(id,curriculum_version_id,subject_id,grade_level,code,title,node_type,official) VALUES('outcome','cv','math',7,'SYNTH.1','Synthetic learning output','OUTCOME',1);
 INSERT INTO curriculum_process_components(id,outcome_id,code,title,source_url,source_title,source_locator,review_note,verified_by) VALUES('component','outcome','P1','Synthetic process','https://tymm.meb.gov.tr/synthetic.pdf','Synthetic document','Synthetic section','Synthetic fixture declaration','teacher');`);
 const criteria=[{id:'criterion',title:'Observable action',description:'Synthetic action',levels:[{id:'guided',label:'With support',description:'Demonstrates with guidance'},{id:'independent',label:'Independent',description:'Demonstrates independently'}]}];
 db.prepare("INSERT INTO learning_rubric_versions(id,component_id,version_label,title,task_instructions,criteria_json,source_kind,review_note,published_by) VALUES('rubric','component','v1',?,'Observe the synthetic task',?,'TEACHER_DESIGNED','Synthetic review','teacher')").run(rubricTitle,JSON.stringify(criteria));
 const prepare=(sql:string,args:any[]=[]):any=>({sql,args,bind:(...v:any[])=>prepare(sql,v),first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({success:true,results:db.prepare(sql).all(...args)}),run:async()=>({success:true,meta:{changes:Number(db.prepare(sql).run(...args).changes)}})});
 const objects=new Map<string,string>();let gets=0,failNextPut=false;const sent:any[]=[];
 const bucket={put:async(key:string,value:string)=>{if(failNextPut){failNextPut=false;throw new Error('synthetic R2 write failure')}objects.set(key,value)},get:async(key:string)=>{gets++;return objects.has(key)?{body:objects.get(key)!}:null},delete:async(key:string)=>{objects.delete(key)},list:async({prefix,limit}:any)=>{const keys=[...objects.keys()].filter(k=>k.startsWith(prefix)).sort();return {objects:keys.slice(0,limit).map(key=>({key})),truncated:keys.length>limit}}};
 const sentQueue={send:async(value:any)=>{sent.push(value)}};
 const env:any={DB:{prepare,batch:async(stmts:any[])=>{db.exec('BEGIN');try{const result=stmts.map(s=>{const stmt=db.prepare(s.sql);if(stmt.columns().length)return {success:true,results:stmt.all(...s.args),meta:{changes:0}};return {success:true,results:[],meta:{changes:Number(stmt.run(...s.args).changes)}}});db.exec('COMMIT');return result}catch(error){db.exec('ROLLBACK');throw error}}},REPORT_EXPORTS_ENABLED:'true',REPORT_EXPORT_QUEUE_NAME:'anunex-rubric-exports-staging',REPORT_EXPORT_QUEUE:sentQueue,REPORT_EXPORT_FILES:bucket};
 const teacher:any={id:'teacher',role:'TEACHER',institution_id:'school'};
 const body={enrollmentId:'enrollment',rubricId:'rubric',requestId:'synthetic-observation-1',confirmedObservation:true,observedAt:'2026-10-01T12:00:00.000Z',evidenceNote:'Synthetic evidence recorded during the task.',feedback:'Continue demonstrating the observed action.',nextStep:'Try a second synthetic task independently.',selections:[{criterionId:'criterion',levelId:'independent'}]};
 const write=(value:any=body,actor=teacher)=>handleRubricObservations(new Request('https://test/api/learning-observations/students/student',{method:'POST',body:JSON.stringify(value)}),env,actor);
 const withdraw=(id:string,reason='Synthetic withdrawal requiring a fresh observation.',actor=teacher)=>handleRubricObservations(new Request(`https://test/api/learning-observations/students/student/${id}/withdraw`,{method:'POST',body:JSON.stringify({reason})}),env,actor);
 const request=(path:string,method='GET',value?:any,actor=teacher)=>handlePrivateRubricExport(new Request('https://test'+path,{method,...(value?{body:JSON.stringify(value)}:{})}),env,actor);
 const create=async(requestId='synthetic-export-request')=>{const response=await request('/api/private-rubric-exports','POST',{studentId:'student',view:'current',enrollmentId:'',confirmedExport:true,requestId});expect(response!.status).toBe(202);return (await response!.json() as any).jobId as string};
 const consume=async(id:string)=>{let ack=0,retry=0;await consumePrivateRubricExports({messages:[{body:{schemaVersion:1,jobId:id},ack:()=>ack++,retry:()=>retry++}]} as any,env);return {ack,retry}};
 return {db,env,teacher,body,criteria,objects,sent,bucket,write,withdraw,request,create,consume,gets:()=>gets,failPut:()=>{failNextPut=true}};
}

it('exports frozen labels as complete quoted UTF-8 CSV with formula-safe evidence',async()=>{
 const f=fixture('Rubrik; "Türkçe"\niki satır');try{
  expect((await f.write({...f.body,evidenceNote:'=HYPERLINK("https://example.invalid")'}))!.status).toBe(201);
  const id=await f.create();expect(f.sent).toContainEqual({schemaVersion:1,jobId:id});expect(await f.consume(id)).toEqual({ack:1,retry:0});
  const status:any=await (await f.request(`/api/private-rubric-exports/${id}`))!.json();expect(status).toMatchObject({status:'READY',partCount:1,observationCount:1,parts:[{part_no:0,observation_count:1}]});
  const download=await f.request(`/api/private-rubric-exports/${id}/parts/0/download`);expect(download!.status).toBe(200);expect(download!.headers.get('content-type')).toContain('text/csv');
  const objectKey=String(f.db.prepare('SELECT object_key FROM private_rubric_export_parts WHERE job_id=?').get(id)!.object_key),csv=f.objects.get(objectKey)!;expect(csv.startsWith('\ufeff"Eğitim yılı"'),'CSV BOM/header').toBe(true);
  expect(csv).toContain('"Rubrik; ""Türkçe""\niki satır"');expect(csv).toContain('"Öğretmen tasarımı"');
  expect(csv).toContain('"\'=HYPERLINK(""https://example.invalid"")"');expect(csv).toContain('"Continue demonstrating the observed action."');
  expect(csv).toContain('"Independent"');expect(csv.endsWith('\r\n')).toBe(true);
 }finally{f.db.close()}
});

it('replays the same owned request, rejects a changed scope, and hides jobs from other actors',async()=>{
 const f=fixture();try{
  await f.write();const id=await f.create();const same=await f.request('/api/private-rubric-exports','POST',{studentId:'student',view:'current',confirmedExport:true,requestId:'synthetic-export-request'});expect(same!.status).toBe(200);expect(await same!.json()).toMatchObject({jobId:id,replayed:true});
  const conflict=await f.request('/api/private-rubric-exports','POST',{studentId:'student',view:'current',enrollmentId:'enrollment',confirmedExport:true,requestId:'synthetic-export-request'});expect(conflict!.status).toBe(409);
  expect((await f.request(`/api/private-rubric-exports/${id}`,'GET',undefined,{...f.teacher,id:'other-teacher'}))!.status).toBe(403);
  expect((await f.request(`/api/private-rubric-exports/${id}`,'GET',undefined,{...f.teacher,role:'INSTITUTION_MANAGER'}))!.status).toBe(403);
  expect((await f.request(`/api/private-rubric-exports/${id}/parts/0/download`))!.status).toBe(409);
 }finally{f.db.close()}
});

it('revokes a queued export when current teacher assignment is lost before processing',async()=>{
 const f=fixture();try{
  await f.write();const id=await f.create();f.db.exec("UPDATE teacher_assignments SET active=0 WHERE id='assignment'");expect(await f.consume(id)).toEqual({ack:1,retry:0});
  expect(f.db.prepare('SELECT status,error_code,part_count FROM private_rubric_export_jobs WHERE id=?').get(id)).toMatchObject({status:'REVOKED',error_code:'EXPORT_SCOPE_REVOKED',part_count:0});expect(f.objects.size).toBe(0);
 }finally{f.db.close()}
});

it('rechecks current authorization and withdrawal before serving a stored part',async()=>{
 const f=fixture();try{
  await f.write();const id=await f.create();expect(await f.consume(id)).toEqual({ack:1,retry:0});const key=String(f.db.prepare('SELECT object_key FROM private_rubric_export_parts WHERE job_id=?').get(id)!.object_key);expect(f.objects.has(key)).toBe(true);
  const before=f.gets();f.db.exec("UPDATE teacher_assignments SET active=0 WHERE id='assignment'");expect((await f.request(`/api/private-rubric-exports/${id}/parts/0/download`))!.status).toBe(403);expect(f.gets()).toBe(before);
  f.db.exec("UPDATE teacher_assignments SET active=1 WHERE id='assignment'");expect((await f.request(`/api/private-rubric-exports/${id}/parts/0/download`))!.status).toBe(200);
  const observationId=String(f.db.prepare('SELECT id FROM learning_rubric_observations LIMIT 1').get()!.id);expect((await f.withdraw(observationId))!.status).toBe(200);
  expect((await f.request(`/api/private-rubric-exports/${id}/parts/0/download`))!.status).toBe(403);expect(f.gets()).toBe(before+1);
 }finally{f.db.close()}
});

it('retries transient object storage failure without committing a duplicate part',async()=>{
 const f=fixture();try{
  await f.write();const id=await f.create();f.failPut();expect(await f.consume(id)).toEqual({ack:0,retry:1});const failed=f.db.prepare('SELECT status,lease_token,part_count,observation_count,error_code FROM private_rubric_export_jobs WHERE id=?').get(id)!;expect(failed).toMatchObject({status:'RUNNING',lease_token:null,part_count:0,observation_count:0,error_code:'EXPORT_RETRY'});expect(f.db.prepare('SELECT count(*) n FROM private_rubric_export_parts WHERE job_id=?').get(id)!.n).toBe(0);
  expect(await f.consume(id)).toEqual({ack:1,retry:0});expect(f.db.prepare('SELECT status,part_count,observation_count,error_code FROM private_rubric_export_jobs WHERE id=?').get(id)).toMatchObject({status:'READY',part_count:1,observation_count:1,error_code:null});expect(f.db.prepare('SELECT count(*) n FROM private_rubric_export_parts WHERE job_id=?').get(id)!.n).toBe(1);expect(f.objects.size).toBe(1);
 }finally{f.db.close()}
});

it('expires downloads immediately and cleans storage in bounded batches',async()=>{
 const f=fixture();try{
  await f.write();const id=await f.create();expect(await f.consume(id)).toEqual({ack:1,retry:0});
  for(let n=0;n<11;n++)f.objects.set(`report-exports/${id}/orphan-${String(n).padStart(2,'0')}.csv`,'synthetic');
  f.db.prepare("UPDATE private_rubric_export_jobs SET expires_at=datetime('now','-1 minute') WHERE id=?").run(id);
  const before=f.gets();expect((await f.request(`/api/private-rubric-exports/${id}/parts/0/download`))!.status).toBe(410);expect(f.gets()).toBe(before);
  await dispatchPrivateRubricExports(f.env);let job=f.db.prepare('SELECT status,cleanup_done FROM private_rubric_export_jobs WHERE id=?').get(id)!;expect(job).toMatchObject({status:'EXPIRED',cleanup_done:0});expect(f.objects.size).toBe(7);expect(f.db.prepare('SELECT count(*) n FROM private_rubric_export_parts WHERE job_id=?').get(id)!.n).toBe(1);
  await dispatchPrivateRubricExports(f.env);job=f.db.prepare('SELECT status,cleanup_done,selection_json,actor_scope_json FROM private_rubric_export_jobs WHERE id=?').get(id)!;expect(job).toMatchObject({status:'EXPIRED',cleanup_done:0});expect(f.objects.size).toBe(2);
  await dispatchPrivateRubricExports(f.env);job=f.db.prepare('SELECT status,cleanup_done,selection_json,actor_scope_json FROM private_rubric_export_jobs WHERE id=?').get(id)!;expect(job).toMatchObject({status:'EXPIRED',cleanup_done:1,selection_json:'{}',actor_scope_json:'[]'});expect(f.objects.size).toBe(0);expect(f.db.prepare('SELECT count(*) n FROM private_rubric_export_parts WHERE job_id=?').get(id)!.n).toBe(0);
 }finally{f.db.close()}
});
