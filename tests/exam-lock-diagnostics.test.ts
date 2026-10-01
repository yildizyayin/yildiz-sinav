import { DatabaseSync } from 'node:sqlite';
import { expect,it } from 'vitest';
import { handlePlatformApi } from '../worker/lib/platform-expansion';

it('restricts lock diagnostics to Super Admin without querying for other roles',async()=>{
  let queried=false;
  const env={DB:{prepare:()=>{queried=true;throw new Error('UNEXPECTED_READ')}}} as any;
  for(const role of ['INSTITUTION_MANAGER','TEACHER','STUDENT','PARENT']){
    const response=await handlePlatformApi(new Request('https://test/api/platform/exam-center/operation-locks'),env,{role} as any);
    expect(response!.status).toBe(403);
  }
  expect(queried).toBe(false);
});
it('reports bounded waiting locks without owner tokens or claiming abandoned ownership',async()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec('CREATE TABLE exam_operation_locks(exam_id TEXT,owner_token TEXT,operation TEXT,acquired_at TEXT)');
    for(let i=0;i<101;i++)db.prepare('INSERT INTO exam_operation_locks VALUES(?,?,?,?)').run(`exam${i}`,'secret-owner','EVALUATE','2000-01-01 00:00:00');
    const env={DB:{prepare:(sql:string)=>({all:async()=>({results:db.prepare(sql).all()})})}} as any;
    const response=await handlePlatformApi(new Request('https://test/api/platform/exam-center/operation-locks'),env,{role:'SUPER_ADMIN'} as any);
    const body=await response!.json() as any;
    expect(body.locks).toHaveLength(100);expect(body.hasMore).toBe(true);expect(body.recoveryAvailable).toBe(false);
    expect(body.locks[0].age_seconds).toBeGreaterThan(0);expect(body.locks[0].liveness).toBe('UNKNOWN');
    expect(JSON.stringify(body)).not.toContain('secret-owner');
    expect((db.prepare('SELECT COUNT(*) n FROM exam_operation_locks').get() as any).n).toBe(101);
  }finally{db.close()}
});
