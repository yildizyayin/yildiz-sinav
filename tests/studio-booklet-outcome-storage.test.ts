import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
describe('Studio physical booklet outcomes migration',()=>{
 it('preserves separate official outcomes for different printed A/B positions',()=>{
  const db=new DatabaseSync(':memory:');
  try{
   db.exec(`PRAGMA foreign_keys=ON;
   CREATE TABLE exams(id TEXT PRIMARY KEY);
   CREATE TABLE question_bank(id TEXT PRIMARY KEY);
   CREATE TABLE exam_questions(id TEXT PRIMARY KEY);
   CREATE TABLE subjects(id TEXT PRIMARY KEY);
   CREATE TABLE outcomes(id TEXT PRIMARY KEY);`);
   db.exec(readFileSync(new URL('../migrations/0101_studio_exam_booklet_outcomes.sql',import.meta.url),'utf8'));
   db.exec("INSERT INTO exams VALUES('ex'); INSERT INTO question_bank VALUES('q1'),('q2'); INSERT INTO exam_questions VALUES('eq1'),('eq2'); INSERT INTO subjects VALUES('math'); INSERT INTO outcomes VALUES('o1'),('o2')");
   db.exec("INSERT INTO studio_exam_booklet_positions VALUES('ex','A',1,'q1','eq1','math'),('ex','A',2,'q2','eq2','math'),('ex','B',1,'q2','eq1','math'),('ex','B',2,'q1','eq2','math')");
   db.exec("INSERT INTO studio_exam_booklet_outcomes VALUES('ex','A',1,'o1'),('ex','A',2,'o2'),('ex','B',1,'o2'),('ex','B',2,'o1')");
   const rows=db.prepare("SELECT booklet_code,printed_question_no,outcome_id FROM studio_exam_booklet_outcomes ORDER BY booklet_code,printed_question_no").all();
   expect(rows).toEqual([{booklet_code:'A',printed_question_no:1,outcome_id:'o1'},{booklet_code:'A',printed_question_no:2,outcome_id:'o2'},{booklet_code:'B',printed_question_no:1,outcome_id:'o2'},{booklet_code:'B',printed_question_no:2,outcome_id:'o1'}]);
   expect(()=>db.exec("INSERT INTO studio_exam_booklet_positions VALUES('ex','B',1,'q1','eq1','math')")).toThrow();
  }finally{db.close();}
 });
});
