import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { handleQuestionGenerationRunner } from '../worker/lib/question-generation-runner';

const admin={id:'admin',role:'SUPER_ADMIN'} as any;
function fixture(aiResponse:any){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE users(id TEXT PRIMARY KEY);CREATE TABLE subjects(id TEXT PRIMARY KEY);
 CREATE TABLE curriculum_versions(id TEXT PRIMARY KEY,academic_year TEXT,grade_level INTEGER,program_version TEXT,verified INTEGER);
 CREATE TABLE outcomes(id TEXT PRIMARY KEY,curriculum_version_id TEXT,subject_id TEXT,grade_level INTEGER,code TEXT,title TEXT,active INTEGER);
 CREATE TABLE learning_nodes(id TEXT PRIMARY KEY);
 CREATE TABLE question_bank(
  id TEXT PRIMARY KEY,owner_type TEXT,owner_id TEXT,academic_year TEXT,grade_level INTEGER,subject_id TEXT,
  topic TEXT,subtopic TEXT,question_type TEXT,difficulty INTEGER,difficulty_level INTEGER,stem_text TEXT NOT NULL,
  options_json TEXT,correct_answer TEXT,solution_text TEXT,source_label TEXT,copyright_status TEXT,review_status TEXT,
  created_by TEXT,origin_kind TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP
 );
 CREATE TABLE question_learning_links(question_id TEXT REFERENCES question_bank(id) ON DELETE CASCADE,node_id TEXT REFERENCES learning_nodes(id),weight REAL,PRIMARY KEY(question_id,node_id));
 INSERT INTO users VALUES('admin');INSERT INTO subjects VALUES('math');
 INSERT INTO curriculum_versions VALUES('cv','2026-2027',7,'v1',1);
 INSERT INTO outcomes VALUES('o','cv','math',7,'M.7.1','Oran ve orantı problemlerini çözer',1);INSERT INTO learning_nodes VALUES('ln_o');
 `);
 sqlite.exec(readFileSync(new URL('../migrations/0072_question_generation_jobs.sql',import.meta.url),'utf8'));
 sqlite.exec(readFileSync(new URL('../migrations/0073_question_generation_runner.sql',import.meta.url),'utf8'));
 sqlite.exec(`INSERT INTO question_generation_jobs(id,request_key,outcome_id,curriculum_version_id,academic_year,grade_level,subject_id,program_version,outcome_code,outcome_title,question_count,requested_by)
 VALUES('job','00000000-0000-4000-8000-000000000001','o','cv','2026-2027',7,'math','v1','M.7.1','Oran ve orantı problemlerini çözer',2,'admin')`);
 const prepare=(sql:string,args:any[]=[]):any=>({
  bind:(...bound:any[])=>prepare(sql,bound),first:async()=>sqlite.prepare(sql).get(...args),all:async()=>({results:sqlite.prepare(sql).all(...args)}),
  run:async()=>{const r=sqlite.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}
 });
 let aiCalls=0;
 const env:any={DB:{prepare,batch:async(statements:any[])=>{sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec('COMMIT');return out}catch(e){sqlite.exec('ROLLBACK');throw e}}},AI:{run:async()=>{aiCalls++;return aiResponse}}};
 const call=()=>handleQuestionGenerationRunner(new Request('https://test/api/question-bank-standard/generation-jobs/job/run',{method:'POST'}),env,admin)!;
 return{sqlite,env,call,getAiCalls:()=>aiCalls};
}
const good={response:JSON.stringify({questions:[
 {stemText:'Bir sınıfta kızların erkeklere oranı 3 bölü 4 tür. Toplam 28 öğrenci olduğuna göre kaç kız öğrenci vardır?',options:['10','12','14','16'],correctAnswer:'B',solutionText:'Toplam oran birimi 7 dir. 28 bölü 7 eşittir 4 ve kız sayısı 3 çarpı 4 eşittir 12 dir.',difficulty:3},
 {stemText:'Bir tarifte un ile şeker oranı 5 bölü 2 dir. 350 gram un kullanılırsa aynı oran için kaç gram şeker gerekir?',options:['120','130','140','150'],correctAnswer:'C',solutionText:'350 gram 5 oran birimine karşılık gelir. Bir birim 70 gramdır ve şeker 2 birim olduğundan 140 gram gerekir.',difficulty:2}
]})};

it('leases one request and atomically persists AI drafts as REVIEW with lineage, never APPROVED',async()=>{
 const f=fixture(good);try{
  const response=await f.call();expect(response.status).toBe(200);const body:any=await response.json();expect(body).toMatchObject({ok:true,reused:false,status:'COMPLETED',reviewStatus:'REVIEW'});
  expect(f.sqlite.prepare(`SELECT COUNT(*) n FROM question_bank WHERE review_status='REVIEW' AND origin_kind='AI_GENERATED'`).get()?.n).toBe(2);
  expect(f.sqlite.prepare(`SELECT COUNT(*) n FROM question_bank WHERE review_status='APPROVED'`).get()?.n).toBe(0);
  expect(f.sqlite.prepare(`SELECT COUNT(*) n FROM question_learning_links WHERE node_id='ln_o'`).get()?.n).toBe(2);
  expect(f.sqlite.prepare(`SELECT COUNT(*) n FROM question_generation_lineage WHERE job_id='job'`).get()?.n).toBe(2);
  expect(f.sqlite.prepare(`SELECT execution_status FROM question_generation_jobs WHERE id='job'`).get()?.execution_status).toBe('COMPLETED');
  const replay:any=await (await f.call()).json();expect(replay).toMatchObject({ok:true,reused:true,status:'COMPLETED'});expect(f.getAiCalls()).toBe(1);
 }finally{f.sqlite.close();}
});

it('rejects invalid provider schema without persisting a partial question and leaves a safe retry state',async()=>{
 const f=fixture({response:'{"questions":[{"stemText":"short"}]}' });try{
  const response=await f.call();expect(response.status).toBe(502);
  expect(f.sqlite.prepare('SELECT COUNT(*) n FROM question_bank').get()?.n).toBe(0);
  expect(f.sqlite.prepare(`SELECT execution_status,last_error FROM question_generation_jobs WHERE id='job'`).get()).toMatchObject({execution_status:'RETRY',last_error:'AI_SCHEMA_INVALID'});
 }finally{f.sqlite.close();}
});

it('rechecks frozen curriculum context before calling AI',async()=>{
 const f=fixture(good);try{
  f.sqlite.exec(`UPDATE curriculum_versions SET verified=0 WHERE id='cv'`);const response=await f.call();expect(response.status).toBe(409);expect(f.getAiCalls()).toBe(0);
  expect(f.sqlite.prepare('SELECT COUNT(*) n FROM question_bank').get()?.n).toBe(0);
  expect(f.sqlite.prepare(`SELECT execution_status,last_error FROM question_generation_jobs WHERE id='job'`).get()).toMatchObject({execution_status:'RETRY',last_error:'GENERATION_CONTEXT_CHANGED'});
 }finally{f.sqlite.close();}
});

it('blocks a near-duplicate against the existing scoped pool',async()=>{
 const f=fixture(good);try{
  f.sqlite.prepare(`INSERT INTO question_bank(id,academic_year,grade_level,subject_id,stem_text,review_status) VALUES('existing','2026-2027',7,'math',?,'APPROVED')`).run('Bir sınıfta kızların erkeklere oranı 3 bölü 4 tür. Toplam 28 öğrenci olduğuna göre kaç kız öğrenci vardır?');
  const response=await f.call();expect(response.status).toBe(409);expect(f.sqlite.prepare(`SELECT COUNT(*) n FROM question_generation_lineage`).get()?.n).toBe(0);
  expect(f.sqlite.prepare(`SELECT execution_status,last_error FROM question_generation_jobs WHERE id='job'`).get()).toMatchObject({execution_status:'RETRY',last_error:'AI_SEMANTIC_DUPLICATE'});
 }finally{f.sqlite.close();}
});
