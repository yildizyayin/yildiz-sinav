import {DatabaseSync} from 'node:sqlite';
import {expect,it,vi} from 'vitest';
import {verifyStoredQuestionDraft} from '../worker/lib/question-draft-verification';
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE question_bank(id TEXT,review_revision INTEGER,review_status TEXT,review_checks_json TEXT,copyright_status TEXT,academic_year TEXT,grade_level INTEGER,subject_id TEXT,option_count INTEGER,stem_text TEXT,solution_text TEXT,options_json TEXT,correct_answer TEXT);
 CREATE TABLE question_learning_links(question_id TEXT,node_id TEXT);CREATE TABLE outcomes(id TEXT,code TEXT,title TEXT,active INTEGER,grade_level INTEGER,subject_id TEXT,curriculum_version_id TEXT);CREATE TABLE curriculum_versions(id TEXT,program_version TEXT,verified INTEGER,academic_year TEXT,grade_level INTEGER);CREATE TABLE audit_logs(id TEXT,actor_user_id TEXT,institution_id TEXT,action TEXT,entity_type TEXT,entity_id TEXT,details_json TEXT);
 INSERT INTO question_bank VALUES('q',1,'REVIEW',NULL,'RESTRICTED','2026-2027',5,'math',4,'Kalan kalem sayısı kaçtır?','10 − 2 = 8.','["8","7","6","5"]','A');INSERT INTO question_learning_links VALUES('q','ln_o');INSERT INTO outcomes VALUES('o','MAT.5.1.2','Doğal sayılar ve işlemler içeren gerçek yaşam problemlerini çözebilme',1,5,'math','cv');INSERT INTO curriculum_versions VALUES('cv','v1',1,'2026-2027',5);`);
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...a:any[])=>prepare(sql,a),first:async()=>db.prepare(sql).get(...args),all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}})});
 const run=vi.fn(async()=>({response:{reviews:[{index:0,valid:true,issues:[]}]}}));
 const env={DB:{prepare},AI:{run},QUESTION_GENERATION_VERIFICATION_ENABLED:'true'} as any;
 const request=()=>new Request('https://test/content/verify',{method:'POST',headers:{Origin:'https://test'},body:JSON.stringify({expectedRevision:1})});
 return {db,env,run,request};
}
it('records a version-bound automatic verdict without granting human or rights approval',async()=>{
 const f=fixture();try{
  const r=await verifyStoredQuestionDraft(f.request(),f.env,{id:'admin',role:'SUPER_ADMIN'} as any,'q');expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({verification:{ok:true},humanApprovalRequired:true,rightsReviewRequired:true,noveltyCertified:false});
  expect(f.db.prepare("SELECT review_status,copyright_status,review_checks_json FROM question_bank").get()).toMatchObject({review_status:'REVIEW',copyright_status:'RESTRICTED',review_checks_json:null});
  expect(f.db.prepare('SELECT action FROM audit_logs').get()?.action).toBe('QUESTION_DRAFT_VERIFIED');
 }finally{f.db.close()}
});
it('invalidates the verdict if official context changes during the provider request',async()=>{
 const f=fixture();try{
  f.run.mockImplementation(async()=>{f.db.exec("UPDATE outcomes SET title='Changed official title'");return {response:{reviews:[{index:0,valid:true,issues:[]}]}}});
  expect((await verifyStoredQuestionDraft(f.request(),f.env,{id:'admin',role:'SUPER_ADMIN'} as any,'q')).status).toBe(409);
  expect(f.db.prepare('SELECT action FROM audit_logs').get()?.action).toBe('QUESTION_DRAFT_VERIFICATION_STALE');
 }finally{f.db.close()}
});
