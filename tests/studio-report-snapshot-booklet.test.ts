import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {REPORT_SNAPSHOT_SQL} from '../worker/lib/report-snapshot';
describe('Studio A/B outcomes in frozen result report',()=>{
 it('attributes B answers to the B printed position and preserves legacy fallback',()=>{
  const db=new DatabaseSync(':memory:');
  try{
   db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE exams(id TEXT PRIMARY KEY,title TEXT,exam_date TEXT,exam_type TEXT,academic_year TEXT);
    CREATE TABLE question_bank(id TEXT PRIMARY KEY);
    CREATE TABLE subjects(id TEXT PRIMARY KEY,code TEXT,name TEXT);
    CREATE TABLE exam_questions(id TEXT PRIMARY KEY,exam_id TEXT,question_no INTEGER,global_no INTEGER);
    CREATE TABLE outcomes(id TEXT PRIMARY KEY,subject_id TEXT,curriculum_version_id TEXT,code TEXT,topic TEXT,subtopic TEXT,title TEXT);
    CREATE TABLE curriculum_versions(id TEXT PRIMARY KEY,academic_year TEXT,grade_level INTEGER,program_version TEXT,verified INTEGER);
    CREATE TABLE exam_participants(id TEXT PRIMARY KEY,exam_id TEXT,booklet_code TEXT,name_snapshot TEXT,student_number_snapshot TEXT,class_snapshot TEXT);
    CREATE TABLE exam_results(participant_id TEXT,correct_count INTEGER,wrong_count INTEGER,blank_count INTEGER,success_percent REAL);
    CREATE TABLE student_answers(participant_id TEXT,exam_question_id TEXT,status TEXT,answer TEXT);
    CREATE TABLE subject_results(participant_id TEXT,subject_id TEXT,correct_count INTEGER,wrong_count INTEGER,blank_count INTEGER,net REAL,success_percent REAL);
    CREATE TABLE exam_result_snapshots(exam_id TEXT,snapshot_version INTEGER,payload_json TEXT,participant_id TEXT,net REAL,score REAL,institution_rank INTEGER);
    CREATE TABLE question_outcomes(exam_question_id TEXT,outcome_id TEXT);
    CREATE TABLE tyt_optional_philosophy_results(participant_id TEXT,subject_id TEXT,booklet_code TEXT,correct_count INTEGER,wrong_count INTEGER,blank_count INTEGER,invalid_count INTEGER,evidence_count INTEGER,success_percent REAL);
    INSERT INTO exams VALUES('e','Exam',NULL,'PRACTICE','2026-2027');
    INSERT INTO subjects VALUES('math','MAT','Matematik');
    INSERT INTO question_bank VALUES('q1'),('q2');
    INSERT INTO curriculum_versions VALUES('v','2026-2027',5,'maarif',1);
    INSERT INTO outcomes VALUES('o1','math','v','K1',NULL,NULL,'Kazanım 1'),('o2','math','v','K2',NULL,NULL,'Kazanım 2');
    INSERT INTO exam_questions VALUES('eq1','e',1,1),('eq2','e',2,2);
    INSERT INTO question_outcomes VALUES('eq1','o1'),('eq2','o2');
    INSERT INTO exam_participants VALUES('pA','e','A','A','1','5'),('pB','e','B','B','2','5');
    INSERT INTO exam_results VALUES('pA',1,1,0,50),('pB',1,1,0,50);
    INSERT INTO student_answers VALUES('pA','eq1','CORRECT','A'),('pA','eq2','WRONG','B'),('pB','eq1','CORRECT','C'),('pB','eq2','WRONG','A');
    INSERT INTO exam_result_snapshots VALUES('e',1,NULL,'pA',0,0,1),('e',1,NULL,'pB',0,0,2);
   `);
   db.exec(readFileSync(new URL('../migrations/0101_studio_exam_booklet_outcomes.sql',import.meta.url),'utf8'));
   db.exec(`INSERT INTO studio_exam_booklet_positions VALUES('e','A',1,'q1','eq1','math'),('e','A',2,'q2','eq2','math'),('e','B',1,'q2','eq1','math'),('e','B',2,'q1','eq2','math');
   INSERT INTO studio_exam_booklet_outcomes VALUES('e','A',1,'o1'),('e','A',2,'o2'),('e','B',1,'o2'),('e','B',2,'o1');`);
   db.prepare(REPORT_SNAPSHOT_SQL).run('e',1);
   const a=JSON.parse((db.prepare("SELECT payload_json FROM exam_result_snapshots WHERE participant_id='pA'").get() as any).payload_json);
   const b=JSON.parse((db.prepare("SELECT payload_json FROM exam_result_snapshots WHERE participant_id='pB'").get() as any).payload_json);
   expect(a.questionEvidence.map((x:any)=>x.outcomeRefs[0].outcomeId)).toEqual(['o1','o2']);
   expect(b.questionEvidence.map((x:any)=>x.outcomeRefs[0].outcomeId)).toEqual(['o2','o1']);
   expect(b.outcomes.find((x:any)=>x.outcome_id==='o2').correct_count).toBe(1);
  }finally{db.close()}
 });
});
