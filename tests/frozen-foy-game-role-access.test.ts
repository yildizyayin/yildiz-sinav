import {DatabaseSync} from 'node:sqlite';
import {expect,it} from 'vitest';
import {handleFrozenFoyGameReport} from '../worker/lib/frozen-foy-game-report';

const users={
 student:{id:'u-stu',role:'STUDENT',student_id:'stu',institution_id:'inst'},
 parent:{id:'u-parent',role:'PARENT',student_id:null,institution_id:null},
 manager:{id:'u-manager',role:'INSTITUTION_MANAGER',student_id:null,institution_id:'inst'},
 foreignManager:{id:'u-foreign',role:'INSTITUTION_MANAGER',student_id:null,institution_id:'other-inst'},
 teacher:{id:'u-teacher',role:'TEACHER',student_id:null,institution_id:'inst'},
 guidance:{id:'u-guidance',role:'GUIDANCE_TEACHER',student_id:null,institution_id:'inst'},
} as const;
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec(`
 CREATE TABLE student_entities(id TEXT PRIMARY KEY,status TEXT);
 CREATE TABLE student_enrollments(id TEXT PRIMARY KEY,student_id TEXT,institution_id TEXT,season_id TEXT,class_id TEXT,grade_level INTEGER,status TEXT,created_at TEXT);
 CREATE TABLE parent_student_links(id TEXT PRIMARY KEY,parent_user_id TEXT,student_id TEXT,active INTEGER);
 CREATE TABLE teacher_assignments(id TEXT PRIMARY KEY,user_id TEXT,season_id TEXT,class_id TEXT,subject_id TEXT,assignment_type TEXT,active INTEGER);
 CREATE TABLE frozen_foy_response_evidence(response_id TEXT PRIMARY KEY,run_id TEXT,student_id TEXT,institution_id TEXT,assignment_id TEXT,enrollment_id TEXT,season_id TEXT,academic_year TEXT,grade_level INTEGER,subject_id TEXT,curriculum_version_id TEXT,program_version TEXT,outcome_refs_json TEXT,result_status TEXT,context_valid INTEGER,observed_at TEXT);
 CREATE TABLE frozen_game_session_evidence(session_id TEXT PRIMARY KEY,student_id TEXT,institution_id TEXT,enrollment_id TEXT,season_id TEXT,academic_year TEXT,grade_level INTEGER,game_code TEXT,node_id TEXT,subject_id TEXT,outcome_id TEXT,curriculum_version_id TEXT,program_version TEXT,context_valid INTEGER,score REAL,xp_earned INTEGER,duration_seconds INTEGER,observed_at TEXT);
 INSERT INTO student_entities VALUES('stu','ACTIVE'),('other','ACTIVE');
 INSERT INTO student_enrollments VALUES('enr','stu','inst','season','class-7a',7,'ACTIVE','2026-09-01'),('enr-other','other','other-inst','season-other','class-x',7,'ACTIVE','2026-09-01');
 INSERT INTO parent_student_links VALUES('parent-link','u-parent','stu',1);
 INSERT INTO teacher_assignments VALUES('ta','u-teacher','season','class-7a','math','SUBJECT',1),('ga','u-guidance','season','class-7a',NULL,'GUIDANCE',1);
 INSERT INTO frozen_foy_response_evidence VALUES
 ('r-math','foy-1','stu','inst',NULL,'enr','season','2026-2027',7,'math','cv-math','v1','[]','CORRECT',1,'2026-10-01T10:00:00Z'),
 ('r-science','foy-1','stu','inst',NULL,'enr','season','2026-2027',7,'science','cv-science','v1','[]','WRONG',1,'2026-10-01T10:01:00Z');
 INSERT INTO frozen_game_session_evidence VALUES
 ('g-math','stu','inst','enr','season','2026-2027',7,'MATH_SPEED','ln_m','math','m','cv-math','v1',1,90,20,30,'2026-10-01T11:00:00Z'),
 ('g-science','stu','inst','enr','season','2026-2027',7,'SCIENCE','ln_s','science','s','cv-science','v1',1,70,10,40,'2026-10-01T11:01:00Z');
 `);
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...values:any[])=>prepare(sql,values),first:async()=>db.prepare(sql).get(...args),all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
 const env={DB:{prepare}} as any;
 const call=(path:string,user:any)=>handleFrozenFoyGameReport(new Request(`https://test${path}`),env,user)!;
 return{db,call};
}
const foy='/api/reporting/students/stu/frozen-foy?academicYear=2026-2027&runIds=foy-1';
const games='/api/reporting/students/stu/frozen-games?academicYear=2026-2027&sessionIds=g-math,g-science';

it('keeps student, parent and institution-manager FOY access inside live ownership links',async()=>{
 const f=fixture();try{
  expect((await f.call(foy,users.student)).status).toBe(200);
  expect((await f.call(foy,users.parent)).status).toBe(200);
  expect((await f.call(foy,users.manager)).status).toBe(200);
  expect((await f.call(foy,users.foreignManager)).status).toBe(403);
  f.db.exec(`UPDATE parent_student_links SET active=0 WHERE id='parent-link'`);
  expect((await f.call(foy,users.parent)).status).toBe(403);
 }finally{f.db.close();}
});

it('limits subject teachers to assigned class+subject but lets the guidance teacher see the whole assigned class',async()=>{
 const f=fixture();try{
  const teacher:any=await (await f.call(foy,users.teacher)).json();expect(teacher.restrictedToSubjects).toBe(true);expect(teacher.groups.map((g:any)=>g.subjectId)).toEqual(['math']);expect(teacher.unavailableRunIds).toEqual([]);
  const teacherGames:any=await (await f.call(games,users.teacher)).json();expect(teacherGames.groups.map((g:any)=>g.subjectId)).toEqual(['math']);
  const guidance:any=await (await f.call(foy,users.guidance)).json();expect(guidance.restrictedToSubjects).toBe(false);expect(guidance.groups.map((g:any)=>g.subjectId).sort()).toEqual(['math','science']);
  f.db.exec(`UPDATE teacher_assignments SET active=0 WHERE id='ta'`);expect((await f.call(foy,users.teacher)).status).toBe(403);
 }finally{f.db.close();}
});
