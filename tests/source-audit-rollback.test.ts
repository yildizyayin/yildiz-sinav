import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {resolveScanRecord} from '../worker/index';
import {replaceAnswerKey,deleteDefinition} from '../worker/exam-admin-entry';
function fixture(failAudit=false){
 const db=new DatabaseSync(':memory:');
 db.exec(`PRAGMA foreign_keys=ON;CREATE TABLE exam_operation_locks(exam_id TEXT PRIMARY KEY REFERENCES exams(id),owner_token TEXT,operation TEXT);
 CREATE TABLE exam_delivery_profiles(exam_id TEXT,result_freeze_status TEXT,snapshot_version INTEGER);INSERT INTO exam_delivery_profiles VALUES('e','OPEN',0);
 CREATE TABLE exam_administrations(id TEXT,exam_id TEXT,channel TEXT,ranking_frozen_at TEXT,status TEXT,published_snapshot_version INTEGER);
 CREATE TABLE audit_logs(id TEXT,actor_user_id TEXT,institution_id TEXT,action TEXT,entity_type TEXT,entity_id TEXT,details_json TEXT);
 CREATE TABLE scan_batches(id TEXT,exam_id TEXT,institution_id TEXT,season_id TEXT,status TEXT);INSERT INTO scan_batches VALUES('b','e','school','season','NEEDS_REVIEW');
 CREATE TABLE scan_records(id TEXT,batch_id TEXT,matched_student_id TEXT,match_status TEXT,match_confidence REAL,resolution_status TEXT,issues_json TEXT,canonical_json TEXT);
 INSERT INTO scan_records VALUES('r','b',NULL,'NEW_GUEST',0,'PENDING','[]','{"name":"Synthetic student","answers_by_subject":{},"issues":[]}');
 CREATE TABLE exams(id TEXT PRIMARY KEY,status TEXT,owner_type TEXT,institution_id TEXT,outcome_mode TEXT,scoring_rule_version_id TEXT,publisher_name TEXT,exam_type TEXT);
 INSERT INTO exams VALUES('e','DRAFT','INSTITUTION','school','OPTIONAL',NULL,NULL,'LGS');
 CREATE TABLE scoring_rule_versions(id TEXT,rule_id TEXT,verified INTEGER);CREATE TABLE scoring_rules(id TEXT,name TEXT,authority TEXT);
 CREATE TABLE exam_subjects(exam_id TEXT,subject_id TEXT,question_count INTEGER,question_start INTEGER,question_end INTEGER,option_count INTEGER,sort_order INTEGER);
 INSERT INTO exam_subjects VALUES('e','math',1,1,1,4,1);
 CREATE TABLE exam_booklets(exam_id TEXT,code TEXT,active INTEGER);INSERT INTO exam_booklets VALUES('e','A',1);
 CREATE TABLE exam_questions(id TEXT,exam_id TEXT,subject_id TEXT,question_no INTEGER,option_count INTEGER,global_no INTEGER,question_status TEXT);INSERT INTO exam_questions VALUES('q','e','math',1,4,1,'ACTIVE');
 CREATE TABLE answer_keys(id TEXT,exam_question_id TEXT,booklet_code TEXT,correct_answer TEXT,option_count INTEGER,accepted_answers TEXT,question_status TEXT);INSERT INTO answer_keys VALUES('old','q','A','A',4,'["A"]','ACTIVE');
 CREATE TABLE exam_question_booklet_orders(id TEXT,exam_id TEXT,exam_question_id TEXT,booklet_code TEXT,printed_question_no INTEGER);INSERT INTO exam_question_booklet_orders VALUES('old-order','e','q','A',1);
 CREATE TABLE question_outcomes(exam_question_id TEXT,outcome_id TEXT);INSERT INTO question_outcomes VALUES('q','old-outcome');
 CREATE TABLE question_publisher_outcomes(exam_question_id TEXT,publisher_outcome_id TEXT);
 CREATE TABLE exam_optional_answer_keys(exam_id TEXT);INSERT INTO exam_optional_answer_keys VALUES('e');`);
 db.exec(readFileSync(new URL('../migrations/0059_exam_operation_write_guards.sql',import.meta.url),'utf8'));
 if(failAudit)db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'AUDIT_FAILED');END");
 function prepare(sql:string,args:any[]=[]):any{return {bind:(...values:any[])=>prepare(sql,values),first:async()=>db.prepare(sql).get(...args),all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}})}}
 const env={DB:{prepare,batch:async(statements:any[])=>{db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results}catch(error){db.exec('ROLLBACK');throw error}}}} as any;
 const user={id:'admin',role:'SUPER_ADMIN',institution_id:'school'} as any;
 const scan=()=>resolveScanRecord(new Request('https://test',{method:'POST',body:JSON.stringify({action:'CANCEL'})}),env,user,'b','r');
 const key=()=>replaceAnswerKey(new Request('https://test',{method:'PUT',body:JSON.stringify({entries:[{subjectId:'math',bookletCode:'A',answers:'B',optionCount:4,questionStatuses:['EXCLUDED']}],reason:'Synthetic key correction'})}),env,user,'e');
 const remove=()=>deleteDefinition(env,user,'e');
 return {db,scan,key,remove};
}
it('rolls back scan decision and batch status when the audit insert fails',async()=>{const f=fixture(true);try{
 const before=f.db.prepare('SELECT * FROM scan_records').get();await expect(f.scan()).rejects.toThrow('AUDIT_FAILED');
 expect(f.db.prepare('SELECT * FROM scan_records').get()).toEqual(before);expect((f.db.prepare('SELECT status FROM scan_batches').get() as any).status).toBe('NEEDS_REVIEW');expect(f.db.prepare('SELECT * FROM exam_operation_locks').all()).toHaveLength(0);
 }finally{f.db.close()}});
