import {DatabaseSync} from 'node:sqlite';
import {describe,it,expect} from 'vitest';
describe('first ten-question pilot job selection',()=>{
 it('does not mistake two five-question jobs for one runnable ten-question batch',()=>{
  const db=new DatabaseSync(':memory:');
  try{
   db.exec("CREATE TABLE jobs(id TEXT PRIMARY KEY,question_count INTEGER NOT NULL,status TEXT NOT NULL); INSERT INTO jobs VALUES('a',5,'REQUESTED'),('b',5,'REQUESTED');");
   const largest=()=>Number((db.prepare("SELECT COALESCE(MAX(question_count),0) n FROM jobs WHERE status='REQUESTED'").get() as any).n);
   expect(largest()).toBe(5);
   db.exec("INSERT INTO jobs VALUES('c',10,'REQUESTED')");
   expect(largest()).toBe(10);
   db.exec("UPDATE jobs SET status='FAILED' WHERE id='c'");
   expect(largest()).toBe(5);
  }finally{db.close();}
 });
});
