import { DatabaseSync } from 'node:sqlite';
import { it, expect, vi } from 'vitest';
vi.mock('../worker/lib/permissions', async original => ({...await original<any>(),loadPermissionScope:async()=>({guidanceClassIds:[],subjectClassAssignments:[{classId:'class',subjectId:'math'}]})}));
import { frozenExamReport } from '../worker/lib/frozen-exam-report';
import { selectedFrozenExamReport } from '../worker/reporting-entry';

const question=(id:string,status:string,subjectId='math')=>({questionId:id,status,outcomeRefs:[{subjectId,curriculumVersionId:'cv',academicYear:'2026-2027',gradeLevel:7,verified:1}]});
const payload=(questions:any[])=>JSON.stringify({schemaVersion:1,exam:{academic_year:'2026-2027'},questionEvidencePolicy:'NATIVE_STATUS_AND_CURRICULUM_AT_FREEZE_V1',questionEvidence:questions});
it('keeps invalid questions outside accuracy, separates missing context and scopes branch diagnostics',()=>{
 const rows=[{exam_id:'e',grade_level:7,academic_year:'2026-2027',payload_json:payload([question('q1','CORRECT'),question('q2','BLANK'),question('q3','INVALID'),{...question('q4','WRONG'),outcomeRefs:[]},question('science','WRONG','science')])}];
 const all=frozenExamReport(rows,null);expect(all.groups[0]).toMatchObject({evidenceCount:2,accuracyPercent:50,invalid:1});expect(all.coverage?.excludedEvidence).toBe(1);
 const math=frozenExamReport(rows,['math']);expect(math.groups).toHaveLength(1);expect(math.coverage).toBeNull();expect(JSON.stringify(math)).not.toContain('science');
 expect(frozenExamReport([{payload_json:'{}'}],null).coverage?.legacySnapshots).toBe(1);
});

it('reads only current published versions and enforces student, institution and staff season scopes',async()=>{
 const db=new DatabaseSync(':memory:');try{
 db.exec(`CREATE TABLE student_entities(id TEXT,first_name TEXT,last_name TEXT,status TEXT);INSERT INTO student_entities VALUES('student','Synthetic','Student','ACTIVE');
 CREATE TABLE student_enrollments(student_id TEXT,institution_id TEXT,season_id TEXT,class_id TEXT,student_number TEXT,grade_level INTEGER,section TEXT,status TEXT,created_at TEXT);INSERT INTO student_enrollments VALUES('student','school','season','class','1',7,'A','ACTIVE','2026');
 CREATE TABLE classes(id TEXT,name TEXT);INSERT INTO classes VALUES('class','7A');CREATE TABLE institutions(id TEXT,name TEXT);INSERT INTO institutions VALUES('school','Synthetic');
 CREATE TABLE exam_result_snapshots(exam_id TEXT,participant_id TEXT,student_id TEXT,institution_id TEXT,snapshot_version INTEGER,grade_level INTEGER,payload_json TEXT);
 CREATE TABLE exams(id TEXT,academic_year TEXT);INSERT INTO exams VALUES('e','2026-2027');
 CREATE TABLE exam_delivery_profiles(exam_id TEXT,snapshot_version INTEGER,result_freeze_status TEXT,published_at TEXT,result_publish_at TEXT);INSERT INTO exam_delivery_profiles VALUES('e',1,'PUBLISHED','2026-01-01',NULL);
 CREATE TABLE exam_participants(id TEXT,exam_id TEXT,student_id TEXT,institution_id TEXT,season_id TEXT);INSERT INTO exam_participants VALUES('p','e','student','school','season');`);
 db.prepare('INSERT INTO exam_result_snapshots VALUES(?,?,?,?,?,?,?)').run('e','p','student','school',1,7,payload([question('q','CORRECT'),question('s','WRONG','science')]));
 db.prepare('INSERT INTO exam_result_snapshots VALUES(?,?,?,?,?,?,?)').run('e','p','student','school',2,7,payload([question('q','WRONG')]));
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...values:any[])=>prepare(sql,values),first:async()=>db.prepare(sql).get(...args),all:async()=>({results:db.prepare(sql).all(...args)})});const env={DB:{prepare}} as any;
 const url=new URL('https://test?academicYear=2026-2027&examIds=e');
 const student={role:'STUDENT',student_id:'student'} as any;
 expect((await(await selectedFrozenExamReport(env,student,'student',url)).json() as any).groups[0].accuracyPercent).toBe(100);
 expect((await selectedFrozenExamReport(env,{role:'STUDENT',student_id:'foreign'} as any,'student',url)).status).toBe(403);
 const teacher={role:'TEACHER',id:'teacher',institution_id:'school'} as any;
 const branch:any=await(await selectedFrozenExamReport(env,teacher,'student',url)).json();expect(branch.groups).toHaveLength(1);expect(branch.coverage).toBeNull();
 db.exec("UPDATE exam_participants SET season_id='old'");expect((await(await selectedFrozenExamReport(env,teacher,'student',url)).json() as any).groups).toHaveLength(0);
 db.exec("UPDATE exam_delivery_profiles SET result_freeze_status='FROZEN'");expect((await(await selectedFrozenExamReport(env,student,'student',url)).json() as any).unavailableExamIds).toEqual(['e']);
 expect((await selectedFrozenExamReport(env,student,'student',new URL('https://test?academicYear=bad&examIds=e'))).status).toBe(400);
 }finally{db.close();}
});
