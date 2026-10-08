import {DatabaseSync} from 'node:sqlite';
import {expect,it,vi} from 'vitest';
vi.mock('../worker/lib/coach-mastery-cycle',()=>({startCoachMiniTest:vi.fn(async(_env,_user,itemId,mode)=>({ok:true,testId:itemId,questionMode:mode}))}));
import {listOutcomeMiniTests,startOutcomeMiniTest} from '../worker/lib/mini-test-catalog';
it('catalogs every verified current-grade outcome and creates only own authorized outcome task',async()=>{
 const db=new DatabaseSync(':memory:');try{
 db.exec(`CREATE TABLE student_enrollments(id TEXT,student_id TEXT,institution_id TEXT,season_id TEXT,grade_level INTEGER,status TEXT,created_at TEXT);INSERT INTO student_enrollments VALUES('en','s','school','season',7,'ACTIVE','2026');
 CREATE TABLE institution_seasons(id TEXT,institution_id TEXT,academic_year TEXT);INSERT INTO institution_seasons VALUES('season','school','2026-2027');
 CREATE TABLE curriculum_versions(id TEXT,verified INTEGER,academic_year TEXT,grade_level INTEGER,program_version TEXT);INSERT INTO curriculum_versions VALUES('cv',1,'2026-2027',7,'synthetic'),('bad',0,'2026-2027',7,'unverified');
 CREATE TABLE subjects(id TEXT,name TEXT);INSERT INTO subjects VALUES('math','Matematik');
 CREATE TABLE outcomes(id TEXT,code TEXT,title TEXT,subject_id TEXT,curriculum_version_id TEXT,grade_level INTEGER,active INTEGER);INSERT INTO outcomes VALUES('o1','1','Bir','math','cv',7,1),('o2','2','İki','math','cv',7,1),('bad','3','Üç','math','bad',7,1);
 CREATE TABLE assignments(id TEXT PRIMARY KEY,institution_id TEXT,season_id TEXT,created_by TEXT,assignment_type TEXT,title TEXT,description TEXT,status TEXT);
 CREATE TABLE assignment_items(id TEXT PRIMARY KEY,assignment_id TEXT,item_type TEXT,reference_id TEXT,payload_json TEXT,sort_order INTEGER);
 CREATE TABLE assignment_recipients(assignment_id TEXT,student_id TEXT,status TEXT,progress REAL,PRIMARY KEY(assignment_id,student_id));`);
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...a:any[])=>prepare(sql,a),first:async()=>db.prepare(sql).get(...args),all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>db.prepare(sql).run(...args),sql,args});
 const env={DB:{prepare,batch:async(stmts:any[])=>{db.exec('BEGIN');try{const r=stmts.map(x=>db.prepare(x.sql).run(...x.args));db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}}} as any,user={id:'u',role:'STUDENT',student_id:'s',institution_id:'school'} as any;
 const catalog:any=await(await listOutcomeMiniTests(env,user,new URL('https://test'))).json();expect(catalog.items.map((o:any)=>o.id)).toEqual(['o1','o2']);
 expect((await startOutcomeMiniTest(env,user,'bad')).ok).toBe(false);expect(db.prepare('SELECT count(*) n FROM assignments').get()?.n).toBe(0);
 expect((await startOutcomeMiniTest(env,user,'o1')).ok).toBe(true);expect((await startOutcomeMiniTest(env,user,'o1','REPEAT')).ok).toBe(true);
 expect(db.prepare('SELECT count(*) n FROM assignments').get()?.n).toBe(1);expect(db.prepare('SELECT student_id FROM assignment_recipients').get()?.student_id).toBe('s');
 expect((await listOutcomeMiniTests(env,{...user,institution_id:'foreign'},new URL('https://test'))).status).toBe(403);
 }finally{db.close();}
});
