import {DatabaseSync} from 'node:sqlite';
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
describe('Studio multi-subject booklet outcome isolation',()=>{
 it('maps A/B physical global positions without confusing repeated subject-local question numbers',()=>{
  const db=new DatabaseSync(':memory:');
  try {
   db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE exams(id TEXT PRIMARY KEY);
    CREATE TABLE question_bank(id TEXT PRIMARY KEY);
    CREATE TABLE exam_questions(id TEXT PRIMARY KEY,exam_id TEXT,subject_id TEXT,question_no INTEGER,global_no INTEGER);
    CREATE TABLE subjects(id TEXT PRIMARY KEY);
    CREATE TABLE outcomes(id TEXT PRIMARY KEY);
    INSERT INTO exams VALUES('e');
    INSERT INTO question_bank VALUES('qm'),('qt');
    INSERT INTO subjects VALUES('math'),('tur');
    INSERT INTO outcomes VALUES('om'),('ot');
    INSERT INTO exam_questions VALUES('eqm','e','math',1,1),('eqt','e','tur',1,2);`);
   db.exec(readFileSync(new URL('../migrations/0101_studio_exam_booklet_outcomes.sql',import.meta.url),'utf8'));
   db.exec(`INSERT INTO studio_exam_booklet_positions VALUES
    ('e','A',1,'qm','eqm','math'),('e','A',2,'qt','eqt','tur'),
    ('e','B',1,'qm','eqm','math'),('e','B',2,'qt','eqt','tur');
    INSERT INTO studio_exam_booklet_outcomes VALUES
    ('e','A',1,'om'),('e','A',2,'ot'),('e','B',1,'om'),('e','B',2,'ot');`);
   const outcomeSQL=`SELECT q.subject_id,sbo.outcome_id FROM exam_questions q
    JOIN studio_exam_booklet_outcomes sbo ON sbo.exam_id=q.exam_id AND sbo.booklet_code='B'
    AND sbo.printed_question_no=coalesce(q.global_no,q.question_no)
    WHERE q.exam_id='e' ORDER BY q.global_no`;
   expect(db.prepare(outcomeSQL).all()).toEqual([{subject_id:'math',outcome_id:'om'},{subject_id:'tur',outcome_id:'ot'}]);
  } finally {db.close()}
 });
});
