import type { AuthUser, Env } from '../types';
import { all,audit,one } from './db';

export type CoachWeakOutcome={
 outcome_id:string;title:string;topic:string|null;subtopic:string|null;subject_id:string;subject_name:string;evidence_count:number;correct_count:number;success_rate:number;
};
export type CoachWorksheet={id:string;title:string;track:string;planned_date:string|null;outcome_id:string|null};
export type CoachDraftItem={itemType:'TASK'|'WORKSHEET';referenceId:string|null;label:string;payload:Record<string,unknown>};
export type CoachPlanResult={available:boolean;reason?:string;reused?:boolean;plan?:any;items?:any[];evidence?:any};

export function istanbulDateKey(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const get=(type:string)=>parts.find(p=>p.type===type)?.value||'';
 return `${get('year')}-${get('month')}-${get('day')}`;
}

export function coachQuestionTarget(successRate:number){
 if(successRate<0.40)return 12;
 if(successRate<0.55)return 10;
 return 8;
}

export function buildCoachDraft(weak:CoachWeakOutcome[],worksheet:CoachWorksheet|null):CoachDraftItem[]{
 const items:CoachDraftItem[]=[];
 if(weak[0])items.push({itemType:'TASK',referenceId:weak[0].outcome_id,label:`${weak[0].subject_name} · ${weak[0].title}`,payload:{kind:'OUTCOME_PRACTICE',outcomeId:weak[0].outcome_id,subjectName:weak[0].subject_name,outcomeTitle:weak[0].title,topic:weak[0].topic,successRate:weak[0].success_rate,evidenceCount:weak[0].evidence_count,questionTarget:coachQuestionTarget(weak[0].success_rate),minutes:15}});
 if(worksheet)items.push({itemType:'WORKSHEET',referenceId:worksheet.id,label:worksheet.title,payload:{kind:'ASSIGNED_WORKSHEET',worksheetId:worksheet.id,title:worksheet.title,track:worksheet.track,plannedDate:worksheet.planned_date,minutes:20}});
 if(weak[1]&&items.length<3)items.push({itemType:'TASK',referenceId:weak[1].outcome_id,label:`${weak[1].subject_name} · ${weak[1].title}`,payload:{kind:'OUTCOME_PRACTICE',outcomeId:weak[1].outcome_id,subjectName:weak[1].subject_name,outcomeTitle:weak[1].title,topic:weak[1].topic,successRate:weak[1].success_rate,evidenceCount:weak[1].evidence_count,questionTarget:coachQuestionTarget(weak[1].success_rate),minutes:12}});
 return items.slice(0,3);
}

function safeIdPart(v:string){return v.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,80)}
function planIdFor(studentId:string,dateKey:string){return `coach_${dateKey.replace(/-/g,'')}_${safeIdPart(studentId)}`}
function itemIdFor(planId:string,index:number){return `${planId}_i${index+1}`}
function completionIdFor(studentId:string,itemId:string){return `coachdone_${safeIdPart(studentId)}_${safeIdPart(itemId)}`}

async function activeEnrollment(env:Env,studentId:string){return one<any>(env.DB.prepare(`SELECT e.*,c.name class_name FROM student_enrollments e LEFT JOIN classes c ON c.id=e.class_id WHERE e.student_id=? AND e.status='ACTIVE' ORDER BY e.created_at DESC LIMIT 1`).bind(studentId));}

async function weakOutcomes(env:Env,studentId:string){return all<CoachWeakOutcome>(env.DB.prepare(`SELECT o.id outcome_id,o.title,o.topic,o.subtopic,o.subject_id,s.name subject_name,SUM(r.evidence_count) evidence_count,SUM(r.correct_count) correct_count,CASE WHEN SUM(r.evidence_count)>0 THEN CAST(SUM(r.correct_count) AS REAL)/SUM(r.evidence_count) ELSE 0 END success_rate FROM outcome_results r JOIN outcomes o ON o.id=r.outcome_id JOIN subjects s ON s.id=o.subject_id WHERE r.student_id=? GROUP BY o.id,o.title,o.topic,o.subtopic,o.subject_id,s.name HAVING SUM(r.evidence_count)>=3 AND (CAST(SUM(r.correct_count) AS REAL)/NULLIF(SUM(r.evidence_count),0))<0.70 ORDER BY success_rate ASC,evidence_count DESC LIMIT 3`).bind(studentId));}

