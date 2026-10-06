import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {expect,it,vi} from 'vitest';
vi.mock('../worker/lib/auth',()=>({getAuthUser:vi.fn(async(env:any)=>env.testActor)}));
vi.mock('../worker/worksheet-admin-entry',()=>({default:{fetch:async()=>new Response('unrelated',{status:404})}}));
import entry from '../worker/curriculum-admin-entry';
import {handleMaarifRegistry} from '../worker/lib/maarif-rubric-registry';

function fixture(){
 const db=new DatabaseSync(':memory:');const dir=new URL('../migrations/',import.meta.url);for(const n of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync(new URL(n,dir),'utf8'));
 db.exec(`INSERT INTO users(id,role,display_name,password_hash,password_salt) VALUES('admin','SUPER_ADMIN','Synthetic','hash','salt');INSERT INTO subjects(id,code,name) VALUES('math','SYNTH_MATH','Synthetic math');
 INSERT INTO curriculum_versions(id,academic_year,grade_level,program_version,authority,verified,program_code) VALUES('base','2026-2027',7,'BASE','MEB',1,'SCHOOL');
 INSERT INTO outcomes(id,curriculum_version_id,subject_id,grade_level,code,title,node_type,official) VALUES('base-outcome','base','math',7,'BASE.1','Synthetic output','OUTCOME',1);
 INSERT INTO curriculum_import_jobs(id,academic_year,program_code,grade_level,program_version,authority,source_kind,source_url,source_title,source_file_key,source_file_name,source_file_hash,status,row_count,valid_count,invalid_count,created_by)
 VALUES('job','2026-2027','SCHOOL',7,'IMPORTED','MEB','MEB_TYMM','https://tymm.meb.gov.tr/synthetic-test.pdf','Synthetic test document','synthetic/source.csv','synthetic.csv','synthetic-hash','READY',2,2,0,'admin');
 INSERT INTO curriculum_import_rows(id,job_id,row_no,subject_code,subject_id,grade_level,outcome_code,title,parent_code,node_type,valid,issues_json) VALUES('child','job',1,'SYNTH_MATH','math',7,'C','Synthetic child','P','OUTCOME',1,'[]'),('parent','job',2,'SYNTH_MATH','math',7,'P','Synthetic parent',NULL,'UNIT',1,'[]');`);
 let failAt=-1;let race:(()=>void)|null=null;
 const prepare=(sql:string,args:any[]=[]):any=>({sql,args,bind:(...v:any[])=>prepare(sql,v),first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({success:true,results:db.prepare(sql).all(...args)}),run:async()=>{if(race&&sql.startsWith('INSERT INTO curriculum_process_components')){const hook=race;race=null;hook()}return {success:true,meta:{changes:Number(db.prepare(sql).run(...args).changes)}}}});
 const actor:any={id:'admin',role:'SUPER_ADMIN'};const env:any={testActor:actor,DB:{prepare,batch:async(stmts:any[])=>{db.exec('BEGIN');try{const result=stmts.map((s,i)=>{if(i===failAt)throw new Error('synthetic batch failure');return {success:true,meta:{changes:Number(db.prepare(s.sql).run(...s.args).changes)}}});db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}}}};
 const commit=(body:any={confirmedOfficial:true})=>entry.fetch(new Request('https://test/api/curriculum-admin/imports/job/commit',{method:'POST',body:JSON.stringify(body)}),env);
 const component={versionId:'base',outcomeId:'base-outcome',code:'P1',title:'Synthetic process definition',confirmedSource:true,reviewNote:'Synthetic review declaration for this isolated test.',sourceUrl:'https://tymm.meb.gov.tr/synthetic-test.pdf',sourceTitle:'Synthetic test document',sourceLocator:'Synthetic section 1'};
 const publish=(body:any=component,role='SUPER_ADMIN')=>handleMaarifRegistry(new Request('https://test/api/curriculum-admin/process-components',{method:'POST',body:JSON.stringify(body)}),env,{...actor,role});
 return {db,env,actor,commit,component,publish,fail:(i:number)=>{failAt=i},race:(hook:()=>void)=>{race=hook}};
}

it('publishes complete forward-linked outcomes, provenance and commit state together',async()=>{
 const f=fixture();try{
  const response=await f.commit();expect(response.status).toBe(200);const body:any=await response.json();expect(body.outcomeCount).toBe(2);
  expect(f.db.prepare("SELECT parent_outcome_id FROM outcomes WHERE id='out_child'").get()!.parent_outcome_id).toBe('out_parent');
  expect(f.db.prepare('SELECT verified FROM curriculum_versions WHERE id=?').get(body.versionId)!.verified).toBe(1);expect(f.db.prepare("SELECT status FROM curriculum_import_jobs WHERE id='job'").get()!.status).toBe('COMMITTED');
  expect(f.db.prepare("SELECT count(*) n FROM official_knowledge_events WHERE entity_id=?").get(body.versionId)!.n).toBe(1);expect(f.db.prepare("SELECT count(*) n FROM audit_logs WHERE action='CURRICULUM_IMPORT_COMMITTED'").get()!.n).toBe(1);
  expect(f.db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);expect((await f.commit()).status).toBe(409);
 }finally{f.db.close()}
});

