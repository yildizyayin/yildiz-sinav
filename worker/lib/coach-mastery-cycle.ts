import type { AuthUser,Env } from '../types';
import { all,audit,one,uuid } from './db';
import { coachQuestionTarget,markCoachItemVerifiedComplete } from './education-coach';
import { hydrateQuestionMedia } from './question-content';

const PASS_THRESHOLD=.80;
const MIN_QUESTIONS=5;
const MAX_QUESTIONS=10;

type MiniTestAnswer={questionId:string;answer:string};
type EligibleQuestion={id:string;stem_text:string;options_json:string|null;difficulty:number;solution_text:string|null;correct_answer:string;[key:string]:any};

export function miniTestQuestionCount(available:number,cycleNo:number){
 if(available<MIN_QUESTIONS)return 0;
 return Math.min(available,MAX_QUESTIONS,MIN_QUESTIONS+Math.max(0,cycleNo-1));
}

export function evaluateMiniTest(correct:number,total:number,threshold=PASS_THRESHOLD){
 const safeTotal=Math.max(0,total),safeCorrect=Math.max(0,Math.min(correct,safeTotal));
 const rate=safeTotal?safeCorrect/safeTotal:0;
 return{correct:safeCorrect,total:safeTotal,rate,scorePercent:Math.round(rate*10000)/100,passed:safeTotal>=MIN_QUESTIONS&&rate>=threshold};
}

function normalizedAnswer(value:unknown){return String(value??'').trim().toLocaleUpperCase('tr-TR')}
function parseJson<T>(value:string|null,fallback:T):T{try{return value?JSON.parse(value):fallback}catch{return fallback}}
function nodeId(outcomeId:string){return `ln_${outcomeId}`}


function validMiniSnapshot(value:any){
 return value?.schemaVersion===1&&typeof value.question?.correct_answer==='string'&&typeof value.question?.stem_text==='string'&&typeof value.academicYear==='string'&&Number.isInteger(value.gradeLevel)&&typeof value.enrollmentId==='string'&&typeof value.seasonId==='string'&&Array.isArray(value.outcomeRefs)&&value.outcomeRefs.length>0&&value.outcomeRefs.every((r:any)=>r.verified===1&&typeof r.outcomeId==='string'&&typeof r.subjectId==='string'&&typeof r.curriculumVersionId==='string'&&r.academicYear===value.academicYear&&r.gradeLevel===value.gradeLevel);
}

async function scopedItem(env:Env,user:AuthUser,itemId:string){
 if(user.role!=='STUDENT'||!user.student_id)return null;
 return one<any>(env.DB.prepare(`SELECT ai.id,ai.assignment_id,ai.reference_id outcome_id,ai.payload_json,a.institution_id
   FROM assignment_items ai JOIN assignments a ON a.id=ai.assignment_id
   JOIN assignment_recipients ar ON ar.assignment_id=a.id
   WHERE ai.id=? AND a.assignment_type='NIBIRU' AND ar.student_id=? AND a.institution_id=?`).bind(itemId,user.student_id,user.institution_id));
}

async function currentTest(env:Env,studentId:string,itemId:string){
 return one<any>(env.DB.prepare(`SELECT * FROM coach_mini_tests WHERE assignment_item_id=? AND student_id=? ORDER BY cycle_no DESC LIMIT 1`).bind(itemId,studentId));
}

