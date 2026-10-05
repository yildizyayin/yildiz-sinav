import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {handleFrozenFoyGameReport} from '../worker/lib/frozen-foy-game-report';

const student={id:'u-student',role:'STUDENT',student_id:'stu',institution_id:'inst'} as any;
const parent={id:'u-parent',role:'PARENT',student_id:null,institution_id:null} as any;
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE institutions(id TEXT PRIMARY KEY);
 CREATE TABLE subjects(id TEXT PRIMARY KEY);
 CREATE TABLE student_entities(id TEXT PRIMARY KEY,status TEXT);
 CREATE TABLE institution_seasons(id TEXT PRIMARY KEY,institution_id TEXT,academic_year TEXT);
 CREATE TABLE student_enrollments(id TEXT PRIMARY KEY,student_id TEXT,institution_id TEXT,season_id TEXT,class_id TEXT,grade_level INTEGER,status TEXT,created_at TEXT);
 CREATE TABLE parent_student_links(id TEXT PRIMARY KEY,parent_user_id TEXT,student_id TEXT,active INTEGER);
 CREATE TABLE curriculum_versions(id TEXT PRIMARY KEY,academic_year TEXT,grade_level INTEGER,program_version TEXT,verified INTEGER);
 CREATE TABLE outcomes(id TEXT PRIMARY KEY,curriculum_version_id TEXT,subject_id TEXT,grade_level INTEGER,active INTEGER);
 CREATE TABLE question_bank(id TEXT PRIMARY KEY,subject_id TEXT);
 CREATE TABLE question_learning_links(question_id TEXT,node_id TEXT,PRIMARY KEY(question_id,node_id));
 CREATE TABLE assessment_runs(id TEXT PRIMARY KEY,institution_id TEXT,student_id TEXT,source_type TEXT,assignment_id TEXT);
 CREATE TABLE assessment_responses(id TEXT PRIMARY KEY,run_id TEXT,student_id TEXT,question_id TEXT,node_id TEXT,selected_answer TEXT,is_correct INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE game_sessions(id TEXT PRIMARY KEY,student_id TEXT,game_code TEXT,node_id TEXT,score REAL,xp_earned INTEGER,duration_seconds INTEGER,payload_json TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 INSERT INTO institutions VALUES('inst'),('foreign'); INSERT INTO subjects VALUES('math'),('science');
 INSERT INTO student_entities VALUES('stu','ACTIVE'),('other','ACTIVE');
 INSERT INTO institution_seasons VALUES('season','inst','2026-2027'),('foreign-season','foreign','2026-2027');
 INSERT INTO student_enrollments VALUES('enr','stu','inst','season','class',7,'ACTIVE','2026-09-01 00:00:00');
 INSERT INTO student_enrollments VALUES('enr-other','other','foreign','foreign-season','other-class',7,'ACTIVE','2026-09-01 00:00:00');
 INSERT INTO parent_student_links VALUES('link','u-parent','stu',1);
 INSERT INTO curriculum_versions VALUES('cv','2026-2027',7,'maarif-v1',1);
 INSERT INTO outcomes VALUES('o','cv','math',7,1);
 INSERT INTO question_bank VALUES('q','math'),('bad','math'); INSERT INTO question_learning_links VALUES('q','ln_o');
 INSERT INTO assessment_runs VALUES('foy','inst','stu','FOY','asg');
 `);db.exec(readFileSync(new URL('../migrations/0075_frozen_foy_game_evidence.sql',import.meta.url),'utf8'));
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...a:any[])=>prepare(sql,a),first:async()=>db.prepare(sql).get(...args),all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
 const env={DB:{prepare}} as any;
 const get=(path:string,user:any=student)=>handleFrozenFoyGameReport(new Request(`https://test${path}`),env,user)!;
 return{db,env,get};
}

it('freezes FOY response context at insert time and never re-reads changed curriculum for the report',async()=>{
 const f=fixture();try{
  f.db.exec(`INSERT INTO assessment_responses(id,run_id,student_id,question_id,selected_answer,is_correct) VALUES('resp','foy','stu','q','A',1)`);
  const frozen:any=f.db.prepare(`SELECT * FROM frozen_foy_response_evidence WHERE response_id='resp'`).get();
  expect(frozen).toMatchObject({academic_year:'2026-2027',grade_level:7,subject_id:'math',curriculum_version_id:'cv',program_version:'maarif-v1',result_status:'CORRECT',context_valid:1});
  f.db.exec(`UPDATE curriculum_versions SET program_version='changed-live',verified=0 WHERE id='cv'; UPDATE outcomes SET active=0 WHERE id='o'`);
  const response=await f.get('/api/reporting/students/stu/frozen-foy?academicYear=2026-2027&runIds=foy');expect(response.status).toBe(200);const body:any=await response.json();
  expect(body.policy).toBe('FROZEN_FOY_RESPONSE_CONTEXT_V1');expect(body.groups).toEqual([expect.objectContaining({subjectId:'math',curriculumVersionId:'cv',programVersion:'maarif-v1',correct:1,evidenceCount:1,accuracy:100})]);
  expect(JSON.stringify(body)).not.toContain('changed-live');expect(JSON.stringify(body)).not.toContain('resp');
 }finally{f.db.close();}
});

it('captures invalid FOY context without blocking submission and excludes it from academic metrics',async()=>{
 const f=fixture();try{
  f.db.exec(`INSERT INTO assessment_responses(id,run_id,student_id,question_id,selected_answer,is_correct) VALUES('bad-resp','foy','stu','bad','B',0)`);
  expect(f.db.prepare(`SELECT context_valid,curriculum_version_id,program_version FROM frozen_foy_response_evidence WHERE response_id='bad-resp'`).get()).toMatchObject({context_valid:0,curriculum_version_id:null,program_version:null});
  const body:any=await (await f.get('/api/reporting/students/stu/frozen-foy?academicYear=2026-2027&runIds=foy')).json();expect(body.validEvidenceCount).toBe(0);expect(body.invalidEvidenceCount).toBe(1);expect(body.groups).toEqual([]);
 }finally{f.db.close();}
});

it('freezes mini-game curriculum context and reports game score separately from exam accuracy',async()=>{
 const f=fixture();try{
  f.db.exec(`INSERT INTO game_sessions(id,student_id,game_code,node_id,score,xp_earned,duration_seconds,payload_json) VALUES('game1','stu','MATH_SPEED','ln_o',80,30,45,'{}')`);
  f.db.exec(`UPDATE curriculum_versions SET program_version='later',verified=0 WHERE id='cv'`);
  const response=await f.get('/api/reporting/students/stu/frozen-games?academicYear=2026-2027&sessionIds=game1');expect(response.status).toBe(200);const body:any=await response.json();
  expect(body.policy).toBe('FROZEN_MINI_GAME_CONTEXT_V1');expect(body.groups).toEqual([expect.objectContaining({subjectId:'math',programVersion:'maarif-v1',sessionCount:1,averageScore:80,totalDurationSeconds:45,totalXp:30})]);
  expect(body.officialScore).toBeNull();expect(body.message).toContain('sınav doğruluğuna dönüştürülmez');
 }finally{f.db.close();}
});

it('enforces student/parent ownership and hides raw question/outcome identifiers from reader DTOs',async()=>{
 const f=fixture();try{
  f.db.exec(`INSERT INTO assessment_responses(id,run_id,student_id,question_id,selected_answer,is_correct) VALUES('resp','foy','stu','q','A',1)`);
  expect((await f.get('/api/reporting/students/stu/foy-runs?academicYear=2026-2027',parent)).status).toBe(200);
  f.db.exec(`UPDATE parent_student_links SET active=0 WHERE id='link'`);expect((await f.get('/api/reporting/students/stu/foy-runs?academicYear=2026-2027',parent)).status).toBe(403);
  expect((await f.get('/api/reporting/students/other/foy-runs?academicYear=2026-2027')).status).toBe(403);
  const own:any=await (await f.get('/api/reporting/students/stu/frozen-foy?academicYear=2026-2027&runIds=foy')).json();expect(JSON.stringify(own)).not.toContain('questionId');expect(JSON.stringify(own)).not.toContain('outcomeId');
 }finally{f.db.close();}
});
