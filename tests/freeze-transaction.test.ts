import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { expect,it } from 'vitest';
import { freezeAndPublishAdministration } from '../worker/result-network-entry';
import { reopenNetworkResults } from '../worker/lib/result-network-correction';
import { handlePlatformApi } from '../worker/lib/platform-expansion';

function fixture(failAudit=false){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=OFF');
  const migration=readFileSync(new URL('../migrations/0012_platform_expansion.sql',import.meta.url),'utf8');
  db.exec(migration.match(/CREATE TABLE IF NOT EXISTS exam_result_snapshots \([\s\S]*?\n\);/)![0]);
  db.exec(`CREATE TABLE exams(id TEXT,title TEXT,exam_date TEXT,exam_type TEXT,grade_level INTEGER);
    INSERT INTO exams VALUES('e','Sınav','2026-09-30','LGS',6);
    CREATE TABLE institutions(id TEXT,city TEXT,district TEXT); INSERT INTO institutions VALUES('school','İstanbul','Kartal');
    CREATE TABLE exam_participants(id TEXT,exam_id TEXT,student_id TEXT,institution_id TEXT,season_id TEXT,class_snapshot TEXT,booklet_code TEXT);
    INSERT INTO exam_participants VALUES('p','e','student','school','old','6-A','A');
    CREATE TABLE student_enrollments(id TEXT,student_id TEXT,institution_id TEXT,season_id TEXT,grade_level INTEGER,created_at TEXT);
    INSERT INTO student_enrollments VALUES('old-enr','student','school','old',6,'2025'),('new-enr','student','school','new',7,'2026');
    CREATE TABLE exam_results(participant_id TEXT,score REAL,net REAL,correct_count INTEGER,wrong_count INTEGER,blank_count INTEGER,success_percent REAL);
    INSERT INTO exam_results VALUES('p',NULL,2,2,0,0,100);
    CREATE TABLE subjects(id TEXT,code TEXT,name TEXT);
    CREATE TABLE subject_results(participant_id TEXT,subject_id TEXT,correct_count INTEGER,wrong_count INTEGER,blank_count INTEGER,net REAL,success_percent REAL);
    CREATE TABLE outcomes(id TEXT,code TEXT,topic TEXT,subtopic TEXT,title TEXT,subject_id TEXT);
    CREATE TABLE student_answers(participant_id TEXT,exam_question_id TEXT,status TEXT);
    CREATE TABLE question_outcomes(exam_question_id TEXT,outcome_id TEXT);
    CREATE TABLE tyt_optional_philosophy_results(participant_id TEXT,subject_id TEXT,booklet_code TEXT,correct_count INTEGER,wrong_count INTEGER,blank_count INTEGER,invalid_count INTEGER,evidence_count INTEGER,success_percent REAL);
    CREATE TABLE exam_delivery_profiles(exam_id TEXT,snapshot_version INTEGER,result_freeze_status TEXT,freeze_at TEXT,updated_at TEXT);
    INSERT INTO exam_delivery_profiles VALUES('e',0,'OPEN',NULL,NULL);
    CREATE TABLE exam_operation_locks(exam_id TEXT PRIMARY KEY,owner_token TEXT,operation TEXT);
    CREATE TABLE scan_batches(id TEXT,exam_id TEXT,status TEXT); CREATE TABLE scan_evaluation_progress(batch_id TEXT);
    CREATE TABLE exam_publication_stats(exam_id TEXT,snapshot_version INTEGER,institution_count INTEGER,participant_count INTEGER,city_count INTEGER,payload_json TEXT);
    CREATE TABLE audit_logs(id TEXT,actor_user_id TEXT,institution_id TEXT,action TEXT,entity_type TEXT,entity_id TEXT,details_json TEXT);
    INSERT INTO exam_result_snapshots(id,exam_id,participant_id,snapshot_version,institution_id,net,payload_json) VALUES('previous','e','p',0,'school',1,'previous-payload');`);
  db.exec("ALTER TABLE exams ADD COLUMN academic_year TEXT DEFAULT '2026-2027';ALTER TABLE exam_participants ADD COLUMN name_snapshot TEXT;ALTER TABLE exam_participants ADD COLUMN student_number_snapshot TEXT");
  function statement(sql:string,args:any[]=[]):any{return {
    bind:(...values:any[])=>statement(sql,values),
    first:async()=>sql.includes('SELECT p.*,e.title')?{...db.prepare('SELECT * FROM exam_delivery_profiles').get(),scope:'INSTITUTION',institution_id:'school'}:db.prepare(sql).get(...args),
    run:async()=>{if(failAudit&&sql.includes('INSERT INTO audit_logs'))throw new Error('AUDIT_FAILED');return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}}},
  }}
  db.exec(readFileSync(new URL('../migrations/0059_exam_operation_write_guards.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../migrations/0062_result_artifact_retirement.sql',import.meta.url),'utf8'));
  const env={DB:{prepare:statement,batch:async(statements:any[])=>{db.exec('BEGIN');try{const rows=[];for(const s of statements)rows.push(await s.run());db.exec('COMMIT');return rows}catch(error){db.exec('ROLLBACK');throw error}}}} as any;
  db.exec("ALTER TABLE outcomes ADD COLUMN curriculum_version_id TEXT;CREATE TABLE curriculum_versions(id TEXT,academic_year TEXT,grade_level INTEGER,program_version TEXT,verified INTEGER)");
  return {db,env,run:()=>handlePlatformApi(new Request('https://test/api/platform/exam-center/e/freeze',{method:'POST'}),env,{id:'user',role:'INSTITUTION_MANAGER',institution_id:'school'} as any)};
}
it('commits snapshot payload, historical grade, statistics, profile and audit together',async()=>{
  const f=fixture();try{
    expect((await f.run())!.status).toBe(200);
    const snap=f.db.prepare('SELECT * FROM exam_result_snapshots WHERE snapshot_version=1').get() as any;
    expect(snap.grade_level).toBe(6);expect(JSON.parse(snap.payload_json).exam.net).toBe(2);
    expect((f.db.prepare('SELECT participant_count FROM exam_publication_stats').get() as any).participant_count).toBe(1);
    expect(f.db.prepare('SELECT * FROM audit_logs').all()).toHaveLength(1);
  }finally{f.db.close()}
});
it('rolls back all new snapshot writes on late audit failure while preserving the prior version',async()=>{
  const f=fixture(true);try{
    await expect(f.run()).rejects.toThrow('AUDIT_FAILED');
    expect(f.db.prepare('SELECT snapshot_version,payload_json FROM exam_result_snapshots').all()).toEqual([{snapshot_version:0,payload_json:'previous-payload'}]);
    expect((f.db.prepare('SELECT result_freeze_status,snapshot_version FROM exam_delivery_profiles').get() as any)).toEqual({result_freeze_status:'OPEN',snapshot_version:0});
    expect(f.db.prepare('SELECT * FROM exam_publication_stats').all()).toEqual([]);
    expect(f.db.prepare('SELECT * FROM exam_operation_locks').all()).toEqual([]);
  }finally{f.db.close()}
});
it('allocates above snapshots from other publication channels without overwriting them',async()=>{
  const f=fixture();try{
    f.db.exec("INSERT INTO exam_result_snapshots(id,exam_id,participant_id,snapshot_version,institution_id,net,payload_json) VALUES('network','e','p',7,'school',3,'network-payload')");
    const response=(await f.run())!;expect((await response.json() as any).version).toBe(8);
    expect((f.db.prepare('SELECT payload_json FROM exam_result_snapshots WHERE snapshot_version=7').get() as any).payload_json).toBe('network-payload');
  }finally{f.db.close()}
});

