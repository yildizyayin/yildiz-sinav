import {DatabaseSync} from 'node:sqlite';
import {describe,it,expect} from 'vitest';
import {scopedOutcomeCatalog,matchScopedOutcome,examOutcomeScope} from '../worker/lib/exam-outcome-matching';
function fixture(){const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE subjects(id TEXT,name TEXT); CREATE TABLE curriculum_versions(id TEXT,academic_year TEXT,program_code TEXT,grade_level INTEGER,verified INTEGER,authority TEXT); CREATE TABLE outcomes(id TEXT,curriculum_version_id TEXT,subject_id TEXT,grade_level INTEGER,official INTEGER,active INTEGER,code TEXT,title TEXT,topic TEXT); INSERT INTO subjects VALUES('mat','Matematik'); INSERT INTO curriculum_versions VALUES('good','2026-2027','SCHOOL',8,1,'MEB'),('wrongyear','2025-2026','SCHOOL',8,1,'MEB'),('unverified','2026-2027','SCHOOL',8,0,'MEB'),('wrongprogram','2026-2027','TYT',8,1,'MEB'); INSERT INTO outcomes VALUES('one','good','mat',8,1,1,'M.8.1','Üslü ifadeleri çözümler.',NULL),('two','wrongyear','mat',8,1,1,'M.8.1','Üslü ifadeleri çözümler.',NULL),('three','unverified','mat',8,1,1,'M.8.1','Üslü ifadeleri çözümler.',NULL),('four','wrongprogram','mat',8,1,1,'M.8.1','Üslü ifadeleri çözümler.',NULL);`);function prepare(sql:string,args:any[]=[]):any{return {bind:(...a:any[])=>prepare(sql,a),all:async()=>({results:db.prepare(sql).all(...args)})}}return {db,env:{DB:{prepare}} as any}}
describe('verified exam outcome matching against real catalog SQL',()=>{
 it('filters wrong year/program and unverified rows before code/text matching',async()=>{const f=fixture();try{const catalog=await scopedOutcomeCatalog(f.env,examOutcomeScope({academic_year:'2026-2027',grade_level:8,exam_type:'LGS'}));expect(catalog.map(o=>o.id)).toEqual(['one']);expect(matchScopedOutcome({code:'M.8.1'},'mat',catalog).outcomeId).toBe('one');expect(matchScopedOutcome({publisherTitle:'USLU ifadeleri cozumler'},'mat',catalog).outcomeId).toBe('one');expect(await scopedOutcomeCatalog(f.env,{academicYear:'2026-2027',gradeLevel:7,programCode:'SCHOOL'})).toEqual([]);}finally{f.db.close()}});
 it('does not invent catalog rows or silently resolve duplicates',async()=>{const f=fixture();try{f.db.exec("INSERT INTO outcomes VALUES('duplicate','good','mat',8,1,1,'M.8.1','Üslü ifadeleri çözümler.',NULL)");const catalog=await scopedOutcomeCatalog(f.env,{academicYear:'2026-2027',gradeLevel:8,programCode:'SCHOOL'});expect(matchScopedOutcome({code:'M.8.1'},'mat',catalog).reason).toBe('AMBIGUOUS');expect(matchScopedOutcome({title:'Gezegenlerin hareketi'},'mat',catalog).outcomeId).toBeUndefined();expect(matchScopedOutcome({title:'Üslü ifadeleri'},'mat',catalog).reason).toBe('AMBIGUOUS');expect(matchScopedOutcome({title:'Üslü ifadeleri çözümler.'},'other',catalog).reason).toBe('UNVERIFIED');}finally{f.db.close()}});
});

import {readFileSync,readdirSync} from 'node:fs';
import {putOutcomeMappings,getOutcomeMappings} from '../worker/exam-outcome-matching-entry';
it('updates a locked active exam only through revision checked outcome mappings, leaving answers and scores intact',async()=>{
 const db=new DatabaseSync(':memory:');const directory=new URL('../migrations/',import.meta.url);for(const file of readdirSync(directory).filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(new URL(file,directory),'utf8'));
 function prepare(sql:string,args:any[]=[]):any{return {bind:(...a:any[])=>prepare(sql,a),first:async()=>db.prepare(sql).get(...args),all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{if(/^SELECT/i.test(sql.trim()))return {results:db.prepare(sql).all(...args)};return {results:[],meta:{changes:Number(db.prepare(sql).run(...args).changes)}}}}}
 const env={DB:{prepare,batch:async(statements:any[])=>{db.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}}}} as any;
 try{
 db.exec(`INSERT INTO users(id,role,display_name,password_hash,password_salt) VALUES('mappingadmin','SUPER_ADMIN','Synthetic admin','unused','unused');
 INSERT INTO exams(id,owner_type,academic_year,title,exam_type,grade_level,status) VALUES('mappingexam','CENTRAL','2026-2027','Synthetic mapping','LGS',8,'ACTIVE');
 INSERT INTO curriculum_versions(id,academic_year,grade_level,program_version,program_code,authority,verified) VALUES('mappingcv','2026-2027',8,'synthetic','SCHOOL','MEB',1);
 INSERT INTO outcomes(id,curriculum_version_id,subject_id,grade_level,code,title,official) VALUES('mappingoutcome','mappingcv','sub_tyt_mat',8,'SYNTH.8','Synthetic outcome',1);
 INSERT INTO exam_questions(id,exam_id,subject_id,question_no,global_no) VALUES('mappingq','mappingexam','sub_tyt_mat',1,1);
 INSERT INTO answer_keys(id,exam_question_id,booklet_code,correct_answer) VALUES('mappingak','mappingq','A','B');`);
 const before=db.prepare('SELECT * FROM answer_keys').all();const user={id:'mappingadmin',role:'SUPER_ADMIN'} as any;
 const request=(revision:number)=>new Request('https://demo.anunex.com/api/exam-definitions/mappingexam/outcome-mappings',{method:'PUT',headers:{Origin:'https://demo.anunex.com'},body:JSON.stringify({expectedRevision:revision,mappings:[{questionId:'mappingq',outcomeIds:['mappingoutcome']}]})});
 db.exec("CREATE TRIGGER mapping_audit_fail BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'MAPPING_AUDIT_FAILED'); END");
 await expect(putOutcomeMappings(request(0),env,user,'mappingexam')).rejects.toThrow('MAPPING_AUDIT_FAILED');
 expect(db.prepare("SELECT * FROM question_outcomes WHERE exam_question_id='mappingq'").all()).toEqual([]);
 expect(db.prepare("SELECT * FROM exam_outcome_analysis_revisions WHERE exam_id='mappingexam'").all()).toEqual([]);
 db.exec('DROP TRIGGER mapping_audit_fail');
 expect((await putOutcomeMappings(request(0),env,user,'mappingexam')).status).toBe(200);
 expect(db.prepare('SELECT * FROM answer_keys').all()).toEqual(before);
 expect((db.prepare('SELECT status FROM exams WHERE id=?').get('mappingexam') as any).status).toBe('ACTIVE');
 expect((await putOutcomeMappings(request(0),env,user,'mappingexam')).status).toBe(409);
 const detail:any=await (await getOutcomeMappings(env,{id:'mappingexam',academic_year:'2026-2027',grade_level:8,exam_type:'LGS'})).json();expect(detail.revision).toBe(1);expect(detail.questions[0].outcome_ids).toEqual(['mappingoutcome']);
 expect((await putOutcomeMappings(request(1),env,{id:'other',role:'INSTITUTION_MANAGER',institution_id:'other'} as any,'mappingexam')).status).toBe(404);
 }finally{db.close()}
});
