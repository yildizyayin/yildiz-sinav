import {PILOT_GRADES_SQL} from './question-agent-pilot-policy';
import {PENDING_JOB_SQL} from './question-scheduler-tick';
import {effectivePilotBudget} from './question-agent-dispatch-plan';
import type {AuthUser,Env} from '../types';
import {one} from './db';
import {handleQuestionGenerationJobs} from './question-generation-jobs';
import {questionTeamPaused} from './question-team-policy';

/** A081: a failed outcome is retried in a fresh job, never more than this many failures; untried outcomes still come first. */
export const MAX_FAILED_JOBS_PER_OUTCOME = 3;
/** Uses aliases o (outcome) and cv (curriculum version). */
export const OUTCOME_RETRY_FILTER_SQL=`NOT EXISTS(SELECT 1 FROM question_generation_jobs j WHERE j.outcome_id=o.id AND j.curriculum_version_id=cv.id AND j.status IN ('REQUESTED','RUNNING'))
 AND (SELECT count(*) FROM question_generation_jobs j WHERE j.outcome_id=o.id AND j.curriculum_version_id=cv.id AND j.status='FAILED')<${MAX_FAILED_JOBS_PER_OUTCOME}`;
/** Next outcome to fill. 0118 indexes make every correlated lookup an index range read (see tests/scheduler-read-budget). */
export const OUTCOME_PICK_SQL=`SELECT o.id outcomeId,o.curriculum_version_id curriculumVersionId,cv.academic_year academicYear,o.grade_level gradeLevel,o.subject_id subjectId,cv.program_version programVersion
 FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
 WHERE cv.academic_year=? AND cv.verified=1 AND o.active=1 AND o.grade_level=cv.grade_level AND o.grade_level IN (${PILOT_GRADES_SQL})
 AND EXISTS(SELECT 1 FROM learning_nodes n WHERE n.id='ln_'||o.id AND n.active=1 AND n.node_type='OUTCOME' AND n.academic_year=cv.academic_year AND n.grade_level=o.grade_level AND n.subject_id=o.subject_id)
 AND ${OUTCOME_RETRY_FILTER_SQL}
 AND (SELECT count(*) FROM question_learning_links l JOIN question_bank q ON q.id=l.question_id WHERE l.node_id='ln_'||o.id AND q.owner_type='PLATFORM' AND q.academic_year=cv.academic_year AND q.grade_level=o.grade_level AND q.subject_id=o.subject_id AND q.review_status IN ('APPROVED','REVIEW','DRAFT'))<10
 ORDER BY (SELECT count(*) FROM question_generation_jobs j WHERE j.outcome_id=o.id),o.grade_level,o.subject_id,o.id LIMIT 1`;
export function autonomousYear(value:unknown):value is string{
 if(typeof value!=='string')return false;const m=/^(\d{4})-(\d{4})$/.exec(value);return !!m&&Number(m[2])===Number(m[1])+1;
}
/** One idempotent, single-question editorial request per empty queue. No quota reset or approval. */
export async function replenishAutonomousQueue(env:Env,actor:AuthUser,academicYear:string){
 if(actor.role!=='SUPER_ADMIN'||!autonomousYear(academicYear)||env.QUESTION_AUTOMATED_PILOT_MODE!=='true'||env.QUESTION_AGENT_EXECUTION_ENABLED!=='true'||env.QUESTION_GENERATION_ENABLED!=='true'||env.QUESTION_GENERATION_VERIFICATION_ENABLED!=='true'||!env.AI||env.QUESTION_PILOT_REVIEW_AVAILABLE!=='true')return {created:false,reason:'AUTONOMY_NOT_READY'};
 if(await questionTeamPaused(env,['GENERATOR','VERIFIER','ORIGINALITY']))return {created:false,reason:'TEAM_PAUSED'};
 const budget=await one<any>(env.DB.prepare("SELECT question_cap,reserved_count,budget_mode FROM question_agent_pilot_budget WHERE id='pilot_50'"));
 if(effectivePilotBudget(budget,env.QUESTION_PILOT_BUDGET_REMAINING)<1)return {created:false,reason:'BUDGET_EXHAUSTED'};
 const review=await one<any>(env.DB.prepare("SELECT count(*) n FROM question_bank WHERE owner_type='PLATFORM' AND origin_kind IN ('AI','AI_GENERATED','AI_DRAFT','NIBIRU','NIBIRU_AI') AND review_status='REVIEW'"));
 const slots=Number(env.QUESTION_PILOT_REVIEW_SLOTS??0);
 if(!Number.isSafeInteger(slots)||slots<=Number(review?.n??0))return {created:false,reason:'REVIEW_QUEUE_FULL'};
 const pending=await one<any>(env.DB.prepare(`SELECT id FROM question_generation_jobs WHERE academic_year=? AND ${PENDING_JOB_SQL} LIMIT 1`).bind(academicYear,new Date().toISOString()));
 if(pending)return {created:false,reason:'QUEUE_HAS_WORK'};
 const o=await one<any>(env.DB.prepare(OUTCOME_PICK_SQL).bind(academicYear));
 if(!o)return {created:false,reason:'NO_VERIFIED_GAP'};
 const {outcomeId,...expectedContext}=o;
 const response=await handleQuestionGenerationJobs(new Request('https://internal.invalid/api/question-bank-standard/generation-jobs',{method:'POST',body:JSON.stringify({outcomeId,expectedContext,requestKey:crypto.randomUUID(),questionCount:1,qualityProfile:'EDITORIAL_V1',presentation:'AUTO',taskFocus:'GENERIC',priority:1,instructionNote:'Otonom kapsam tamamlama; insan ve hak incelemesi zorunlu.'})}),env,actor)!;
 return {created:response.status===201,reason:response.ok?'REQUESTED':'REQUEST_REJECTED'};
}
