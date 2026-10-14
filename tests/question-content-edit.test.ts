import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {handleQuestionContentEdit} from '../worker/lib/question-content-edit';
const admin={id:'admin',role:'SUPER_ADMIN'} as any;
function setup(){
 const db=new DatabaseSync(':memory:');db.exec(`PRAGMA foreign_keys=ON;CREATE TABLE users(id TEXT PRIMARY KEY);INSERT INTO users VALUES('admin');
 CREATE TABLE question_bank(id TEXT PRIMARY KEY,review_revision INTEGER DEFAULT 0,stem_text TEXT,options_json TEXT,option_count INTEGER,correct_answer TEXT,solution_text TEXT,review_status TEXT,review_checks_json TEXT,reviewed_by TEXT,reviewed_at TEXT,rejection_note TEXT,origin_kind TEXT,source_model TEXT,source_job_id TEXT,source_label TEXT,academic_year TEXT,grade_level INTEGER,subject_id TEXT,question_type TEXT,content_mode TEXT,copyright_status TEXT,difficulty_level INTEGER,updated_at TEXT);
 CREATE TABLE question_learning_links(question_id TEXT,node_id TEXT);CREATE TABLE question_assets(question_id TEXT);CREATE TABLE question_content_blocks(question_id TEXT);
 CREATE TABLE studio_document_items(question_id TEXT);CREATE TABLE studio_exam_booklet_positions(source_question_id TEXT);CREATE TABLE coach_mini_test_questions(question_id TEXT);CREATE TABLE coach_question_exposures(question_id TEXT);CREATE TABLE question_practice_attempts(question_id TEXT);CREATE TABLE assessment_responses(question_id TEXT);CREATE TABLE student_personal_book_items(bank_question_id TEXT);CREATE TABLE zero_error_booklet_items(bank_question_id TEXT);`);
 db.exec(`CREATE TRIGGER rev AFTER UPDATE ON question_bank WHEN NEW.review_revision=OLD.review_revision BEGIN UPDATE question_bank SET review_revision=OLD.review_revision+1 WHERE id=NEW.id;END;`);
 db.exec(readFileSync(new URL('../migrations/0103_question_content_revisions.sql',import.meta.url),'utf8'));
 db.prepare(`INSERT INTO question_bank(id,stem_text,options_json,option_count,correct_answer,solution_text,review_status,origin_kind,source_model,source_job_id,source_label,academic_year,grade_level,subject_id,question_type,content_mode,copyright_status,difficulty_level,review_checks_json,reviewed_by,reviewed_at) VALUES('q','Kaç kalem kaldı?',?,4,'A','10 - 2 = 8.','REVIEW','AI_GENERATED','model','job','AI source','2026-2027',5,'math','MULTIPLE_CHOICE','TEXT','OWNED',3,'old checks','admin','yesterday')`).run(JSON.stringify(['8','7','6','5'].map((text,i)=>({label:String.fromCharCode(65+i),text}))));
 let race:(()=>void)|undefined;
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...a:any[])=>prepare(sql,a),first:async()=>db.prepare(sql).get(...args),all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{if(race&&sql.startsWith('UPDATE question_bank SET stem_text=')){const f=race;race=undefined;f();}const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}});
 const body=()=>({expectedRevision:Number(db.prepare("SELECT review_revision FROM question_bank WHERE id='q'").get()?.review_revision),stemText:'On kalemin ikisi verildi. Kaç kalem kaldı?',options:['8','7','6','5'].map((text,i)=>({label:String.fromCharCode(65+i),text})),correctAnswer:'A',solutionText:'10 − 2 = 8. Geriye 8 kalem kalır.',editNote:'Anlatım hatası düzeltildi; insan onayı bekliyor.'});
 const req=(b:any=body(),origin='https://test')=>new Request('https://test/api/question-bank-standard/q/content',{method:'PATCH',headers:{Origin:origin},body:JSON.stringify(b)});
 const env={DB:{prepare}} as any;
 return {db,env,body,req,race:(f:()=>void)=>{race=f;},get:()=>db.prepare("SELECT * FROM question_bank WHERE id='q'").get() as any};
}
it('saves a draft with immutable prior content, preserves AI provenance and clears all approvals',async()=>{
 const f=setup();try{
  const before=f.get();expect((await handleQuestionContentEdit(f.req(),f.env,admin,'q')).status).toBe(200);
  const after=f.get();expect(after).toMatchObject({review_revision:1,review_status:'REVIEW',copyright_status:'RESTRICTED',review_checks_json:null,reviewed_by:null,reviewed_at:null,source_job_id:'job',source_model:'model',origin_kind:'AI_GENERATED'});
  const row=f.db.prepare('SELECT * FROM question_content_revisions').get() as any;expect(JSON.parse(row.snapshot_json).stemText).toBe(before.stem_text);
  expect(()=>f.db.exec("UPDATE question_content_revisions SET edit_note='changed'")).toThrow(/IMMUTABLE/);
  expect(()=>f.db.exec('DELETE FROM question_content_revisions')).toThrow(/IMMUTABLE/);
  const history=await handleQuestionContentEdit(new Request('https://test/content'),f.env,admin,'q');expect((await history.json() as any).revisions[0].snapshot.options[0]).toEqual({label:'A',text:'8'});
 }finally{f.db.close()}
});
it('rejects other roles, foreign origins, provenance mutation and stale revisions without a write',async()=>{
 const f=setup();try{
  expect((await handleQuestionContentEdit(f.req(),f.env,{...admin,role:'TEACHER'},'q')).status).toBe(403);
  expect((await handleQuestionContentEdit(f.req(undefined,'https://evil.test'),f.env,admin,'q')).status).toBe(403);
  expect((await handleQuestionContentEdit(f.req({...f.body(),sourceJobId:'fake'}),f.env,admin,'q')).status).toBe(400);
  const b=f.body();f.db.exec("UPDATE question_bank SET source_label='changed'");
  expect((await handleQuestionContentEdit(f.req(b),f.env,admin,'q')).status).toBe(409);
  expect(f.db.prepare('SELECT count(*) n FROM question_content_revisions').get()?.n).toBe(0);
 }finally{f.db.close()}
});
it('does not overwrite used content even when a delivery races the preflight read',async()=>{
 const f=setup();try{
  const before=f.get();f.race(()=>f.db.exec("INSERT INTO assessment_responses VALUES('q')"));
  const response=await handleQuestionContentEdit(f.req(),f.env,admin,'q');expect(response.status).toBe(409);
  expect(f.get().stem_text).toBe(before.stem_text);expect(f.db.prepare('SELECT count(*) n FROM question_content_revisions').get()?.n).toBe(0);
 }finally{f.db.close()}
});
it('blocks approved questions and wrong arithmetic, and cannot partially edit rich packets',async()=>{
 const f=setup();try{
  expect((await handleQuestionContentEdit(f.req({...f.body(),solutionText:'10 - 2 = 9.'}),f.env,admin,'q')).status).toBe(400);
  f.db.exec("INSERT INTO question_assets VALUES('q')");expect((await handleQuestionContentEdit(f.req(),f.env,admin,'q')).status).toBe(409);
  f.db.exec("DELETE FROM question_assets;UPDATE question_bank SET review_status='APPROVED'");expect((await handleQuestionContentEdit(f.req(),f.env,admin,'q')).status).toBe(409);
 }finally{f.db.close()}
});
