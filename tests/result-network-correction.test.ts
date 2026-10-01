import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {reopenNetworkResults} from '../worker/lib/result-network-correction';
function fixture(fail=false){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE exam_administrations(id TEXT,exam_id TEXT,channel TEXT,status TEXT,published_snapshot_version INTEGER,published_at TEXT,ranking_frozen_at TEXT,retention_due_at TEXT);
 INSERT INTO exam_administrations VALUES('a','e','RESULT_NETWORK','PUBLISHED',2,'old','old','2099');
 CREATE TABLE exam_operation_locks(exam_id TEXT PRIMARY KEY,owner_token TEXT,operation TEXT);
 CREATE TABLE exam_result_snapshots(payload_json TEXT);INSERT INTO exam_result_snapshots VALUES('original');
 CREATE TABLE scan_batches(id TEXT,exam_id TEXT,status TEXT);INSERT INTO scan_batches VALUES('b','e','COMMITTED'),('foreign','other','COMMITTED');
 CREATE TABLE scan_evaluation_progress(batch_id TEXT);INSERT INTO scan_evaluation_progress VALUES('b'),('foreign');
 CREATE TABLE audit_logs(id TEXT,actor_user_id TEXT,institution_id TEXT,action TEXT,entity_type TEXT,entity_id TEXT,details_json TEXT);`);
 db.exec(readFileSync(new URL('../migrations/0059_exam_operation_write_guards.sql',import.meta.url),'utf8'));
 function prepare(sql:string,args:any[]=[]):any{return {bind:(...values:any[])=>prepare(sql,values),first:async()=>db.prepare(sql).get(...args),run:async()=>{if(fail&&sql.includes('INSERT INTO audit_logs'))throw Error('AUDIT_FAILED');return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}}}}}
 const env={DB:{prepare,batch:async(stmts:any[])=>{db.exec('BEGIN');try{const result=[];for(const s of stmts)result.push(await s.run());db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}}}} as any;
 const run=(version=2,reason='Yanlış anahtar düzeltmesi')=>reopenNetworkResults(new Request('https://test',{method:'POST',body:JSON.stringify({expectedSnapshotVersion:version,reason})}),env,{id:'admin',role:'SUPER_ADMIN'} as any,'a');
 return {db,run};
}
it('withdraws only the observed publication and preserves old snapshots and retention',async()=>{
 const f=fixture();try{
 expect((await f.run()).status).toBe(200);
 const row=f.db.prepare('SELECT * FROM exam_administrations').get() as any;
 expect(row.status).toBe('READY');expect(row.published_snapshot_version).toBe(2);expect(row.retention_due_at).toBe('2099');expect(row.published_at).toBeNull();expect(row.ranking_frozen_at).toBeNull();
 expect(f.db.prepare('SELECT * FROM exam_result_snapshots').all()).toEqual([{payload_json:'original'}]);
 expect(f.db.prepare('SELECT * FROM scan_evaluation_progress').all()).toEqual([{batch_id:'foreign'}]);
 expect(f.db.prepare('SELECT status FROM scan_batches WHERE id=?').get('b')).toEqual({status:'READY'});
 expect(f.db.prepare('SELECT * FROM audit_logs').all()).toHaveLength(1);expect((await f.run()).status).toBe(409);
 }finally{f.db.close()}
});
it('rejects stale versions and short reasons without audit or data changes',async()=>{const f=fixture();try{expect((await f.run(1)).status).toBe(409);expect((await f.run(2,'kısa')).status).toBe(400);expect(f.db.prepare('SELECT * FROM audit_logs').all()).toHaveLength(0);expect((f.db.prepare('SELECT status FROM exam_administrations').get() as any).status).toBe('PUBLISHED')}finally{f.db.close()}});
it('rolls back withdrawal and batch resets when audit fails',async()=>{const f=fixture(true);try{await expect(f.run()).rejects.toThrow('AUDIT_FAILED');expect((f.db.prepare('SELECT status FROM exam_administrations').get() as any).status).toBe('PUBLISHED');expect(f.db.prepare('SELECT * FROM scan_evaluation_progress').all()).toHaveLength(2);expect(f.db.prepare('SELECT * FROM exam_operation_locks').all()).toHaveLength(0)}finally{f.db.close()}});
it('denies non Super Admin before database reads',async()=>{expect((await reopenNetworkResults(new Request('https://test'),{DB:{prepare:()=>{throw Error('UNEXPECTED_READ')}}} as any,{role:'INSTITUTION_MANAGER'} as any,'a')).status).toBe(403)});
