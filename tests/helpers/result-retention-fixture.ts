import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export function resultRetentionFixture(count=1){
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
 for(const migration of ['0059_exam_operation_write_guards','0061_result_artifact_manifest','0062_result_artifact_retirement'])db.exec(readFileSync(new URL(`../../migrations/${migration}.sql`,import.meta.url),'utf8'));
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
 const env={DB:{prepare,batch:async(statements:any[])=>{db.exec('BEGIN');try{const rows=[];for(const s of statements)rows.push(await s.run());db.exec('COMMIT');return rows}catch(e){db.exec('ROLLBACK');throw e}}},RESULT_FILES:bucket,RESULT_ARTIFACT_CLEANUP_ENABLED:'true',RESULT_ARTIFACTS_ENABLED:'true',RESULT_RETENTION_QUEUE_ENABLED:'true',RESULT_RETENTION_QUEUE:{send:async()=>{}}} as any;
 return {db,env,objects,get listCalls(){return listCalls},setFailDelete:(v:boolean)=>{failDelete=v},setFailEvent:(v=true)=>{failEvent=v},setFailAudit:(v=true)=>{failAudit=v},beforeCurrent:(fn:()=>void)=>{beforeCurrent=fn},beforeRetirement:(fn:()=>void)=>{beforeRetirement=fn}};
}
