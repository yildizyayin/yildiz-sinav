import type { AuthUser,Env } from '../types';
import { all,audit,one,uuid } from './db';
import { coachQuestionTarget,markCoachItemVerifiedComplete } from './education-coach';

const PASS_THRESHOLD=.80;
const MIN_QUESTIONS=5;
const MAX_QUESTIONS=10;

type MiniTestAnswer={questionId:string;answer:string};
type EligibleQuestion={id:string;stem_text:string;options_json:string|null;difficulty:number;solution_text:string|null;correct_answer:string};

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

async function scopedItem(env:Env,user:AuthUser,itemId:string){
 if(user.role!=='STUDENT'||!user.student_id)return null;
 return one<any>(env.DB.prepare(`SELECT ai.id,ai.assignment_id,ai.reference_id outcome_id,ai.payload_json,a.institution_id
   FROM assignment_items ai JOIN assignments a ON a.id=ai.assignment_id
   JOIN assignment_recipients ar ON ar.assignment_id=a.id
   WHERE ai.id=? AND a.assignment_type='NIBIRU' AND ar.student_id=?`).bind(itemId,user.student_id));
}

async function currentTest(env:Env,studentId:string,itemId:string){
 return one<any>(env.DB.prepare(`SELECT * FROM coach_mini_tests WHERE assignment_item_id=? AND student_id=? ORDER BY cycle_no DESC LIMIT 1`).bind(itemId,studentId));
}

async function eligibleQuestions(env:Env,outcomeId:string){
 return all<EligibleQuestion>(env.DB.prepare(`SELECT DISTINCT q.id,q.stem_text,q.options_json,q.difficulty,q.solution_text,q.correct_answer
   FROM question_bank q JOIN question_learning_links l ON l.question_id=q.id
   WHERE l.node_id=? AND q.review_status='APPROVED'
     AND q.copyright_status IN ('OWNED','LICENSED','PUBLIC_DOMAIN')
     AND q.question_type='MULTIPLE_CHOICE' AND q.correct_answer IS NOT NULL AND q.options_json IS NOT NULL
   ORDER BY q.difficulty,q.created_at DESC,q.id LIMIT 100`).bind(nodeId(outcomeId)));
}

async function followups(env:Env,studentId:string,testId:string){
 const rows=await all<any>(env.DB.prepare(`SELECT id,action_type,reference_id,title,payload_json,status,completed_at FROM coach_followup_actions WHERE test_id=? AND student_id=? ORDER BY created_at,id`).bind(testId,studentId));
 return rows.map(x=>({...x,payload:parseJson(x.payload_json,{})}));
}

