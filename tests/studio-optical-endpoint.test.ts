import {DatabaseSync} from 'node:sqlite';
import {expect,it,vi} from 'vitest';
vi.mock('../worker/lib/db',async()=>({...await vi.importActual<any>('../worker/lib/db'),audit:async()=>{}}));
import {handlePlatformApi} from '../worker/lib/platform-expansion';

const manager={id:'mx',role:'INSTITUTION_MANAGER',institution_id:'instX'} as any;
function setup(deliveryMode='PDF_OPTICAL'){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE platform_features(feature_key TEXT PRIMARY KEY,enabled_default INTEGER);INSERT INTO platform_features VALUES('STUDIO',1);
 CREATE TABLE institution_feature_overrides(institution_id TEXT,feature_key TEXT,enabled INTEGER);
 CREATE TABLE teacher_assignments(user_id TEXT,institution_id TEXT,subject_id TEXT,active INTEGER,assignment_type TEXT);
 CREATE TABLE student_enrollments(student_id TEXT,institution_id TEXT,status TEXT,class_id TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);INSERT INTO student_enrollments(student_id,institution_id,status) VALUES('s1','instX','ACTIVE'),('s2','instY','ACTIVE');
 CREATE TABLE studio_documents(id TEXT PRIMARY KEY,institution_id TEXT,created_by TEXT,title TEXT,config_json TEXT);
 CREATE TABLE studio_document_items(document_id TEXT,question_id TEXT,booklet_code TEXT,sort_order INTEGER);
 CREATE TABLE studio_document_assets(document_id TEXT,booklet_code TEXT,asset_type TEXT,metadata_json TEXT,file_name TEXT);
 CREATE TABLE question_bank(id TEXT PRIMARY KEY,question_type TEXT,correct_answer TEXT,owner_type TEXT DEFAULT 'PLATFORM',owner_id TEXT,review_status TEXT DEFAULT 'APPROVED',copyright_status TEXT DEFAULT 'OWNED',grade_level INTEGER DEFAULT 8,subject_id TEXT DEFAULT 'math',option_count INTEGER DEFAULT 4,academic_year TEXT DEFAULT '2027-2028');
 CREATE TABLE assessment_runs(id TEXT PRIMARY KEY,institution_id TEXT,student_id TEXT,source_type TEXT,source_id TEXT,assignment_id TEXT,exam_id TEXT,booklet_code TEXT,delivery_mode TEXT,status TEXT,score REAL,metadata_json TEXT,completed_at TEXT);
 CREATE TABLE assessment_responses(id TEXT,run_id TEXT,student_id TEXT,question_id TEXT,exam_question_id TEXT,node_id TEXT,selected_answer TEXT,is_correct INTEGER,source_channel TEXT);
 INSERT INTO question_bank(id,correct_answer) VALUES('q1','A'),('q2','B'),('q3','C');
 INSERT INTO studio_documents VALUES('doc','instX','mx','Deneme','{"deliveryMode":"${deliveryMode}"}');
 INSERT INTO studio_document_items VALUES('doc','q1','A',1),('doc','q2','A',2),('doc','q3','A',3),('doc','q3','B',1),('doc','q2','B',2),('doc','q1','B',3);
 INSERT INTO studio_document_assets VALUES('doc','A','QUESTION_PDF','${deliveryMode==='PDF_OPTICAL'?'{"optical":{"version":"ANUNEX-OPTICAL-1"}}':'{"optical":null}'}','a.pdf');`);
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...a:any[])=>prepare(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}};}});
 const env={DB:{prepare,batch:async(st:any[])=>{for(const s of st)await s.run();return [];}}} as any;
 const call=async(path:string,method='GET',body?:any,user=manager)=>{const r=(await handlePlatformApi(new Request(`https://t${path}`,{method,headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined}),env,user))!;return {status:r.status,body:await r.json() as any};};
 const submit=(body:any)=>call('/api/platform/studio/doc/optical-submit','POST',{studentId:'s1',...body});
 return {db,call,submit};
}

