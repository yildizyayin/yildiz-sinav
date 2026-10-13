import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {refreshExamOutcomeAnalysis,examOutcomePayloadSql} from '../worker/lib/exam-outcome-history';
import {channelState,changeChannel,trashExam,restoreExam,publishedDefinitions} from '../worker/lib/exam-channels';
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

const admin={id:'channeladmin',role:'SUPER_ADMIN'} as any;
function readyFixture(){const f=fixture();f.env.ENVIRONMENT='production';f.db.exec(`
INSERT INTO users(id,role,display_name,password_hash,password_salt) VALUES('channeladmin','SUPER_ADMIN','Synthetic admin','unused','unused');
UPDATE exams SET owner_type='INSTITUTION',institution_id='hi',scoring_rule_version_id=(SELECT id FROM scoring_rule_versions WHERE verified=1 LIMIT 1) WHERE id='he';
INSERT INTO exam_subjects(id,exam_id,subject_id,question_count,question_start,question_end) VALUES('channel-sub','he','sub_mat',1,1,1);
INSERT INTO exam_booklets(id,exam_id,code) VALUES('channel-book','he','A');
INSERT INTO answer_keys(id,exam_question_id,booklet_code,correct_answer) VALUES('channel-key','hq','A','A');
`);return f;}
describe('channel publication and reversible scoped removal on complete schema',()=>{
 it('holds portal metadata and analysis until explicit revision checked update',async()=>{
 const f=readyFixture();try{
 let state=await channelState(f.env,'he');
 expect((await changeChannel(f.env,admin,'he','RESULT_NETWORK','publish',state!.savedRevision)).status).toBe(200);
 f.db.exec("UPDATE exams SET title='Changed after publication' WHERE id='he'");
 await refreshExamOutcomeAnalysis(f.env,'he',admin.id,[f.env.DB.prepare("INSERT INTO question_outcomes VALUES('hq','ho')")]);
 state=await channelState(f.env,'he');expect(state!.channels.find(c=>c.channel==='RESULT_NETWORK')!.status).toBe('PENDING_UPDATE');
 const rows=await publishedDefinitions(f.env,[{exam_id:'he',title:'Changed after publication',payload_json:f.original}]);expect(rows[0].title).toBe('History exam');expect(f.read('RESULT').outcomes).toEqual([]);
 expect((await changeChannel(f.env,admin,'he','RESULT_NETWORK','update',state!.savedRevision-1)).status).toBe(409);
 expect((await changeChannel(f.env,admin,'he','RESULT_NETWORK','update',state!.savedRevision)).status).toBe(200);
 expect((await publishedDefinitions(f.env,[{exam_id:'he',title:'wrong'}]))[0].title).toBe('Changed after publication');expect(f.read('RESULT').outcomes[0].outcome_id).toBe('ho');
 expect((f.db.prepare("SELECT payload_json FROM exam_result_snapshots WHERE id='hsnap'").get() as any).payload_json).toBe(f.original);
 }finally{f.db.close()}});
 it('APP trash preserves portal publication and frozen student results; restore does not republish',async()=>{
 const f=readyFixture();try{
 const state=await channelState(f.env,'he');await changeChannel(f.env,admin,'he','RESULT_NETWORK','publish',state!.savedRevision);
 const before=f.db.prepare("SELECT * FROM exam_results WHERE id='hr'").get();
 expect((await trashExam(f.env,admin,'he','APP')).status).toBe(200);expect((await channelState(f.env,'he'))!.trashedAt).toBeTruthy();
 expect(f.db.prepare("SELECT status FROM exams WHERE id='he'").get()).toEqual({status:'ACTIVE'});
 expect(f.db.prepare("SELECT status FROM exam_channel_publications WHERE exam_id='he' AND channel='RESULT_NETWORK'").get()).toEqual({status:'ACTIVE'});
 expect(f.db.prepare("SELECT * FROM exam_results WHERE id='hr'").get()).toEqual(before);
 expect((await restoreExam(f.env,admin,'he')).status).toBe(200);expect((await channelState(f.env,'he'))!.trashedAt).toBeNull();
 expect(f.db.prepare("SELECT status FROM exam_channel_publications WHERE exam_id='he' AND channel='LICENSED'").get()).toEqual({status:'ARCHIVED'});
 }finally{f.db.close()}});
 it('RESULT removal leaves APP alone; demo and another institution cannot publish or remove',async()=>{
 const f=readyFixture();try{
 let state=await channelState(f.env,'he');await changeChannel(f.env,admin,'he','RESULT_NETWORK','publish',state!.savedRevision);
 expect((await trashExam(f.env,admin,'he','RESULT_PORTAL')).status).toBe(200);expect((await channelState(f.env,'he'))!.trashedAt).toBeNull();
 expect(f.db.prepare("SELECT status FROM exams WHERE id='he'").get()).toEqual({status:'ACTIVE'});
 expect((await trashExam(f.env,{role:'INSTITUTION_MANAGER',institution_id:'other'} as any,'he','APP')).status).toBe(403);
 f.env.ENVIRONMENT='staging';state=await channelState(f.env,'he');expect((await changeChannel(f.env,admin,'he','RESULT_NETWORK','publish',state!.savedRevision)).status).toBe(503);
 expect(f.db.prepare("SELECT count(*) n FROM exam_result_snapshots").get()).toEqual({n:1});
 }finally{f.db.close()}});
});