for(const step of [0,1,2,3,4])it(`rolls back all publication data on failure at transaction step ${step+1}`,async()=>{
 const f=fixture();const spy=vi.spyOn(console,'error').mockImplementation(()=>{});try{
  f.fail(step);expect((await f.commit()).status).toBe(500);
  expect(f.db.prepare("SELECT count(*) n FROM curriculum_versions WHERE program_version='IMPORTED'").get()!.n).toBe(0);expect(f.db.prepare("SELECT count(*) n FROM outcomes WHERE id IN ('out_child','out_parent')").get()!.n).toBe(0);expect(f.db.prepare('SELECT count(*) n FROM official_knowledge_events').get()!.n).toBe(0);expect(f.db.prepare("SELECT count(*) n FROM audit_logs WHERE action='CURRICULUM_IMPORT_COMMITTED'").get()!.n).toBe(0);expect(f.db.prepare("SELECT status FROM curriculum_import_jobs WHERE id='job'").get()!.status).toBe('READY');
  f.fail(-1);expect((await f.commit()).status).toBe(200);
 }finally{spy.mockRestore();f.db.close()}
});

it('rejects incomplete staging, missing hierarchy, revoked subjects and nonliteral confirmation',async()=>{
 const f=fixture();try{
  expect((await f.commit({confirmedOfficial:'true'})).status).toBe(400);f.db.exec("UPDATE curriculum_import_jobs SET row_count=3");expect((await f.commit()).status).toBe(400);f.db.exec("UPDATE curriculum_import_jobs SET row_count=2; UPDATE curriculum_import_rows SET parent_code='missing' WHERE id='child'");expect((await f.commit()).status).toBe(400);f.db.exec("UPDATE curriculum_import_rows SET parent_code='P' WHERE id='child'; UPDATE subjects SET active=0 WHERE id='math'");expect((await f.commit()).status).toBe(409);expect(f.db.prepare("SELECT count(*) n FROM curriculum_versions WHERE program_version='IMPORTED'").get()!.n).toBe(0);
 }finally{f.db.close()}
});

it('enforces registry roles/version and rechecks context inside the component INSERT',async()=>{
 const f=fixture();try{
  for(const role of ['INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER','STUDENT','PARENT']){expect((await f.publish(f.component,role))!.status).toBe(403);f.env.testActor={...f.actor,role};expect((await f.commit()).status).toBe(403);}f.env.testActor=null;expect((await f.commit()).status).toBe(401);f.env.testActor=f.actor;
  expect((await f.publish({...f.component,versionId:'another'}))!.status).toBe(400);
  f.race(()=>f.db.exec("UPDATE curriculum_versions SET verified=0 WHERE id='base'"));expect((await f.publish())!.status).toBe(409);expect(f.db.prepare('SELECT count(*) n FROM curriculum_process_components').get()!.n).toBe(0);
  f.db.exec("UPDATE curriculum_versions SET verified=1 WHERE id='base'");expect((await f.publish())!.status).toBe(201);
  expect((await f.publish())!.status).toBe(409);expect(()=>f.db.exec("UPDATE curriculum_process_components SET title='Changed'")).toThrow('PROCESS_COMPONENT_IMMUTABLE');expect(()=>f.db.exec('DELETE FROM curriculum_process_components')).toThrow('PROCESS_COMPONENT_IMMUTABLE');
 }finally{f.db.close()}
});

it('keeps teacher-designed rubric provenance separate and published versions immutable',async()=>{
 const f=fixture();try{
  const component:any=await (await f.publish())!.json();
  const body={versionId:'base',componentId:component.id,sourceKind:'TEACHER_DESIGNED',versionLabel:'v1',title:'Synthetic observation rubric',taskInstructions:'Observe the synthetic task and select exactly one level for the criterion.',reviewNote:'Synthetic criteria reviewed for an isolated test.',confirmedSource:true,criteria:[{id:'criterion',title:'Observable action',description:'Describe the observable action in this synthetic task.',levels:[{id:'developing',label:'Developing',description:'Action is demonstrated with guided support.'},{id:'independent',label:'Independent',description:'Action is demonstrated independently in this task.'}]}]};
  const publish=(value:any)=>handleMaarifRegistry(new Request('https://test/api/curriculum-admin/learning-rubrics',{method:'POST',body:JSON.stringify(value)}),f.env,f.actor);
  expect((await publish({...body,versionId:'wrong'}))!.status).toBe(400);expect((await publish({...body,sourceKind:'OFFICIAL'}))!.status).toBe(400);expect((await publish({...body,confirmedSource:'true'}))!.status).toBe(400);
  const response=await publish(body);expect(response!.status).toBe(201);const id=(await response!.json() as any).id;const row=f.db.prepare('SELECT * FROM learning_rubric_versions WHERE id=?').get(id)!;expect(row.source_kind).toBe('TEACHER_DESIGNED');expect(row.source_url).toBeNull();expect(JSON.parse(String(row.criteria_json))).toEqual(body.criteria);expect((await publish(body))!.status).toBe(409);
  expect(()=>f.db.prepare('UPDATE learning_rubric_versions SET title=? WHERE id=?').run('Changed',id)).toThrow('RUBRIC_VERSION_IMMUTABLE');expect(()=>f.db.prepare('DELETE FROM learning_rubric_versions WHERE id=?').run(id)).toThrow('RUBRIC_VERSION_IMMUTABLE');
 }finally{f.db.close()}
});
