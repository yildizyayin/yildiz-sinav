import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {getCoachMiniTest,submitCoachMiniTest} from '../worker/lib/coach-mastery-cycle';

function fixture(mode='NEW'){
 const db=new DatabaseSync(':memory:');
 db.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE assignments(id TEXT PRIMARY KEY,institution_id TEXT,assignment_type TEXT);
 CREATE TABLE assignment_items(id TEXT PRIMARY KEY,assignment_id TEXT);
 CREATE TABLE assignment_recipients(assignment_id TEXT,student_id TEXT,status TEXT,progress REAL,completed_at TEXT,PRIMARY KEY(assignment_id,student_id));
 CREATE TABLE assignment_attempts(id TEXT PRIMARY KEY,assignment_id TEXT,student_id TEXT,item_id TEXT,answer_json TEXT,score REAL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE subjects(id TEXT PRIMARY KEY,name TEXT);
 CREATE TABLE outcomes(id TEXT PRIMARY KEY,title TEXT,topic TEXT,subtopic TEXT,subject_id TEXT);
 CREATE TABLE coach_mini_tests(id TEXT PRIMARY KEY,assignment_id TEXT,assignment_item_id TEXT,student_id TEXT,outcome_id TEXT,cycle_no INTEGER,status TEXT,question_count INTEGER,pass_threshold REAL,selection_mode TEXT,correct_count INTEGER,score_percent REAL,submitted_at TEXT);
 CREATE TABLE coach_mini_test_questions(test_id TEXT,question_id TEXT,sort_order INTEGER,snapshot_json TEXT,student_answer TEXT,correct INTEGER,answered_at TEXT,PRIMARY KEY(test_id,question_id));
 CREATE TABLE student_outcome_mastery(student_id TEXT,outcome_id TEXT,status TEXT,cycle_count INTEGER,last_score REAL,last_test_id TEXT,mastered_at TEXT,updated_at TEXT,PRIMARY KEY(student_id,outcome_id));
 CREATE TABLE learning_nodes(id TEXT PRIMARY KEY);
 CREATE TABLE learning_evidence(id TEXT PRIMARY KEY,student_id TEXT,node_id TEXT,source_type TEXT,source_id TEXT,result REAL,weight REAL);
 CREATE TABLE student_learning_state(student_id TEXT,node_id TEXT,mastery REAL,confidence REAL,evidence_count INTEGER,last_evidence_at TEXT,updated_at TEXT,PRIMARY KEY(student_id,node_id));
 CREATE TABLE assessment_runs(id TEXT PRIMARY KEY,institution_id TEXT,student_id TEXT,source_type TEXT,source_id TEXT,assignment_id TEXT,delivery_mode TEXT,status TEXT,score REAL,metadata_json TEXT,completed_at TEXT);
 CREATE TABLE assessment_responses(id TEXT PRIMARY KEY,run_id TEXT,student_id TEXT,question_id TEXT,node_id TEXT,selected_answer TEXT,is_correct INTEGER,source_channel TEXT);
 CREATE TABLE learning_videos(id TEXT,node_id TEXT,title TEXT,url TEXT,duration_seconds INTEGER,approved INTEGER,active INTEGER,created_at TEXT);
 CREATE TABLE coach_followup_actions(id TEXT PRIMARY KEY,test_id TEXT,student_id TEXT,outcome_id TEXT,action_type TEXT,reference_id TEXT,title TEXT,payload_json TEXT,status TEXT DEFAULT 'PENDING',created_at TEXT DEFAULT CURRENT_TIMESTAMP,completed_at TEXT);
 CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_user_id TEXT,institution_id TEXT,action TEXT,entity_type TEXT,entity_id TEXT,details_json TEXT);
 INSERT INTO assignments VALUES('assignment','school','NIBIRU');INSERT INTO assignment_items VALUES('item','assignment');
 INSERT INTO assignment_recipients VALUES('assignment','student','ASSIGNED',0,NULL);
 INSERT INTO subjects VALUES('math','Math');INSERT INTO outcomes VALUES('outcome','Outcome',NULL,NULL,'math');INSERT INTO learning_nodes VALUES('ln_outcome');`);
 db.exec(readFileSync(new URL('../migrations/0070_coach_mini_test_atomic_submission.sql',import.meta.url),'utf8'));
 // The migration is safely repeatable and does not populate old submission receipts.
 db.exec(readFileSync(new URL('../migrations/0070_coach_mini_test_atomic_submission.sql',import.meta.url),'utf8'));
 db.prepare(`INSERT INTO coach_mini_tests(id,assignment_id,assignment_item_id,student_id,outcome_id,cycle_no,status,question_count,pass_threshold,selection_mode) VALUES('test','assignment','item','student','outcome',1,'READY',5,.8,?)`).run(mode);
 for(let i=0;i<5;i++)db.prepare('INSERT INTO coach_mini_test_questions(test_id,question_id,sort_order,snapshot_json) VALUES(?,?,?,?)').run('test',`q${i}`,i+1,JSON.stringify({schemaVersion:1,question:{id:`q${i}`,stem_text:'Frozen question',options_json:'["a","b"]',correct_answer:'A',solution_text:'Frozen solution'},academicYear:'2026-2027',gradeLevel:7,enrollmentId:'enrollment',seasonId:'season',outcomeRefs:[{outcomeId:'outcome',subjectId:'math',curriculumVersionId:'version',academicYear:'2026-2027',gradeLevel:7,programVersion:'TYMM',verified:1}]}));
 let beforeBatch:()=>Promise<void>=async()=>{};
 const prepare=(sql:string,args:any[]=[]):any=>({sql,args,bind:(...values:any[])=>prepare(sql,values),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({success:true,meta:{changes:db.prepare(sql).run(...args).changes}})});
 const env={DB:{prepare,batch:async(statements:any[])=>{await beforeBatch();db.exec('BEGIN');try{const results=statements.map(s=>({success:true,meta:{changes:db.prepare(s.sql).run(...s.args).changes}}));db.exec('COMMIT');return results}catch(error){db.exec('ROLLBACK');throw error}}}} as any;
 const user={role:'STUDENT',id:'user',student_id:'student',institution_id:'school'} as any;
 const answers=(correct:number)=>Array.from({length:5},(_,i)=>({questionId:`q${i}`,answer:i<correct?'A':'B'}));
 const count=(table:string)=>Number(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get()?.n);
 const barrier=()=>{let arrivals=0;let release:()=>void;const ready=new Promise<void>(resolve=>release=resolve);beforeBatch=async()=>{if(++arrivals===2)release();await ready};};
 return{db,env,user,answers,count,barrier,setBeforeBatch:(fn:()=>Promise<void>)=>beforeBatch=fn,clearBarrier:()=>beforeBatch=async()=>{}};
}

it('commits one complete winner when different concurrent answers saw READY and returns that persisted result to the loser and retries',async()=>{
 const f=fixture();try{
 f.barrier();const results:any[]=await Promise.all([submitCoachMiniTest(f.env,f.user,'test',f.answers(4)),submitCoachMiniTest(f.env,f.user,'test',f.answers(0))]);
 expect(results.map(r=>r.reused).sort()).toEqual([false,true]);
 expect(results[0].result).toEqual(results[1].result);expect(results[0].result).toMatchObject({correct:4,status:'PASSED',scorePercent:80});
 expect(results[1].detail.questions.map((q:any)=>q.student_answer)).toEqual(['A','A','A','A','B']);
 f.clearBarrier();const retry:any=await submitCoachMiniTest(f.env,f.user,'test',f.answers(0));expect(retry.reused).toBe(true);expect(retry.result).toEqual(results[0].result);
 expect(f.count('coach_mini_test_submissions')).toBe(1);expect(f.count('assessment_runs')).toBe(1);expect(f.count('assessment_responses')).toBe(5);
 expect(f.db.prepare('SELECT cycle_count,last_score FROM student_outcome_mastery').get()).toMatchObject({cycle_count:1,last_score:.8});
 expect(f.count('learning_evidence')).toBe(1);expect(f.db.prepare('SELECT evidence_count,mastery FROM student_learning_state').get()).toMatchObject({evidence_count:5,mastery:.8});
 expect(f.count('assignment_attempts')).toBe(1);expect(f.db.prepare('SELECT status,progress FROM assignment_recipients').get()).toMatchObject({status:'COMPLETED',progress:100});
 expect(f.count('coach_followup_actions')).toBe(0);expect(f.count('audit_logs')).toBe(2);
 const meta=JSON.parse(String(f.db.prepare('SELECT metadata_json FROM assessment_runs').get()?.metadata_json));expect(meta.miniEvidence.questionEvidence[4].status).toBe('WRONG');
 }finally{f.db.close()}
});

it('rolls back answers, receipt, mastery, task progress and evidence when the last audit write fails, then allows a complete retry',async()=>{
 const f=fixture();try{
 f.db.exec(`CREATE TRIGGER reject_submit_audit BEFORE INSERT ON audit_logs WHEN NEW.action='COACH_MINI_TEST_SUBMITTED' BEGIN SELECT RAISE(ABORT,'audit failed'); END;`);
 await expect(submitCoachMiniTest(f.env,f.user,'test',f.answers(5))).rejects.toThrow('audit failed');
 expect(f.db.prepare('SELECT status,correct_count FROM coach_mini_tests').get()).toMatchObject({status:'READY',correct_count:null});
 expect(f.db.prepare('SELECT COUNT(*) n FROM coach_mini_test_questions WHERE student_answer IS NOT NULL').get()?.n).toBe(0);
 for(const table of ['coach_mini_test_submissions','student_outcome_mastery','learning_evidence','student_learning_state','assessment_runs','assessment_responses','assignment_attempts','coach_followup_actions','audit_logs'])expect(f.count(table)).toBe(0);
 expect(f.db.prepare('SELECT status,progress FROM assignment_recipients').get()).toMatchObject({status:'ASSIGNED',progress:0});
 f.db.exec('DROP TRIGGER reject_submit_audit');expect(await submitCoachMiniTest(f.env,f.user,'test',f.answers(5))).toMatchObject({ok:true,reused:false,result:{status:'PASSED',correct:5}});
 expect(f.count('coach_mini_test_submissions')).toBe(1);expect(f.count('audit_logs')).toBe(2);
 }finally{f.db.close()}
});

it('creates failed-test followups once, chooses one approved video and performs no repeat promotion',async()=>{
 const f=fixture();try{
 f.db.exec(`INSERT INTO learning_videos VALUES('v','ln_outcome','Help','https://example.test/video',90,1,1,'2026-10-01');`);
 f.barrier();const responses:any[]=await Promise.all([submitCoachMiniTest(f.env,f.user,'test',f.answers(0)),submitCoachMiniTest(f.env,f.user,'test',f.answers(5))]);
 expect(responses[0].result).toEqual(responses[1].result);expect(responses[0].result.status).toBe('FAILED');
 expect(f.db.prepare('SELECT action_type FROM coach_followup_actions ORDER BY action_type').all()).toEqual([{action_type:'PRACTICE'},{action_type:'VIDEO'}]);
 expect(f.count('assignment_attempts')).toBe(0);expect(f.count('audit_logs')).toBe(1);expect(f.count('learning_evidence')).toBe(1);
 }finally{f.db.close()}
 const repeat=fixture('REPEAT');try{
 repeat.barrier();const results:any[]=await Promise.all([submitCoachMiniTest(repeat.env,repeat.user,'test',repeat.answers(5)),submitCoachMiniTest(repeat.env,repeat.user,'test',repeat.answers(0))]);
 expect(results[0].result).toEqual(results[1].result);expect(results[0].result).toMatchObject({practiceOnly:true,masteryStatus:null});
 for(const table of ['student_outcome_mastery','learning_evidence','student_learning_state','assignment_attempts','coach_followup_actions'])expect(repeat.count(table)).toBe(0);
 expect(repeat.count('assessment_responses')).toBe(5);expect(repeat.count('audit_logs')).toBe(1);
 }finally{repeat.db.close()}
});

it('rejects a different institution and missing assignment recipient before reading or mutating test content',async()=>{
 const f=fixture();try{
 expect(await getCoachMiniTest(f.env,{...f.user,institution_id:'other'},'test')).toMatchObject({ok:false,reason:'TEST_NOT_FOUND'});
 expect(await submitCoachMiniTest(f.env,{...f.user,institution_id:'other'},'test',f.answers(5))).toMatchObject({ok:false,reason:'TEST_NOT_FOUND'});
 expect(f.count('coach_mini_test_submissions')).toBe(0);
 f.db.exec('DELETE FROM assignment_recipients');expect(await submitCoachMiniTest(f.env,f.user,'test',f.answers(5))).toMatchObject({ok:false,reason:'TEST_NOT_FOUND'});
 }finally{f.db.close()}
});


it('fails closed when assignment scope is revoked after the initial read and before the batch claim',async()=>{
 const f=fixture();try{
 f.setBeforeBatch(async()=>{f.db.exec('DELETE FROM assignment_recipients')});
 expect(await submitCoachMiniTest(f.env,f.user,'test',f.answers(5))).toEqual({ok:false,reason:'SUBMISSION_NOT_COMMITTED'});
 expect(f.count('coach_mini_test_submissions')).toBe(0);expect(f.count('assessment_runs')).toBe(0);expect(f.count('audit_logs')).toBe(0);
 expect(f.db.prepare('SELECT status FROM coach_mini_tests').get()?.status).toBe('READY');
 }finally{f.db.close()}
});

it('executes the guarded submission batch on native local D1, rolls back a late failure, and commits one concurrent winner',async()=>{
 const {Miniflare,convertV4MiniflareOptions}=await import('miniflare');
 const mf=new Miniflare(convertV4MiniflareOptions({name:'mini-test-atomic',modules:true,script:'export default { fetch() { return new Response("ok") } }',compatibilityDate:'2026-09-01',d1Databases:['DB']}));
 const f=fixture();try{
  const native=await mf.getD1Database('DB');
  const tables=f.db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all();
  await native.batch(tables.map(t=>native.prepare(String(t.sql))));
  for(const table of tables){
   const rows=f.db.prepare(`SELECT * FROM ${table.name}`).all();
   if(rows.length)await native.batch(rows.map(row=>native.prepare(`INSERT INTO ${table.name}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).bind(...Object.values(row))));
  }
  const env={DB:native} as any;
  await native.prepare(`CREATE TRIGGER reject_submit_audit BEFORE INSERT ON audit_logs WHEN NEW.action='COACH_MINI_TEST_SUBMITTED' BEGIN SELECT RAISE(ABORT,'audit failed'); END`).run();
  await expect(submitCoachMiniTest(env,f.user,'test',f.answers(5))).rejects.toThrow('audit failed');
  expect(await native.prepare('SELECT status FROM coach_mini_tests').first()).toMatchObject({status:'READY'});
  expect(await native.prepare('SELECT COUNT(*) n FROM coach_mini_test_submissions').first('n')).toBe(0);
  await native.prepare('DROP TRIGGER reject_submit_audit').run();
  let arrivals=0;let release:()=>void;const ready=new Promise<void>(resolve=>release=resolve);
  env.DB={prepare:native.prepare.bind(native),batch:async(statements:any[])=>{if(++arrivals===2)release();await ready;return native.batch(statements)}};
  const results:any[]=await Promise.all([submitCoachMiniTest(env,f.user,'test',f.answers(4)),submitCoachMiniTest(env,f.user,'test',f.answers(0))]);
  expect(results.map(r=>r.reused).sort()).toEqual([false,true]);expect(results[0].result).toEqual(results[1].result);
  expect(await native.prepare('SELECT cycle_count FROM student_outcome_mastery').first('cycle_count')).toBe(1);
  expect(await native.prepare('SELECT evidence_count FROM student_learning_state').first('evidence_count')).toBe(5);
  expect(await native.prepare('SELECT COUNT(*) n FROM assessment_responses').first('n')).toBe(5);
  expect(await native.prepare('SELECT COUNT(*) n FROM coach_mini_test_submissions').first('n')).toBe(1);
 }finally{f.db.close();await mf.dispose()}
},30000);
