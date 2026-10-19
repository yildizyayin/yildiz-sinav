import {DatabaseSync} from 'node:sqlite';
import {expect,it} from 'vitest';
import catalog from '../data/question-full-math-target-2028.json';
import {handleQuestionTeam} from '../worker/lib/question-team';
const admin={id:'super',role:'SUPER_ADMIN'} as any;
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE curriculum_versions(id TEXT,academic_year TEXT,grade_level INTEGER,program_code TEXT,program_version TEXT,verified INTEGER,authority TEXT,source_url TEXT);CREATE TABLE outcomes(id TEXT,curriculum_version_id TEXT,code TEXT,title TEXT,active INTEGER,official INTEGER,subject_id TEXT);CREATE TABLE learning_nodes(id TEXT,active INTEGER,grade_level INTEGER,academic_year TEXT);CREATE TABLE question_bank(id TEXT,academic_year TEXT,grade_level INTEGER,subject_id TEXT,owner_type TEXT,review_status TEXT,copyright_status TEXT);CREATE TABLE question_learning_links(question_id TEXT,node_id TEXT);CREATE TABLE question_production_campaigns(id TEXT,academic_year TEXT,status TEXT,reserved_questions INTEGER,target_accepted INTEGER);`);
 const g=catalog.grades[0];db.prepare('INSERT INTO curriculum_versions VALUES(?,?,?,?,?,?,?,?)').run('v','2027-2028',5,'SCHOOL','ANUNEX-TYMM-MAT5-ALLTHEMES-TARGET2028-20261019-V2',1,'MEB',g.indexUrl);
 g.outcomes.forEach((o,i)=>{db.prepare('INSERT INTO outcomes VALUES(?,?,?,?,?,?,?)').run('o'+i,'v',o.code,o.title,1,1,'mat');db.prepare('INSERT INTO learning_nodes VALUES(?,?,?,?)').run('ln_o'+i,1,5,'2027-2028');});
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...a:any[])=>prepare(sql,a),all:async()=>({results:db.prepare(sql).all(...args)})});const env={DB:{prepare}} as any;
 return {db,env,g,request:(year='2027-2028')=>new Request('https://test/api/question-bank-standard/team/readiness?academicYear='+year)};
}
it('counts only approved rights-cleared platform questions with matching year/grade/subject and active links',async()=>{
 const f=fixture();try{
  const records=[['valid','2027-2028',5,'mat','PLATFORM','APPROVED','OWNED'],['old','2026-2027',5,'mat','PLATFORM','APPROVED','OWNED'],['wrongSubject','2027-2028',5,'fen','PLATFORM','APPROVED','OWNED'],['draft','2027-2028',5,'mat','PLATFORM','REVIEW','OWNED'],['rights','2027-2028',5,'mat','PLATFORM','APPROVED','UNKNOWN'],['private','2027-2028',5,'mat','INSTITUTION','APPROVED','OWNED']];
  for(const q of records){f.db.prepare('INSERT INTO question_bank VALUES(?,?,?,?,?,?,?)').run(...q);f.db.prepare('INSERT INTO question_learning_links VALUES(?,?)').run(q[0],'ln_o0');}f.db.prepare('INSERT INTO question_learning_links VALUES(?,?)').run('valid','ln_o1');
  const r=await handleQuestionTeam(f.request(),f.env,admin),p:any=await r.json();expect(r.status).toBe(200);expect(p.grades[0]).toMatchObject({fullProgramImported:true,approvedLinkedQuestions:1});expect(p.summary.importedGrades).toBe(1);expect(p.capabilities.massProductionReady).toBe(false);
  f.db.prepare("UPDATE learning_nodes SET active=0 WHERE id='ln_o0'").run();const changed:any=await (await handleQuestionTeam(f.request(),f.env,admin)).json();expect(changed.grades[0].fullProgramImported).toBe(false);
 }finally{f.db.close();}
});
it('enforces role and year before accessing preparation data',async()=>{
 const f=fixture();try{expect((await handleQuestionTeam(f.request(),f.env,null)).status).toBe(401);expect((await handleQuestionTeam(f.request(),f.env,{...admin,role:'TEACHER'})).status).toBe(403);expect((await handleQuestionTeam(f.request('2027-2030'),f.env,admin)).status).toBe(400);const p:any=await (await handleQuestionTeam(f.request('2026-2027'),f.env,admin)).json();expect(p.summary.importedGrades).toBe(0);expect(p.summary.approvedLinkedQuestions).toBe(0);}finally{f.db.close();}
});
