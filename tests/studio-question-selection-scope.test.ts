import {DatabaseSync} from 'node:sqlite';
import {expect,it,vi} from 'vitest';
vi.mock('../worker/lib/db',async()=>({...await vi.importActual<any>('../worker/lib/db'),audit:async()=>{}}));
import {handlePlatformApi} from '../worker/lib/platform-expansion';

const admin={id:'admin',role:'SUPER_ADMIN',institution_id:null} as any;
const managerX={id:'mx',role:'INSTITUTION_MANAGER',institution_id:'instX'} as any;

function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE platform_features(feature_key TEXT PRIMARY KEY,enabled_default INTEGER);INSERT INTO platform_features VALUES('STUDIO',1);
 CREATE TABLE institution_feature_overrides(institution_id TEXT,feature_key TEXT,enabled INTEGER);
 CREATE TABLE teacher_assignments(user_id TEXT,institution_id TEXT,subject_id TEXT,active INTEGER,assignment_type TEXT);
 CREATE TABLE question_bank(id TEXT PRIMARY KEY,owner_type TEXT DEFAULT 'PLATFORM',owner_id TEXT,academic_year TEXT,grade_level INTEGER,subject_id TEXT,review_status TEXT,copyright_status TEXT,option_count INTEGER DEFAULT 4);
 CREATE TABLE curriculum_versions(id TEXT,academic_year TEXT,verified INTEGER);
 CREATE TABLE outcomes(id TEXT,code TEXT,active INTEGER,grade_level INTEGER,subject_id TEXT,curriculum_version_id TEXT);
 CREATE TABLE question_learning_links(question_id TEXT,node_id TEXT);
 CREATE TABLE studio_documents(id TEXT PRIMARY KEY,institution_id TEXT,created_by TEXT,document_type TEXT,title TEXT,grade_level INTEGER,subject_id TEXT,status TEXT,config_json TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE studio_document_items(document_id TEXT,question_id TEXT,booklet_code TEXT,sort_order INTEGER);
 INSERT INTO curriculum_versions VALUES('cv27','2027-2028',1),('cv26','2026-2027',1);
 INSERT INTO outcomes VALUES('o1','MAT.8.1.1',1,8,'math','cv27'),('o2','MAT.8.1.2',1,8,'math','cv27'),('o26','MAT.8.1.1',1,8,'math','cv26');`);
 const q=(id:string,extra:Record<string,any>={})=>{const r={owner_type:'PLATFORM',owner_id:null,academic_year:'2027-2028',grade_level:8,subject_id:'math',review_status:'APPROVED',copyright_status:'OWNED',...extra};db.prepare('INSERT INTO question_bank(id,owner_type,owner_id,academic_year,grade_level,subject_id,review_status,copyright_status) VALUES(?,?,?,?,?,?,?,?)').run(id,r.owner_type,r.owner_id,r.academic_year,r.grade_level,r.subject_id,r.review_status,r.copyright_status);};
 const link=(qid:string,oid:string)=>db.prepare('INSERT INTO question_learning_links VALUES(?,?)').run(qid,'ln_'+oid);
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...a:any[])=>prepare(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}};},sql,args});
 const env={DB:{prepare,batch:async(stmts:any[])=>{for(const s of stmts)db.prepare(s.sql).run(...s.args);return [];}}} as any;
 const create=async(user:any,body:any)=>{const r=await handlePlatformApi(new Request('https://t/api/platform/studio',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'Deneme',documentType:'PRACTICE_EXAM',bookletCodes:'A',...body})}),env,user);return {status:r!.status,body:await r!.json() as any};};
 const items=(docId:string)=>db.prepare('SELECT question_id FROM studio_document_items WHERE document_id=? ORDER BY question_id').all(docId).map((r:any)=>r.question_id);
 return {db,q,link,create,items};
}

it('never puts another institution\'s private questions in a booklet, even when requested by id',async()=>{
 const f=setup();try{
  f.q('platform');f.q('ownX',{owner_type:'INSTITUTION',owner_id:'instX'});f.q('ownY',{owner_type:'INSTITUTION',owner_id:'instY'});
  const r=await f.create(managerX,{gradeLevel:8,subjectId:'math',questionCount:2});
  expect(r.status).toBe(201);expect(f.items(r.body.id)).toEqual(['ownX','platform']);
  expect((await f.create(managerX,{gradeLevel:8,subjectId:'math',questionCount:3})).body.error.code).toBe('INSUFFICIENT_QUESTION_POOL');
  const byId=await f.create(managerX,{questionIds:['ownY'],questionCount:1});
  expect(byId.status).toBe(400);expect(byId.body.error.code).toBe('INSUFFICIENT_QUESTION_POOL');
  const forY=await f.create(admin,{institutionId:'instY',gradeLevel:8,subjectId:'math',questionCount:2});
  expect(f.items(forY.body.id)).toEqual(['ownY','platform']);
 }finally{f.db.close();}
});

it('uses only approved questions with usable rights and refuses to build a short booklet',async()=>{
 const f=setup();try{
  f.q('ok');f.q('review',{review_status:'REVIEW'});f.q('restricted',{copyright_status:'RESTRICTED'});f.q('rejected',{review_status:'REJECTED'});
  const short=await f.create(admin,{institutionId:'instX',gradeLevel:8,subjectId:'math',questionCount:2});
  expect(short.status).toBe(400);expect(short.body.error.message).toContain('yalnız 1 soru');
  const one=await f.create(admin,{institutionId:'instX',gradeLevel:8,subjectId:'math',questionCount:1});
  expect(f.items(one.body.id)).toEqual(['ok']);
 }finally{f.db.close();}
});

it('limits a booklet to the chosen academic year and verified outcome codes, and names unknown codes',async()=>{
 const f=setup();try{
  f.q('y27a');f.link('y27a','o1');f.q('y27b');f.link('y27b','o2');f.q('y26',{academic_year:'2026-2027'});f.link('y26','o26');
  const year=await f.create(admin,{institutionId:'instX',gradeLevel:8,subjectId:'math',academicYear:'2026-2027',questionCount:1});
  expect(f.items(year.body.id)).toEqual(['y26']);
  const byOutcome=await f.create(admin,{institutionId:'instX',gradeLevel:8,subjectId:'math',academicYear:'2027-2028',outcomeCodes:'MAT.8.1.2',questionCount:1});
  expect(f.items(byOutcome.body.id)).toEqual(['y27b']);
  expect(JSON.parse(f.db.prepare('SELECT config_json c FROM studio_documents WHERE id=?').get(byOutcome.body.id)!.c as string)).toMatchObject({academicYear:'2027-2028',outcomeCodes:['MAT.8.1.2']});
  const unknown=await f.create(admin,{institutionId:'instX',gradeLevel:8,subjectId:'math',outcomeCodes:'MAT.8.1.2, MAT.8.9.9',questionCount:1});
  expect(unknown.status).toBe(400);expect(unknown.body.error.code).toBe('UNKNOWN_OUTCOME_CODES');expect(unknown.body.error.message).toContain('MAT.8.9.9');
  expect((await f.create(admin,{institutionId:'instX',academicYear:'2027',questionCount:1})).body.error.code).toBe('INVALID_ACADEMIC_YEAR');
  expect((await f.create(admin,{institutionId:'instX',outcomeCodes:Array.from({length:31},(_,i)=>`X.${i}`),questionCount:1})).body.error.code).toBe('TOO_MANY_OUTCOMES');
 }finally{f.db.close();}
});
