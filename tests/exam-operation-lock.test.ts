import { DatabaseSync } from 'node:sqlite';
import { expect,it } from 'vitest';
import { withExamOperationLock } from '../worker/lib/exam-operation-lock';

it('serializes the same exam, allows independent exams and releases after errors',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE exam_operation_locks(exam_id TEXT PRIMARY KEY,owner_token TEXT,operation TEXT)');
  const env={DB:{prepare:(sql:string)=>({bind:(...args:any[])=>({run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}})})})}} as any;
  try{
    let release!:()=>void;let started!:()=>void;
    const ready=new Promise<void>(resolve=>{started=resolve});
    const gate=new Promise<void>(resolve=>{release=resolve});
    const first=withExamOperationLock(env,'exam','FREEZE',async()=>{started();await gate;return new Response('ok')});
    await ready;
    let called=false;
    const busy=await withExamOperationLock(env,'exam','PUBLISH',async()=>{called=true;return new Response('unexpected')});
    expect(busy.status).toBe(409);expect(called).toBe(false);
    expect((await withExamOperationLock(env,'other','FREEZE',async()=>new Response('ok'))).status).toBe(200);
    release();await first;
    expect(db.prepare('SELECT * FROM exam_operation_locks').all()).toEqual([]);
    await expect(withExamOperationLock(env,'exam','FREEZE',async()=>{throw new Error('FAILED')})).rejects.toThrow('FAILED');
    expect(db.prepare('SELECT * FROM exam_operation_locks').all()).toEqual([]);
  }finally{db.close()}
});

it('never deletes a lock owned by another token',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE exam_operation_locks(exam_id TEXT PRIMARY KEY,owner_token TEXT,operation TEXT)');
  const env={DB:{prepare:(sql:string)=>({bind:(...args:any[])=>({run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}})})})}} as any;
  try{
    await withExamOperationLock(env,'exam','FREEZE',async()=>{db.exec("UPDATE exam_operation_locks SET owner_token='different-owner'");return new Response('ok')});
    expect((db.prepare('SELECT owner_token FROM exam_operation_locks').get() as any).owner_token).toBe('different-owner');
  }finally{db.close()}
});
