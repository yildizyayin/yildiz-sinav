import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {refreshExamOutcomeAnalysis,examOutcomePayloadSql} from '../worker/lib/exam-outcome-history';

/** 3 Nov (owner): outcomes were on the institution karne but missing on the student page, because a later
 * re-analysis that matched no curriculum overlaid an empty list on the published outcomes. */
function fixture(){
 const db=new DatabaseSync(':memory:');const dir=new URL('../migrations/',import.meta.url);
 for(const f of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(new URL(f,dir),'utf8'));
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...v:any[])=>prepare(sql,v),all:async()=>({results:db.prepare(sql).all(...args)}),first:async()=>db.prepare(sql).get(...args),run:async()=>{const p=db.prepare(sql);return /^\s*SELECT/.test(sql)?{results:p.all(...args),meta:{changes:0}}:{results:[],meta:{changes:Number(p.run(...args).changes)}}}});
 const env={DB:{prepare,batch:async(ss:any[])=>{db.exec('BEGIN');try{const rows=[];for(const s of ss)rows.push(await s.run());db.exec('COMMIT');return rows}catch(e){db.exec('ROLLBACK');throw e}}}} as any;
 db.exec(`INSERT INTO institutions(id,name,code,status) VALUES('ki','Test Kurum','KT','ACTIVE');
 INSERT INTO student_entities(id,first_name,last_name,normalized_name,status) VALUES('ks','Deneme','Ogrenci','denemeogrenci','ACTIVE');
 INSERT INTO exams(id,owner_type,academic_year,title,exam_type,grade_level,status,sponsor_mode) VALUES('ke','CENTRAL','2026-2027','Deneme TYT','TYT',12,'ACTIVE','ADMIN_SPONSORED');
 INSERT INTO curriculum_versions(id,academic_year,grade_level,program_version,program_code,verified) VALUES('kcv','2027-2028',9,'V1','SCHOOL',1),('tcv','2026-2027',12,'T1','TYT',1);
 INSERT INTO outcomes(id,curriculum_version_id,subject_id,grade_level,code,title,official,active) VALUES('ko','kcv','sub_mat',9,'M.9.1','Okul kazanımı',1,1),('to','tcv','sub_mat',12,'T.1','TYT kazanımı',1,1);
 INSERT INTO exam_questions(id,exam_id,subject_id,question_no) VALUES('kq','ke','sub_mat',1);
 INSERT INTO exam_participants(id,exam_id,institution_id,student_id,name_snapshot,participant_status,booklet_code) VALUES('kp','ke','ki','ks','Deneme Ogrenci','ACTIVE','A');
 INSERT INTO exam_results(id,participant_id,correct_count,net,score,institution_rank) VALUES('kr','kp',1,1,NULL,1);
 INSERT INTO student_answers(id,participant_id,exam_question_id,status) VALUES('ka','kp','kq','CORRECT');`);
 const published=[{outcome_id:'ko',code:'M.9.1',title:'Okul kazanımı',evidence_count:1,correct_count:1,wrong_count:0,blank_count:0}];
 db.prepare('INSERT INTO exam_result_snapshots(id,exam_id,participant_id,snapshot_version,student_id,institution_id,grade_level,net,score,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?)')
  .run('ksnap','ke','kp',1,'ks','ki',12,1,null,JSON.stringify({schemaVersion:1,exam:{exam_id:'ke',academic_year:'2026-2027',net:1},subjects:[],outcomes:published}));
 const read=(channel:'APP'|'RESULT'='APP')=>JSON.parse((db.prepare(`SELECT ${examOutcomePayloadSql('snap',channel)} payload FROM exam_result_snapshots snap WHERE id='ksnap'`).get() as any).payload);
 const publish=()=>db.exec("UPDATE exam_outcome_analysis_revisions SET published_app_at=CURRENT_TIMESTAMP,published_result_at=CURRENT_TIMESTAMP");
 return {db,env,read,publish,published};
}
describe('an empty outcome re-analysis does not erase published outcomes',()=>{
 it('keeps the snapshot outcomes on the app and the result network',async()=>{
  const f=fixture();try{
   await refreshExamOutcomeAnalysis(f.env,'ke','admin',[f.env.DB.prepare("INSERT INTO question_outcomes VALUES('kq','ko')")]);f.publish();
   // the gate still refuses the grade-9 school curriculum for a grade-12 TYT exam: the revision is empty
   expect(JSON.parse((f.db.prepare('SELECT payload_json p FROM exam_outcome_analysis_history').get() as any).p).outcomes).toEqual([]);
   expect(f.read().outcomes).toEqual(f.published);expect(f.read('RESULT').outcomes).toEqual(f.published);
  }finally{f.db.close()}});
 it('a later revision with outcomes still replaces them',async()=>{
  const f=fixture();try{
   await refreshExamOutcomeAnalysis(f.env,'ke','admin',[f.env.DB.prepare("INSERT INTO question_outcomes VALUES('kq','to')")]);f.publish();
   expect(f.read().outcomes.map((o:any)=>o.outcome_id)).toEqual(['to']);
   // a newer empty revision falls back to the newest one with outcomes, not to nothing
   await refreshExamOutcomeAnalysis(f.env,'ke','admin',[f.env.DB.prepare("DELETE FROM question_outcomes"),f.env.DB.prepare("INSERT INTO question_outcomes VALUES('kq','ko')")]);f.publish();
   expect(f.read('RESULT').outcomes.map((o:any)=>o.outcome_id)).toEqual(['to']);
  }finally{f.db.close()}});
});
