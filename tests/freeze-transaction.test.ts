import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { expect,it } from 'vitest';
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
  function statement(sql:string,args:any[]=[]):any{return {
    bind:(...values:any[])=>statement(sql,values),
    first:async()=>sql.includes('SELECT p.*,e.title')?{...db.prepare('SELECT * FROM exam_delivery_profiles').get(),scope:'INSTITUTION',institution_id:'school'}:db.prepare(sql).get(...args),
    run:async()=>{if(failAudit&&sql.includes('INSERT INTO audit_logs'))throw new Error('AUDIT_FAILED');return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}}},
  }}
  const env={DB:{prepare:statement,batch:async(statements:any[])=>{db.exec('BEGIN');try{const rows=[];for(const s of statements)rows.push(await s.run());db.exec('COMMIT');return rows}catch(error){db.exec('ROLLBACK');throw error}}}} as any;
  return {db,run:()=>handlePlatformApi(new Request('https://test/api/platform/exam-center/e/freeze',{method:'POST'}),env,{id:'user',role:'INSTITUTION_MANAGER',institution_id:'school'} as any)};
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
