import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { expect,it } from 'vitest';
import { handlePlatformApi } from '../worker/lib/platform-expansion';

function fixture(scope='INSTITUTION', failAudit=false, racePublish=false){
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE exam_delivery_profiles(exam_id TEXT,snapshot_version INTEGER,result_freeze_status TEXT,published_at TEXT,result_publish_at TEXT,freeze_at TEXT,updated_at TEXT);
    CREATE TABLE exam_result_snapshots(exam_id TEXT,snapshot_version INTEGER,payload_json TEXT);
    CREATE TABLE exam_operation_locks(exam_id TEXT PRIMARY KEY,owner_token TEXT,operation TEXT);
    CREATE TABLE scan_batches(id TEXT,exam_id TEXT,status TEXT);
    CREATE TABLE scan_evaluation_progress(batch_id TEXT);
    INSERT INTO scan_batches VALUES('batch','exam','COMMITTED'),('foreign','other','COMMITTED');
    INSERT INTO scan_evaluation_progress VALUES('batch'),('foreign');
    CREATE TABLE audit_logs(id TEXT,actor_user_id TEXT,institution_id TEXT,action TEXT,entity_type TEXT,entity_id TEXT,details_json TEXT);
    INSERT INTO exam_delivery_profiles VALUES('exam',2,'PUBLISHED','old','future','old',NULL);
    INSERT INTO exam_result_snapshots VALUES('exam',1,'old-one'),('exam',2,'old-two');`);
  db.exec(readFileSync(new URL('../migrations/0059_exam_operation_write_guards.sql',import.meta.url),'utf8'));
  const env={DB:{batch:async(statements:any[])=>{if(racePublish)db.exec("UPDATE exam_delivery_profiles SET result_freeze_status='OPEN'");db.exec('BEGIN');try{const rows=[];for(const statement of statements)rows.push(await statement.run());db.exec('COMMIT');return rows}catch(error){db.exec('ROLLBACK');throw error}},prepare:(sql:string)=>({bind:(...args:any[])=>({
    first:async()=>sql.includes('SELECT count(*) c FROM scan_batches')?db.prepare(sql).get(...args):sql.includes('SELECT p.*,e.title')?{...db.prepare('SELECT * FROM exam_delivery_profiles').get(),institution_id:'school',scope}:null,
    run:async()=>{if(failAudit&&sql.includes('INSERT INTO audit_logs'))throw new Error('AUDIT_UNAVAILABLE');const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}}},
  })})}} as any;
  const request=(role='INSTITUTION_MANAGER',institution='school',version=2,reason='Yanlış cevap anahtarı düzeltmesi')=>handlePlatformApi(new Request('https://test/api/platform/exam-center/exam/reopen-results',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason,expectedSnapshotVersion:version})}),env,{id:'user',role,institution_id:institution} as any);
  return {db,request,freeze:()=>handlePlatformApi(new Request('https://test/api/platform/exam-center/exam/freeze',{method:'POST'}),env,{id:'user',role:'INSTITUTION_MANAGER',institution_id:'school'} as any),publish:()=>handlePlatformApi(new Request('https://test/api/platform/exam-center/exam/publish',{method:'POST'}),env,{id:'user',role:'INSTITUTION_MANAGER',institution_id:'school'} as any)};
}

it('withdraws publication explicitly, clears auto-publish schedule and preserves all snapshots',async()=>{
  const f=fixture();try{
    const response=(await f.request())!;expect(response.status).toBe(200);
    expect((await response.json() as any).publicationWithdrawn).toBe(true);
    const row=f.db.prepare('SELECT * FROM exam_delivery_profiles').get() as any;
    expect((f.db.prepare("SELECT status FROM scan_batches WHERE id='batch'").get() as any).status).toBe('READY');
    expect(f.db.prepare('SELECT * FROM scan_evaluation_progress').all()).toEqual([{batch_id:'foreign'}]);
    expect(row.result_freeze_status).toBe('OPEN');expect(row.snapshot_version).toBe(2);
    expect(row.published_at).toBeNull();expect(row.result_publish_at).toBeNull();
    expect(f.db.prepare('SELECT payload_json FROM exam_result_snapshots ORDER BY snapshot_version').all()).toEqual([{payload_json:'old-one'},{payload_json:'old-two'}]);
    const audit=f.db.prepare('SELECT details_json FROM audit_logs').get() as any;
    expect(JSON.parse(audit.details_json).previousVersion).toBe(2);
    expect((await f.request())!.status).toBe(409);
  }finally{f.db.close()}
});
it.each([['TEACHER','school','INSTITUTION'],['INSTITUTION_MANAGER','foreign','INSTITUTION'],['INSTITUTION_MANAGER','school','CENTRAL']])('rejects unauthorized correction %s/%s/%s',async(role,institution,scope)=>{
  const f=fixture(scope);try{expect((await f.request(role,institution))!.status).toBe(403);expect((f.db.prepare('SELECT result_freeze_status FROM exam_delivery_profiles').get() as any).result_freeze_status).toBe('PUBLISHED')}finally{f.db.close()}
});
it('rejects stale versions and insufficient reasons without changing publication',async()=>{
  const f=fixture();try{expect((await f.request('INSTITUTION_MANAGER','school',1))!.status).toBe(409);expect((await f.request('INSTITUTION_MANAGER','school',2,'kısa'))!.status).toBe(400);expect(f.db.prepare('SELECT * FROM audit_logs').all()).toEqual([])}finally{f.db.close()}
});

it('rolls back correction entirely when the required audit record fails',async()=>{
  const f=fixture('INSTITUTION',true);try{
    await expect(f.request()).rejects.toThrow('AUDIT_UNAVAILABLE');
    expect((f.db.prepare('SELECT result_freeze_status FROM exam_delivery_profiles').get() as any).result_freeze_status).toBe('PUBLISHED');
    expect((f.db.prepare("SELECT status FROM scan_batches WHERE id='batch'").get() as any).status).toBe('COMMITTED');
    expect(f.db.prepare('SELECT * FROM scan_evaluation_progress').all()).toHaveLength(2);
    expect(f.db.prepare('SELECT * FROM audit_logs').all()).toEqual([]);
  }finally{f.db.close()}
});

it('does not publish a stale frozen version after correction has opened it',async()=>{
  const f=fixture('INSTITUTION',false,true);try{
    f.db.exec("UPDATE exam_delivery_profiles SET result_freeze_status='FROZEN'");
    expect((await f.publish())!.status).toBe(409);
    expect((f.db.prepare('SELECT result_freeze_status FROM exam_delivery_profiles').get() as any).result_freeze_status).toBe('OPEN');
    expect(f.db.prepare('SELECT * FROM audit_logs').all()).toEqual([]);
  }finally{f.db.close()}
});
it('publishes the matching version with its audit record in the same transaction',async()=>{
  const f=fixture();try{
    f.db.exec("UPDATE exam_delivery_profiles SET result_freeze_status='FROZEN'");
    expect((await f.publish())!.status).toBe(200);
    expect((f.db.prepare('SELECT action FROM audit_logs').get() as any).action).toBe('EXAM_RESULTS_PUBLISHED');
  }finally{f.db.close()}
});

it('blocks freezing between evaluation chunks while partial progress remains',async()=>{
  const f=fixture();try{f.db.exec("UPDATE exam_delivery_profiles SET result_freeze_status='OPEN'; UPDATE scan_batches SET status='READY' WHERE id='batch'");const response=(await f.freeze())!;expect(response.status).toBe(400);expect((await response.json() as any).error.code).toBe('EVALUATION_INCOMPLETE');expect(f.db.prepare('SELECT * FROM exam_operation_locks').all()).toEqual([])}finally{f.db.close()}
});
