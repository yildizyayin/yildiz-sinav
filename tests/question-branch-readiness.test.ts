import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {handleQuestionTeam} from '../worker/lib/question-team';
import math from '../data/question-full-math-target-2028.json';
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE curriculum_versions(id TEXT,academic_year TEXT,grade_level INTEGER,program_version TEXT,program_code TEXT,verified INTEGER,authority TEXT,source_url TEXT);CREATE TABLE outcomes(id TEXT,curriculum_version_id TEXT,code TEXT,title TEXT,unit TEXT,grade_level INTEGER,active INTEGER,official INTEGER,subject_id TEXT);CREATE TABLE subjects(id TEXT,code TEXT);INSERT INTO subjects VALUES('mat','MAT');CREATE TABLE learning_nodes(id TEXT,active INTEGER,academic_year TEXT,grade_level INTEGER);CREATE TABLE question_bank(id TEXT,academic_year TEXT,grade_level INTEGER,subject_id TEXT,owner_type TEXT,review_status TEXT,copyright_status TEXT);CREATE TABLE question_learning_links(question_id TEXT,node_id TEXT);`);
 const g=math.grades[0];db.prepare('INSERT INTO curriculum_versions VALUES(?,?,?,?,?,?,?,?)').run('v','2027-2028',5,'ANUNEX-TYMM-MAT5-ALLTHEMES-TARGET2028-20261019-V2','SCHOOL',1,'MEB',g.indexUrl);
 for(const [i,o] of g.outcomes.entries()){db.prepare('INSERT INTO outcomes VALUES(?,?,?,?,?,?,?,?,?)').run('o'+i,'v',o.code,o.title,o.unit,5,1,1,'mat');db.prepare('INSERT INTO learning_nodes VALUES(?,?,?,?)').run('ln_o'+i,1,'2027-2028',5);}
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...a:any[])=>prepare(sql,a),all:async()=>({results:db.prepare(sql).all(...args)})});
 return {db,env:{DB:{prepare},ENVIRONMENT:'production'} as any};
}
const admin={id:'super',role:'SUPER_ADMIN'} as any;
const request=(year='2027-2028')=>new Request('https://app.anunex.com/api/question-bank-standard/team/branch-readiness?academicYear='+year);
it('authenticates before reading curriculum data',async()=>{
 expect((await handleQuestionTeam(request(),{} as any,null)).status).toBe(401);
 expect((await handleQuestionTeam(request(),{} as any,{...admin,role:'TEACHER'})).status).toBe(403);
 expect((await handleQuestionTeam(request('2027-2030'),{} as any,admin)).status).toBe(400);
});
it('uses real production rows and exact source text instead of staging counts',async()=>{
 const f=fixture();try{const response=await handleQuestionTeam(request(),f.env,admin),p:any=await response.json();expect(response.status).toBe(200);expect(p.environment).toBe('production');expect(p.summary).toMatchObject({expectedVersions:77,importedVersions:1,expectedOutcomes:2916});expect(p.subjects.find((s:any)=>s.subject==='MAT'&&s.grade===5).imported).toBe(true);
 f.db.exec("UPDATE outcomes SET title='Wrong source text' WHERE id='o0'");const changed:any=await(await handleQuestionTeam(request(),f.env,admin)).json();expect(changed.summary.importedVersions).toBe(0);
 }finally{f.db.close()}
});
it('counts only eligible owned platform questions and deduplicates links',async()=>{
 const f=fixture();try{const records=[['valid','2027-2028',5,'mat','PLATFORM','APPROVED','OWNED'],['private','2027-2028',5,'mat','INSTITUTION','APPROVED','OWNED'],['wrongYear','2026-2027',5,'mat','PLATFORM','APPROVED','OWNED'],['unreviewed','2027-2028',5,'mat','PLATFORM','REVIEW','OWNED']];for(const row of records){f.db.prepare('INSERT INTO question_bank VALUES(?,?,?,?,?,?,?)').run(...row);f.db.prepare('INSERT INTO question_learning_links VALUES(?,?)').run(row[0],'ln_o0');}f.db.prepare('INSERT INTO question_learning_links VALUES(?,?)').run('valid','ln_o1');const p:any=await(await handleQuestionTeam(request(),f.env,admin)).json();expect(p.subjects.find((s:any)=>s.subject==='MAT'&&s.grade===5).approvedQuestions).toBe(1);
 const old:any=await(await handleQuestionTeam(request('2026-2027'),f.env,admin)).json();expect(old.subjects).toEqual([]);expect(old.summary.importedVersions).toBe(0);expect(old.capabilities.massProductionReady).toBe(false);
 }finally{f.db.close()}
});
it('adds the new year and live component to the production super admin workspace',()=>{
 const page=readFileSync(new URL('../src/pages/QuestionTeam.tsx',import.meta.url),'utf8');expect(page).toContain('<QuestionBranchReadiness academicYear={year}/>');expect(page).toContain("useState('2027-2028')");expect(page).toContain("user?.role==='SUPER_ADMIN'");
});
