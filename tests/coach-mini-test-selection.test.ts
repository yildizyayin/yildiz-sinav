import { DatabaseSync } from 'node:sqlite';
import { expect,it } from 'vitest';
import { eligibleCoachMiniTestQuestions,startCoachMiniTest } from '../worker/lib/coach-mastery-cycle';
it('selects only new verified current tenant questions and permits seen questions only in repeat mode',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
 db.exec(`CREATE TABLE question_bank(id TEXT,stem_text TEXT,options_json TEXT,difficulty_level INTEGER,difficulty INTEGER,solution_text TEXT,correct_answer TEXT,grade_level INTEGER,academic_year TEXT,subject_id TEXT,owner_type TEXT,owner_id TEXT,review_status TEXT,copyright_status TEXT,question_type TEXT,created_at TEXT);
 CREATE TABLE question_learning_links(question_id TEXT,node_id TEXT);
 CREATE TABLE outcomes(id TEXT,curriculum_version_id TEXT,active INTEGER,grade_level INTEGER,subject_id TEXT);
 CREATE TABLE curriculum_versions(id TEXT,verified INTEGER,academic_year TEXT,grade_level INTEGER);
 CREATE TABLE student_enrollments(student_id TEXT,institution_id TEXT,status TEXT,season_id TEXT,grade_level INTEGER);
 CREATE TABLE institution_seasons(id TEXT,institution_id TEXT,status TEXT,academic_year TEXT);
 CREATE TABLE coach_mini_tests(id TEXT,student_id TEXT);
 CREATE TABLE coach_mini_test_questions(test_id TEXT,question_id TEXT);
 CREATE TABLE coach_question_exposures(student_id TEXT,question_id TEXT,PRIMARY KEY(student_id,question_id));
 CREATE TABLE question_practice_attempts(student_id TEXT,question_id TEXT);
 CREATE TABLE assessment_responses(student_id TEXT,question_id TEXT);
 INSERT INTO outcomes VALUES('outcome','version',1,7,'math');
 INSERT INTO curriculum_versions VALUES('version',1,'2026-2027',7);
 INSERT INTO student_enrollments VALUES('student','school','ACTIVE','season',7);
 INSERT INTO institution_seasons VALUES('season','school','ACTIVE','2026-2027');
 INSERT INTO coach_mini_tests VALUES('old','student');
 ALTER TABLE question_bank ADD COLUMN content_mode TEXT;ALTER TABLE question_bank ADD COLUMN option_count INTEGER;
 ALTER TABLE curriculum_versions ADD COLUMN program_version TEXT;
 ALTER TABLE student_enrollments ADD COLUMN id TEXT;UPDATE student_enrollments SET id='enrollment';`);
 const add=(id:string)=>{db.prepare(`INSERT INTO question_bank(id,stem_text,options_json,difficulty_level,difficulty,solution_text,correct_answer,grade_level,academic_year,subject_id,owner_type,owner_id,review_status,copyright_status,question_type,created_at) VALUES(?,?,?,3,3,NULL,'A',7,'2026-2027','math','PLATFORM',NULL,'APPROVED','OWNED','MULTIPLE_CHOICE','2026-10-01')`).run(id,`stem ${id}`,'["a","b"]');db.prepare('INSERT INTO question_learning_links VALUES(?,?)').run(id,'ln_outcome')};
 ['new','mini','practice','assessment','foreign','draft','wrongyear','duplicate','reservation','ownclone','aaa-privateclone'].forEach(add);
 db.exec(`INSERT INTO coach_mini_test_questions VALUES('old','mini');INSERT INTO question_practice_attempts VALUES('student','practice');INSERT INTO assessment_responses VALUES('student','assessment');INSERT INTO coach_question_exposures VALUES('student','reservation');
 UPDATE question_bank SET owner_type='INSTITUTION',owner_id='other' WHERE id='foreign';UPDATE question_bank SET review_status='DRAFT' WHERE id='draft';UPDATE question_bank SET academic_year='2025-2026' WHERE id='wrongyear';UPDATE question_bank SET stem_text='stem mini' WHERE id='duplicate';UPDATE question_bank SET stem_text='stem new',owner_type='INSTITUTION',owner_id='school' WHERE id='ownclone';UPDATE question_bank SET stem_text='stem new',owner_type='INSTITUTION',owner_id='other' WHERE id='aaa-privateclone';`);
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...values:any[])=>prepare(sql,values),all:async()=>({results:db.prepare(sql).all(...args)})});
 const env={DB:{prepare}} as any,user={role:'STUDENT',id:'user',student_id:'student',institution_id:'school'} as any;
 expect((await eligibleCoachMiniTestQuestions(env,user,'outcome','NEW')).map(q=>q.id)).toEqual(['new']);
 const repeat=(await eligibleCoachMiniTestQuestions(env,user,'outcome','REPEAT')).map(q=>q.id);
 expect(repeat).toContain('practice');expect(repeat).toContain('assessment');expect(repeat).not.toContain('new');expect(repeat.filter(id=>['mini','duplicate'].includes(id))).toHaveLength(1);
 db.exec('UPDATE curriculum_versions SET verified=0');expect(await eligibleCoachMiniTestQuestions(env,user,'outcome','NEW')).toEqual([]);
 expect(await startCoachMiniTest(env,user,'item','AUTO')).toEqual({ok:false,reason:'INVALID_QUESTION_MODE'});
 }finally{db.close()}
});

