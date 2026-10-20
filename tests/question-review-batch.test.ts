import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {expect,it,vi} from 'vitest';
vi.mock('../worker/lib/auth',()=>({getAuthUser:vi.fn(async()=>({id:'admin',role:'SUPER_ADMIN'}))}));
vi.mock('../worker/student-books-entry',()=>({default:{fetch:async()=>new Response('missing',{status:404})}}));
vi.mock('../worker/lib/question-content',()=>({hydrateQuestionMedia:async(_env:any,rows:any[])=>rows}));
vi.mock('../worker/lib/db',async()=>({...await vi.importActual<any>('../worker/lib/db'),audit:async()=>{}}));
import {REVIEW_BATCH_MAX} from "../worker/lib/question-review-batch";
import standard from '../worker/question-bank-standard-entry';

const user={id:'admin',role:'SUPER_ADMIN'} as any;
const checks={answerAndSolution:true,curriculum:true,ageAppropriate:true,originalityAndRights:true};
const qualityReview={outcomeAlignment:'The item directly assesses the linked learning outcome.',languageAndDistractors:'Wording is clear and distractors are plausible and distinct.',duplicateDisposition:'NO_REPETITION_FOUND',duplicateRationale:'No materially repeated item was found in the reviewed set.'};
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
const clone=(db:any,id:string,patch:string='')=>{db.exec(`INSERT INTO question_bank(id,academic_year,grade_level,subject_id,question_type,option_count,stem_text,options_json,correct_answer,solution_text,source_label,copyright_status,review_status,origin_kind) SELECT '${id}',academic_year,grade_level,subject_id,question_type,option_count,stem_text||' ${id}',options_json,correct_answer,solution_text,source_label,copyright_status,review_status,origin_kind FROM question_bank WHERE id='q';INSERT INTO question_learning_links VALUES('${id}','ln_o');${patch}`);};
const item=(f:any,id:string)=>({id,expectedRevision:Number(f.db.prepare('SELECT review_revision FROM question_bank WHERE id=?').get(id)?.review_revision),expectedContext:f.context()});
const batch=(f:any,body:any)=>standard.fetch(f.request(body,'/api/question-bank-standard/review-batch','POST'),f.env,{} as any);
const row=(f:any,id:string)=>f.db.prepare('SELECT review_status,reviewed_by,review_checks_json,rejection_note FROM question_bank WHERE id=?').get(id);

it('approves many AI questions in one action, each through its own gate with its own record and the batch id',async()=>{
 const f=setup();try{
  clone(f.db,'q2');clone(f.db,'q3');
  const response=await batch(f,{status:'APPROVED',checks,qualityReview,items:['q','q2','q3'].map(id=>item(f,id))});
  expect(response.status).toBe(200);
  const body:any=await response.json();
  expect(body).toMatchObject({ok:true,status:'APPROVED',requested:3,succeeded:3,failed:0});
  expect(body.batchId).toMatch(/^qrb_[0-9a-f-]{36}$/);
  for(const id of ['q','q2','q3']){
   const r=row(f,id);
   expect(r).toMatchObject({review_status:'APPROVED',reviewed_by:'admin'});
   expect(JSON.parse(String(r.review_checks_json))).toEqual({...checks,qualityReview:{schemaVersion:1,...qualityReview},review:{mode:'BATCH',batchId:body.batchId}});
  }
 }finally{f.db.close();}
});