export async function eligibleCoachMiniTestQuestions(env:Env,user:AuthUser,outcomeId:string,mode:'NEW'|'REPEAT'){
 return all<EligibleQuestion>(env.DB.prepare(`SELECT DISTINCT q.id,q.stem_text,q.options_json,COALESCE(q.difficulty_level,q.difficulty,3) difficulty,q.solution_text,q.correct_answer,q.content_mode,q.option_count,
   e.id enrollmentId,e.season_id seasonId,season.academic_year academicYear,e.grade_level gradeLevel,
   o.id outcomeId,o.subject_id subjectId,cv.id curriculumVersionId,cv.program_version programVersion,cv.verified verified
   FROM question_bank q JOIN question_learning_links l ON l.question_id=q.id
   JOIN outcomes o ON l.node_id='ln_'||o.id
   JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
   JOIN student_enrollments e ON e.student_id=? AND e.institution_id=? AND e.status='ACTIVE'
   JOIN institution_seasons season ON season.id=e.season_id AND season.institution_id=e.institution_id AND season.status='ACTIVE'
   WHERE o.id=? AND o.active=1 AND cv.verified=1 AND cv.academic_year=season.academic_year
     AND o.grade_level=e.grade_level AND cv.grade_level=e.grade_level
     AND q.grade_level=e.grade_level AND q.academic_year=season.academic_year AND q.subject_id=o.subject_id
     AND (q.owner_type='PLATFORM' OR (q.owner_type='INSTITUTION' AND q.owner_id=e.institution_id) OR (q.owner_type='USER' AND q.owner_id=?))
     AND q.review_status='APPROVED' AND q.copyright_status IN ('OWNED','LICENSED','PUBLIC_DOMAIN')
     AND NOT EXISTS(SELECT 1 FROM question_bank duplicate JOIN question_learning_links dl ON dl.question_id=duplicate.id WHERE dl.node_id=l.node_id AND duplicate.id<q.id AND lower(trim(duplicate.stem_text))=lower(trim(q.stem_text)) AND duplicate.options_json=q.options_json AND (duplicate.owner_type='PLATFORM' OR (duplicate.owner_type='INSTITUTION' AND duplicate.owner_id=e.institution_id) OR (duplicate.owner_type='USER' AND duplicate.owner_id=?)) AND duplicate.question_type='MULTIPLE_CHOICE' AND duplicate.correct_answer IS NOT NULL AND duplicate.options_json IS NOT NULL AND duplicate.review_status='APPROVED' AND duplicate.academic_year=q.academic_year AND duplicate.grade_level=q.grade_level AND duplicate.subject_id=q.subject_id AND duplicate.copyright_status IN ('OWNED','LICENSED','PUBLIC_DOMAIN'))
     AND q.question_type='MULTIPLE_CHOICE' AND q.correct_answer IS NOT NULL AND q.options_json IS NOT NULL
     AND CASE WHEN EXISTS(SELECT 1 FROM coach_mini_test_questions tq JOIN coach_mini_tests t ON t.id=tq.test_id WHERE t.student_id=? AND (tq.question_id=q.id OR EXISTS(SELECT 1 FROM question_bank seen WHERE seen.id=tq.question_id AND lower(trim(seen.stem_text))=lower(trim(q.stem_text)) AND seen.options_json=q.options_json)))
       OR EXISTS(SELECT 1 FROM coach_question_exposures exposure WHERE exposure.student_id=? AND (exposure.question_id=q.id OR EXISTS(SELECT 1 FROM question_bank seen WHERE seen.id=exposure.question_id AND lower(trim(seen.stem_text))=lower(trim(q.stem_text)) AND seen.options_json=q.options_json)))
       OR EXISTS(SELECT 1 FROM question_practice_attempts p WHERE p.student_id=? AND (p.question_id=q.id OR EXISTS(SELECT 1 FROM question_bank seen WHERE seen.id=p.question_id AND lower(trim(seen.stem_text))=lower(trim(q.stem_text)) AND seen.options_json=q.options_json)))
       OR EXISTS(SELECT 1 FROM assessment_responses r WHERE r.student_id=? AND (r.question_id=q.id OR EXISTS(SELECT 1 FROM question_bank seen WHERE seen.id=r.question_id AND lower(trim(seen.stem_text))=lower(trim(q.stem_text)) AND seen.options_json=q.options_json)))
       THEN 'REPEAT' ELSE 'NEW' END=?
   ORDER BY COALESCE(q.difficulty_level,q.difficulty,3),q.created_at DESC,q.id LIMIT 10`).bind(user.student_id,user.institution_id,outcomeId,user.id,user.id,user.student_id,user.student_id,user.student_id,user.student_id,mode));
}

async function followups(env:Env,studentId:string,testId:string){
 const rows=await all<any>(env.DB.prepare(`SELECT id,action_type,reference_id,title,payload_json,status,completed_at FROM coach_followup_actions WHERE test_id=? AND student_id=? ORDER BY created_at,id`).bind(testId,studentId));
 return rows.map(x=>({...x,payload:parseJson(x.payload_json,{})}));
}

