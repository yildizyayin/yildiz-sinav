import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { submitStudentPractice } from '../worker/lib/platform-expansion';

it('isolates server-created practice attempts from supplied foreign runs and rejects inactive institution membership', async () => {
 const db=new DatabaseSync(':memory:');
 try {
  db.exec(`CREATE TABLE platform_features(feature_key TEXT,enabled_default INTEGER);INSERT INTO platform_features VALUES('QUESTION_BANK',1);
   CREATE TABLE institution_feature_overrides(feature_key TEXT,institution_id TEXT,enabled INTEGER);
   CREATE TABLE student_enrollments(student_id TEXT,institution_id TEXT,status TEXT,created_at TEXT);INSERT INTO student_enrollments VALUES('student','school','ACTIVE','2026');
   CREATE TABLE question_bank(id TEXT,correct_answer TEXT,solution_text TEXT,owner_type TEXT,owner_id TEXT,review_status TEXT,copyright_status TEXT,options_json TEXT);
   INSERT INTO question_bank VALUES('q','A',NULL,'PLATFORM',NULL,'APPROVED','OWNED','[]');
   CREATE TABLE learning_nodes(id TEXT,node_type TEXT);CREATE TABLE question_learning_links(question_id TEXT,node_id TEXT);
   CREATE TABLE assessment_runs(id TEXT PRIMARY KEY,institution_id TEXT,student_id TEXT,source_type TEXT,source_id TEXT,delivery_mode TEXT,status TEXT,score REAL,metadata_json TEXT,completed_at TEXT);
   INSERT INTO assessment_runs VALUES('foreign','other-school','other-student','MINI_TEST','other-source','DIGITAL','SCORED',0,NULL,NULL);
   CREATE TABLE question_practice_attempts(id TEXT PRIMARY KEY,student_id TEXT,question_id TEXT,selected_answer TEXT,is_correct INTEGER);
   CREATE TABLE assessment_responses(id TEXT,run_id TEXT,student_id TEXT,question_id TEXT,node_id TEXT,selected_answer TEXT,is_correct INTEGER,source_channel TEXT,UNIQUE(run_id,question_id));
   CREATE TABLE audit_logs(id TEXT,actor_user_id TEXT,institution_id TEXT,action TEXT,entity_type TEXT,entity_id TEXT,details_json TEXT);`);
  const prepare=(sql:string,args:any[]=[]):any=>({bind:(...values:any[])=>prepare(sql,values),first:async()=>db.prepare(sql).get(...args),all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>db.prepare(sql).run(...args),sql,args});
  const env={DB:{prepare,batch:async(stmts:any[])=>{db.exec('BEGIN');try{const results=stmts.map(x=>db.prepare(x.sql).run(...x.args));db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}}} as any;
  const user={id:'user',role:'STUDENT',student_id:'student',institution_id:'school'} as any;
  const send=()=>submitStudentPractice(new Request('https://test',{method:'POST',body:JSON.stringify({questionId:'q',answer:'A',runId:'foreign'})}),env,user);
  const first:any=await(await send()).json(),second:any=await(await send()).json();
  expect(first.ok).toBe(true);expect(first.runId).not.toBe('foreign');expect(second.runId).not.toBe(first.runId);
  expect(db.prepare("SELECT COUNT(*) n FROM assessment_responses WHERE run_id='foreign'").get()?.n).toBe(0);
  expect(db.prepare("SELECT student_id,source_type FROM assessment_runs WHERE id='foreign'").get()).toMatchObject({student_id:'other-student',source_type:'MINI_TEST'});
  expect(db.prepare("SELECT COUNT(*) n FROM assessment_runs WHERE student_id='student' AND institution_id='school' AND source_type='QUESTION_BANK'").get()?.n).toBe(2);
  db.exec("UPDATE student_enrollments SET institution_id='other-school'");
  expect((await send()).status).toBe(403);
  expect(db.prepare('SELECT COUNT(*) n FROM question_practice_attempts').get()?.n).toBe(2);
 } finally {db.close();}
});
