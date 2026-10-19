import {DatabaseSync} from 'node:sqlite';
import {it,expect} from 'vitest';
import {questionCardIntelligence} from '../worker/lib/question-card-intelligence';
const admin={role:'SUPER_ADMIN'} as any;
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec(`
 CREATE TABLE question_bank(id TEXT,academic_year TEXT,grade_level INTEGER,subject_id TEXT,difficulty_level INTEGER,difficulty INTEGER,prior_grade_refs_json TEXT,lgs_probability REAL,yks_probability REAL,exam_5y_count INTEGER,review_revision INTEGER);
 CREATE TABLE curriculum_versions(id TEXT,grade_level INTEGER,academic_year TEXT,verified INTEGER,program_version TEXT,source_url TEXT);
 CREATE TABLE outcomes(id TEXT,code TEXT,title TEXT,grade_level INTEGER,subject_id TEXT,curriculum_version_id TEXT,active INTEGER);
 CREATE TABLE question_learning_links(question_id TEXT,node_id TEXT);
 CREATE TABLE official_exam_archives(id TEXT,active INTEGER,landing_url TEXT,document_url TEXT,authority TEXT);
 CREATE TABLE official_question_outcome_facts(archive_id TEXT,exam_family TEXT,exam_year INTEGER,session_code TEXT,subject_name TEXT,question_no INTEGER,verification_status TEXT,outcome_id TEXT,outcome_code_snapshot TEXT,outcome_title_snapshot TEXT);
 CREATE TABLE official_outcome_equivalences(current_outcome_id TEXT,verified INTEGER,exam_family TEXT,from_year INTEGER,from_outcome_code TEXT,from_outcome_title TEXT);
 INSERT INTO question_bank VALUES('q','2027-2028',5,'math',4,4,'["Eski sınıf etiketi"]',0.9,0.8,99,3);
 INSERT INTO curriculum_versions VALUES('cv',5,'2027-2028',1,'test-version','https://tymm.meb.gov.tr');
 INSERT INTO outcomes VALUES('o','TEST','Synthetic',5,'math','cv',1);
 INSERT INTO question_learning_links VALUES('q','ln_o');
 INSERT INTO official_exam_archives VALUES('a',1,'https://meb.gov.tr',NULL,'MEB');
 `);
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...a:any[])=>prepare(sql,a),first:async()=>db.prepare(sql).get(...args),all:async()=>({results:db.prepare(sql).all(...args)})});return {db,env:{DB:{prepare}} as any};
}
it('reads exact verified context; distinguishes absent evidence from zero and legacy claims from predictions',async()=>{
 const {db,env}=fixture();try{const p:any=await(await questionCardIntelligence(env,admin,'q',new Date('2026-10-19'))).json();expect(p.outcomes).toHaveLength(1);expect(p.history).toMatchObject({fromYear:2022,toYear:2026,status:'NO_VERIFIED_MAPPING',coverageComplete:false});expect(p.history.families[0].observedQuestionCount).toBeNull();expect(p.prediction.probability).toBeNull();expect(p.manualClaims).toMatchObject({lgsProbability:.9,exam5yCount:99,verified:false});expect(p.priorLearning.status).toContain('UNVERIFIED');db.exec("UPDATE curriculum_versions SET academic_year='2026-2027'");const stale:any=await(await questionCardIntelligence(env,admin,'q')).json();expect(stale.outcomes).toEqual([]);}finally{db.close()}
});
it('counts only in-window verified facts and explicit verified cross-year equivalences; enforces role',async()=>{
 const {db,env}=fixture();try{db.exec(`INSERT INTO official_question_outcome_facts VALUES
 ('a','LGS',2025,'SAYISAL','Math',1,'VERIFIED','o',NULL,NULL),
 ('a','LGS',2026,'SAYISAL','Math',2,'REVIEW','o',NULL,NULL),
 ('a','LGS',2021,'SAYISAL','Math',3,'VERIFIED','o',NULL,NULL),
 ('a','LGS',2024,'SAYISAL','Math',4,'VERIFIED','old','OLD',NULL),
 ('a','LGS',2023,'SAYISAL','Math',5,'VERIFIED','other','OTHER',NULL);
 INSERT INTO official_outcome_equivalences VALUES('o',1,'LGS',2024,'OLD',NULL),('o',0,'LGS',2023,'OTHER',NULL);`);
 expect((await questionCardIntelligence(env,{role:'TEACHER'} as any,'q')).status).toBe(403);
 const p:any=await(await questionCardIntelligence(env,admin,'q',new Date('2026-10-19'))).json();expect(p.history.facts.map((f:any)=>f.question_no)).toEqual([1,4]);expect(p.history.families[0].observedQuestionCount).toBe(2);expect(p.history.families[0].perYear.find((y:any)=>y.year===2026).count).toBeNull();db.exec('UPDATE official_exam_archives SET active=0');const inactive:any=await(await questionCardIntelligence(env,admin,'q')).json();expect(inactive.history.facts).toEqual([]);
 }finally{db.close()}
});