export async function startCoachMiniTest(env:Env,user:AuthUser,itemId:string,mode:unknown='NEW'){
 if(mode!=='NEW'&&mode!=='REPEAT')return{ok:false,reason:'INVALID_QUESTION_MODE'};
 const item=await scopedItem(env,user,itemId);if(!item||!user.student_id)return{ok:false,reason:'ITEM_NOT_FOUND'};
 const payload=parseJson<any>(item.payload_json,{});if(payload.kind!=='OUTCOME_PRACTICE'||!item.outcome_id)return{ok:false,reason:'MINI_TEST_NOT_REQUIRED'};
 const latest=await currentTest(env,user.student_id,itemId);
 if(latest?.status==='READY')return{ok:true,reused:true,testId:latest.id,cycleNo:Number(latest.cycle_no),questionCount:Number(latest.question_count),questionMode:latest.selection_mode||'LEGACY'};
 if(mode==='NEW'&&latest?.status==='FAILED'){
  const support=await followups(env,user.student_id,latest.id);
  if(!support.some(x=>x.status==='DONE'))return{ok:false,reason:'SUPPORT_REQUIRED',testId:latest.id,followups:support};
 }
 const cycleNo=Number(latest?.cycle_no||0)+1;
 const pool=await eligibleCoachMiniTestQuestions(env,user,item.outcome_id,mode);const questionCount=miniTestQuestionCount(pool.length,cycleNo);
 if(!questionCount)return{ok:false,reason:mode==='NEW'?'NEW_QUESTIONS_REQUIRED':'REPEAT_QUESTIONS_REQUIRED',availableQuestionCount:pool.length,requiredQuestionCount:MIN_QUESTIONS,questionMode:mode};
 const selected=await hydrateQuestionMedia(env,pool.slice(0,questionCount)),testId=uuid('cmt');
 if(new Set(selected.map(q=>q.id)).size!==selected.length||selected.some(q=>q.enrollmentId!==selected[0].enrollmentId||q.seasonId!==selected[0].seasonId||q.academicYear!==selected[0].academicYear||q.gradeLevel!==selected[0].gradeLevel))return{ok:false,reason:'SNAPSHOT_CONTEXT_AMBIGUOUS'};
 const statements:D1PreparedStatement[]=[env.DB.prepare(`INSERT INTO coach_mini_tests(id,assignment_id,assignment_item_id,student_id,outcome_id,cycle_no,status,question_count,pass_threshold,selection_mode) VALUES(?,?,?,?,?,?,'READY',?,?,?)`).bind(testId,item.assignment_id,itemId,user.student_id,item.outcome_id,cycleNo,questionCount,PASS_THRESHOLD,mode)];
 selected.forEach((q,index)=>statements.push(env.DB.prepare(`INSERT INTO coach_mini_test_questions(test_id,question_id,sort_order,snapshot_json) VALUES(?,?,?,?)`).bind(testId,q.id,index+1,JSON.stringify({schemaVersion:1,question:q,academicYear:q.academicYear,gradeLevel:q.gradeLevel,enrollmentId:q.enrollmentId,seasonId:q.seasonId,outcomeRefs:[{outcomeId:q.outcomeId,subjectId:q.subjectId,curriculumVersionId:q.curriculumVersionId,academicYear:q.academicYear,gradeLevel:q.gradeLevel,programVersion:q.programVersion,verified:q.verified}]}))));
 if(mode==='NEW')selected.forEach(q=>statements.push(env.DB.prepare(`INSERT INTO coach_question_exposures(student_id,question_id) VALUES(?,?)`).bind(user.student_id,q.id)));
 try{await env.DB.batch(statements)}catch(error){
  if(mode==='NEW'&&/UNIQUE constraint failed: coach_question_exposures/.test(String(error)))return{ok:false,reason:'NEW_QUESTIONS_REQUIRED',requiredQuestionCount:MIN_QUESTIONS,questionMode:mode,retryRequired:true};
  throw error;
 }
 await audit(env.DB,user.id,item.institution_id,'COACH_MINI_TEST_STARTED','coach_mini_test',testId,{assignmentId:item.assignment_id,itemId,outcomeId:item.outcome_id,cycleNo,questionCount,questionMode:mode});
 return{ok:true,reused:false,testId,cycleNo,questionCount,questionMode:mode};
}

