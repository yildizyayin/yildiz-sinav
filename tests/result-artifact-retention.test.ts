import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {purgeExpiredResultNetwork} from '../worker/result-network-entry';
import {prepareResultArtifacts} from '../worker/lib/result-artifacts';
import {sweepRetiredResultArtifacts} from '../worker/lib/result-artifact-retention';

function fixture(count=1){
 const db=new DatabaseSync(':memory:');db.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE exam_administrations(id TEXT PRIMARY KEY,exam_id TEXT,channel TEXT,status TEXT,published_snapshot_version INTEGER,retention_due_at TEXT);
 INSERT INTO exam_administrations VALUES('a','e','RESULT_NETWORK','PUBLISHED',2,'2000-01-01'),('b','other','RESULT_NETWORK','PUBLISHED',1,'2099-01-01');
 CREATE TABLE exam_participants(id TEXT PRIMARY KEY,exam_id TEXT,institution_id TEXT);
 CREATE TABLE institutions(id TEXT PRIMARY KEY,code TEXT);INSERT INTO institutions VALUES('school','code');
 CREATE TABLE result_network_institutions(id TEXT PRIMARY KEY,administration_id TEXT,licensed_institution_id TEXT,meb_code TEXT);
 INSERT INTO result_network_institutions VALUES('rni','a','school','code');
 CREATE TABLE exam_result_snapshots(exam_id TEXT,participant_id TEXT REFERENCES exam_participants(id) ON DELETE CASCADE,snapshot_version INTEGER,institution_id TEXT,payload_json TEXT);
 CREATE TABLE result_access_identities(administration_id TEXT,participant_id TEXT REFERENCES exam_participants(id) ON DELETE CASCADE,result_institution_id TEXT REFERENCES result_network_institutions(id) ON DELETE CASCADE);
 CREATE TABLE exam_delivery_profiles(exam_id TEXT,snapshot_version INTEGER);
 CREATE TABLE result_retention_events(id TEXT PRIMARY KEY,administration_id TEXT,event_type TEXT,summary_json TEXT);
 CREATE TABLE exam_operation_locks(exam_id TEXT PRIMARY KEY,owner_token TEXT,operation TEXT);
 CREATE TABLE audit_logs(id TEXT,actor_user_id TEXT,institution_id TEXT,action TEXT,entity_type TEXT,entity_id TEXT,details_json TEXT);`);
 for(const migration of ['0059_exam_operation_write_guards','0061_result_artifact_manifest','0062_result_artifact_retirement'])db.exec(readFileSync(new URL(`../migrations/${migration}.sql`,import.meta.url),'utf8'));
 const payload=JSON.stringify({schemaVersion:1,exam:{exam_id:'e',net:3},subjects:[],outcomes:[]});
 for(let i=0;i<count;i++){
  const id='p'+String(i).padStart(3,'0');db.prepare('INSERT INTO exam_participants VALUES(?,?,?)').run(id,'e','school');
  db.prepare('INSERT INTO exam_result_snapshots VALUES(?,?,?,?,?)').run('e',id,2,'school',payload);
  db.prepare('INSERT INTO result_access_identities VALUES(?,?,?)').run('a',id,'rni');
 }
 let failEvent=false,failAudit=false,beforeCurrent:(()=>void)|undefined,beforeRetirement:(()=>void)|undefined;
 function prepare(sql:string,args:any[]=[]):any{return {
  bind:(...values:any[])=>prepare(sql,values),
  first:async()=>{if(sql.startsWith('SELECT id FROM exam_administrations WHERE id=? AND exam_id=?')){beforeCurrent?.();beforeCurrent=undefined}if(sql.startsWith('SELECT MAX(version) version')){beforeRetirement?.();beforeRetirement=undefined}return db.prepare(sql).get(...args)},
  all:async()=>({results:db.prepare(sql).all(...args)}),
  run:async()=>{if(failEvent&&sql.includes("VALUES(?,?,'PURGE_STARTED'"))throw Error('EVENT_FAILED');if(failAudit&&sql.includes('INSERT INTO audit_logs'))throw Error('AUDIT_FAILED');return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}}}
 }}
 const objects=new Map<string,string>();let failDelete=false;let listCalls=0;
 const bucket={list:async({prefix,limit}:any)=>{listCalls++;const keys=[...objects.keys()].filter(key=>key.startsWith(prefix));return {objects:keys.slice(0,limit).map(key=>({key})),truncated:keys.length>limit}},delete:async(keys:string[])=>{if(failDelete)throw Error('R2_FAILED');keys.forEach(key=>objects.delete(key))},put:async(key:string,body:string)=>{objects.set(key,body);return {}},get:async(key:string)=>objects.has(key)?{text:async()=>objects.get(key)}:null};
 const env={DB:{prepare,batch:async(statements:any[])=>{db.exec('BEGIN');try{const rows=[];for(const s of statements)rows.push(await s.run());db.exec('COMMIT');return rows}catch(e){db.exec('ROLLBACK');throw e}}},RESULT_FILES:bucket,RESULT_ARTIFACT_CLEANUP_ENABLED:'true',RESULT_ARTIFACTS_ENABLED:'true'} as any;
 return {db,env,objects,get listCalls(){return listCalls},setFailDelete:(v:boolean)=>{failDelete=v},setFailEvent:()=>{failEvent=true},setFailAudit:()=>{failAudit=true},beforeCurrent:(fn:()=>void)=>{beforeCurrent=fn},beforeRetirement:(fn:()=>void)=>{beforeRetirement=fn}};
}
it('retires versions before cascading source deletion, keeps the nonexpired administration and caps each purge at 80 participants',async()=>{
 const f=fixture(81);try{
 await purgeExpiredResultNetwork(f.env);
 expect(f.db.prepare('SELECT count(*) n FROM exam_participants').get()).toEqual({n:1});
 expect(f.db.prepare("SELECT status FROM exam_administrations WHERE id='a'").get()).toEqual({status:'PUBLISHED'});
 expect(f.db.prepare('SELECT administration_id,exam_id,retired_through_version FROM result_artifact_retirements').all()).toEqual([{administration_id:'a',exam_id:'e',retired_through_version:2}]);
 await purgeExpiredResultNetwork(f.env);
 expect(f.db.prepare('SELECT * FROM exam_result_snapshots').all()).toHaveLength(0);
 expect(f.db.prepare("SELECT status FROM exam_administrations WHERE id='a'").get()).toEqual({status:'PURGED'});
 expect(f.db.prepare("SELECT status FROM exam_administrations WHERE id='b'").get()).toEqual({status:'PUBLISHED'});
 const summary=JSON.parse((f.db.prepare("SELECT summary_json FROM result_retention_events WHERE event_type='PURGE_COMPLETED'").get() as any).summary_json);expect(summary.participants).toBe(81);for(const field of ['examDefinitionRetained','answerKeysRetained','outcomesRetained','videosRetained'])expect(summary[field]).toBe(true);
 f.db.exec("DELETE FROM exam_administrations WHERE id='a'");expect(f.db.prepare('SELECT * FROM result_artifact_retirements').all()).toHaveLength(1);
 }finally{f.db.close()}
});
it('cleans manifest-free orphans by exact retired versions and retains markers for late-write reconciliation',async()=>{
 const f=fixture();try{
 f.objects.set('private-results/a/v1/orphan','');f.objects.set('private-results/a/v2/orphan','');f.objects.set('private-results/a/v3/new','');f.objects.set('private-results/b/v1/other','');
 await purgeExpiredResultNetwork(f.env);
 expect((await sweepRetiredResultArtifacts(f.env)).processed).toBe(1);
 expect(f.objects.has('private-results/a/v1/orphan')).toBe(false);expect(f.objects.has('private-results/a/v2/orphan')).toBe(true);
 f.db.exec("UPDATE result_artifact_retirements SET next_sweep_at='2000-01-01'");await sweepRetiredResultArtifacts(f.env);
 expect([...f.objects.keys()]).toEqual(['private-results/a/v3/new','private-results/b/v1/other']);
 expect((f.db.prepare('SELECT sweep_version FROM result_artifact_retirements').get() as any).sweep_version).toBe(1);
 f.objects.set('private-results/a/v1/late','');f.db.exec("UPDATE result_artifact_retirements SET next_sweep_at='2000-01-01'");await sweepRetiredResultArtifacts(f.env);expect(f.objects.has('private-results/a/v1/late')).toBe(false);
 expect(f.db.prepare('SELECT * FROM result_artifact_retirements').all()).toHaveLength(1);
 }finally{f.db.close()}
});
it('keeps failed deletion jobs retryable and gates cleanup before all database/bucket access',async()=>{
 expect(await sweepRetiredResultArtifacts({DB:{prepare:()=>{throw Error('UNEXPECTED')}}} as any)).toEqual({enabled:false,processed:0,failed:0});
 const f=fixture();try{await purgeExpiredResultNetwork(f.env);f.objects.set('private-results/a/v1/orphan','');f.setFailDelete(true);
 expect((await sweepRetiredResultArtifacts(f.env)).failed).toBe(1);expect(f.objects.size).toBe(1);expect((f.db.prepare('SELECT sweep_version FROM result_artifact_retirements').get() as any).sweep_version).toBe(1);
 f.setFailDelete(false);f.db.exec("UPDATE result_artifact_retirements SET next_sweep_at='2000-01-01'");expect((await sweepRetiredResultArtifacts(f.env)).failed).toBe(0);expect(f.objects.size).toBe(0);
 }finally{f.db.close()}
});
it('does not purge or retire after expiry changes, a busy lock or revoked ownership',async()=>{
 for(const mode of ['expiry','busy','revoke']){const f=fixture();try{
 if(mode==='expiry')f.beforeCurrent(()=>f.db.exec("UPDATE exam_administrations SET retention_due_at='2099-01-01' WHERE id='a'"));
 if(mode==='busy')f.db.exec("INSERT INTO exam_operation_locks VALUES('e','other-owner','BUSY')");
 if(mode==='revoke')f.beforeRetirement(()=>f.db.exec("UPDATE exam_operation_locks SET owner_token='replacement' WHERE exam_id='e'"));
 await purgeExpiredResultNetwork(f.env);expect(f.db.prepare('SELECT * FROM result_artifact_retirements').all()).toHaveLength(0);expect(f.db.prepare('SELECT * FROM exam_participants').all()).toHaveLength(1);
 }finally{f.db.close()}}
});
it('preserves a durable retirement but rolls back participant removal on retention event failure',async()=>{
 const f=fixture();try{f.setFailEvent();await expect(purgeExpiredResultNetwork(f.env)).rejects.toThrow('EVENT_FAILED');expect(f.db.prepare('SELECT * FROM exam_participants').all()).toHaveLength(1);expect(f.db.prepare('SELECT * FROM result_artifact_retirements').all()).toHaveLength(1);expect(f.db.prepare('SELECT * FROM exam_operation_locks').all()).toHaveLength(0)}finally{f.db.close()}
});
it('denies preparation of retired versions before touching the bucket',async()=>{
 const f=fixture();try{
 f.db.exec("INSERT INTO result_artifact_retirements(administration_id,exam_id,retired_through_version) VALUES('a','e',2)");
 const response=await prepareResultArtifacts(new Request('https://test',{method:'POST',body:JSON.stringify({expectedSnapshotVersion:2})}),f.env,{id:'super',role:'SUPER_ADMIN'} as any,'a');
 expect(response.status).toBe(409);expect(f.objects.size).toBe(0);expect(f.db.prepare('SELECT * FROM result_artifact_manifest').all()).toHaveLength(0);
 }finally{f.db.close()}
});
it('eventually removes orphan bytes left by a failed producer manifest/audit transaction',async()=>{
 const f=fixture();try{
 f.setFailAudit();await expect(prepareResultArtifacts(new Request('https://test',{method:'POST',body:JSON.stringify({expectedSnapshotVersion:2})}),f.env,{id:'super',role:'SUPER_ADMIN'} as any,'a')).rejects.toThrow('AUDIT_FAILED');
 expect(f.objects.size).toBe(1);expect(f.db.prepare('SELECT * FROM result_artifact_manifest').all()).toHaveLength(0);
 await purgeExpiredResultNetwork(f.env);await sweepRetiredResultArtifacts(f.env);f.db.exec("UPDATE result_artifact_retirements SET next_sweep_at='2000-01-01'");await sweepRetiredResultArtifacts(f.env);expect(f.objects.size).toBe(0);
 }finally{f.db.close()}
});
it('processes at most five jobs and lets other jobs advance when one deletion fails',async()=>{
 const f=fixture();try{
 for(const id of ['a','b','c','d','e','f']){f.db.prepare('INSERT INTO result_artifact_retirements(administration_id,exam_id,retired_through_version) VALUES(?,?,1)').run(id,'exam-'+id);f.objects.set(`private-results/${id}/v1/file`,'');}
 const deleteObjects=f.env.RESULT_FILES.delete;f.env.RESULT_FILES.delete=async(keys:string[])=>{if(keys[0].includes('/a/'))throw Error('R2_FAILED');return deleteObjects(keys)};
 expect(await sweepRetiredResultArtifacts(f.env)).toEqual({enabled:true,processed:5,failed:1});expect(f.listCalls).toBe(5);expect([...f.objects.keys()]).toEqual(['private-results/a/v1/file','private-results/f/v1/file']);
 }finally{f.db.close()}
});
it('preserves participants and snapshots referenced by another administration or licensed publication',async()=>{
 for(const mode of ['other-administration','licensed-profile','licensed-administration']){const f=fixture();try{
 if(mode==='other-administration')f.db.exec("UPDATE exam_administrations SET exam_id='e',published_snapshot_version=3 WHERE id='b';INSERT INTO result_network_institutions VALUES('rni-b','b','school','code');INSERT INTO result_access_identities VALUES('b','p000','rni-b');INSERT INTO exam_result_snapshots SELECT exam_id,participant_id,3,institution_id,payload_json FROM exam_result_snapshots");
 if(mode==='licensed-profile')f.db.exec("INSERT INTO exam_delivery_profiles VALUES('e',2)");
 if(mode==='licensed-administration')f.db.exec("INSERT INTO exam_administrations VALUES('licensed','e','LICENSED','PUBLISHED',2,'2099-01-01')");
 f.db.exec("INSERT INTO result_artifact_manifest(administration_id,participant_id,snapshot_version,object_key,content_sha256) VALUES('a','p000',2,'key','digest')");
 await purgeExpiredResultNetwork(f.env);
 expect(f.db.prepare('SELECT * FROM exam_participants').all()).toHaveLength(1);
 expect(f.db.prepare('SELECT * FROM exam_result_snapshots').all()).toHaveLength(mode==='other-administration'?2:1);
 expect(f.db.prepare('SELECT * FROM result_artifact_manifest').all()).toHaveLength(0);
 expect(f.db.prepare("SELECT * FROM result_access_identities WHERE administration_id='a'").all()).toHaveLength(0);
 expect(f.db.prepare("SELECT status FROM exam_administrations WHERE id='a'").get()).toEqual({status:'PURGED'});
 }finally{f.db.close()}}
});