it('repeat scoring does not promote mastery or assignment completion',async()=>{
 const {submitCoachMiniTest}=await import('../worker/lib/coach-mastery-cycle');
 const writes:string[]=[];
 let receipt:any;
 const test:any={id:'test',student_id:'student',status:'READY',selection_mode:'REPEAT',question_count:5,pass_threshold:.8,outcome_id:'outcome',assignment_id:'assignment'};
 const prepare=(sql:string,args:any[]=[]):any=>({sql,args,bind:(...values:any[])=>prepare(sql,values),
 first:async()=>sql.includes('FROM coach_mini_test_submissions')?receipt:sql.includes('coach_mini_tests')?test:null,
 all:async()=>({results:sql.includes('snapshot_json FROM coach_mini_test_questions')?Array.from({length:5},(_,i)=>({question_id:`q${i}`,snapshot_json:JSON.stringify({schemaVersion:1,question:{id:`q${i}`,stem_text:'stem',correct_answer:'A'},academicYear:'2026-2027',gradeLevel:7,enrollmentId:'enrollment',seasonId:'season',outcomeRefs:[{outcomeId:'outcome',subjectId:'math',curriculumVersionId:'version',academicYear:'2026-2027',gradeLevel:7,verified:1}]})})):[]}),
 run:async()=>{writes.push(sql);return{success:true}}});
 const env={DB:{prepare,batch:async(statements:any[])=>{for(const statement of statements){writes.push(statement.sql);if(statement.sql.startsWith('INSERT OR IGNORE INTO coach_mini_test_submissions'))receipt={token:statement.args[0]};if(statement.sql.startsWith('UPDATE coach_mini_tests')){test.status=statement.args[0];test.correct_count=statement.args[1];}}return statements.map(()=>({success:true}))}}} as any;
 const result=await submitCoachMiniTest(env,{role:'STUDENT',id:'user',student_id:'student',institution_id:'school'} as any,'test',Array.from({length:5},(_,i)=>({questionId:`q${i}`,answer:'A'})));
 expect(result).toMatchObject({ok:true,result:{practiceOnly:true,masteryStatus:null,selectionMode:'REPEAT'}});
 expect(writes.some(sql=>sql.includes('student_outcome_mastery')||sql.includes('student_learning_state')||sql.includes('learning_evidence')||sql.includes('UPDATE assignment_items'))).toBe(false);
});

it('rolls back the whole new test when another request reserves a question first',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
 db.exec(`CREATE TABLE coach_mini_tests(id TEXT,assignment_id TEXT,assignment_item_id TEXT,student_id TEXT,outcome_id TEXT,cycle_no INTEGER,status TEXT,question_count INTEGER,pass_threshold REAL,selection_mode TEXT);
 CREATE TABLE coach_mini_test_questions(test_id TEXT,question_id TEXT,sort_order INTEGER,snapshot_json TEXT);
 CREATE TABLE coach_question_exposures(student_id TEXT,question_id TEXT,PRIMARY KEY(student_id,question_id));`);
 const pool=Array.from({length:5},(_,i)=>({id:`q${i}`}));
 const prepare=(sql:string,args:any[]=[]):any=>({sql,args,bind:(...values:any[])=>prepare(sql,values),first:async()=>sql.includes('FROM assignment_items')?{id:'item',assignment_id:'assignment',outcome_id:'outcome',institution_id:'school',payload_json:'{"kind":"OUTCOME_PRACTICE"}'}:null,all:async()=>({results:pool})});
 const env={DB:{prepare,batch:async(statements:any[])=>{
 db.prepare('INSERT INTO coach_question_exposures VALUES(?,?)').run('student','q0');
 db.exec('BEGIN');try{for(const statement of statements)db.prepare(statement.sql).run(...statement.args);db.exec('COMMIT')}catch(error){db.exec('ROLLBACK');throw error}
 }}} as any;
 const result=await startCoachMiniTest(env,{role:'STUDENT',id:'user',student_id:'student',institution_id:'school'} as any,'item');
 expect(result).toMatchObject({ok:false,reason:'NEW_QUESTIONS_REQUIRED',retryRequired:true});
 expect(db.prepare('SELECT count(*) c FROM coach_mini_tests').get()?.c).toBe(0);
 expect(db.prepare('SELECT count(*) c FROM coach_mini_test_questions').get()?.c).toBe(0);
 expect(db.prepare('SELECT count(*) c FROM coach_question_exposures').get()?.c).toBe(1);
 }finally{db.close()}
});
