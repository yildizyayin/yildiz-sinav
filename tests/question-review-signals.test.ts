import {DatabaseSync} from 'node:sqlite';
import {expect,it} from 'vitest';
import {loadScreening,screeningFor} from '../worker/lib/question-screening';
import {MAX_FAILED_JOBS_PER_OUTCOME,OUTCOME_RETRY_FILTER_SQL} from '../worker/lib/question-autonomous-queue';
import {orderForReview} from '../src/components/QuestionScreening';

const editorial=(o:Partial<Record<string,number>>={})=>({outcomeAlignment:4,reasoningDemand:4,distractorQuality:4,languageAndFairness:4,visualConsistency:4,originalityDesign:4,rationale:'Kazanımı doğrudan ölçüyor; çeldiriciler öğrenci hatalarına dayanıyor.',...o});
const details=(reviews:any[])=>({questionIds:['qa','qb'],verification:{model:'@cf/nvidia/nemotron-3-120b-a12b',reviews}});

it('reads the verifier scores of the right question in a job and flags weak dimensions',()=>{
 const d=details([{index:0,valid:true,issues:[],editorial:editorial()},{index:1,valid:true,issues:[],editorial:editorial({distractorQuality:3,reasoningDemand:3})}]);
 expect(screeningFor(d,'qa')).toMatchObject({total:24,max:24,suspicion:0,weakest:[]});
 expect(screeningFor(d,'qb')).toMatchObject({total:22,suspicion:2,weakest:['reasoningDemand','distractorQuality'],model:'@cf/nvidia/nemotron-3-120b-a12b'});
 expect(screeningFor(d,'unknown')).toBeNull();
 expect(screeningFor(details([{index:0,valid:true,issues:[]}]),'qa')).toBeNull();
 expect(screeningFor(details([{index:0,valid:true,issues:[],editorial:editorial({outcomeAlignment:9})}]),'qa')).toBeNull();
 expect(screeningFor(null,'qa')).toBeNull();
});

it('loads screening from the generation audit trail and tolerates broken records',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(`CREATE TABLE audit_logs(id TEXT,action TEXT,entity_type TEXT,entity_id TEXT,details_json TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  db.prepare(`INSERT INTO audit_logs(id,action,entity_type,entity_id,details_json) VALUES('a1','QUESTION_GENERATION_REVIEW_READY','question_generation_job','job1',?)`).run(JSON.stringify(details([{index:0,valid:true,issues:[],editorial:editorial({languageAndFairness:3})}])));
  db.prepare(`INSERT INTO audit_logs(id,action,entity_type,entity_id,details_json) VALUES('a2','QUESTION_GENERATION_REVIEW_READY','question_generation_job','job2','{broken')`).run();
  db.prepare(`INSERT INTO audit_logs(id,action,entity_type,entity_id,details_json) VALUES('a3','QUESTION_GENERATION_OUTPUT_BLOCKED','question_generation_job','job1','{}')`).run();
  const prepare=(sql:string,args:any[]=[]):any=>({bind:(...a:any[])=>prepare(sql,a),all:async()=>({results:db.prepare(sql).all(...args)})});
  const map=await loadScreening({DB:{prepare}} as any,[{id:'qa',source_job_id:'job1'},{id:'qx',source_job_id:'job2'},{id:'qm',source_job_id:null}]);
  expect([...map.keys()]).toEqual(['qa']);
  expect(map.get('qa')).toMatchObject({total:23,weakest:['languageAndFairness']});
  const broken=await loadScreening({DB:{prepare:()=>{throw new Error('no table')}}} as any,[{id:'qa',source_job_id:'job1'}]);
  expect(broken.size).toBe(0);
 }finally{db.close();}
});

it('puts the weakest questions in review first, keeps everything else in place, and can be switched off',()=>{
 const qs=[{id:'approved',review_status:'APPROVED'},{id:'clean',review_status:'REVIEW',screening:{suspicion:0}},{id:'weak',review_status:'REVIEW',screening:{suspicion:4}},{id:'none',review_status:'REVIEW'},{id:'mid',review_status:'REVIEW',screening:{suspicion:2}}];
 expect(orderForReview(qs,true).map(q=>q.id)).toEqual(['weak','mid','clean','none','approved']);
 expect(orderForReview(qs,false).map(q=>q.id)).toEqual(qs.map(q=>q.id));
});

it('retries a failed outcome in a fresh job until three failures, never while a job is queued or running',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(`CREATE TABLE outcomes(id TEXT,curriculum_version_id TEXT);CREATE TABLE curriculum_versions(id TEXT);CREATE TABLE question_generation_jobs(id TEXT,outcome_id TEXT,curriculum_version_id TEXT,status TEXT);
  INSERT INTO curriculum_versions VALUES('cv');INSERT INTO outcomes VALUES('fresh','cv'),('failed1','cv'),('failed3','cv'),('queued','cv'),('running','cv');
  INSERT INTO question_generation_jobs VALUES('j1','failed1','cv','FAILED'),('j2','failed3','cv','FAILED'),('j3','failed3','cv','FAILED'),('j4','failed3','cv','FAILED'),('j5','queued','cv','REQUESTED'),('j6','running','cv','RUNNING');`);
  const eligible=db.prepare(`SELECT o.id FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE ${OUTCOME_RETRY_FILTER_SQL} ORDER BY o.id`).all().map((r:any)=>r.id);
  expect(MAX_FAILED_JOBS_PER_OUTCOME).toBe(3);
  expect(eligible).toEqual(['failed1','fresh']);
 }finally{db.close();}
});