export async function getCoachMiniTest(env:Env,user:AuthUser,testId:string){
 if(user.role!=='STUDENT'||!user.student_id)return{ok:false,reason:'STUDENT_ONLY'};
 const test=await one<any>(env.DB.prepare(`SELECT t.*,o.title outcome_title,o.topic,o.subtopic,s.name subject_name
   FROM coach_mini_tests t JOIN outcomes o ON o.id=t.outcome_id JOIN subjects s ON s.id=o.subject_id
   WHERE t.id=? AND t.student_id=?`).bind(testId,user.student_id));
 if(!test)return{ok:false,reason:'TEST_NOT_FOUND'};
 const submitted=test.status!=='READY';
 const rows=await all<any>(env.DB.prepare(`SELECT question_id,sort_order,student_answer,correct,snapshot_json FROM coach_mini_test_questions WHERE test_id=? ORDER BY sort_order`).bind(testId));
 const snapshots=rows.map(x=>parseJson<any>(x.snapshot_json,null));
 if(!submitted&&(!rows.length||snapshots.some(x=>!validMiniSnapshot(x))))return{ok:false,reason:'SNAPSHOT_REQUIRED'};
 const questions=rows.map((row,index)=>{
  const snapshot=snapshots[index];if(!validMiniSnapshot(snapshot))return{id:row.question_id,question_id:row.question_id,sort_order:row.sort_order,student_answer:row.student_answer,correct:row.correct,legacyEvidence:true,stem_text:'Eski sorunun dondurulmuş içeriği mevcut değil',options:[]};
  const q=snapshot.question;
  return{id:row.question_id,question_id:row.question_id,sort_order:row.sort_order,student_answer:row.student_answer,correct:row.correct,stem_text:q.stem_text,options:parseJson(q.options_json,[]),content_mode:q.content_mode,option_count:q.option_count,difficulty:q.difficulty,assets:(q.assets||[]).filter((x:any)=>submitted||x.placement!=='SOLUTION'),contentBlocks:(q.contentBlocks||[]).filter((x:any)=>submitted||x.placement!=='SOLUTION'),...(submitted?{solution_text:q.solution_text,correct_answer:q.correct_answer}:{})};
 });
 return{ok:true,test,questions,legacyEvidence:snapshots.some(x=>!validMiniSnapshot(x)),followups:await followups(env,user.student_id,testId)};
}

async function updateLearningState(env:Env,studentId:string,outcomeId:string,testId:string,rate:number,questionCount:number){
 const node=await one<any>(env.DB.prepare(`SELECT id FROM learning_nodes WHERE id=?`).bind(nodeId(outcomeId)));if(!node)return;
 await env.DB.batch([
  env.DB.prepare(`INSERT INTO learning_evidence(id,student_id,node_id,source_type,source_id,result,weight) VALUES(?,?,?,'ASSIGNMENT',?,?,?)`).bind(uuid('evd'),studentId,node.id,testId,rate,questionCount),
  env.DB.prepare(`INSERT INTO student_learning_state(student_id,node_id,mastery,confidence,evidence_count,last_evidence_at,updated_at) VALUES(?,?,?,MIN(1,0.20+?*0.08),?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(student_id,node_id) DO UPDATE SET mastery=ROUND(((student_learning_state.mastery*student_learning_state.evidence_count)+(excluded.mastery*excluded.evidence_count))/(student_learning_state.evidence_count+excluded.evidence_count),4),confidence=MIN(1,student_learning_state.confidence+0.12),evidence_count=student_learning_state.evidence_count+excluded.evidence_count,last_evidence_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`).bind(studentId,node.id,rate,questionCount,questionCount),
 ]);
}

