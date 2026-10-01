import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { expect,it } from 'vitest';
import { withExamOperationLock } from '../worker/lib/exam-operation-lock';

function fixture(){
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE exam_operation_locks(exam_id TEXT PRIMARY KEY,owner_token TEXT,operation TEXT);CREATE TABLE written_results(value TEXT)');
  db.exec(readFileSync(new URL('../migrations/0059_exam_operation_write_guards.sql',import.meta.url),'utf8'));
  function prepare(sql:string,args:any[]=[]):any{return {
    bind:(...values:any[])=>prepare(sql,values),
    first:async(column?:string)=>{const row=db.prepare(sql).get(...args) as any;return column?row?.[column]:row},
    all:async()=>({results:db.prepare(sql).all(...args)}),
    run:async()=>{const stmt=db.prepare(sql);if(/RETURNING/i.test(sql))return {results:stmt.all(...args),meta:{changes:1}};return {results:[],meta:{changes:Number(stmt.run(...args).changes)}}},
  }}
  const env={DB:{prepare,batch:async(statements:any[])=>{db.exec('BEGIN');try{const rows=[];for(const s of statements)rows.push(await s.run());db.exec('COMMIT');return rows}catch(error){db.exec('ROLLBACK');throw error}}}} as any;
  return {db,env};
}
it('rejects a revoked owner resuming after another owner takes the lock, without deleting the new lock',async()=>{
  const f=fixture();try{
    let started!:()=>void;let resume!:()=>void;
    const ready=new Promise<void>(r=>{started=r});const gate=new Promise<void>(r=>{resume=r});
    const old=withExamOperationLock(f.env,'exam','EVALUATE',async(env)=>{started();await gate;await env.DB.prepare("INSERT INTO written_results VALUES('old')").run();return new Response('ok')});
    await ready;
    f.db.exec("DELETE FROM exam_operation_locks;INSERT INTO exam_operation_locks VALUES('exam','new-owner','FREEZE')");
    resume();expect((await old).status).toBe(409);
    expect(f.db.prepare('SELECT * FROM written_results').all()).toEqual([]);
    expect((f.db.prepare('SELECT owner_token FROM exam_operation_locks').get() as any).owner_token).toBe('new-owner');
    expect(f.db.prepare('SELECT * FROM exam_operation_write_guards').all()).toEqual([]);
  }finally{f.db.close()}
});
it('supports mutation batches and RETURNING while cleaning ownership assertions',async()=>{
  const f=fixture();try{
    const response=await withExamOperationLock(f.env,'exam','EVALUATE',async(env)=>{
      await env.DB.batch([env.DB.prepare("INSERT INTO written_results VALUES('one')"),env.DB.prepare("INSERT INTO written_results VALUES('two')")]);
      expect(await env.DB.prepare("INSERT INTO written_results VALUES('three') RETURNING value").first('value')).toBe('three');
      return new Response('ok');
    });
    expect(response.status).toBe(200);expect(f.db.prepare('SELECT * FROM written_results').all()).toHaveLength(3);
    expect(f.db.prepare('SELECT * FROM exam_operation_write_guards').all()).toEqual([]);
    expect(f.db.prepare('SELECT * FROM exam_operation_locks').all()).toEqual([]);
  }finally{f.db.close()}
});