it('scores by printed position for the booklet read from the sheet and records it',async()=>{
 const f=setup();try{
  const r=await f.submit({booklet:'B',readBooklet:'B',answers:'C_A'});
  expect(r.status).toBe(200);expect(r.body).toMatchObject({correct:2,blank:1,total:3,booklet:'B',replaced:false});
  const run=f.db.prepare('SELECT booklet_code,score FROM assessment_runs').get() as any;expect(run).toMatchObject({booklet_code:'B'});
  expect(f.db.prepare('SELECT question_id,selected_answer,is_correct FROM assessment_responses ORDER BY question_id').all()).toEqual([{question_id:'q1',selected_answer:'A',is_correct:1},{question_id:'q2',selected_answer:null,is_correct:0},{question_id:'q3',selected_answer:'C',is_correct:1}]);
 }finally{f.db.close();}
});

it('rejects a wrong booklet, asks for confirmation when the bubble is unreadable, and never silently overwrites',async()=>{
 const f=setup();try{
  expect((await f.submit({booklet:'A',readBooklet:'B',answers:'ABC'})).body.error.code).toBe('BOOKLET_MISMATCH');
  expect((await f.submit({booklet:'A',answers:'ABC'})).body.error.code).toBe('BOOKLET_UNREAD');
  expect((await f.submit({booklet:'A',answers:'AB'})).status).toBe(409);
  expect((await f.submit({booklet:'A',confirmBooklet:true,answers:'AB'})).body.error.code).toBe('ANSWER_COUNT_MISMATCH');
  expect((await f.submit({booklet:'A',confirmBooklet:true,answers:'ABC'})).body).toMatchObject({correct:3,booklet:'A'});
  expect(f.db.prepare('SELECT count(*) n FROM assessment_runs').get()).toEqual({n:1});
  const again=await f.submit({booklet:'B',readBooklet:'B',answers:'CBA'});
  expect(again.status).toBe(409);expect(again.body.error.code).toBe('ALREADY_SCANNED');expect(again.body.error.details.previous).toMatchObject({score:1,booklet:'A'});
  expect((await f.submit({booklet:'B',readBooklet:'B',answers:'CBA',replace:true,replaceReason:'x'})).body.error.code).toBe('REPLACE_REASON_REQUIRED');
  const replaced=await f.submit({booklet:'B',readBooklet:'B',answers:'C__',replace:true,replaceReason:'ilk okutmada yanlış kitapçık'});
  expect(replaced.body).toMatchObject({replaced:true,correct:1,booklet:'B'});
  expect(f.db.prepare('SELECT booklet_code,score FROM assessment_runs').get()).toEqual({booklet_code:'B',score:1/3});
 }finally{f.db.close();}
});

it('refuses students outside the document institution, for managers and Super Admin alike',async()=>{
 const f=setup();try{
  expect((await f.call('/api/platform/studio/doc/optical-submit','POST',{studentId:'s2',booklet:'A',readBooklet:'A',answers:'ABC'})).status).toBe(403);
  const sa=await f.call('/api/platform/studio/doc/optical-submit','POST',{studentId:'s2',booklet:'A',readBooklet:'A',answers:'ABC'},{id:'sa',role:'SUPER_ADMIN',institution_id:null} as any);
  expect(sa.status).toBe(403);expect(sa.body.error.message).toContain('kurumunda kayıtlı değil');
  expect(f.db.prepare('SELECT count(*) n FROM assessment_runs').get()).toEqual({n:0});
 }finally{f.db.close();}
});

it('PDF-only documents have no optical template, and an optical booklet over capacity cannot be created',async()=>{
 const pdfOnly=setup('PDF');try{expect((await pdfOnly.call('/api/platform/studio/doc/optical-template?booklet=A')).body.error.code).toBe('NO_OPTICAL_FORM');}finally{pdfOnly.db.close();}
 const f=setup();try{
  expect((await f.call('/api/platform/studio/doc/optical-template?booklet=A')).status).toBe(200);
  const over=await f.call('/api/platform/studio','POST',{title:'Uzun',documentType:'PRACTICE_EXAM',questionCount:45,deliveryMode:'PDF_OPTICAL'});
  expect(over.status).toBe(400);expect(over.body.error.code).toBe('OPTICAL_CAPACITY_EXCEEDED');
  const pdf=await f.call('/api/platform/studio','POST',{title:'Uzun',documentType:'PRACTICE_EXAM',questionCount:45,deliveryMode:'PDF'});
  expect(pdf.body.error?.code).not.toBe('OPTICAL_CAPACITY_EXCEEDED');
 }finally{f.db.close();}
});
