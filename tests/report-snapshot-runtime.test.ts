import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { REPORT_SNAPSHOT_SQL } from '../worker/lib/report-snapshot';

it('captures independent report evidence once per version with real SQLite JSON', () => {
  const db=new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE exam_result_snapshots(exam_id TEXT,snapshot_version INTEGER,participant_id TEXT,student_id TEXT,net REAL,score REAL,institution_rank INTEGER,payload_json TEXT);
      CREATE TABLE exams(id TEXT,title TEXT,exam_date TEXT,exam_type TEXT);
      CREATE TABLE exam_participants(id TEXT,exam_id TEXT,booklet_code TEXT);
      CREATE TABLE exam_results(participant_id TEXT,correct_count INTEGER,wrong_count INTEGER,blank_count INTEGER,success_percent REAL);
      CREATE TABLE subjects(id TEXT,code TEXT,name TEXT);
      CREATE TABLE subject_results(participant_id TEXT,subject_id TEXT,correct_count INTEGER,wrong_count INTEGER,blank_count INTEGER,net REAL,success_percent REAL);
      CREATE TABLE outcomes(id TEXT,code TEXT,topic TEXT,subtopic TEXT,title TEXT,subject_id TEXT);
      CREATE TABLE student_answers(participant_id TEXT,exam_question_id TEXT,status TEXT);
      CREATE TABLE question_outcomes(exam_question_id TEXT,outcome_id TEXT);
      CREATE TABLE outcome_results(student_id TEXT,exam_id TEXT,outcome_id TEXT,evidence_count INTEGER,correct_count INTEGER);
      CREATE TABLE tyt_optional_philosophy_results(participant_id TEXT,subject_id TEXT,booklet_code TEXT,correct_count INTEGER,wrong_count INTEGER,blank_count INTEGER,invalid_count INTEGER,evidence_count INTEGER,success_percent REAL);
      INSERT INTO exam_result_snapshots VALUES('e',1,'p','student',2,NULL,1,NULL);
      INSERT INTO exams VALUES('e','Sınav','2026-09-30','TYT');
      INSERT INTO exam_participants VALUES('p','e','B');
      INSERT INTO exam_results VALUES('p',2,0,0,100);
      INSERT INTO subjects VALUES('s','MAT','Matematik');
      INSERT INTO subject_results VALUES('p','s',2,0,0,2,100);
      INSERT INTO outcomes VALUES('o','O1','Konu',NULL,'Çıktı','s');
      INSERT INTO outcome_results VALUES('student','e','o',99,99);
      INSERT INTO question_outcomes VALUES('q1','o'),('q2','o'),('q3','o');
      INSERT INTO student_answers VALUES('p','q1','CORRECT'),('p','q2','CORRECT'),('p','q3','INVALID'),('other-institution','q1','WRONG');
      INSERT INTO tyt_optional_philosophy_results VALUES('p','fel','B',1,1,3,0,5,20);`);
    db.exec("ALTER TABLE exams ADD COLUMN academic_year TEXT DEFAULT '2026-2027';ALTER TABLE exam_participants ADD COLUMN name_snapshot TEXT;ALTER TABLE exam_participants ADD COLUMN student_number_snapshot TEXT;ALTER TABLE exam_participants ADD COLUMN class_snapshot TEXT");
    db.prepare(REPORT_SNAPSHOT_SQL).run('e',1);
    const read=()=>JSON.parse((db.prepare('SELECT payload_json FROM exam_result_snapshots').get() as any).payload_json);
    expect(read().subjects[0].net).toBe(2);
    expect(read().outcomes[0].evidence_count).toBe(2);
    expect(read().optionalPhilosophy[0].correct_count).toBe(1);
    db.exec("UPDATE subject_results SET net=99; UPDATE student_answers SET status='WRONG';");
    db.prepare(REPORT_SNAPSHOT_SQL).run('e',1);
    expect(read().subjects[0].net).toBe(2);expect(read().outcomes[0].correct_count).toBe(2);
  } finally {db.close()}
});