async function worksheetCandidate(env:Env,enrollment:any,weak:CoachWeakOutcome[]){
 if(!enrollment?.class_id)return null;
 const outcomeIds=weak.map(x=>x.outcome_id);
 if(outcomeIds.length){
  const placeholders=outcomeIds.map(()=>'?').join(',');
  const linked=await one<CoachWorksheet>(env.DB.prepare(`SELECT DISTINCT w.id,w.title,w.track,wce.planned_date,wo.outcome_id FROM worksheets w JOIN worksheet_outcomes wo ON wo.worksheet_id=w.id LEFT JOIN worksheet_calendar_entries wce ON wce.worksheet_id=w.id AND wce.class_id=? AND wce.status IN ('PLANNED','ASSIGNED') WHERE w.status='PUBLISHED' AND (w.grade_level=? OR w.grade_level IS NULL) AND wo.outcome_id IN (${placeholders}) ORDER BY CASE WHEN wce.planned_date IS NULL THEN 1 ELSE 0 END,ABS(julianday(coalesce(wce.planned_date,date('now')))-julianday(date('now'))),w.sequence_no LIMIT 1`).bind(enrollment.class_id,enrollment.grade_level,...outcomeIds));
  if(linked)return linked;
 }
 return one<CoachWorksheet>(env.DB.prepare(`SELECT w.id,w.title,w.track,wce.planned_date,NULL outcome_id FROM worksheet_calendar_entries wce JOIN worksheets w ON w.id=wce.worksheet_id WHERE wce.class_id=? AND wce.status IN ('PLANNED','ASSIGNED') AND w.status='PUBLISHED' AND (w.grade_level=? OR w.grade_level IS NULL) ORDER BY ABS(julianday(wce.planned_date)-julianday(date('now'))) LIMIT 1`).bind(enrollment.class_id,enrollment.grade_level));
}

async function latestExamEvidence(env:Env,studentId:string,institutionId:string){return one<any>(env.DB.prepare(`SELECT e.id,e.title,e.exam_date,er.net,er.success_percent FROM exam_participants ep JOIN exams e ON e.id=ep.exam_id JOIN exam_results er ON er.participant_id=ep.id WHERE ep.student_id=? AND ep.institution_id=? ORDER BY coalesce(e.exam_date,er.created_at) DESC LIMIT 1`).bind(studentId,institutionId));}

async function readPlan(env:Env,studentId:string,planId:string):Promise<CoachPlanResult>{
 const plan=await one<any>(env.DB.prepare(`SELECT a.*,ar.status recipient_status,ar.progress,ar.completed_at FROM assignments a JOIN assignment_recipients ar ON ar.assignment_id=a.id WHERE a.id=? AND a.assignment_type='NIBIRU' AND ar.student_id=?`).bind(planId,studentId));
 if(!plan)return{available:false,reason:'PLAN_NOT_FOUND'};
 const items=await all<any>(env.DB.prepare(`SELECT ai.*,CASE WHEN EXISTS(SELECT 1 FROM assignment_attempts aa WHERE aa.item_id=ai.id AND aa.student_id=? AND coalesce(aa.score,0)>=1) THEN 1 ELSE 0 END completed FROM assignment_items ai WHERE ai.assignment_id=? ORDER BY ai.sort_order`).bind(studentId,planId));
 return{available:true,plan,items:items.map(x=>({...x,payload:x.payload_json?JSON.parse(x.payload_json):{},completed:Boolean(x.completed)}))};
}

export async function getTodayCoachPlan(env:Env,user:AuthUser):Promise<CoachPlanResult>{
 if(user.role!=='STUDENT'||!user.student_id)return{available:false,reason:'STUDENT_ONLY'};
 return readPlan(env,user.student_id,planIdFor(user.student_id,istanbulDateKey()));
}