export async function startCoachMiniTest(env:Env,user:AuthUser,itemId:string){
 const item=await scopedItem(env,user,itemId);if(!item||!user.student_id)return{ok:false,reason:'ITEM_NOT_FOUND'};
 const payload=parseJson<any>(item.payload_json,{});if(payload.kind!=='OUTCOME_PRACTICE'||!item.outcome_id)return{ok:false,reason:'MINI_TEST_NOT_REQUIRED'};
 const mastery=await one<any>(env.DB.prepare(`SELECT status,last_score,last_test_id FROM student_outcome_mastery WHERE student_id=? AND outcome_id=?`).bind(user.student_id,item.outcome_id));
 if(mastery?.status==='MASTERED')return{ok:true,reused:true,mastered:true,testId:mastery.last_test_id};
 const latest=await currentTest(env,user.student_id,itemId);
 if(latest?.status==='READY')return{ok:true,reused:true,testId:latest.id,cycleNo:Number(latest.cycle_no),questionCount:Number(latest.question_count)};
 if(latest?.status==='FAILED'){
  const support=await followups(env,user.student_id,latest.id);
  if(!support.some(x=>x.status==='DONE'))return{ok:false,reason:'SUPPORT_REQUIRED',testId:latest.id,followups:support};
 }
 const cycleNo=Number(latest?.cycle_no||0)+1;
 const pool=await eligibleQuestions(env,item.outcome_id);const questionCount=miniTestQuestionCount(pool.length,cycleNo);
 if(!questionCount)return{ok:false,reason:'INSUFFICIENT_VERIFIED_QUESTIONS',availableQuestionCount:pool.length,requiredQuestionCount:MIN_QUESTIONS};
 const used=await all<{question_id:string}>(env.DB.prepare(`SELECT q.question_id FROM coach_mini_test_questions q JOIN coach_mini_tests t ON t.id=q.test_id WHERE t.assignment_item_id=? AND t.student_id=?`).bind(itemId,user.student_id));
 const usedIds=new Set(used.map(x=>x.question_id));const unseen=pool.filter(x=>!usedIds.has(x.id));
 const candidates=[...unseen,...pool.filter(x=>usedIds.has(x.id))];
 const offset=pool.length?((cycleNo-1)*2)%pool.length:0;
 const rotated=[...candidates.slice(offset),...candidates.slice(0,offset)];
 const selected=rotated.slice(0,questionCount),testId=uuid('cmt');
 const statements:D1PreparedStatement[]=[env.DB.prepare(`INSERT INTO coach_mini_tests(id,assignment_id,assignment_item_id,student_id,outcome_id,cycle_no,status,question_count,pass_threshold) VALUES(?,?,?,?,?,?,'READY',?,?)`).bind(testId,item.assignment_id,itemId,user.student_id,item.outcome_id,cycleNo,questionCount,PASS_THRESHOLD)];
 selected.forEach((q,index)=>statements.push(env.DB.prepare(`INSERT INTO coach_mini_test_questions(test_id,question_id,sort_order) VALUES(?,?,?)`).bind(testId,q.id,index+1)));
 await env.DB.batch(statements);
 await audit(env.DB,user.id,item.institution_id,'COACH_MINI_TEST_STARTED','coach_mini_test',testId,{assignmentId:item.assignment_id,itemId,outcomeId:item.outcome_id,cycleNo,questionCount});
 return{ok:true,reused:false,testId,cycleNo,questionCount};
}