async function createFollowupActions(env:Env,user:AuthUser,test:any,result:ReturnType<typeof evaluateMiniTest>){
 const questionTarget=coachQuestionTarget(result.rate),actions:D1PreparedStatement[]=[];
 actions.push(env.DB.prepare(`INSERT INTO coach_followup_actions(id,test_id,student_id,outcome_id,action_type,title,payload_json) VALUES(?,?,?,?, 'PRACTICE',?,?)`).bind(uuid('cfa'),test.id,user.student_id,test.outcome_id,'Kısa pekiştirme çalışmasını tamamla',JSON.stringify({questionTarget,minutes:12,reason:'MINI_TEST_REMEASUREMENT',scorePercent:result.scorePercent})));
 const video=await one<any>(env.DB.prepare(`SELECT id,title,url,duration_seconds FROM learning_videos WHERE node_id=? AND approved=1 AND active=1 ORDER BY CASE WHEN duration_seconds BETWEEN 60 AND 180 THEN 0 ELSE 1 END,created_at DESC LIMIT 1`).bind(nodeId(test.outcome_id)));
 if(video)actions.push(env.DB.prepare(`INSERT INTO coach_followup_actions(id,test_id,student_id,outcome_id,action_type,reference_id,title,payload_json) VALUES(?,?,?,?, 'VIDEO',?,?,?)`).bind(uuid('cfa'),test.id,user.student_id,test.outcome_id,video.id,video.title,JSON.stringify({url:video.url,durationSeconds:video.duration_seconds,source:'APPROVED_LEARNING_VIDEO'})));
 else actions.push(env.DB.prepare(`INSERT INTO coach_followup_actions(id,test_id,student_id,outcome_id,action_type,title,payload_json) VALUES(?,?,?,?, 'TOPIC_REVIEW',?,?)`).bind(uuid('cfa'),test.id,user.student_id,test.outcome_id,'Konu özetini yeniden gözden geçir',JSON.stringify({minutes:8,reason:'APPROVED_VIDEO_NOT_AVAILABLE'})));
 await env.DB.batch(actions);
}

