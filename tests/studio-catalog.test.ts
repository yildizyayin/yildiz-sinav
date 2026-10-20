import {DatabaseSync} from 'node:sqlite';
import {expect,it,vi} from 'vitest';
vi.mock('../worker/lib/db',async()=>({...await vi.importActual<any>('../worker/lib/db'),audit:async()=>{}}));
import {handlePlatformApi} from '../worker/lib/platform-expansion';
import {narrowingMessage} from '../worker/lib/studio-selection';

const managerX={id:'mx',role:'INSTITUTION_MANAGER',institution_id:'instX'} as any;
const teacherX={id:'tx',role:'TEACHER',institution_id:'instX'} as any;

function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE platform_features(feature_key TEXT PRIMARY KEY,enabled_default INTEGER);INSERT INTO platform_features VALUES('STUDIO',1);
 CREATE TABLE institution_feature_overrides(institution_id TEXT,feature_key TEXT,enabled INTEGER);
 CREATE TABLE teacher_assignments(user_id TEXT,institution_id TEXT,subject_id TEXT,active INTEGER,assignment_type TEXT);
 INSERT INTO teacher_assignments VALUES('tx','instX','tur',1,'SUBJECT');
 CREATE TABLE subjects(id TEXT PRIMARY KEY,code TEXT,name TEXT,active INTEGER DEFAULT 1);
 INSERT INTO subjects VALUES('tur','TUR','Türkçe',1),('mat','MAT','Matematik',1),('fen','FEN','Fen Bilimleri',1);
 CREATE TABLE question_bank(id TEXT PRIMARY KEY,question_type TEXT,owner_type TEXT DEFAULT 'PLATFORM',owner_id TEXT,academic_year TEXT,grade_level INTEGER,subject_id TEXT,review_status TEXT,copyright_status TEXT,option_count INTEGER DEFAULT 4);
 CREATE TABLE curriculum_versions(id TEXT,academic_year TEXT,verified INTEGER);
 CREATE TABLE outcomes(id TEXT,code TEXT,title TEXT,unit TEXT,topic TEXT,node_type TEXT DEFAULT 'OUTCOME',active INTEGER,grade_level INTEGER,subject_id TEXT,curriculum_version_id TEXT);
 CREATE TABLE question_learning_links(question_id TEXT,node_id TEXT);
 CREATE TABLE studio_documents(id TEXT PRIMARY KEY,institution_id TEXT,created_by TEXT,document_type TEXT,title TEXT,grade_level INTEGER,subject_id TEXT,status TEXT,config_json TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE studio_document_items(document_id TEXT,question_id TEXT,booklet_code TEXT,sort_order INTEGER);
 INSERT INTO curriculum_versions VALUES('cv27','2027-2028',1),('cvx','2027-2028',0);
 INSERT INTO outcomes VALUES('o1','T.5.1.1','Fiil kiplerini ayırt eder','1. Ünite: Dil Bilgisi','Fiiller','OUTCOME',1,5,'tur','cv27'),
  ('o2','T.5.1.2','Zaman kaymasını fark eder','1. Ünite: Dil Bilgisi','Fiiller','OUTCOME',1,5,'tur','cv27'),
  ('o3','T.5.2.1','Ana fikri bulur','2. Ünite: Okuma','Anlama','OUTCOME',1,5,'tur','cv27'),
  ('ou','T.5.1','Dil Bilgisi','1. Ünite: Dil Bilgisi',NULL,'UNIT',1,5,'tur','cv27'),
  ('ov','T.5.9.9','Doğrulanmamış','X','Y','OUTCOME',1,5,'tur','cvx'),
  ('om','M.5.1.1','Doğal sayılar','1. Ünite','Sayılar','OUTCOME',1,5,'mat','cv27');`);
 const q=(id:string,extra:Record<string,any>={})=>{const r={question_type:'MULTIPLE_CHOICE',owner_type:'PLATFORM',owner_id:null,academic_year:'2027-2028',grade_level:5,subject_id:'tur',review_status:'APPROVED',copyright_status:'OWNED',...extra};db.prepare('INSERT INTO question_bank(id,question_type,owner_type,owner_id,academic_year,grade_level,subject_id,review_status,copyright_status) VALUES(?,?,?,?,?,?,?,?,?)').run(id,r.question_type,r.owner_type,r.owner_id,r.academic_year,r.grade_level,r.subject_id,r.review_status,r.copyright_status);};
 const link=(qid:string,oid:string)=>db.prepare('INSERT INTO question_learning_links VALUES(?,?)').run(qid,'ln_'+oid);
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...a:any[])=>prepare(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{db.prepare(sql).run(...args);return {success:true,meta:{changes:1}};},sql,args});
 const env={DB:{prepare,batch:async(stmts:any[])=>{for(const s of stmts)db.prepare(s.sql).run(...s.args);return [];}}} as any;
 const catalog=async(user:any,params:Record<string,string>)=>{const r=await handlePlatformApi(new Request(`https://t/api/platform/studio/catalog?${new URLSearchParams(params)}`),env,user);return {status:r!.status,body:await r!.json() as any};};
 const create=async(user:any,body:any)=>{const r=await handlePlatformApi(new Request('https://t/api/platform/studio',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'D',documentType:'PRACTICE_EXAM',bookletCodes:'A',deliveryMode:'PDF',...body})}),env,user);return {status:r!.status,body:await r!.json() as any};};
 // Türkçe 5: a,b on o1; c on o2; d unlinked. Not countable: REVIEW, RESTRICTED, open-ended, another institution's private item.
 q('a');q('b');q('c');q('d');link('a','o1');link('b','o1');link('c','o2');
 q('rev',{review_status:'REVIEW'});link('rev','o1');q('rst',{copyright_status:'RESTRICTED'});link('rst','o1');q('open',{question_type:'OPEN_ENDED'});link('open','o1');q('y',{owner_type:'INSTITUTION',owner_id:'instY'});link('y','o1');
 q('own',{owner_type:'INSTITUTION',owner_id:'instX'});link('own','o3');
 q('m1',{subject_id:'mat'});q('old',{academic_year:'2026-2027'});
 return {db,catalog,create};
}

