import { DatabaseSync } from 'node:sqlite';
import { expect,it,vi } from 'vitest';
vi.mock('../worker/lib/permissions',async original=>({...await original<any>(),loadPermissionScope:async()=>({guidanceClassIds:[],subjectClassAssignments:[{classId:'class',subjectId:'math'}]})}));
import { selectedFrozenPracticeReport } from '../worker/reporting-entry';
it('reads selected owned frozen practice with branch and season isolation and current parent authorization',async()=>{
 const db=new DatabaseSync(':memory:');try{
 db.exec(`CREATE TABLE student_entities(id TEXT,first_name TEXT,last_name TEXT,status TEXT);INSERT INTO student_entities VALUES('s','Synthetic','Student','ACTIVE');
 CREATE TABLE student_enrollments(id TEXT,student_id TEXT,institution_id TEXT,season_id TEXT,class_id TEXT,student_number TEXT,grade_level INTEGER,section TEXT,status TEXT,created_at TEXT);INSERT INTO student_enrollments VALUES('en','s','school','season','class','1',7,'A','ACTIVE','2026');
 CREATE TABLE classes(id TEXT,name TEXT);INSERT INTO classes VALUES('class','7A');CREATE TABLE institutions(id TEXT,name TEXT);INSERT INTO institutions VALUES('school','Synthetic');
 CREATE TABLE parent_student_links(id TEXT,parent_user_id TEXT,student_id TEXT,active INTEGER);INSERT INTO parent_student_links VALUES('l','parent','s',1);
 CREATE TABLE assessment_runs(id TEXT,student_id TEXT,institution_id TEXT,source_type TEXT,status TEXT,delivery_mode TEXT,completed_at TEXT,metadata_json TEXT,source_id TEXT);`);
 const add=(id:string,student='s',institution='school',subject='math',season='season')=>db.prepare('INSERT INTO assessment_runs VALUES(?,?,?,?,?,?,?,?,?)').run(id,student,institution,'QUESTION_BANK','SCORED','DIGITAL','2026-10-01',JSON.stringify({frozenEvidence:{policy:'QUESTION_PRACTICE_READ_CONTEXT_V1',enrollmentId:'en',seasonId:season,academicYear:'2026-2027',gradeLevel:7,questionId:id,contentDigest:'a'.repeat(64),status:'CORRECT',outcomeRefs:[{outcomeId:'outcome',subjectId:subject,curriculumVersionId:'cv',academicYear:'2026-2027',gradeLevel:7,verified:1}]}}),id);
 add('own');add('foreign','foreign');add('foreign-school','s','other');add('science','s','school','science');add('old','s','school','math','old');
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...values:any[])=>prepare(sql,values),first:async()=>db.prepare(sql).get(...args),all:async()=>({results:db.prepare(sql).all(...args)})});const env={DB:{prepare}} as any;
 const url=new URL('https://test?academicYear=2026-2027&runIds=own,foreign,foreign-school,science,old');const student={role:'STUDENT',student_id:'s'} as any;
 const data:any=await(await selectedFrozenPracticeReport(env,student,'s',url)).json();expect(data.groups).toHaveLength(2);expect(data.unavailableRunIds).toEqual(['foreign','foreign-school','old']);expect(JSON.stringify(data)).not.toContain('contentDigest');
 const teacher:any=await(await selectedFrozenPracticeReport(env,{id:'t',role:'TEACHER',institution_id:'school'} as any,'s',url)).json();expect(teacher.groups).toHaveLength(1);expect(teacher.groups[0].subjectId).toBe('math');expect(teacher.coverage).toBeNull();expect(teacher.unavailableRunIds).toEqual([]);
 const parent={role:'PARENT',id:'parent'} as any;expect((await selectedFrozenPracticeReport(env,parent,'s',url)).status).toBe(200);db.exec('UPDATE parent_student_links SET active=0');expect((await selectedFrozenPracticeReport(env,parent,'s',url)).status).toBe(403);
 expect((await selectedFrozenPracticeReport(env,{role:'INSTITUTION_MANAGER',institution_id:'other'} as any,'s',url)).status).toBe(403);
 expect((await selectedFrozenPracticeReport(env,student,'s',new URL('https://test?academicYear=2026-2027&runIds=own&repeatPolicy=BAD'))).status).toBe(400);
 }finally{db.close();}
});
