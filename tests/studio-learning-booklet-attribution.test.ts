import {DatabaseSync} from 'node:sqlite';
import {describe,it,expect} from 'vitest';
describe('booklet-dependent learning assessment attribution',()=>{
 it('keeps A and B outcome IDs attached to the physically answered question',()=>{
  const db=new DatabaseSync(':memory:');
  try{
   db.exec(`CREATE TABLE exam_questions(id TEXT PRIMARY KEY,exam_id TEXT,question_no INTEGER,global_no INTEGER,subject_id TEXT);
    CREATE TABLE student_answers(participant_id TEXT,exam_question_id TEXT,answer TEXT,status TEXT);
    CREATE TABLE question_outcomes(exam_question_id TEXT,outcome_id TEXT);
    CREATE TABLE studio_exam_booklet_positions(exam_id TEXT,booklet_code TEXT,printed_question_no INTEGER);
    CREATE TABLE studio_exam_booklet_outcomes(exam_id TEXT,booklet_code TEXT,printed_question_no INTEGER,outcome_id TEXT);
    INSERT INTO exam_questions VALUES('eq1','e',1,1,'m'),('eq2','e',2,2,'m');
    INSERT INTO question_outcomes VALUES('eq1','o1'),('eq2','o2');
    INSERT INTO studio_exam_booklet_positions VALUES('e','A',1),('e','A',2),('e','B',1),('e','B',2);
    INSERT INTO studio_exam_booklet_outcomes VALUES('e','A',1,'o1'),('e','A',2,'o2'),('e','B',1,'o2'),('e','B',2,'o1');
    INSERT INTO student_answers VALUES('pA','eq1','A','CORRECT'),('pA','eq2','C','WRONG'),('pB','eq1','C','CORRECT'),('pB','eq2','A','WRONG');`);
   const sql=`SELECT sa.exam_question_id question_id,sa.status,coalesce(sbo.outcome_id,qo.outcome_id) outcome_id
    FROM student_answers sa JOIN exam_questions q ON q.id=sa.exam_question_id
    LEFT JOIN studio_exam_booklet_outcomes sbo ON sbo.exam_id=?
      AND sbo.booklet_code=? AND sbo.printed_question_no=coalesce(q.global_no,q.question_no)
    LEFT JOIN question_outcomes qo ON qo.exam_question_id=q.id
      AND NOT EXISTS(SELECT 1 FROM studio_exam_booklet_positions sp WHERE sp.exam_id=? AND sp.booklet_code=?)
    WHERE sa.participant_id=? ORDER BY q.global_no`;
   expect(db.prepare(sql).all('e','A','e','A','pA').map((r:any)=>r.outcome_id)).toEqual(['o1','o2']);
   expect(db.prepare(sql).all('e','B','e','B','pB').map((r:any)=>r.outcome_id)).toEqual(['o2','o1']);
   db.exec("DELETE FROM studio_exam_booklet_outcomes; DELETE FROM studio_exam_booklet_positions");
   expect(db.prepare(sql).all('e','B','e','B','pB').map((r:any)=>r.outcome_id)).toEqual(['o1','o2']);
  }finally{db.close()}
 });
});
