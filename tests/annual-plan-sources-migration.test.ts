import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
it('preserves legacy plans, scopes additional sources and prevents deleting published work',()=>{
 const db=new DatabaseSync(':memory:');try{
 db.exec(`PRAGMA foreign_keys=ON;CREATE TABLE curriculum_versions(id TEXT PRIMARY KEY,verified INTEGER,program_code TEXT,academic_year TEXT,grade_level INTEGER);
 CREATE TABLE annual_content_plans(id TEXT PRIMARY KEY,curriculum_version_id TEXT REFERENCES curriculum_versions(id),academic_year TEXT,grade_level INTEGER);
 CREATE TABLE annual_content_plan_slots(id TEXT PRIMARY KEY,plan_id TEXT REFERENCES annual_content_plans(id),status TEXT);
 INSERT INTO curriculum_versions VALUES('mat',1,'SCHOOL','2027-2028',9),('fiz',1,'SCHOOL','2027-2028',9),('old',1,'SCHOOL','2026-2027',9),('foreign_grade',1,'SCHOOL','2027-2028',10),('exam',1,'TYT','2027-2028',9),('unverified',0,'SCHOOL','2027-2028',9);
 INSERT INTO annual_content_plans VALUES('p','mat','2027-2028',9);INSERT INTO annual_content_plan_slots VALUES('a','p','CONTENT_REQUIRED'),('b','p','PUBLISHED');`);
 db.exec(readFileSync(new URL('../migrations/0117_annual_plan_curriculum_sources.sql',import.meta.url),'utf8'));
 expect(db.prepare('SELECT * FROM annual_content_plan_curricula').all()).toEqual([{plan_id:'p',curriculum_version_id:'mat'}]);
 db.exec("INSERT INTO annual_content_plan_curricula VALUES('p','fiz')");
 for(const id of ['old','foreign_grade','exam','unverified'])expect(()=>db.prepare("INSERT INTO annual_content_plan_curricula VALUES('p',?)").run(id)).toThrow('ANNUAL_CURRICULUM_CONTEXT_MISMATCH');
 expect(()=>db.exec("DELETE FROM annual_content_plan_slots WHERE plan_id='p'")).toThrow('PUBLISHED_ANNUAL_PLAN_IMMUTABLE');
 expect(()=>db.exec("DELETE FROM annual_content_plan_curricula WHERE plan_id='p'")).toThrow('PUBLISHED_ANNUAL_PLAN_IMMUTABLE');
 expect(db.prepare('SELECT count(*) n FROM annual_content_plan_slots').get()?.n).toBe(2);
 expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
 }finally{db.close()}
});
