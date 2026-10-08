import { DatabaseSync } from 'node:sqlite';
import { expect,it,vi } from 'vitest';
vi.mock('../worker/lib/permissions',async original=>({...await original<any>(),loadPermissionScope:async()=>({guidanceClassIds:[],subjectClassAssignments:[{classId:'class',subjectId:'math'}]})}));
import { listFrozenPracticeRuns } from '../worker/reporting-entry';
it('lists only eligible owned frozen practice with branch filtering before keyset pagination',async()=>{
 const db=new DatabaseSync(':memory:');try{
 db.exec(`CREATE TABLE student_entities(id TEXT,first_name TEXT,last_name TEXT,status TEXT);INSERT INTO student_entities VALUES('s','Synthetic','Student','ACTIVE');
 CREATE TABLE student_enrollments(id TEXT,student_id TEXT,institution_id TEXT,season_id TEXT,class_id TEXT,student_number TEXT,grade_level INTEGER,section TEXT,status TEXT,created_at TEXT);INSERT INTO student_enrollments VALUES('en','s','school','season','class','1',7,'A','ACTIVE','2026');
 CREATE TABLE classes(id TEXT,name TEXT);INSERT INTO classes VALUES('class','7A');CREATE TABLE institutions(id TEXT,name TEXT);INSERT INTO institutions VALUES('school','Synthetic');
 CREATE TABLE parent_student_links(id TEXT,parent_user_id TEXT,student_id TEXT,active INTEGER);INSERT INTO parent_student_links VALUES('l','parent','s',1);
 CREATE TABLE assessment_runs(id TEXT,student_id TEXT,institution_id TEXT,source_type TEXT,status TEXT,delivery_mode TEXT,completed_at TEXT,metadata_json TEXT,source_id TEXT);`);
 const add=(id:string,student='s',institution='school',subject='math',season='season')=>db.prepare('INSERT INTO assessment_runs VALUES(?,?,?,?,?,?,?,?,?)').run(id,student,institution,'QUESTION_BANK','SCORED','DIGITAL','2026-10-01 12:00:00',JSON.stringify({frozenEvidence:{policy:'QUESTION_PRACTICE_READ_CONTEXT_V1',enrollmentId:'en',seasonId:season,academicYear:'2026-2027',gradeLevel:7,questionId:id,contentDigest:'a'.repeat(64),status:'CORRECT',outcomeRefs:[{outcomeId:'outcome',subjectId:subject,curriculumVersionId:'cv',academicYear:'2026-2027',gradeLevel:7,verified:1}]}}),id);
 add('own');add('foreign','foreign');add('foreign-school','s','other');add('science','s','school','science');add('old','s','school','math','old');
 const bad=(id:string,patch:any)=>{add(id);const r:any=db.prepare('SELECT metadata_json FROM assessment_runs WHERE id=?').get(id);const m=JSON.parse(r.metadata_json);Object.assign(m.frozenEvidence,patch);db.prepare('UPDATE assessment_runs SET metadata_json=? WHERE id=?').run(JSON.stringify(m),id);};
 bad('z-unverified',{outcomeRefs:[{verified:0}]});bad('z-string',{outcomeRefs:['bad']});bad('z-scalar',{outcomeRefs:'bad'});bad('z-grade',{gradeLevel:99});bad('z-digest',{contentDigest:'x'.repeat(64)});bad('z-mixed',{outcomeRefs:[{outcomeId:'a',subjectId:'math',curriculumVersionId:'a',academicYear:'2026-2027',gradeLevel:7,verified:1},{outcomeId:'b',subjectId:'math',curriculumVersionId:'b',academicYear:'2026-2027',gradeLevel:7,verified:1}]});bad('z-program',{outcomeRefs:[{outcomeId:'a',subjectId:'math',curriculumVersionId:'a',academicYear:'2026-2027',gradeLevel:7,verified:1,programVersion:3}]});add('z-malformed');db.prepare('UPDATE assessment_runs SET metadata_json=? WHERE id=?').run('{','z-malformed');
 add('z-date-only');db.prepare('UPDATE assessment_runs SET completed_at=? WHERE id=?').run('2026-10-01','z-date-only');
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...values:any[])=>prepare(sql,values),first:async()=>db.prepare(sql).get(...args),all:async()=>({results:db.prepare(sql).all(...args)})});const env={DB:{prepare}} as any;
 const url=new URL('https://test?academicYear=2026-2027&limit=1');const student={role:'STUDENT',student_id:'s'} as any;
 const first:any=await(await listFrozenPracticeRuns(env,student,'s',url)).json();expect(first.runs).toEqual([{id:'science',completedAt:'2026-10-01T12:00:00.000Z'}]);expect(first.nextCursor).toBeTypeOf('string');
 const next=new URL(url);next.searchParams.set('cursor',first.nextCursor);const second:any=await(await listFrozenPracticeRuns(env,student,'s',next)).json();expect(second.runs.map((r:any)=>r.id)).toEqual(['own']);expect(second.nextCursor).toBeNull();
 const teacher:any=await(await listFrozenPracticeRuns(env,{id:'t',role:'TEACHER',institution_id:'school'} as any,'s',url)).json();expect(teacher.runs.map((r:any)=>r.id)).toEqual(['own']);expect(teacher.nextCursor).toBeNull();expect(teacher.restrictedToSubjects).toBe(true);
 expect(JSON.stringify(first)).not.toMatch(/contentDigest|questionId|Synthetic|metadata/);
 const parent={role:'PARENT',id:'parent'} as any;expect((await listFrozenPracticeRuns(env,parent,'s',url)).status).toBe(200);db.exec('UPDATE parent_student_links SET active=0');expect((await listFrozenPracticeRuns(env,parent,'s',url)).status).toBe(403);
 expect((await listFrozenPracticeRuns(env,{role:'INSTITUTION_MANAGER',institution_id:'other'} as any,'s',url)).status).toBe(403);
 for(const query of ['academicYear=2026-2028','academicYear=2026-2027&limit=51','academicYear=2026-2027&cursor=bad'])expect((await listFrozenPracticeRuns(env,student,'s',new URL('https://test?'+query))).status).toBe(400);
 }finally{db.close();}
});
