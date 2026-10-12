import app from './student-books-entry';
import {getQuestionPoolCoverage} from './lib/question-pool-coverage';
import {handleQuestionGenerationJobs} from './lib/question-generation-jobs';
import {runQuestionGenerationJob} from './lib/question-generation-runner';
import {planQuestionPilotDispatch,canExecuteScheduledPilot,validateScheduledActor} from './lib/question-agent-dispatch-plan';
import type { Env } from './types';
import { getAuthUser } from './lib/auth';
import { json,one,all } from './lib/db';
import { legacyDifficulty, normalizeDifficultyLevel } from './lib/question-bank';
import { reviewQuestionWithGate,normalizeQuestionOrigin,isAiQuestionOrigin,validMultipleChoiceQuestion } from './lib/question-review';

function fail(status:number,code:string,message:string){return json({ok:false,error:{code,message}},status)}

async function stats(env:Env){
 const rows=await all<any>(env.DB.prepare(`SELECT review_status,copyright_status,COUNT(*) count FROM question_bank WHERE review_status<>'ARCHIVED' GROUP BY review_status,copyright_status ORDER BY review_status,copyright_status`));
 const total=rows.reduce((sum:number,r:any)=>sum+Number(r.count||0),0);
 const approved=rows.filter((r:any)=>r.review_status==='APPROVED').reduce((sum:number,r:any)=>sum+Number(r.count||0),0);
 const printable=rows.filter((r:any)=>r.review_status==='APPROVED'&&['OWNED','LICENSED','PUBLIC_DOMAIN'].includes(r.copyright_status)).reduce((sum:number,r:any)=>sum+Number(r.count||0),0);
 return json({ok:true,total,approved,printable,breakdown:rows});
}

async function reviewQuestion(request:Request,env:Env,id:string){
 const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');if(user.role!=='SUPER_ADMIN')return fail(403,'SUPER_ADMIN_ONLY','Soru onayını yalnız Süper Admin yapabilir.');
 return reviewQuestionWithGate(request,env,user,id);
}

