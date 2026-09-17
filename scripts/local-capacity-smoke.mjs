import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';

const root=new URL('../',import.meta.url).pathname;
const tempDir=mkdtempSync(join(tmpdir(),'yildiz-capacity-'));
const dbPath=join(tempDir,'capacity.sqlite');
const db=new DatabaseSync(dbPath);

try{
 db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;');
 const migrationStart=performance.now();
 for(const name of readdirSync(join(root,'migrations')).filter(x=>/^\d{4}.*\.sql$/.test(x)).sort())db.exec(readFileSync(join(root,'migrations',name),'utf8'));
 const migrationMs=performance.now()-migrationStart;
 db.exec(`INSERT INTO users(id,role,display_name,password_hash,password_salt,active) VALUES('capacity_admin','SUPER_ADMIN','Capacity Smoke','not-a-login','not-a-login',1);`);
 db.exec(`INSERT INTO capacity_test_runs(id,environment,target_count,chunk_size,total_chunks,status,started_by) VALUES('capacity_local_100k','local',100000,100,1000,'RUNNING','capacity_admin');`);
 const insertChunk=db.prepare(`INSERT INTO capacity_test_chunks(run_id,chunk_no,start_no,row_count,status) VALUES('capacity_local_100k',?,?,100,'RUNNING')`);
 const insertRow=db.prepare(`INSERT INTO capacity_test_rows(run_id,synthetic_number,shard,payload_hash) VALUES('capacity_local_100k',?,?,?)`);
 const finishChunk=db.prepare(`UPDATE capacity_test_chunks SET status='COMPLETED',duration_ms=?,completed_at=CURRENT_TIMESTAMP WHERE run_id='capacity_local_100k' AND chunk_no=?`);
 const insertStart=performance.now();
 for(let chunkNo=0;chunkNo<1000;chunkNo++){
  const chunkStart=performance.now(),startNo=chunkNo*100+1;
  db.exec('BEGIN');insertChunk.run(chunkNo,startNo);
  for(let offset=0;offset<100;offset++){const n=startNo+offset;insertRow.run(n,n%128,`cap-capacity_local_100k-${String(n).padStart(6,'0')}`)}
  finishChunk.run(Math.round(performance.now()-chunkStart),chunkNo);db.exec('COMMIT');
 }
 db.exec(`UPDATE capacity_test_runs SET completed_chunks=1000,processed_count=100000,status='COMPLETED',completed_at=CURRENT_TIMESTAMP WHERE id='capacity_local_100k'`);
 const insertMs=performance.now()-insertStart;
 const countStart=performance.now();const total=Number(db.prepare(`SELECT count(*) c FROM capacity_test_rows WHERE run_id='capacity_local_100k'`).get().c);const countMs=performance.now()-countStart;
 const shardStart=performance.now();const shardRows=Number(db.prepare(`SELECT count(*) c FROM capacity_test_rows WHERE run_id='capacity_local_100k' AND shard=73`).get().c);const shardMs=performance.now()-shardStart;
 const studentRows=Number(db.prepare(`SELECT count(*) c FROM student_entities`).get().c);
 const result={ok:total===100000&&studentRows===0,targetCount:100000,totalRows:total,studentTableRows:studentRows,chunks:1000,shardRows,migrationMs:Math.round(migrationMs),insertMs:Math.round(insertMs),rowsPerSecond:Math.round(total/(insertMs/1000)),countQueryMs:Number(countMs.toFixed(3)),indexedShardQueryMs:Number(shardMs.toFixed(3)),databaseBytes:statSync(dbPath).size};
 console.log(JSON.stringify(result,null,2));
 if(!result.ok)process.exitCode=1;
}finally{db.close();rmSync(tempDir,{recursive:true,force:true})}
