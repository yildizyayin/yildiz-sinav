import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {expect,it,vi} from 'vitest';
vi.mock('../worker/lib/auth',()=>({getAuthUser:vi.fn(async()=>({id:'admin',role:'SUPER_ADMIN'}))}));
vi.mock('../worker/student-books-entry',()=>({default:{fetch:async()=>new Response('missing',{status:404})}}));
vi.mock('../worker/lib/question-content',()=>({hydrateQuestionMedia:async(_env:any,rows:any[])=>rows}));
vi.mock('../worker/lib/db',async()=>({...await vi.importActual<any>('../worker/lib/db'),audit:async()=>{}}));
import {reviewQuestionWithGate} from '../worker/lib/question-review';
import {handlePlatformOps} from '../worker/lib/platform-ops';
import {handlePlatformApi} from '../worker/lib/platform-expansion';
import standard from '../worker/question-bank-standard-entry';

const user={id:'admin',role:'SUPER_ADMIN'} as any;
const checks={answerAndSolution:true,curriculum:true,ageAppropriate:true,originalityAndRights:true};
function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE question_bank(id TEXT PRIMARY KEY,owner_type TEXT DEFAULT 'PLATFORM',owner_id TEXT,academic_year TEXT,grade_level INTEGER,subject_id TEXT,topic TEXT,subtopic TEXT,question_type TEXT,difficulty INTEGER DEFAULT 3,difficulty_level INTEGER DEFAULT 3,content_mode TEXT,option_count INTEGER,prior_grade_refs_json TEXT,lgs_probability REAL,yks_probability REAL,exam_5y_count INTEGER,stem_text TEXT,options_json TEXT,correct_answer TEXT,solution_text TEXT,source_label TEXT,copyright_status TEXT,review_status TEXT,created_by TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,origin_kind TEXT DEFAULT 'MANUAL',reviewed_by TEXT,reviewed_at TEXT,rejection_note TEXT);
 CREATE TABLE question_learning_links(question_id TEXT,node_id TEXT,PRIMARY KEY(question_id,node_id));
 CREATE TABLE question_assets(id TEXT PRIMARY KEY,question_id TEXT,external_url TEXT);
 CREATE TABLE question_content_blocks(id TEXT PRIMARY KEY,question_id TEXT,text_content TEXT);
 CREATE TABLE curriculum_versions(id TEXT,academic_year TEXT,grade_level INTEGER,verified INTEGER,program_version TEXT);
 CREATE TABLE outcomes(id TEXT,code TEXT,title TEXT,curriculum_version_id TEXT,grade_level INTEGER,subject_id TEXT,active INTEGER);
 CREATE TABLE learning_nodes(id TEXT,active INTEGER);
 INSERT INTO curriculum_versions VALUES('cv','2026-2027',7,1,'synthetic-reviewed');
 INSERT INTO outcomes VALUES('o','O.1','Synthetic outcome','cv',7,'math',1);
 INSERT INTO learning_nodes VALUES('ln_o',1);`);
 db.exec(readFileSync(new URL('../migrations/0071_question_review_revision.sql',import.meta.url),'utf8'));
 db.prepare(`INSERT INTO question_bank(id,academic_year,grade_level,subject_id,question_type,option_count,stem_text,options_json,correct_answer,solution_text,source_label,copyright_status,review_status,origin_kind) VALUES('q','2026-2027',7,'math','MULTIPLE_CHOICE',4,'Synthetic question','["one","two","three","four"]','A','Synthetic solution','Synthetic provenance','OWNED','REVIEW','AI_GENERATED')`).run();
 db.exec(`INSERT INTO question_learning_links VALUES('q','ln_o')`);
 let beforeWrite:(()=>void)|undefined;
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...a:any[])=>{if(a.length>100)throw new Error('D1 maximum bound parameter count exceeded');return prepare(sql,a);},first:async()=>db.prepare(sql).get(...args),all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{if(sql.startsWith('UPDATE question_bank SET review_status=')&&beforeWrite){const f=beforeWrite;beforeWrite=undefined;f();}const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}};},sql,args});
 const env={DB:{prepare,batch:async(stmts:any[])=>{db.exec('BEGIN');try{const rs=stmts.map(s=>db.prepare(s.sql).run(...s.args));db.exec('COMMIT');return rs;}catch(e){db.exec('ROLLBACK');throw e;}}}} as any;
 const request=(body:any,path='/api/question-bank-standard/q/review',method='PATCH')=>new Request(`https://test${path}`,{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const revision=()=>Number(db.prepare(`SELECT review_revision FROM question_bank WHERE id='q'`).get()?.review_revision);
 const context=()=>db.prepare(`SELECT o.id,cv.id curriculumVersionId,o.subject_id,o.grade_level,cv.academic_year academicYear,cv.program_version programVersion,cv.verified FROM question_learning_links l JOIN outcomes o ON l.node_id='ln_'||o.id JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE l.question_id='q' ORDER BY o.id`).all();
 return {db,env,request,revision,context,race:(f:()=>void)=>{beforeWrite=f;}};
}
it('both review routes require explicit current-version AI review and validate rights/content/context',async()=>{
 const f=setup();try{
  expect((await handlePlatformOps(f.request({status:'APPROVED'},'/api/platform/questions/q/review'),f.env,user))?.status).toBe(409);
  const payload=()=>({status:'APPROVED',checks,expectedRevision:f.revision(),expectedContext:f.context()});
  expect((await standard.fetch(f.request({status:'APPROVED',expectedRevision:f.revision()}),f.env,{} as any)).status).toBe(400);
  expect((await standard.fetch(f.request({status:'APPROVED',expectedRevision:f.revision()},'/api/platform/questions/q/review'),f.env,{} as any)).status).toBe(400);
  f.db.exec(`UPDATE question_bank SET copyright_status='RESTRICTED' WHERE id='q'`);
  expect((await handlePlatformOps(f.request(payload(),'/api/platform/questions/q/review'),f.env,user))?.status).toBe(400);
  f.db.exec(`UPDATE question_bank SET copyright_status='OWNED',correct_answer='E' WHERE id='q'`);
  expect((await reviewQuestionWithGate(f.request(payload()),f.env,user,'q')).status).toBe(400);
  f.db.exec(`UPDATE question_bank SET correct_answer='A' WHERE id='q';UPDATE curriculum_versions SET verified=0`);
  expect((await reviewQuestionWithGate(f.request(payload()),f.env,user,'q')).status).toBe(400);
  f.db.exec(`UPDATE curriculum_versions SET verified=1`);
  expect((await standard.fetch(f.request(payload()),f.env,{} as any)).status).toBe(200);
  const row=f.db.prepare(`SELECT review_status,reviewed_by,review_checks_json FROM question_bank WHERE id='q'`).get();
  expect(row?.review_status).toBe('APPROVED');expect(row?.reviewed_by).toBe('admin');expect(JSON.parse(String(row?.review_checks_json))).toEqual(checks);
 }finally{f.db.close();}
});
it('bounds AI curriculum review to fifteen references within D1 hundred-parameter limit',async()=>{
 const f=setup();try{
  for(let i=2;i<=15;i++){f.db.prepare(`INSERT INTO outcomes VALUES(?,?,'Synthetic outcome','cv',7,'math',1)`).run(`o${i}`,`O.${i}`);f.db.prepare(`INSERT INTO question_learning_links VALUES('q',?)`).run(`ln_o${i}`);}
  expect((await reviewQuestionWithGate(f.request({status:'APPROVED',checks,expectedRevision:f.revision(),expectedContext:f.context()}),f.env,user,'q')).status).toBe(200);
  f.db.exec(`INSERT INTO outcomes VALUES('o16','O.16','Synthetic outcome','cv',7,'math',1);INSERT INTO question_learning_links VALUES('q','ln_o16')`);
  expect((await reviewQuestionWithGate(f.request({status:'APPROVED',checks,expectedRevision:f.revision(),expectedContext:f.context()}),f.env,user,'q')).status).toBe(400);
 }finally{f.db.close();}
});
it('rejects AI null, mismatched year/grade/subject and inactive outcome scope',async()=>{
 const f=setup();try{
  for(const mutation of [`UPDATE question_bank SET grade_level=NULL WHERE id='q';UPDATE curriculum_versions SET grade_level=NULL;UPDATE outcomes SET grade_level=NULL`,
   `UPDATE question_bank SET academic_year='2026-2028' WHERE id='q'`,
   `UPDATE question_bank SET subject_id='other' WHERE id='q'`,
   `UPDATE outcomes SET active=0`]){
   f.db.exec(mutation);
   expect((await reviewQuestionWithGate(f.request({status:'APPROVED',checks,expectedRevision:f.revision(),expectedContext:f.context()}),f.env,user,'q')).status).toBe(400);
   f.db.exec(`UPDATE question_bank SET grade_level=7,academic_year='2026-2027',subject_id='math' WHERE id='q';UPDATE curriculum_versions SET grade_level=7;UPDATE outcomes SET grade_level=7,active=1`);
  }
 }finally{f.db.close();}
});
it('rejects a displayed curriculum witness when program changes before the review request',async()=>{
 const f=setup();try{
  const expectedRevision=f.revision(),expectedContext=f.context();
  f.db.exec(`UPDATE curriculum_versions SET program_version='new displayed program'`);
  expect(f.revision()).toBe(expectedRevision);
  const response=await reviewQuestionWithGate(f.request({status:'APPROVED',checks,expectedRevision,expectedContext}),f.env,user,'q');
  expect(response.status).toBe(409);expect((await response.json() as any).error.code).toBe('QUESTION_REVIEW_CONTEXT_CHANGED');
  expect(f.db.prepare(`SELECT review_status FROM question_bank WHERE id='q'`).get()?.review_status).toBe('REVIEW');
  expect((await reviewQuestionWithGate(f.request({status:'APPROVED',checks,expectedRevision,expectedContext:f.context()}),f.env,user,'q')).status).toBe(200);
 }finally{f.db.close();}
});
it('invalidates approval on late media changes and revisions both questions on media reassignment',async()=>{
 const f=setup();try{
  f.race(()=>f.db.exec(`INSERT INTO question_assets VALUES('asset','q','https://example.invalid/new-image')`));
  expect((await reviewQuestionWithGate(f.request({status:'APPROVED',checks,expectedRevision:f.revision(),expectedContext:f.context()}),f.env,user,'q')).status).toBe(409);
  expect(f.db.prepare(`SELECT review_status FROM question_bank WHERE id='q'`).get()?.review_status).toBe('REVIEW');
  f.db.exec(`INSERT INTO question_bank(id) VALUES('other')`);
  for(const table of ['question_assets','question_content_blocks']){
   if(table==='question_content_blocks')f.db.exec(`INSERT INTO question_content_blocks VALUES('block','q','old content')`);
   const oldQ=f.revision(),otherRevision=Number(f.db.prepare(`SELECT review_revision FROM question_bank WHERE id='other'`).get()?.review_revision);
   f.db.exec(`UPDATE ${table} SET question_id='other'`);
   expect(f.revision()).toBe(oldQ+1);
   expect(Number(f.db.prepare(`SELECT review_revision FROM question_bank WHERE id='other'`).get()?.review_revision)).toBe(otherRevision+1);
   const beforeDelete=Number(f.db.prepare(`SELECT review_revision FROM question_bank WHERE id='other'`).get()?.review_revision);
   f.db.exec(`DELETE FROM ${table}`);
   expect(Number(f.db.prepare(`SELECT review_revision FROM question_bank WHERE id='other'`).get()?.review_revision)).toBe(beforeDelete+1);
  }
 }finally{f.db.close();}
});
it('rejects content, mapping and program changes during approval and stops AI downgrade/keepApproved',async()=>{
 const f=setup();try{
  for(const sql of [`UPDATE question_bank SET solution_text='changed' WHERE id='q'`,`UPDATE curriculum_versions SET program_version='changed'`,`DELETE FROM question_learning_links WHERE question_id='q'`]){
   f.race(()=>f.db.exec(sql));
   expect((await reviewQuestionWithGate(f.request({status:'APPROVED',checks,expectedRevision:f.revision(),expectedContext:f.context()}),f.env,user,'q')).status).toBe(409);
  }
  expect((await standard.fetch(f.request({originKind:'MANUAL',keepApproved:true},'/api/question-bank-standard/q'),f.env,{} as any)).status).toBe(400);
  f.db.exec(`UPDATE question_bank SET review_status='APPROVED' WHERE id='q'`);
  expect((await standard.fetch(f.request({keepApproved:true,sourceLabel:'new source'},'/api/question-bank-standard/q'),f.env,{} as any)).status).toBe(200);
  expect(f.db.prepare(`SELECT review_status FROM question_bank WHERE id='q'`).get()?.review_status).toBe('REVIEW');
 }finally{f.db.close();}
});
it('uploads explicit AI aliases into REVIEW while valid manual OWNED uploads retain existing automatic approval',async()=>{
 const f=setup();try{
  const base={stemText:'A fresh synthetic question',options:['one','two','three','four'],correctAnswer:'A',solutionText:'Explanation',sourceLabel:'Provenance',copyrightStatus:'OWNED',gradeLevel:7,subjectId:'math',nodeIds:['ln_o']};
  for(const [originKind,expected] of [['AI_DRAFT','REVIEW'],['MANUAL','APPROVED']]){
   const response=await handlePlatformApi(f.request({...base,originKind},'/api/platform/questions','POST'),f.env,user);
   expect(response?.status).toBe(201);const body:any=await response!.json();
   const row=f.db.prepare(`SELECT origin_kind,review_status FROM question_bank WHERE id=?`).get(body.id);
   expect(row?.review_status).toBe(expected);expect(row?.origin_kind).toBe(originKind==='MANUAL'?'MANUAL':'AI_GENERATED');
  }
 }finally{f.db.close();}
});