it('never lets RESTRICTED, stale or invalid questions through a batch, while the rest still commit independently',async()=>{
 const f=setup();try{
  clone(f.db,'restricted',`UPDATE question_bank SET copyright_status='RESTRICTED' WHERE id='restricted';`);
  clone(f.db,'stale');clone(f.db,'badkey',`UPDATE question_bank SET correct_answer='E' WHERE id='badkey';`);
  const items=['q','restricted','stale','badkey'].map(id=>item(f,id));
  f.db.exec(`UPDATE question_bank SET stem_text='edited after preview' WHERE id='stale'`);
  const body:any=await (await batch(f,{status:'APPROVED',checks,qualityReview,items})).json();
  expect(body).toMatchObject({requested:4,succeeded:1,failed:3});
  const byId=Object.fromEntries(body.results.map((r:any)=>[r.id,r]));
  expect(byId.q.ok).toBe(true);
  expect(byId.restricted).toMatchObject({ok:false,code:'COPYRIGHT_BLOCKED'});
  expect(byId.stale).toMatchObject({ok:false,code:'QUESTION_REVIEW_CHANGED'});
  expect(byId.badkey).toMatchObject({ok:false,code:'INVALID_QUESTION_CONTENT'});
  for(const id of ['restricted','stale','badkey'])expect(row(f,id).review_status).toBe('REVIEW');
 }finally{f.db.close();}
});

it('requires the reviewer checklist and justification once for a batch approval',async()=>{
 const f=setup();try{
  const noChecks:any=await (await batch(f,{status:'APPROVED',qualityReview,items:[item(f,'q')]})).json();
  expect(noChecks.results[0]).toMatchObject({ok:false,code:'HUMAN_REVIEW_REQUIRED'});
  const noWhy:any=await (await batch(f,{status:'APPROVED',checks,items:[item(f,'q')]})).json();
  expect(noWhy.results[0]).toMatchObject({ok:false,code:'QUESTION_QUALITY_REVIEW_REQUIRED'});
  expect(row(f,'q').review_status).toBe('REVIEW');
 }finally{f.db.close();}
});

it('rejects with a mandatory note and sends to correction (DRAFT) in bulk',async()=>{
 const f=setup();try{
  clone(f.db,'q2');clone(f.db,'q3');
  expect((await batch(f,{status:'REJECTED',items:[item(f,'q')]})).status).toBe(400);
  const rejected:any=await (await batch(f,{status:'REJECTED',note:'Bilimsel olarak yanlış gözlem',items:[item(f,'q'),item(f,'q2')]})).json();
  expect(rejected.succeeded).toBe(2);
  expect(row(f,'q')).toMatchObject({review_status:'REJECTED',rejection_note:'Bilimsel olarak yanlış gözlem'});
  expect(JSON.parse(String(row(f,'q').review_checks_json))).toEqual({review:{mode:'BATCH',batchId:rejected.batchId}});
  const drafted:any=await (await batch(f,{status:'DRAFT',items:[item(f,'q3')]})).json();
  expect(drafted.succeeded).toBe(1);expect(row(f,'q3').review_status).toBe('DRAFT');
 }finally{f.db.close();}
});

it('bounds batch size, rejects duplicates, unknown statuses and non-POST, and forbids non super admins',async()=>{
 const f=setup();try{
  expect((await batch(f,{status:'APPROVED',items:[]})).status).toBe(400);
  expect((await batch(f,{status:'APPROVED',items:Array.from({length:REVIEW_BATCH_MAX+1},(_,i)=>({id:`x${i}`}))})).status).toBe(400);
  expect((await batch(f,{status:'APPROVED',items:[item(f,'q'),item(f,'q')]})).status).toBe(400);
  expect((await batch(f,{status:'ARCHIVED',items:[item(f,'q')]})).status).toBe(400);
  expect((await standard.fetch(f.request({},'/api/question-bank-standard/review-batch','GET'.replace('GET','PUT')),f.env,{} as any)).status).toBe(405);
  const {getAuthUser}=await import('../worker/lib/auth');
  (getAuthUser as any).mockResolvedValueOnce({id:'teacher',role:'TEACHER'});
  expect((await batch(f,{status:'APPROVED',checks,qualityReview,items:[item(f,'q')]})).status).toBe(403);
  expect(row(f,'q').review_status).toBe('REVIEW');
 }finally{f.db.close();}
});