it('commits scan cancellation, ready state and audit together',async()=>{const f=fixture();try{expect((await f.scan()).status).toBe(200);expect((f.db.prepare('SELECT resolution_status FROM scan_records').get() as any).resolution_status).toBe('CANCELLED');expect((f.db.prepare('SELECT status FROM scan_batches').get() as any).status).toBe('READY');expect(f.db.prepare('SELECT * FROM audit_logs').all()).toHaveLength(1)}finally{f.db.close()}});
it('rolls back key deletion, question metadata, ordering and outcome evidence when audit fails',async()=>{const f=fixture(true);try{
 const before=f.db.prepare('SELECT * FROM answer_keys').all();await expect(f.key()).rejects.toThrow('AUDIT_FAILED');
 expect(f.db.prepare('SELECT * FROM answer_keys').all()).toEqual(before);expect((f.db.prepare('SELECT question_status FROM exam_questions').get() as any).question_status).toBe('ACTIVE');expect(f.db.prepare('SELECT * FROM question_outcomes').all()).toHaveLength(1);expect(f.db.prepare('SELECT * FROM exam_optional_answer_keys').all()).toHaveLength(1);expect(f.db.prepare('SELECT * FROM exam_operation_write_guards').all()).toHaveLength(0);
 }finally{f.db.close()}});
it('allows non-draft answer-key correction only after explicit withdrawal and blocks re-frozen writes',async()=>{const f=fixture();try{
 f.db.exec("UPDATE exams SET status='PUBLISHED'");expect((await f.key()).status).toBe(409);
 f.db.exec('UPDATE exam_delivery_profiles SET snapshot_version=1');expect((await f.key()).status).toBe(200);expect((f.db.prepare('SELECT correct_answer FROM answer_keys').get() as any).correct_answer).toBe('B');expect(f.db.prepare('SELECT * FROM audit_logs').all()).toHaveLength(1);
 f.db.exec("UPDATE exam_delivery_profiles SET result_freeze_status='PUBLISHED'");expect((await f.key()).status).toBe(400);expect(f.db.prepare('SELECT * FROM audit_logs').all()).toHaveLength(1);
 }finally{f.db.close()}});

function prepareDeletion(db:DatabaseSync){db.exec(`CREATE TABLE exam_participants(exam_id TEXT);
 CREATE TABLE exam_channel_publications(exam_id TEXT);CREATE TABLE exam_institutions(exam_id TEXT);CREATE TABLE exam_optical_bindings(exam_id TEXT);CREATE TABLE exam_document_assets(exam_id TEXT);CREATE TABLE video_links(exam_id TEXT);`)}
it('deletes an unused draft and its lock atomically with foreign keys enabled',async()=>{const f=fixture();try{prepareDeletion(f.db);expect((await f.remove()).status).toBe(200);expect(f.db.prepare('SELECT * FROM exams').all()).toHaveLength(0);expect(f.db.prepare('SELECT * FROM exam_operation_locks').all()).toHaveLength(0);expect(f.db.prepare('SELECT * FROM audit_logs').all()).toHaveLength(1)}finally{f.db.close()}});
it('preserves a draft when deletion audit fails and releases the restored lock',async()=>{const f=fixture(true);try{prepareDeletion(f.db);await expect(f.remove()).rejects.toThrow('AUDIT_FAILED');expect(f.db.prepare('SELECT * FROM exams').all()).toHaveLength(1);expect(f.db.prepare('SELECT * FROM exam_operation_locks').all()).toHaveLength(0);expect(f.db.prepare('SELECT * FROM exam_optional_answer_keys').all()).toHaveLength(1)}finally{f.db.close()}});