async function patchQuestion(request:Request,env:Env,id:string){
 const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');
 const q=await one<any>(env.DB.prepare(`SELECT * FROM question_bank WHERE id=?`).bind(id));if(!q)return fail(404,'QUESTION_NOT_FOUND','Soru bulunamadı.');
 const can=user.role==='SUPER_ADMIN'||(q.owner_type==='INSTITUTION'&&q.owner_id===user.institution_id&&['INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role));if(!can)return fail(403,'FORBIDDEN','Bu soruyu düzenleyemezsiniz.');
 const body:any=await request.json().catch(()=>({}));if(body.expectedRevision!==undefined&&(!Number.isInteger(body.expectedRevision)||body.expectedRevision!==Number(q.review_revision)))return fail(409,'QUESTION_REVIEW_CHANGED','Soru değişti. Güncel içeriği yeniden açın.');const origin=normalizeQuestionOrigin(body.originKind??q.origin_kind);if(!origin)return fail(400,'INVALID_QUESTION_ORIGIN','Geçersiz soru kaynağı.');if(isAiQuestionOrigin(q.origin_kind)&&!isAiQuestionOrigin(origin))return fail(400,'AI_ORIGIN_IMMUTABLE','AI taslağının kaynak türü değiştirilemez.');const copyright=body.copyrightStatus||q.copyright_status;const allowed=['OWNED','LICENSED','PUBLIC_DOMAIN','USER_PROVIDED','RESTRICTED'];if(!allowed.includes(copyright))return fail(400,'INVALID_COPYRIGHT','Geçersiz telif durumu.');
 const requestedDifficulty=body.difficultyLevel??body.difficulty;const currentDifficulty=normalizeDifficultyLevel(q.difficulty_level??q.difficulty,3);const difficultyLevel=normalizeDifficultyLevel(requestedDifficulty,currentDifficulty);if(!difficultyLevel)return fail(400,'INVALID_DIFFICULTY','Zorluk seviyesi 1 ile 6 arasında olmalıdır.');
 const result=await env.DB.prepare(`UPDATE question_bank SET topic=?,subtopic=?,difficulty=?,difficulty_level=?,source_label=?,copyright_status=?,origin_kind=?,review_status=?,reviewed_by=NULL,reviewed_at=NULL,rejection_note=NULL,review_checks_json=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND review_revision=?`).bind(body.topic??q.topic,body.subtopic??q.subtopic,legacyDifficulty(difficultyLevel),difficultyLevel,body.sourceLabel??q.source_label,copyright,origin,user.role==='SUPER_ADMIN'&&body.keepApproved&&!isAiQuestionOrigin(origin)&&['OWNED','LICENSED','PUBLIC_DOMAIN','USER_PROVIDED'].includes(copyright)&&(q.question_type!=='MULTIPLE_CHOICE'||validMultipleChoiceQuestion(q))? q.review_status:'REVIEW',id,q.review_revision).run();
 // D1 counts the revision trigger too; this primary-key conditional write
 // changes no rows when the fence fails, and at least one when it commits.
 if(Number(result.meta?.changes||0)<1)return fail(409,'QUESTION_REVIEW_CHANGED','Soru düzenleme sırasında değişti. Güncel içeriği yeniden açın.');
 return json({ok:true,id});
}

export default {async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{const url=new URL(request.url),p=url.pathname;if(p==='/api/question-bank-standard/coverage'||p.startsWith('/api/question-bank-standard/generation-jobs')){const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');if(p==='/api/question-bank-standard/coverage'&&request.method==='GET')return getQuestionPoolCoverage(request,env,user);const run=p.match(/^\/api\/question-bank-standard\/generation-jobs\/([^/]+)\/run$/);if(run&&request.method==='POST')return runQuestionGenerationJob(request,env,user,run[1]);const response=await handleQuestionGenerationJobs(request,env,user);if(response)return response;return fail(404,'NOT_FOUND','İşlem bulunamadı.');}if(p==='/api/question-bank-standard/stats'&&request.method==='GET'){const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');if(!['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role))return fail(403,'FORBIDDEN','Yetkisiz erişim.');return stats(env)}const review=p.match(/^\/api\/(?:question-bank-standard|platform\/questions)\/([^/]+)\/review$/);if(review&&request.method==='PATCH')return reviewQuestion(request,env,review[1]);const patch=p.match(/^\/api\/question-bank-standard\/([^/]+)$/);if(patch&&request.method==='PATCH')return patchQuestion(request,env,patch[1]);return app.fetch(request,env,ctx);},async scheduled(event:ScheduledController,env:Env,ctx:ExecutionContext){
  // Read-only scheduling preview. No provider requests, job claims or database writes.
  const cfg=env as Env & {QUESTION_AGENT_DISPATCH_PREVIEW?:string;QUESTION_PILOT_BUDGET_REMAINING?:string;QUESTION_PILOT_REVIEW_SLOTS?:string};
  if(cfg.QUESTION_AGENT_DISPATCH_PREVIEW==='true'){
    const budget=Number(cfg.QUESTION_PILOT_BUDGET_REMAINING??'0');
    const reviewSlots=Number(cfg.QUESTION_PILOT_REVIEW_SLOTS??'0');
    ctx.waitUntil((async()=>{
      const rows=await all<any>(env.DB.prepare(`SELECT j.id,j.grade_level gradeLevel,j.academic_year academicYear,
       j.question_count questionCount,j.status,j.attempt_count attemptCount,
       cv.verified curriculumVerified,o.active outcomeActive
       FROM question_generation_jobs j
       JOIN outcomes o ON o.id=j.outcome_id
       JOIN curriculum_versions cv ON cv.id=j.curriculum_version_id
       WHERE j.status='REQUESTED' ORDER BY j.created_at,j.id LIMIT 20`));
      const plan=planQuestionPilotDispatch(rows.map(r=>({...r,gradeLevel:Number(r.gradeLevel),
       questionCount:Number(r.questionCount),attemptCount:Number(r.attemptCount),
       curriculumVerified:Number(r.curriculumVerified)===1,outcomeActive:Number(r.outcomeActive)===1})),
       {enabled:env.QUESTION_GENERATION_ENABLED==='true'&&!!env.AI,budget,reviewSlots,maxJobs:5,maxQuestions:50});
      console.log('question-agent-dispatch-preview',JSON.stringify({selected:plan.ids.length,questionCount:plan.questionCount,rejected:plan.rejected.length}));
      const actorId=(cfg as typeof cfg & {QUESTION_AGENT_SERVICE_ACTOR_ID?:string}).QUESTION_AGENT_SERVICE_ACTOR_ID;
      const actorRow=actorId?await one<{id:string;role:string;active:number}>(env.DB.prepare(
       "SELECT id,role,active FROM users WHERE id=? AND role='SUPER_ADMIN' AND active=1"
      ).bind(actorId)):null;
      const actor=validateScheduledActor(actorRow?{id:actorRow.id,role:actorRow.role,active:actorRow.active===1}:null,actorId);
      const execution=canExecuteScheduledPilot({
       dispatchPreview:true,
       executionEnabled:(cfg as typeof cfg & {QUESTION_AGENT_EXECUTION_ENABLED?:string}).QUESTION_AGENT_EXECUTION_ENABLED==='true',
       generationEnabled:env.QUESTION_GENERATION_ENABLED==='true',
       providerAvailable:!!env.AI,
       verifiedServiceActor:actor.ok, // verified directly from D1; no user object is forged
       reviewCapacity:reviewSlots,budget
      });
      if(!execution.allowed)console.log('question-agent-execution-blocked',JSON.stringify({reasons:execution.reasons}));
      // The existing runner requires an authenticated SUPER_ADMIN. No background
      // runner invocation is permitted until a separately audited service actor exists.

    })());
  }
  if('scheduled' in app&&typeof app.scheduled==='function')return app.scheduled(event,env,ctx);
}} satisfies ExportedHandler<Env>;