export async function getCoachMiniTest(env:Env,user:AuthUser,testId:string){
 if(user.role!=='STUDENT'||!user.student_id)return{ok:false,reason:'STUDENT_ONLY'};
 const test=await one<any>(env.DB.prepare(`SELECT t.*,o.title outcome_title,o.topic,o.subtopic,s.name subject_name
   FROM coach_mini_tests t JOIN outcomes o ON o.id=t.outcome_id JOIN subjects s ON s.id=o.subject_id
   WHERE t.id=? AND t.student_id=?`).bind(testId,user.student_id));
 if(!test)return{ok:false,reason:'TEST_NOT_FOUND'};
 const submitted=test.status!=='READY';
 const rows=await all<any>(env.DB.prepare(`SELECT tq.question_id,tq.sort_order,tq.student_answer,tq.correct,q.stem_text,q.options_json,q.difficulty,q.solution_text,
   CASE WHEN ?=1 THEN q.correct_answer ELSE NULL END correct_answer
   FROM coach_mini_test_questions tq JOIN question_bank q ON q.id=tq.question_id
   WHERE tq.test_id=? ORDER BY tq.sort_order`).bind(submitted?1:0,testId));
 return{ok:true,test,questions:rows.map(x=>({...x,options:parseJson(x.options_json,[]),options_json:undefined})),followups:await followups(env,user.student_id,testId)};
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
 const rows=await all<any>(env.DB.prepare(`SELECT tq.question_id,q.correct_answer FROM coach_mini_test_questions tq JOIN question_bank q ON q.id=tq.question_id WHERE tq.test_id=? ORDER BY tq.sort_order`).bind(testId));
 const answerMap=new Map((Array.isArray(answers)?answers:[]).map(x=>[String(x.questionId),normalizedAnswer(x.answer)]));
 if(rows.some(x=>!answerMap.has(x.question_id)))return{ok:false,reason:'ALL_QUESTIONS_REQUIRED'};
 const graded=rows.map(x=>({questionId:x.question_id,answer:answerMap.get(x.question_id)||'',correct:(answerMap.get(x.question_id)||'')===normalizedAnswer(x.correct_answer)}));
 const result=evaluateMiniTest(graded.filter(x=>x.correct).length,rows.length,Number(test.pass_threshold||PASS_THRESHOLD));
 const status=result.passed?'PASSED':'FAILED',statements:D1PreparedStatement[]=[];
 graded.forEach(x=>statements.push(env.DB.prepare(`UPDATE coach_mini_test_questions SET student_answer=?,correct=?,answered_at=CURRENT_TIMESTAMP WHERE test_id=? AND question_id=?`).bind(x.answer,x.correct?1:0,testId,x.questionId)));
 statements.push(env.DB.prepare(`UPDATE coach_mini_tests SET status=?,correct_count=?,score_percent=?,submitted_at=CURRENT_TIMESTAMP WHERE id=? AND status='READY'`).bind(status,result.correct,result.scorePercent,testId));
 statements.push(env.DB.prepare(`INSERT INTO student_outcome_mastery(student_id,outcome_id,status,cycle_count,last_score,last_test_id,mastered_at,updated_at) VALUES(?,?,?,?,?,?,CASE WHEN ?='MASTERED' THEN CURRENT_TIMESTAMP ELSE NULL END,CURRENT_TIMESTAMP)
   ON CONFLICT(student_id,outcome_id) DO UPDATE SET status=excluded.status,cycle_count=student_outcome_mastery.cycle_count+1,last_score=excluded.last_score,last_test_id=excluded.last_test_id,mastered_at=CASE WHEN excluded.status='MASTERED' THEN CURRENT_TIMESTAMP ELSE student_outcome_mastery.mastered_at END,updated_at=CURRENT_TIMESTAMP`).bind(user.student_id,test.outcome_id,result.passed?'MASTERED':'DEVELOPING',1,result.rate,testId,result.passed?'MASTERED':'DEVELOPING'));
 await env.DB.batch(statements);
 await updateLearningState(env,user.student_id,test.outcome_id,testId,result.rate,result.total);
 if(result.passed)await markCoachItemVerifiedComplete(env,user,test.assignment_item_id,{testId,scorePercent:result.scorePercent,cycleNo:test.cycle_no});else await createFollowupActions(env,user,{...test,id:testId},result);
 await audit(env.DB,user.id,user.institution_id,'COACH_MINI_TEST_SUBMITTED','coach_mini_test',testId,{outcomeId:test.outcome_id,cycleNo:test.cycle_no,...result,status});
 return{ok:true,reused:false,result:{...result,status,masteryStatus:result.passed?'MASTERED':'DEVELOPING'},detail:await getCoachMiniTest(env,user,testId)};
}

export async function completeCoachFollowup(env:Env,user:AuthUser,actionId:string){
 if(user.role!=='STUDENT'||!user.student_id)return{ok:false,reason:'STUDENT_ONLY'};
 const action=await one<any>(env.DB.prepare(`SELECT f.*,t.assignment_item_id FROM coach_followup_actions f JOIN coach_mini_tests t ON t.id=f.test_id WHERE f.id=? AND f.student_id=?`).bind(actionId,user.student_id));
 if(!action)return{ok:false,reason:'FOLLOWUP_NOT_FOUND'};
 await env.DB.prepare(`UPDATE coach_followup_actions SET status='DONE',completed_at=CURRENT_TIMESTAMP WHERE id=? AND student_id=?`).bind(actionId,user.student_id).run();
 await audit(env.DB,user.id,user.institution_id,'COACH_FOLLOWUP_COMPLETED','coach_followup',actionId,{testId:action.test_id,outcomeId:action.outcome_id,actionType:action.action_type});
 return{ok:true,actionId,testId:action.test_id,itemId:action.assignment_item_id,followups:await followups(env,user.student_id,action.test_id)};
}