export async function submitCoachMiniTest(env:Env,user:AuthUser,testId:string,answers:MiniTestAnswer[]){
 if(user.role!=='STUDENT'||!user.student_id)return{ok:false,reason:'STUDENT_ONLY'};
 const test=await one<any>(env.DB.prepare(`SELECT * FROM coach_mini_tests WHERE id=? AND student_id=?`).bind(testId,user.student_id));
 if(!test)return{ok:false,reason:'TEST_NOT_FOUND'};if(test.status!=='READY'){const detail=await getCoachMiniTest(env,user,testId);return{...detail,reused:true};}
 const rows=await all<any>(env.DB.prepare(`SELECT question_id,snapshot_json FROM coach_mini_test_questions WHERE test_id=? ORDER BY sort_order`).bind(testId));
 const snapshots=rows.map(x=>parseJson<any>(x.snapshot_json,null));
 if(!rows.length||rows.length!==Number(test.question_count)||snapshots.some(x=>!validMiniSnapshot(x)))return{ok:false,reason:'SNAPSHOT_REQUIRED'};
 const context=snapshots[0];
 if(snapshots.some(x=>x.academicYear!==context.academicYear||x.gradeLevel!==context.gradeLevel||x.enrollmentId!==context.enrollmentId||x.seasonId!==context.seasonId))return{ok:false,reason:'SNAPSHOT_REQUIRED'};
 rows.forEach((row,index)=>row.correct_answer=snapshots[index].question.correct_answer);
 const answerMap=new Map((Array.isArray(answers)?answers:[]).map(x=>[String(x.questionId),normalizedAnswer(x.answer)]));
 if(rows.some(x=>!answerMap.has(x.question_id)))return{ok:false,reason:'ALL_QUESTIONS_REQUIRED'};
 const graded=rows.map(x=>({questionId:x.question_id,answer:answerMap.get(x.question_id)||'',correct:(answerMap.get(x.question_id)||'')===normalizedAnswer(x.correct_answer)}));
 const result=evaluateMiniTest(graded.filter(x=>x.correct).length,rows.length,Number(test.pass_threshold||PASS_THRESHOLD));
 const isRepeat=test.selection_mode==='REPEAT';
 const status=result.passed?'PASSED':'FAILED',statements:D1PreparedStatement[]=[];
 graded.forEach(x=>statements.push(env.DB.prepare(`UPDATE coach_mini_test_questions SET student_answer=?,correct=?,answered_at=CURRENT_TIMESTAMP WHERE test_id=? AND question_id=?`).bind(x.answer,x.correct?1:0,testId,x.questionId)));
 statements.push(env.DB.prepare(`UPDATE coach_mini_tests SET status=?,correct_count=?,score_percent=?,submitted_at=CURRENT_TIMESTAMP WHERE id=? AND status='READY'`).bind(status,result.correct,result.scorePercent,testId));
 if(!isRepeat)statements.push(env.DB.prepare(`INSERT INTO student_outcome_mastery(student_id,outcome_id,status,cycle_count,last_score,last_test_id,mastered_at,updated_at) VALUES(?,?,?,?,?,?,CASE WHEN ?='MASTERED' THEN CURRENT_TIMESTAMP ELSE NULL END,CURRENT_TIMESTAMP)
   ON CONFLICT(student_id,outcome_id) DO UPDATE SET status=excluded.status,cycle_count=student_outcome_mastery.cycle_count+1,last_score=excluded.last_score,last_test_id=excluded.last_test_id,mastered_at=CASE WHEN excluded.status='MASTERED' THEN CURRENT_TIMESTAMP ELSE student_outcome_mastery.mastered_at END,updated_at=CURRENT_TIMESTAMP`).bind(user.student_id,test.outcome_id,result.passed?'MASTERED':'DEVELOPING',1,result.rate,testId,result.passed?'MASTERED':'DEVELOPING'));
 statements.push(env.DB.prepare(`INSERT OR IGNORE INTO assessment_runs(id,institution_id,student_id,source_type,source_id,assignment_id,delivery_mode,status,score,metadata_json,completed_at) VALUES(?,?,?,'MINI_TEST',?,?,'DIGITAL','SCORED',?,?,CURRENT_TIMESTAMP)`).bind(testId,user.institution_id,user.student_id,testId,test.assignment_id,result.rate,JSON.stringify({outcomeId:test.outcome_id,cycleNo:test.cycle_no,correct:result.correct,total:result.total,scorePercent:result.scorePercent,passThreshold:test.pass_threshold,selectionMode:test.selection_mode||'LEGACY',practiceOnly:isRepeat,...(!isRepeat?{miniEvidence:{policy:'MINI_TEST_CONTENT_AT_START_V1',academicYear:context.academicYear,gradeLevel:context.gradeLevel,enrollmentId:context.enrollmentId,seasonId:context.seasonId,questionEvidence:graded.map((x,index)=>({questionId:x.questionId,status:x.answer?(x.correct?'CORRECT':'WRONG'):'BLANK',outcomeRefs:snapshots[index].outcomeRefs}))}}:{})})));
 graded.forEach(x=>statements.push(env.DB.prepare(`INSERT OR IGNORE INTO assessment_responses(id,run_id,student_id,question_id,node_id,selected_answer,is_correct,source_channel) VALUES(?,?,?,?,?,?,?,'DIGITAL')`).bind(uuid('ars'),testId,user.student_id,x.questionId,nodeId(test.outcome_id),x.answer,x.correct?1:0)));
 await env.DB.batch(statements);
 if(!isRepeat)await updateLearningState(env,user.student_id,test.outcome_id,testId,result.rate,result.total);
 if(!isRepeat&&result.passed)await markCoachItemVerifiedComplete(env,user,test.assignment_item_id,{testId,scorePercent:result.scorePercent,cycleNo:test.cycle_no});else if(!isRepeat)await createFollowupActions(env,user,{...test,id:testId},result);
 await audit(env.DB,user.id,user.institution_id,'COACH_MINI_TEST_SUBMITTED','coach_mini_test',testId,{outcomeId:test.outcome_id,cycleNo:test.cycle_no,...result,status});
 return{ok:true,reused:false,result:{...result,status,practiceOnly:isRepeat,selectionMode:test.selection_mode||'LEGACY',masteryStatus:isRepeat?null:result.passed?'MASTERED':'DEVELOPING'},detail:await getCoachMiniTest(env,user,testId)};
}

export async function completeCoachFollowup(env:Env,user:AuthUser,actionId:string){
 if(user.role!=='STUDENT'||!user.student_id)return{ok:false,reason:'STUDENT_ONLY'};
 const action=await one<any>(env.DB.prepare(`SELECT f.*,t.assignment_item_id FROM coach_followup_actions f JOIN coach_mini_tests t ON t.id=f.test_id WHERE f.id=? AND f.student_id=?`).bind(actionId,user.student_id));
 if(!action)return{ok:false,reason:'FOLLOWUP_NOT_FOUND'};
 await env.DB.prepare(`UPDATE coach_followup_actions SET status='DONE',completed_at=CURRENT_TIMESTAMP WHERE id=? AND student_id=?`).bind(actionId,user.student_id).run();
 await audit(env.DB,user.id,user.institution_id,'COACH_FOLLOWUP_COMPLETED','coach_followup',actionId,{testId:action.test_id,outcomeId:action.outcome_id,actionType:action.action_type});
 return{ok:true,actionId,testId:action.test_id,itemId:action.assignment_item_id,followups:await followups(env,user.student_id,action.test_id)};
}
