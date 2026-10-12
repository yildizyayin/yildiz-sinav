import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {refreshExamOutcomeAnalysis,examOutcomePayloadSql} from '../worker/lib/exam-outcome-history';
function fixture(){
 const db=new DatabaseSync(':memory:');const dir=new URL('../migrations/',import.meta.url);
 for(const f of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(new URL(f,dir),'utf8'));
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...v:any[])=>prepare(sql,v),all:async()=>({results:db.prepare(sql).all(...args)}),first:async()=>db.prepare(sql).get(...args),run:async()=>{const p=db.prepare(sql);return /^\s*SELECT/.test(sql)?{results:p.all(...args),meta:{changes:0}}:{results:[],meta:{changes:Number(p.run(...args).changes)}}}});
 const env={DB:{prepare,batch:async(ss:any[])=>{db.exec('BEGIN');try{const rows=[];for(const s of ss)rows.push(await s.run());db.exec('COMMIT');return rows}catch(e){db.exec('ROLLBACK');throw e}}}} as any;
 db.exec(`INSERT INTO institutions(id,name,code,status) VALUES('hi','History School','HIST','ACTIVE');
 INSERT INTO student_entities(id,first_name,last_name,normalized_name,status) VALUES('hs','Student','History','studenthistory','ACTIVE'),('other','Other','History','otherhistory','ACTIVE');
 INSERT INTO exams(id,owner_type,academic_year,title,exam_type,grade_level,status,sponsor_mode) VALUES('he','CENTRAL','2026-2027','History exam','CUSTOM',8,'ACTIVE','ADMIN_SPONSORED'),('otherExam','CENTRAL','2026-2027','Other exam','CUSTOM',8,'ACTIVE','ADMIN_SPONSORED');
 INSERT INTO curriculum_versions(id,academic_year,grade_level,program_version,verified) VALUES('hcv','2026-2027',8,'HISTORY_V1',1),('badcv','2025-2026',8,'HISTORY_V1',1);
 INSERT INTO outcomes(id,curriculum_version_id,subject_id,grade_level,code,title,official,active) VALUES('ho','hcv','sub_mat',8,'HO','Historical outcome',1,1),('ho2','hcv','sub_mat',8,'HO2','Replacement outcome',1,1),('bad','badcv','sub_mat',8,'BAD','Wrong year',1,1);
 INSERT INTO exam_questions(id,exam_id,subject_id,question_no) VALUES('hq','he','sub_mat',1);
 INSERT INTO exam_participants(id,exam_id,institution_id,student_id,name_snapshot,participant_status,booklet_code) VALUES('hp','he','hi','hs','History Student','ACTIVE','A');
 INSERT INTO exam_results(id,participant_id,correct_count,net,score,institution_rank) VALUES('hr','hp',1,1,500,1);
 INSERT INTO student_answers(id,participant_id,exam_question_id,status) VALUES('ha','hp','hq','CORRECT');
 INSERT INTO outcome_results(id,student_id,exam_id,outcome_id,evidence_count,correct_count,success_rate,mastery_status) VALUES('unrelated','other','otherExam','ho',4,2,0.5,'DEVELOPING');`);
 const original=JSON.stringify({schemaVersion:1,exam:{exam_id:'he',academic_year:'2026-2027',net:1,score:500},subjects:[],outcomes:[],questionEvidencePolicy:'NATIVE_STATUS_AND_CURRICULUM_AT_FREEZE_V1',questionEvidence:[{questionId:'hq',status:'CORRECT',outcomeRefs:[]}]});
 // Complete schema snapshots require only these fields; production score/ranks remain frozen.
 db.prepare('INSERT INTO exam_result_snapshots(id,exam_id,participant_id,snapshot_version,student_id,institution_id,grade_level,net,score,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?)').run('hsnap','he','hp',1,'hs','hi',8,1,500,original);
 const read=(channel:'APP'|'RESULT'='APP',asOf?:string)=>JSON.parse((db.prepare(`SELECT ${examOutcomePayloadSql('snap',channel,asOf?"'"+asOf+"'":undefined)} payload FROM exam_result_snapshots snap WHERE id='hsnap'`).get() as any).payload);
 return {db,env,read,original};
}
describe('retroactive outcome analysis on all migrations',()=>{
 it('adds later mapping, replaces old evidence idempotently, preserves score snapshots and other students',async()=>{
 const f=fixture();try{
 const before=f.db.prepare("SELECT * FROM exam_results WHERE id='hr'").get();
 const rev=await refreshExamOutcomeAnalysis(f.env,'he','admin',[f.env.DB.prepare("INSERT INTO question_outcomes VALUES('hq','ho')")]);expect(rev).toEqual({revision:1,participantCount:1});
 expect(f.read().outcomes[0]).toMatchObject({outcome_id:'ho',evidence_count:1,correct_count:1});expect(f.read('RESULT').outcomes).toEqual([]);
 await refreshExamOutcomeAnalysis(f.env,'he','admin',[f.env.DB.prepare("DELETE FROM question_outcomes WHERE exam_question_id='hq'"),f.env.DB.prepare("INSERT INTO question_outcomes VALUES('hq','ho2')")]);
 await refreshExamOutcomeAnalysis(f.env,'he','admin');
 expect(f.db.prepare("SELECT outcome_id,evidence_count FROM outcome_results WHERE exam_id='he'").all()).toEqual([{outcome_id:'ho2',evidence_count:1}]);
 expect(f.db.prepare("SELECT evidence_count FROM outcome_results WHERE id='unrelated'").get()).toEqual({evidence_count:4});
 expect(f.db.prepare("SELECT * FROM exam_results WHERE id='hr'").get()).toEqual(before);
 expect((f.db.prepare("SELECT payload_json FROM exam_result_snapshots WHERE id='hsnap'").get() as any).payload_json).toBe(f.original);
 expect(f.db.prepare("SELECT count(*) n FROM exam_outcome_analysis_history").get()).toEqual({n:3});
 expect((f.db.prepare("SELECT revision FROM cohort_report_revisions WHERE institution_id='hi'").get() as any).revision).toBeGreaterThan(0);
 }finally{f.db.close()}});
 it('excludes wrong-year curriculum and rolls back mapping plus history when batch fails',async()=>{
 const f=fixture();try{
 await refreshExamOutcomeAnalysis(f.env,'he','admin',[f.env.DB.prepare("INSERT INTO question_outcomes VALUES('hq','bad')")]);expect(f.read().outcomes).toEqual([]);
 await expect(refreshExamOutcomeAnalysis(f.env,'he','admin',[f.env.DB.prepare("DELETE FROM question_outcomes WHERE exam_question_id='hq'"),f.env.DB.prepare("INSERT INTO question_outcomes VALUES('hq','missing')")])).rejects.toThrow();
 expect(f.db.prepare('SELECT outcome_id FROM question_outcomes').all()).toEqual([{outcome_id:'bad'}]);expect(f.db.prepare('SELECT count(*) n FROM exam_outcome_analysis_revisions').get()).toEqual({n:1});
 }finally{f.db.close()}});
 it('rejects another grade, program or mixed curriculum context',async()=>{
 const f=fixture();try{
 f.db.exec("INSERT INTO curriculum_versions(id,academic_year,grade_level,program_version,program_code,verified) VALUES('wronggrade','2026-2027',7,'HG','SCHOOL',1),('wrongprogram','2026-2027',8,'HP','TYT',1),('mixedcv','2026-2027',8,'MIX','SCHOOL',1);INSERT INTO outcomes(id,curriculum_version_id,subject_id,grade_level,title,official,active) VALUES('wronggradeo','wronggrade','sub_mat',7,'Wrong grade',1,1),('wrongprogramo','wrongprogram','sub_mat',8,'Wrong program',1,1),('mixedo','mixedcv','sub_mat',8,'Mixed context',1,1)");
 for(const outcome of ['wronggradeo','wrongprogramo']){
 await refreshExamOutcomeAnalysis(f.env,'he','admin',[f.env.DB.prepare("DELETE FROM question_outcomes WHERE exam_question_id='hq'"),f.env.DB.prepare("INSERT INTO question_outcomes VALUES('hq',?)").bind(outcome)]);expect(f.read().outcomes).toEqual([]);
 }
 await refreshExamOutcomeAnalysis(f.env,'he','admin',[f.env.DB.prepare("DELETE FROM question_outcomes WHERE exam_question_id='hq'"),f.env.DB.prepare("INSERT INTO question_outcomes VALUES('hq','ho'),('hq','mixedo')")]);expect(f.read().outcomes).toEqual([]);
 }finally{f.db.close()}});
 it('keeps exports at their asOf and RESULT revision until explicit publication',async()=>{
 const f=fixture();try{
 await refreshExamOutcomeAnalysis(f.env,'he','admin',[f.env.DB.prepare("INSERT INTO question_outcomes VALUES('hq','ho')")]);
 f.db.exec("UPDATE exam_outcome_analysis_revisions SET published_app_at='2026-01-01',published_result_at='2026-01-01' WHERE revision=1");
 await refreshExamOutcomeAnalysis(f.env,'he','admin',[f.env.DB.prepare("DELETE FROM question_outcomes WHERE exam_question_id='hq'"),f.env.DB.prepare("INSERT INTO question_outcomes VALUES('hq','ho2')")]);
 f.db.exec("UPDATE exam_outcome_analysis_revisions SET published_app_at='2026-02-01' WHERE revision=2");
 expect(f.read('APP','2026-01-15').outcomes[0].outcome_id).toBe('ho');expect(f.read().outcomes[0].outcome_id).toBe('ho2');expect(f.read('RESULT').outcomes[0].outcome_id).toBe('ho');
 f.db.exec("UPDATE exam_outcome_analysis_revisions SET published_result_at='2026-02-01' WHERE revision=2");expect(f.read('RESULT').outcomes[0].outcome_id).toBe('ho2');
 }finally{f.db.close()}});
});
