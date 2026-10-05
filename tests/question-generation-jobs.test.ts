import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { handleQuestionGenerationJobs } from '../worker/lib/question-generation-jobs';

const admin = { id: 'admin', role: 'SUPER_ADMIN' } as any;
const teacher = { id: 'teacher', role: 'TEACHER' } as any;
const base = '/api/question-bank-standard/generation-jobs';
const expectedContext = {curriculumVersionId:'cv',academicYear:'2026-2027',gradeLevel:7,subjectId:'math',programVersion:'v1'};
let keyCounter = 0;
const key = () => `00000000-0000-4000-8000-${String(++keyCounter).padStart(12,'0')}`;
const request = (body:any, path=base, method='POST') => new Request(`https://test${path}`,{
  method,headers:{'content-type':'application/json'},...(method === 'POST' ? {body:JSON.stringify(body)} : {}),
});
const payload = (requestKey=key(),questionCount=3) => ({outcomeId:'o',expectedContext,requestKey,questionCount});
function fixture(){
 const sqlite = new DatabaseSync(':memory:');
 sqlite.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE users(id TEXT PRIMARY KEY);
 CREATE TABLE subjects(id TEXT PRIMARY KEY);
 CREATE TABLE curriculum_versions(id TEXT PRIMARY KEY,academic_year TEXT,grade_level INTEGER,program_version TEXT,verified INTEGER);
 CREATE TABLE outcomes(id TEXT PRIMARY KEY,curriculum_version_id TEXT,subject_id TEXT,grade_level INTEGER,code TEXT,title TEXT,active INTEGER);
 CREATE TABLE learning_nodes(id TEXT PRIMARY KEY,active INTEGER DEFAULT 1,node_type TEXT DEFAULT 'OUTCOME',academic_year TEXT DEFAULT '2026-2027',grade_level INTEGER DEFAULT 7,subject_id TEXT DEFAULT 'math');
 CREATE TABLE question_bank(id TEXT PRIMARY KEY,owner_type TEXT,academic_year TEXT,grade_level INTEGER,subject_id TEXT,question_type TEXT,difficulty INTEGER,difficulty_level INTEGER,content_mode TEXT,option_count INTEGER,stem_text TEXT,options_json TEXT,correct_answer TEXT,solution_text TEXT,source_label TEXT,copyright_status TEXT,review_status TEXT,created_by TEXT,origin_kind TEXT,review_revision INTEGER DEFAULT 0);
 CREATE TABLE question_learning_links(question_id TEXT REFERENCES question_bank(id),node_id TEXT REFERENCES learning_nodes(id),PRIMARY KEY(question_id,node_id));
 CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_user_id TEXT,institution_id TEXT,action TEXT,entity_type TEXT,entity_id TEXT,details_json TEXT);
 INSERT INTO users VALUES('admin'),('teacher'); INSERT INTO subjects VALUES('math'),('other');
 INSERT INTO curriculum_versions VALUES('cv','2026-2027',7,'v1',1),('cv2','2026-2027',7,'v2',1);
 INSERT INTO outcomes VALUES('o','cv','math',7,'M.7.1','Synthetic outcome',1);
 INSERT INTO outcomes VALUES('o2','cv2','math',7,'M.7.2','Other outcome',1);
 INSERT INTO learning_nodes(id) VALUES('ln_o'),('ln_o2');
 `);
 sqlite.exec(readFileSync(new URL('../migrations/0072_question_generation_jobs.sql',import.meta.url),'utf8'));
 sqlite.exec(readFileSync(new URL('../migrations/0073_question_generation_runner.sql',import.meta.url),'utf8'));
 let beforeInsert:(()=>void)|undefined;
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...bound:any[])=>prepare(sql,bound),
  first:async()=>sqlite.prepare(sql).get(...args),
  all:async()=>({results:sqlite.prepare(sql).all(...args)}),
  run:async()=>{if(sql.includes('INSERT OR IGNORE INTO question_generation_jobs')&&beforeInsert){const fn=beforeInsert;beforeInsert=undefined;fn();}
   const result=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:Number(result.changes)}};}});
 const env={DB:{prepare}} as any;
 const call=(req:Request,user:any=admin)=>handleQuestionGenerationJobs(req,env,user)!;
 return {sqlite,env,call,race:(fn:()=>void)=>{beforeInsert=fn;}};
}

it('records an immutable, explicit outcome request and idempotent retries without private request key in response',async()=>{
 const f=fixture();try{
  const p=payload();const created=await f.call(request(p));expect(created.status).toBe(201);
  const first:any=await created.json();
  expect(first).toMatchObject({ok:true,reused:false,job:{outcomeId:'o',status:'REQUESTED',questionCount:3,
   context:{...expectedContext,outcomeCode:'M.7.1',outcomeTitle:'Synthetic outcome'}}});
  expect(JSON.stringify(first)).not.toContain(p.requestKey);
  const retry:any=await (await f.call(request(p))).json();expect(retry).toMatchObject({reused:true,job:{id:first.job.id}});
  expect((await f.call(request({...p,questionCount:4}))).status).toBe(409);
  expect((await f.call(request(payload(key(),4)))).status).toBe(409);
  expect(f.sqlite.prepare('SELECT count(*) n FROM question_generation_jobs').get()?.n).toBe(1);
  const list:any=await (await f.call(request(null,`${base}?academicYear=2026-2027&limit=1`,'GET'))).json();
  expect(list).toMatchObject({jobs:[{id:first.job.id}],nextCursor:null});
  expect((await f.call(request(null,base,'GET'))).status).toBe(400);
  expect((await f.call(request(null,`${base}?academicYear=2026-2027&limit=51`,'GET'))).status).toBe(400);
  expect((await f.call(request(null,`${base}?academicYear=2026-2027&limit=1e1`,'GET'))).status).toBe(400);
  expect((await f.call(request(null,`${base}?academicYear=2026-2029`,'GET'))).status).toBe(400);
  expect((await f.call(request(null,`${base}?academicYear=2026-2027&status=GENERATED`,'GET'))).status).toBe(400);
  const active:any=await (await f.call(request(null,`${base}?academicYear=2026-2027&status=REQUESTED`,'GET'))).json();
  expect(active.jobs).toHaveLength(1);
  expect((await f.call(request(null,`${base}/${first.job.id}/cancel`,'PATCH'))).status).toBe(200);
  const cancellation = f.sqlite.prepare('SELECT cancelled_at,cancelled_by FROM question_generation_jobs WHERE id=?').get(first.job.id);
  await f.call(request(null,`${base}/${first.job.id}/cancel`,'PATCH'));
  expect(f.sqlite.prepare('SELECT cancelled_at,cancelled_by FROM question_generation_jobs WHERE id=?').get(first.job.id)).toEqual(cancellation);
  expect((await f.call(request(payload(key(),4)))).status).toBe(201);
  const retryCancelled:any=await (await f.call(request(p))).json();expect(retryCancelled.job.status).toBe('CANCELLED');
  const cancelled:any=await (await f.call(request(null,`${base}?academicYear=2026-2027&status=CANCELLED`,'GET'))).json();
  expect(cancelled.jobs.map((job:any)=>job.id)).toEqual([first.job.id]);
 }finally{f.sqlite.close();}
});

it('rejects missing and foreign roles before reads or writes',async()=>{
 const f=fixture();try{
  for(const user of [null,teacher]){
   expect((await f.call(request(payload()),user)).status).toBe(user?403:401);
   expect((await f.call(request(null,`${base}?academicYear=2026-2027`,'GET'),user)).status).toBe(user?403:401);
   expect((await f.call(request(null,`${base}/x/cancel`,'PATCH'),user)).status).toBe(user?403:401);
  }
  expect(f.sqlite.prepare('SELECT count(*) n FROM question_generation_jobs').get()?.n).toBe(0);
 }finally{f.sqlite.close();}
});

it('validates count, key, year, grade, subject, version and active/verified state',async()=>{
 const f=fixture();try{
  for(const questionCount of [0,11,2.5,'3'])expect((await f.call(request(payload(key(),questionCount as number)))).status).toBe(400);
  expect((await f.call(request({...payload(),requestKey:'chosen-name'}))).status).toBe(400);
  expect((await f.call(request({...payload(),outcomeId:'x'.repeat(101)}))).status).toBe(400);
  expect((await f.call(request({...payload(),expectedContext:{...expectedContext,academicYear:'2026-2029'}}))).status).toBe(400);
  expect((await f.call(request({...payload(),expectedContext:{...expectedContext,subjectId:'s'.repeat(101)}}))).status).toBe(400);
  expect((await f.call(request({...payload(),expectedContext:{...expectedContext,programVersion:'v'.repeat(201)}}))).status).toBe(400);
  for(const [field,value] of [['academicYear','2027-2028'],['gradeLevel',8],['subjectId','other'],['programVersion','v2'],['curriculumVersionId','cv2']] as const){
   const p=payload();expect((await f.call(request({...p,expectedContext:{...expectedContext,[field]:value}}))).status).toBe(409);
  }
  for(const [bad,reset] of [
   [`UPDATE outcomes SET active=0 WHERE id='o'`,`UPDATE outcomes SET active=1 WHERE id='o'`],
   [`UPDATE curriculum_versions SET verified=0 WHERE id='cv'`,`UPDATE curriculum_versions SET verified=1 WHERE id='cv'`],
   [`UPDATE outcomes SET grade_level=8 WHERE id='o'`,`UPDATE outcomes SET grade_level=7 WHERE id='o'`],
  ]){f.sqlite.exec(bad);expect((await f.call(request(payload()))).status).toBe(409);f.sqlite.exec(reset);}
  expect(f.sqlite.prepare('SELECT count(*) n FROM question_generation_jobs').get()?.n).toBe(0);
 }finally{f.sqlite.close();}
});

it('fences a late context or label mutation in the conditional INSERT',async()=>{
 for(const sql of [`UPDATE outcomes SET title='Changed' WHERE id='o'`,`UPDATE outcomes SET code='Changed' WHERE id='o'`,
   `UPDATE outcomes SET active=0 WHERE id='o'`,`UPDATE curriculum_versions SET verified=0 WHERE id='cv'`,
   `UPDATE curriculum_versions SET program_version='v2' WHERE id='cv'`,
   `UPDATE curriculum_versions SET academic_year='2027-2028' WHERE id='cv'`]){
  const f=fixture();try{
   f.race(()=>f.sqlite.exec(sql));
   const result=await f.call(request(payload()));expect(result.status,sql).toBe(409);
   expect(f.sqlite.prepare('SELECT count(*) n FROM question_generation_jobs').get()?.n).toBe(0);
  }finally{f.sqlite.close();}
 }
});

it('lets the database arbitrate simultaneous active requests and pages by year, outcome, and cursor',async()=>{
 const f=fixture();try{
  const a=payload(),b=payload();
  f.race(()=>f.sqlite.prepare(`INSERT INTO question_generation_jobs
   (id,request_key,outcome_id,curriculum_version_id,academic_year,grade_level,subject_id,program_version,outcome_code,outcome_title,question_count,requested_by)
   VALUES('competing',?,'o','cv','2026-2027',7,'math','v1','M.7.1','Synthetic outcome',3,'admin')`).run(b.requestKey));
  expect((await f.call(request(a))).status).toBe(409);
  expect((await f.call(request(b))).status).toBe(200);
  const second=await f.call(request({...payload(),outcomeId:'o2',expectedContext:{...expectedContext,curriculumVersionId:'cv2',programVersion:'v2'}}));
  expect(second.status).toBe(201);
  const page:any=await (await f.call(request(null,`${base}?academicYear=2026-2027&limit=1`,'GET'))).json();
  expect(page.jobs).toHaveLength(1);expect(page.nextCursor).toBe(page.jobs[0].id);
  const next:any=await (await f.call(request(null,`${base}?academicYear=2026-2027&limit=1&cursor=${page.nextCursor}`,'GET'))).json();
  expect(next.jobs).toHaveLength(1);expect(next.jobs[0].id).not.toBe(page.jobs[0].id);
  const scoped:any=await (await f.call(request(null,`${base}?academicYear=2026-2027&outcomeId=o2`,'GET'))).json();
  expect(scoped.jobs.map((job:any)=>job.outcomeId)).toEqual(['o2']);
 }finally{f.sqlite.close();}
});

it('commits exactly one request under native D1 and reuses its key after cancellation',async()=>{
 const { Miniflare, convertV4MiniflareOptions } = await import('miniflare');
 const mf = new Miniflare(convertV4MiniflareOptions({name:'question-generation-jobs',modules:true,
  script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-09-01',d1Databases:['DB']}));
 try{
  const db=await mf.getD1Database('DB');
  await db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY); CREATE TABLE subjects(id TEXT PRIMARY KEY);
   CREATE TABLE curriculum_versions(id TEXT PRIMARY KEY,academic_year TEXT,grade_level INTEGER,program_version TEXT,verified INTEGER);
   CREATE TABLE outcomes(id TEXT PRIMARY KEY,curriculum_version_id TEXT,subject_id TEXT,grade_level INTEGER,code TEXT,title TEXT,active INTEGER);`);
  await db.exec(`INSERT INTO users VALUES('admin'); INSERT INTO subjects VALUES('math');
   INSERT INTO curriculum_versions VALUES('cv','2026-2027',7,'v1',1);
   INSERT INTO outcomes VALUES('o','cv','math',7,'M.7.1','Native outcome',1);`);
  await db.exec(`CREATE TABLE learning_nodes(id TEXT PRIMARY KEY,active INTEGER DEFAULT 1,node_type TEXT DEFAULT 'OUTCOME',academic_year TEXT DEFAULT '2026-2027',grade_level INTEGER DEFAULT 7,subject_id TEXT DEFAULT 'math');
   CREATE TABLE question_bank(id TEXT PRIMARY KEY,owner_type TEXT,academic_year TEXT,grade_level INTEGER,subject_id TEXT,question_type TEXT,difficulty INTEGER,difficulty_level INTEGER,content_mode TEXT,option_count INTEGER,stem_text TEXT,options_json TEXT,correct_answer TEXT,solution_text TEXT,source_label TEXT,copyright_status TEXT,review_status TEXT,created_by TEXT,origin_kind TEXT,review_revision INTEGER DEFAULT 0);
   CREATE TABLE question_learning_links(question_id TEXT REFERENCES question_bank(id),node_id TEXT REFERENCES learning_nodes(id),PRIMARY KEY(question_id,node_id));
   CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_user_id TEXT,institution_id TEXT,action TEXT,entity_type TEXT,entity_id TEXT,details_json TEXT);
   INSERT INTO learning_nodes(id) VALUES('ln_o');`);
  await db.exec(readFileSync(new URL('../migrations/0072_question_generation_jobs.sql',import.meta.url),'utf8').replace(/^--.*$/gm,'').replace(/\n/g,' '));
  await db.exec(readFileSync(new URL('../migrations/0073_question_generation_runner.sql',import.meta.url),'utf8').replace(/^--.*$/gm,'').replace(/\n/g,' '));
  const env={DB:db} as any,p=payload();
  const call=(req:Request)=>handleQuestionGenerationJobs(req,env,admin)!;
  const simultaneous=await Promise.all([call(request(p)),call(request(p))]);
  expect(simultaneous.map(response=>response.status).sort()).toEqual([200,201]);
  const bodies:any[]=await Promise.all(simultaneous.map(response=>response.json()));
  expect(bodies.map(body=>body.reused).sort()).toEqual([false,true]);
  expect(bodies[0].job.id).toBe(bodies[1].job.id);
  const job:any=bodies[0].job;
  expect((await db.prepare('SELECT COUNT(*) n FROM question_generation_jobs').first<any>())?.n).toBe(1);
  expect((await call(request(p))).status).toBe(200);
  expect((await call(request(payload()))).status).toBe(409);
  expect((await call(request(null,`${base}/${job.id}/cancel`,'PATCH'))).status).toBe(200);
  expect((await call(request(p))).status).toBe(200);
  expect((await db.prepare('SELECT status FROM question_generation_jobs WHERE id=?').bind(job.id).first<any>())?.status).toBe('CANCELLED');
  const differentKeys=await Promise.all([call(request(payload())),call(request(payload()))]);
  expect(differentKeys.map(response=>response.status).sort()).toEqual([201,409]);
  expect(await db.prepare("SELECT COUNT(*) n FROM question_generation_jobs WHERE status='REQUESTED'").first('n')).toBe(1);
 }finally{await mf.dispose();}
});