it('uses native D1 trigger-inclusive change counts without misreporting committed approval or allowing a stale write',async()=>{
 const {Miniflare,convertV4MiniflareOptions}=await import('miniflare');
 const mf=new Miniflare(convertV4MiniflareOptions({name:'question-review-gate',modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-09-01',d1Databases:['DB']}));
 const f=setup();try{
  const native=await mf.getD1Database('DB');
  const tables=f.db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all();
  await native.batch(tables.map(t=>native.prepare(String(t.sql))));
  for(const table of tables){const rows=f.db.prepare(`SELECT * FROM ${table.name}`).all();if(rows.length)await native.batch(rows.map(row=>native.prepare(`INSERT INTO ${table.name}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).bind(...Object.values(row))));}
  const triggers=f.db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' ORDER BY rowid").all();
  await native.batch(triggers.map(t=>native.prepare(String(t.sql))));
  const changes:number[]=[];let beforeWrite:(()=>Promise<void>)|undefined;
  const wrap=(sql:string,statement:any):any=>({bind:(...args:any[])=>wrap(sql,statement.bind(...args)),first:statement.first.bind(statement),all:statement.all.bind(statement),run:async()=>{if(sql.startsWith('UPDATE question_bank')&&beforeWrite){const fn=beforeWrite;beforeWrite=undefined;await fn();}const r=await statement.run();changes.push(Number(r.meta.changes));return r;}});
  const env={DB:{prepare:(sql:string)=>wrap(sql,native.prepare(sql))}} as any;
  const body={status:'APPROVED',checks,expectedRevision:f.revision(),expectedContext:f.context()};
  const approved=await standard.fetch(f.request(body,'/api/platform/questions/q/review'),env,{} as any);
  expect(changes).toContain(2);expect(approved.status).toBe(200);
  expect(await native.prepare("SELECT review_status FROM question_bank WHERE id='q'").first('review_status')).toBe('APPROVED');
  expect((await standard.fetch(f.request(body),env,{} as any)).status).toBe(409);
  expect((await standard.fetch(f.request({sourceLabel:'New human provenance'},'/api/question-bank-standard/q'),env,{} as any)).status).toBe(200);
  expect(await native.prepare("SELECT review_status FROM question_bank WHERE id='q'").first('review_status')).toBe('REVIEW');
  const expectedRevision=await native.prepare("SELECT review_revision FROM question_bank WHERE id='q'").first('review_revision');
  beforeWrite=async()=>{await native.prepare("UPDATE question_bank SET solution_text='Concurrent edit' WHERE id='q'").run();};
  const raced=await standard.fetch(f.request({...body,expectedRevision}),env,{} as any);
  expect(raced.status).toBe(409);expect(changes.at(-1)).toBe(0);
  expect(await native.prepare("SELECT review_status FROM question_bank WHERE id='q'").first('review_status')).toBe('REVIEW');
 }finally{f.db.close();await mf.dispose();}
},30000);