it('shows subjects and the outcome tree with approved stock counted by the same gates as creation',async()=>{
 const f=setup();try{
  const r=await f.catalog(managerX,{gradeLevel:'5',subjectId:'tur',academicYear:'2027-2028'});
  expect(r.status).toBe(200);
  expect(r.body.subjects.map((s:any)=>[s.name,s.approved])).toEqual([['Matematik',1],['Türkçe',5]]);
  expect(r.body.outcomes.map((o:any)=>[o.code,o.unit,o.topic,o.approved])).toEqual([
   ['T.5.1.1','1. Ünite: Dil Bilgisi','Fiiller',2],['T.5.1.2','1. Ünite: Dil Bilgisi','Fiiller',1],['T.5.2.1','2. Ünite: Okuma','Anlama',1]]);
  expect(r.body.available).toBe(5);expect(r.body.opticalCapacity).toBe(44);
  // Count shown = count creation can use, and one more is refused.
  expect((await f.create(managerX,{gradeLevel:5,subjectId:'tur',academicYear:'2027-2028',questionCount:5})).status).toBe(201);
  expect((await f.create(managerX,{gradeLevel:5,subjectId:'tur',academicYear:'2027-2028',questionCount:6})).status).toBe(400);
  const sel=await f.catalog(managerX,{gradeLevel:'5',subjectId:'tur',academicYear:'2027-2028',outcomeCodes:'T.5.1.1,T.5.1.2'});
  expect(sel.body.available).toBe(3);
 }finally{f.db.close();}
});

it('names the filter that emptied the pool instead of a bare "0 questions"',async()=>{
 const f=setup();try{
  const r=await f.catalog(managerX,{gradeLevel:'5',subjectId:'tur',academicYear:'2027-2028',outcomeCodes:'T.5.2.1',questionCount:'4'});
  expect(r.body.funnel.map((s:any)=>[s.key,s.count])).toEqual([['base',7],['grade',7],['subject',6],['year',5],['outcomes',1]]);
  expect(r.body.message).toContain('Seçilen 1 kazanım');expect(r.body.message).toContain('5 → 1');
  expect(narrowingMessage([{key:'base',label:'x',count:2}],5)).toContain('yalnız 2');
  expect(narrowingMessage([{key:'base',label:'x',count:9}],5)).toBeNull();
 }finally{f.db.close();}
});

it('a teacher sees and counts only subjects they are assigned to',async()=>{
 const f=setup();try{
  const r=await f.catalog(teacherX,{gradeLevel:'5'});
  expect(r.body.subjects.map((s:any)=>s.name)).toEqual(['Türkçe']);
 }finally{f.db.close();}
});

it('never puts open-ended items into a printable booklet',async()=>{
 const f=setup();try{
  f.db.exec(`DELETE FROM question_bank WHERE id<>'open'`);
  const r=await f.create(managerX,{gradeLevel:5,subjectId:'tur',questionCount:1});
  expect(r.body.error.code).toBe('INSUFFICIENT_QUESTION_POOL');
 }finally{f.db.close();}
});