export async function createOrReuseDailyCoachPlan(env:Env,user:AuthUser):Promise<CoachPlanResult>{
 if(user.role!=='STUDENT'||!user.student_id)return{available:false,reason:'STUDENT_ONLY'};
 const dateKey=istanbulDateKey(),planId=planIdFor(user.student_id,dateKey);
 const existing=await readPlan(env,user.student_id,planId);
 if(existing.available)return{...existing,reused:true};
 const enrollment=await activeEnrollment(env,user.student_id);
 if(!enrollment)return{available:false,reason:'ENROLLMENT_REQUIRED'};
 const weak=await weakOutcomes(env,user.student_id);
 const worksheet=await worksheetCandidate(env,enrollment,weak);
 const latestExam=await latestExamEvidence(env,user.student_id,enrollment.institution_id);
 const draft=buildCoachDraft(weak,worksheet);
 if(!draft.length)return{available:false,reason:'INSUFFICIENT_EVIDENCE',evidence:{weakOutcomeCount:0,worksheet:null,latestExam}};
 const dueAt=`${dateKey}T21:00:00+03:00`;
 const statements:D1PreparedStatement[]=[
  env.DB.prepare(`INSERT OR IGNORE INTO assignments(id,institution_id,season_id,created_by,assignment_type,title,description,due_at,status) VALUES(?,?,?,?, 'NIBIRU',?,?,?,'ASSIGNED')`).bind(planId,enrollment.institution_id,enrollment.season_id,user.id,`Nibiru · ${dateKey} Günlük Gelişim Planı`,'Doğrulanmış sınav/kazanım kanıtları ve kurum föy planına göre hazırlanmış kısa günlük çalışma planı.',dueAt),
  env.DB.prepare(`INSERT OR IGNORE INTO assignment_recipients(assignment_id,student_id,status,progress) VALUES(?,?,'ASSIGNED',0)`).bind(planId,user.student_id),
 ];
 draft.forEach((item,index)=>statements.push(env.DB.prepare(`INSERT OR IGNORE INTO assignment_items(id,assignment_id,item_type,reference_id,payload_json,sort_order) VALUES(?,?,?,?,?,?)`).bind(itemIdFor(planId,index),planId,item.itemType,item.referenceId,JSON.stringify({...item.payload,label:item.label}),index+1)));
 await env.DB.batch(statements);
 await audit(env.DB,user.id,enrollment.institution_id,'NIBIRU_DAILY_PLAN_CREATED','assignment',planId,{dateKey,itemCount:draft.length,weakOutcomeIds:weak.slice(0,2).map(x=>x.outcome_id),worksheetId:worksheet?.id||null,latestExamId:latestExam?.id||null});
 const created=await readPlan(env,user.student_id,planId);
 return{...created,reused:false,evidence:{weakOutcomes:weak.slice(0,2),worksheet,latestExam}};
}

export async function completeCoachItem(env:Env,user:AuthUser,itemId:string,completed=true){
 if(user.role!=='STUDENT'||!user.student_id)return{ok:false,reason:'STUDENT_ONLY'};
 const item=await one<any>(env.DB.prepare(`SELECT ai.id,ai.assignment_id FROM assignment_items ai JOIN assignments a ON a.id=ai.assignment_id JOIN assignment_recipients ar ON ar.assignment_id=a.id WHERE ai.id=? AND a.assignment_type='NIBIRU' AND ar.student_id=?`).bind(itemId,user.student_id));
 if(!item)return{ok:false,reason:'ITEM_NOT_FOUND'};
 const completionId=completionIdFor(user.student_id,itemId);
 await env.DB.prepare(`INSERT INTO assignment_attempts(id,assignment_id,student_id,item_id,answer_json,score) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET answer_json=excluded.answer_json,score=excluded.score,created_at=CURRENT_TIMESTAMP`).bind(completionId,item.assignment_id,user.student_id,itemId,JSON.stringify({completed}),completed?1:0).run();
 const counts=await one<any>(env.DB.prepare(`SELECT (SELECT COUNT(*) FROM assignment_items WHERE assignment_id=?) total,(SELECT COUNT(DISTINCT aa.item_id) FROM assignment_attempts aa JOIN assignment_items ai ON ai.id=aa.item_id WHERE ai.assignment_id=? AND aa.student_id=? AND coalesce(aa.score,0)>=1) done`).bind(item.assignment_id,item.assignment_id,user.student_id));
 const total=Number(counts?.total||0),done=Number(counts?.done||0),progress=total?Math.round(done*100/total):0,status=done===0?'ASSIGNED':done>=total?'COMPLETED':'STARTED';
 await env.DB.prepare(`UPDATE assignment_recipients SET status=?,progress=?,completed_at=CASE WHEN ?='COMPLETED' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE assignment_id=? AND student_id=?`).bind(status,progress,status,item.assignment_id,user.student_id).run();
 await audit(env.DB,user.id,user.institution_id,'NIBIRU_DAILY_PLAN_PROGRESS','assignment',item.assignment_id,{itemId,completed,done,total,progress});
 return{ok:true,assignmentId:item.assignment_id,itemId,completed,done,total,progress,status};
}

export function coachPlanSummary(result:CoachPlanResult){
 if(!result.available||!result.items?.length)return null;
 return result.items.map((item:any,index:number)=>`${index+1}. ${item.payload?.label||item.reference_id||'Çalışma görevi'}${item.payload?.questionTarget?` · ${item.payload.questionTarget} soru`:''}${item.payload?.minutes?` · ~${item.payload.minutes} dk`:''}`).join('\n');
}