it('allocates beyond durable retired versions after their snapshots were deleted',async()=>{const f=fixture();try{f.db.exec("DELETE FROM exam_result_snapshots;INSERT INTO result_artifact_retirements(administration_id,exam_id,retired_through_version) VALUES('retired-admin','e',9)");expect((await (await f.run())!.json() as any).version).toBe(10)}finally{f.db.close()}});

it('requires completed reevaluation after network withdrawal and publishes a new preserved version',async()=>{
 const f=fixture();try{
 await f.run();
 f.db.exec(`CREATE TABLE exam_administrations(id TEXT,exam_id TEXT,channel TEXT,status TEXT,published_snapshot_version INTEGER,published_at TEXT,ranking_frozen_at TEXT,retention_due_at TEXT,participant_count INTEGER,institution_count INTEGER);
 INSERT INTO exam_administrations VALUES('admin','e','RESULT_NETWORK','PUBLISHED',1,'old','old','2099',1,1);
 CREATE TABLE result_access_identities(administration_id TEXT,participant_id TEXT,expires_at TEXT);INSERT INTO result_access_identities VALUES('admin','p','2099');
 CREATE TABLE institution_network_members(institution_id TEXT,network_id TEXT,active INTEGER,joined_at TEXT);
 CREATE TABLE scan_records(batch_id TEXT,resolution_status TEXT);
 INSERT INTO scan_batches VALUES('b','e','COMMITTED');INSERT INTO scan_records VALUES('b','MATCHED');`);
 const user={id:'super',role:'SUPER_ADMIN'} as any;
 expect((await reopenNetworkResults(new Request('https://test',{method:'POST',body:JSON.stringify({expectedSnapshotVersion:1,reason:'Cevap anahtarı düzeltmesi'})}),f.env,user,'admin')).status).toBe(200);
 const publish=()=>freezeAndPublishAdministration(new Request('https://test',{method:'POST'}),f.env,user,'admin');
 expect((await publish()).status).toBe(400);
 f.db.exec("UPDATE exam_results SET net=7;UPDATE scan_batches SET status='COMMITTED' WHERE id='b'");
 f.db.exec("INSERT INTO result_access_identities VALUES('admin','missing-participant','2099')");
 const incompleteCohort=await publish();expect(incompleteCohort.status).toBe(400);expect((await incompleteCohort.json() as any).error.code).toBe('RESULT_COHORT_INCOMPLETE');
 expect((f.db.prepare('SELECT status FROM exam_administrations').get() as any).status).toBe('READY');
 expect(f.db.prepare('SELECT * FROM exam_result_snapshots WHERE snapshot_version>1').all()).toHaveLength(0);
 f.db.exec("DELETE FROM result_access_identities WHERE participant_id='missing-participant'");
 f.db.exec("INSERT INTO result_artifact_retirements(administration_id,exam_id,retired_through_version) VALUES('previous-admin','e',7)");
 const response=await publish();expect(response.status).toBe(200);expect((await response.json() as any).snapshotVersion).toBe(8);
 expect((f.db.prepare('SELECT published_snapshot_version,status FROM exam_administrations').get() as any)).toEqual({published_snapshot_version:8,status:'PUBLISHED'});
 const snapshots=f.db.prepare('SELECT payload_json FROM exam_result_snapshots WHERE snapshot_version IN(1,8) ORDER BY snapshot_version').all() as any[];
 expect(JSON.parse(snapshots[0].payload_json).exam.net).toBe(2);expect(JSON.parse(snapshots[1].payload_json).exam.net).toBe(7);
 expect((await publish()).status).toBe(400);
 }finally{f.db.close()}
});
