import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
it('labels historical tests honestly and rolls back a competing question reservation',()=>{
 const db=new DatabaseSync(':memory:');try{
 db.exec(`PRAGMA foreign_keys=ON;CREATE TABLE student_entities(id TEXT PRIMARY KEY);INSERT INTO student_entities VALUES('s');CREATE TABLE question_bank(id TEXT PRIMARY KEY);INSERT INTO question_bank VALUES('q');CREATE TABLE coach_mini_tests(id TEXT PRIMARY KEY,student_id TEXT);INSERT INTO coach_mini_tests VALUES('old','s');CREATE TABLE coach_mini_test_questions(test_id TEXT,question_id TEXT);INSERT INTO coach_mini_test_questions VALUES('old','q');`);
 db.exec(readFileSync('migrations/0068_coach_mini_test_novelty.sql','utf8'));
 expect(db.prepare("SELECT selection_mode FROM coach_mini_tests WHERE id='old'").get()?.selection_mode).toBe('LEGACY');
 expect(db.prepare('SELECT count(*) n FROM coach_question_exposures').get()?.n).toBe(1);
 db.exec('BEGIN');try{db.exec("INSERT INTO coach_mini_tests VALUES('competing','s','NEW');INSERT INTO coach_question_exposures(student_id,question_id) VALUES('s','q')");throw Error('expected conflict');}catch(e){db.exec('ROLLBACK');expect(String(e)).toContain('UNIQUE constraint');}
 expect(db.prepare('SELECT count(*) n FROM coach_mini_tests').get()?.n).toBe(1);
 }finally{db.close();}
});
