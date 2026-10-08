import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { expect,it } from 'vitest';
import { publishScheduledExamResults } from '../worker/lib/exam-schedule';

function fixture(failAudit=false,changeVersion=false){
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE exams(id TEXT,institution_id TEXT); INSERT INTO exams VALUES('e','school');
    CREATE TABLE exam_delivery_profiles(exam_id TEXT,snapshot_version INTEGER,result_freeze_status TEXT,result_publish_at TEXT,published_at TEXT,updated_at TEXT);
    INSERT INTO exam_delivery_profiles VALUES('e',1,'FROZEN','2000-01-01T00:00:00Z',NULL,NULL);
    CREATE TABLE exam_operation_locks(exam_id TEXT PRIMARY KEY,owner_token TEXT,operation TEXT);
    CREATE TABLE audit_logs(id TEXT,actor_user_id TEXT,institution_id TEXT,action TEXT,entity_type TEXT,entity_id TEXT,details_json TEXT);`);
  function statement(sql:string,args:any[]=[]):any{return {
    bind:(...bound:any[])=>statement(sql,bound),
    all:async()=>({results:db.prepare(sql).all(...args)}),
    run:async()=>{
      if(failAudit&&sql.includes('INSERT INTO audit_logs'))throw new Error('AUDIT_FAILED');
      if(changeVersion&&sql.includes('INSERT INTO exam_operation_locks'))db.exec('UPDATE exam_delivery_profiles SET snapshot_version=2');
      return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};
    },
  }}
  db.exec(readFileSync(new URL('../migrations/0059_exam_operation_write_guards.sql',import.meta.url),'utf8'));
  const env={DB:{prepare:statement,batch:async(statements:any[])=>{db.exec('BEGIN');try{const rows=[];for(const stmt of statements)rows.push(await stmt.run());db.exec('COMMIT');return rows}catch(error){db.exec('ROLLBACK');throw error}}}} as any;
  return {db,run:()=>publishScheduledExamResults(env)};
}
it('defers busy scheduled publication and publishes once after release',async()=>{
  const f=fixture();try{
    f.db.exec("INSERT INTO exam_operation_locks VALUES('e','owner','EVALUATE')");
    expect(await f.run()).toBe(0);expect(f.db.prepare('SELECT * FROM audit_logs').all()).toEqual([]);
    f.db.exec('DELETE FROM exam_operation_locks');expect(await f.run()).toBe(1);expect(await f.run()).toBe(0);
    expect(f.db.prepare('SELECT * FROM audit_logs').all()).toHaveLength(1);
  }finally{f.db.close()}
});
it('rolls back publication when its audit fails and releases the lock',async()=>{
  const f=fixture(true);try{await expect(f.run()).rejects.toThrow('AUDIT_FAILED');expect((f.db.prepare('SELECT result_freeze_status FROM exam_delivery_profiles').get() as any).result_freeze_status).toBe('FROZEN');expect(f.db.prepare('SELECT * FROM exam_operation_locks').all()).toEqual([])}finally{f.db.close()}
});
it('does not publish a snapshot version that changed since the due list was read',async()=>{
  const f=fixture(false,true);try{expect(await f.run()).toBe(0);expect(f.db.prepare('SELECT * FROM audit_logs').all()).toEqual([])}finally{f.db.close()}
});
