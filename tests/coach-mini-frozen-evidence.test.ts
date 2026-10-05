import { expect,it } from 'vitest';
import { getCoachMiniTest,startCoachMiniTest,submitCoachMiniTest } from '../worker/lib/coach-mastery-cycle';

it('freezes content and verified context at allocation, grades frozen keys and hides private solutions before submission',async()=>{
 const pool=Array.from({length:5},(_,i)=>({id:`q${i}`,stem_text:`old stem ${i}`,options_json:'["a","b"]',correct_answer:'A',solution_text:'private explanation',academicYear:'2026-2027',gradeLevel:7,enrollmentId:'enrollment',seasonId:'season',outcomeId:'outcome',subjectId:'math',curriculumVersionId:'version',programVersion:'TYMM',verified:1}));
 const frozen:any[]=[];let test:any=null;let metadata:any;let receipt:any;
 const prepare=(sql:string,args:any[]=[]):any=>({sql,args,bind:(...values:any[])=>prepare(sql,values),
 first:async()=>sql.includes('FROM coach_mini_test_submissions')?receipt:sql.includes('FROM assignment_items')?{assignment_id:'assignment',outcome_id:'outcome',institution_id:'school',payload_json:'{"kind":"OUTCOME_PRACTICE"}'}:sql.includes('coach_mini_tests')?test:null,
 all:async()=>({results:sql.includes('SELECT DISTINCT q.id')?pool:sql.includes('snapshot_json FROM coach_mini_test_questions')?frozen:[]}),run:async()=>({success:true})});
 const env={DB:{prepare,batch:async(statements:any[])=>{for(const s of statements){
 if(s.sql.startsWith('INSERT INTO coach_mini_tests'))test={id:s.args[0],status:'READY',selection_mode:'NEW',question_count:5,assignment_id:'assignment',outcome_id:'outcome',cycle_no:1};
 if(s.sql.startsWith('INSERT INTO coach_mini_test_questions'))frozen.push({question_id:s.args[1],sort_order:s.args[2],snapshot_json:s.args[3]});
 if(s.sql.startsWith('INSERT OR IGNORE INTO coach_mini_test_submissions'))receipt={token:s.args[0]};
 if(s.sql.startsWith('UPDATE coach_mini_tests')){test.status=s.args[0];test.correct_count=s.args[1];test.score_percent=s.args[2];}
 if(s.sql.includes('INSERT INTO assessment_runs'))metadata=JSON.parse(s.args[6]);
 }return statements.map(()=>({success:true}))}}} as any;
 const user={role:'STUDENT',id:'user',student_id:'student',institution_id:'school'} as any;
 const started=await startCoachMiniTest(env,user,'item');expect(started.ok).toBe(true);
 pool.forEach(q=>{q.correct_answer='B';q.stem_text='changed live content';q.verified=0});
 const ready:any=await getCoachMiniTest(env,user,test.id);
 expect(ready.questions[0].stem_text).toBe('old stem 0');expect(ready.questions[0]).not.toHaveProperty('correct_answer');expect(ready.questions[0]).not.toHaveProperty('solution_text');
 const result:any=await submitCoachMiniTest(env,user,test.id,frozen.map((q,index)=>({questionId:q.question_id,answer:index===0?'A':''})));
 expect(result.result.correct).toBe(1);expect(result.detail.questions[0].correct_answer).toBe('A');
 expect(metadata.miniEvidence).toMatchObject({policy:'MINI_TEST_CONTENT_AT_START_V1',academicYear:'2026-2027',gradeLevel:7,enrollmentId:'enrollment',seasonId:'season'});
 expect(metadata.miniEvidence.questionEvidence).toHaveLength(5);expect(metadata.miniEvidence.questionEvidence[0]).toMatchObject({status:'CORRECT',outcomeRefs:[{verified:1,programVersion:'TYMM'}]});
});

it('fails closed for ready legacy tests without frozen evidence',async()=>{
 const prepare=(sql:string):any=>({bind:()=>prepare(sql),first:async()=>({id:'test',status:'READY',question_count:5}),all:async()=>({results:[{question_id:'q',snapshot_json:null}]})});
 const env={DB:{prepare}} as any,user={role:'STUDENT',student_id:'student'} as any;
 expect(await getCoachMiniTest(env,user,'test')).toMatchObject({ok:false,reason:'SNAPSHOT_REQUIRED'});
 expect(await submitCoachMiniTest(env,user,'test',[])).toMatchObject({ok:false,reason:'SNAPSHOT_REQUIRED'});
});
