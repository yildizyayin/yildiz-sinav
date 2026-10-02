import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { it, expect, vi } from 'vitest';
vi.mock('../worker/lib/auth', async original => ({ ...await original<any>(), getAuthUser: async () => ({ id: 'super', role: 'SUPER_ADMIN' }) }));
import { generateBatchAccessCodes } from '../worker/result-network-entry';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE exams(id TEXT,academic_year TEXT,grade_level INTEGER);INSERT INTO exams VALUES('e','2026-2027',6);
    CREATE TABLE institutions(id TEXT,code TEXT,name TEXT,city TEXT,district TEXT,status TEXT);INSERT INTO institutions VALUES('school','code','Synthetic','City','District','ACTIVE');
    CREATE TABLE institution_access_controls(institution_id TEXT,lifecycle_status TEXT);
    CREATE TABLE national_institution_directory(meb_code TEXT,status TEXT);INSERT INTO national_institution_directory VALUES('code','ACTIVE');
    CREATE TABLE scan_batches(id TEXT,exam_id TEXT,institution_id TEXT,status TEXT);INSERT INTO scan_batches VALUES('b','e','school','COMMITTED');
    CREATE TABLE exam_administrations(id TEXT,exam_id TEXT,channel TEXT,status TEXT,academic_year TEXT,published_at TEXT,created_at TEXT);
    INSERT INTO exam_administrations VALUES('a','e','RESULT_NETWORK','READY','2026-2027',NULL,'2026');
    CREATE TABLE exam_participants(id TEXT,exam_id TEXT,institution_id TEXT,student_id TEXT,season_id TEXT,student_number_snapshot TEXT,name_snapshot TEXT);
    CREATE TABLE exam_results(participant_id TEXT);
    CREATE TABLE student_enrollments(id TEXT,student_id TEXT,institution_id TEXT,season_id TEXT,grade_level INTEGER,created_at TEXT,status TEXT);
    INSERT INTO student_enrollments VALUES('old','s','school','old',6,'2025','COMPLETED'),('new','s','school','new',7,'2026','ACTIVE'),('duplicate','s','school','new',7,'2027','ACTIVE');
    CREATE TABLE result_network_institutions(id TEXT,administration_id TEXT,meb_code TEXT,licensed_institution_id TEXT,dealer_id TEXT,display_name_snapshot TEXT,city_snapshot TEXT,district_snapshot TEXT,UNIQUE(administration_id,meb_code));
    CREATE TABLE result_access_identities(id TEXT,administration_id TEXT,result_institution_id TEXT,participant_id TEXT,grade_level INTEGER,normalized_name TEXT,student_number_lookup_token TEXT,access_code_hash TEXT,access_code_salt TEXT,expires_at TEXT,UNIQUE(administration_id,participant_id));
    CREATE TABLE exam_operation_locks(exam_id TEXT PRIMARY KEY,owner_token TEXT,operation TEXT);
    CREATE TABLE audit_logs(id TEXT,actor_user_id TEXT,institution_id TEXT,action TEXT,entity_type TEXT,entity_id TEXT,details_json TEXT);`);
  db.exec(readFileSync(new URL('../migrations/0059_exam_operation_write_guards.sql', import.meta.url), 'utf8'));
  for(let i=0;i<81;i++){const id='p'+String(i).padStart(3,'0');db.prepare('INSERT INTO exam_participants VALUES(?,?,?,?,?,?,?)').run(id,'e','school','s','old',String(i+1),'Synthetic');db.prepare('INSERT INTO exam_results VALUES(?)').run(id);}
  const prepare=(sql:string,args:any[]=[]):any=>({bind:(...values:any[])=>prepare(sql,values),first:async()=>db.prepare(sql).get(...args),all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}})});
  const env:any={RESULT_LOOKUP_SECRET:'synthetic-only',DB:{prepare,batch:async(statements:any[])=>{db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());db.exec('COMMIT');return results;}catch(error){db.exec('ROLLBACK');throw error;}}}};
  const run=(cursor='')=>generateBatchAccessCodes(new Request('https://test?cursor='+cursor,{method:'POST'}),env,'b');
  return {db,run};
}
it('issues 80 plus one codes without duplicate students and preserves historical grades', async()=>{
  const f=fixture();try{
    const first:any=await(await f.run()).json();expect(first.codes).toHaveLength(80);expect(first.nextCursor).toBe('p079');expect(first.codes.every((code:any)=>code.gradeLevel===6)).toBe(true);
    const last:any=await(await f.run(first.nextCursor)).json();expect(last.codes).toHaveLength(1);expect(last.nextCursor).toBeNull();
    expect(f.db.prepare('SELECT * FROM result_access_identities').all()).toHaveLength(81);
    expect((await(await f.run()).json() as any).codes).toHaveLength(0);
  }finally{f.db.close();}
});
it('rolls back the entire page on audit failure and rejects frozen cohorts',async()=>{
  const f=fixture();try{
    f.db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'SYNTHETIC_AUDIT_FAILED'); END;");
    await expect(f.run()).rejects.toThrow('SYNTHETIC_AUDIT_FAILED');
    expect(f.db.prepare('SELECT * FROM result_access_identities').all()).toHaveLength(0);expect(f.db.prepare('SELECT * FROM result_network_institutions').all()).toHaveLength(0);expect(f.db.prepare('SELECT * FROM exam_operation_locks').all()).toHaveLength(0);
    f.db.exec("DROP TRIGGER fail_audit;UPDATE exam_administrations SET status='PUBLISHED';");
    expect((await f.run()).status).toBe(409);
  }finally{f.db.close();}
});
