import {DatabaseSync} from 'node:sqlite';
import {describe,it,expect} from 'vitest';
import {inspectThreeOptionMigration} from '../worker/lib/option-migration-inspect';
describe('read-only D1 3-option migration inventory',()=>{
 it('counts existing rows and captures inbound/outbound schema dependencies',async()=>{
  const db=new DatabaseSync(':memory:');
  try {
   db.exec(`PRAGMA foreign_keys=ON;
   CREATE TABLE question_bank(id TEXT PRIMARY KEY,option_count INTEGER CHECK(option_count IN(4,5)));
   CREATE TABLE exam_subjects(id TEXT PRIMARY KEY,option_count INTEGER CHECK(option_count IN(4,5)));
   CREATE TABLE exam_questions(id TEXT PRIMARY KEY,option_count INTEGER CHECK(option_count IN(4,5)));
   CREATE TABLE answer_keys(id TEXT PRIMARY KEY,exam_question_id TEXT REFERENCES exam_questions(id),option_count INTEGER CHECK(option_count IN(4,5)));
   CREATE INDEX idx_bank_count ON question_bank(option_count);
   INSERT INTO question_bank VALUES('q1',4); INSERT INTO exam_questions VALUES('eq',5);`);
   const env={DB:{prepare:(sql:string)=>{
    let params:any[]=[];
    const statement:any={bind:(...values:any[])=>{params=values;return statement;},all:async()=>({results:db.prepare(sql).all(...params)}),first:async()=>db.prepare(sql).get(...params)};
    return statement;
   }}} as any;
   const result=await inspectThreeOptionMigration(env);
   expect(result.safeToAutoRebuild).toBe(false);
   expect(result.rowCounts.find(x=>x.table==='question_bank')?.count).toBe(1);
   expect(result.dependentObjects).toContain('idx_bank_count');
   expect(result.foreignKeys.find(x=>x.table==='answer_keys')?.foreignKeys[0].refTable).toBe('exam_questions');
   expect((db.prepare('SELECT count(*) count FROM question_bank').get() as any).count).toBe(1);
  }finally{db.close();}
 });
});
