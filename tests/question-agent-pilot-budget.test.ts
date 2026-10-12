import {describe,it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
describe('atomic AI question pilot quota',()=>{
 it('reserves max 50 questions and blocks duplicate or over-budget jobs',()=>{
  const db=new DatabaseSync(':memory:');
  try{
   db.exec('PRAGMA foreign_keys=ON; CREATE TABLE question_generation_jobs(id TEXT PRIMARY KEY);');
   db.exec(readFileSync('migrations/0102_question_agent_pilot_budget.sql','utf8'));
   for(let i=0;i<6;i++)db.prepare('INSERT INTO question_generation_jobs(id) VALUES(?)').run('j'+i);
   const stmt=db.prepare('INSERT OR IGNORE INTO question_agent_pilot_reservations(job_id,question_count) VALUES(?,10)');
   for(let i=0;i<5;i++)expect(stmt.run('j'+i).changes).toBe(1);
   expect(stmt.run('j0').changes).toBe(0);
   expect(()=>stmt.run('j5')).toThrow();
   expect((db.prepare("SELECT reserved_count FROM question_agent_pilot_budget WHERE id='pilot_50'").get() as any).reserved_count).toBe(50);
   expect((db.prepare('SELECT count(*) n FROM question_agent_pilot_reservations').get() as any).n).toBe(5);
  } finally {db.close();}
 });
});

describe('pilot reservation failure safety',()=>{
 it('does not refund failed jobs or accidentally allow a sixth batch',()=>{
  const db=new DatabaseSync(':memory:');
  try{
   db.exec("PRAGMA foreign_keys=ON; CREATE TABLE question_generation_jobs(id TEXT PRIMARY KEY,status TEXT NOT NULL);");
   db.exec(readFileSync('migrations/0102_question_agent_pilot_budget.sql','utf8'));
   for(let i=0;i<6;i++)db.prepare('INSERT INTO question_generation_jobs VALUES(?,?)').run('job'+i,'REQUESTED');
   const reserve=db.prepare('INSERT OR IGNORE INTO question_agent_pilot_reservations(job_id,question_count) VALUES(?,?)');
   expect(reserve.run('job0',10).changes).toBe(1);
   db.prepare("UPDATE question_generation_jobs SET status='FAILED' WHERE id='job0'").run();
   expect(reserve.run('job0',10).changes).toBe(0);
   for(let i=1;i<5;i++)expect(reserve.run('job'+i,10).changes).toBe(1);
   expect(()=>reserve.run('job5',10)).toThrow(/PILOT_BUDGET_EXHAUSTED/);
   expect((db.prepare("SELECT reserved_count n FROM question_agent_pilot_budget WHERE id='pilot_50'").get() as any).n).toBe(50);
   expect((db.prepare('SELECT count(*) n FROM question_agent_pilot_reservations').get() as any).n).toBe(5);
  }finally{db.close();}
 });
 it('does not debit quota on invalid foreign-key job references',()=>{
  const db=new DatabaseSync(':memory:');
  try{
   db.exec('PRAGMA foreign_keys=ON; CREATE TABLE question_generation_jobs(id TEXT PRIMARY KEY);');
   db.exec(readFileSync('migrations/0102_question_agent_pilot_budget.sql','utf8'));
   expect(()=>db.prepare("INSERT INTO question_agent_pilot_reservations(job_id,question_count) VALUES('missing',10)").run()).toThrow();
   expect((db.prepare("SELECT reserved_count n FROM question_agent_pilot_budget WHERE id='pilot_50'").get() as any).n).toBe(0);
  }finally{db.close();}
 });
});
