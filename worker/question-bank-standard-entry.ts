import {replenishAutonomousQueue,autonomousYear} from './lib/question-autonomous-queue';
import {questionCardIntelligence} from './lib/question-card-intelligence';
import {handleQuestionEditorialRepair} from './lib/question-editorial-repair';
import {handleQuestionTeam} from './lib/question-team';
import {handleQuestionMediaJobs,prepareAutonomousQuestionVideo} from './lib/question-media-jobs';
import {verifyStoredQuestionDraft} from './lib/question-draft-verification';
import {handleQuestionContentEdit} from './lib/question-content-edit';
import app from './student-books-entry';
import {getQuestionPoolCoverage} from './lib/question-pool-coverage';
import {handleQuestionGenerationJobs} from './lib/question-generation-jobs';
import {runQuestionGenerationJob} from './lib/question-generation-runner';
import {planQuestionPilotDispatch,effectivePilotBudget,canExecuteScheduledPilot,validateScheduledActor,canDispatchToReviewQueue,evaluatePilotReadiness,pilotReadinessAccess} from './lib/question-agent-dispatch-plan';
import type { Env } from './types';
import { getAuthUser } from './lib/auth';
import { json,one,all } from './lib/db';
import { legacyDifficulty, normalizeDifficultyLevel } from './lib/question-bank';
import { reviewQuestionWithGate,normalizeQuestionOrigin,isAiQuestionOrigin,validMultipleChoiceQuestion } from './lib/question-review';

function fail(status:number,code:string,message:string){return json({ok:false,error:{code,message}},status)}

async function pilotReadiness(env:Env){
 const cfg=env as Env & {QUESTION_AGENT_DISPATCH_PREVIEW?:string;QUESTION_AGENT_EXECUTION_ENABLED?:string;QUESTION_AUTOMATED_PILOT_MODE?:string;QUESTION_AGENT_SERVICE_ACTOR_ID?:string;QUESTION_PILOT_REVIEW_AVAILABLE?:string;QUESTION_PILOT_REVIEW_SLOTS?:string;QUESTION_PILOT_BUDGET_REMAINING?:string};
 const year=env.QUESTION_AUTOMATED_ACADEMIC_YEAR??'';
 const actor=cfg.QUESTION_AGENT_SERVICE_ACTOR_ID?await one<{id:string}>(env.DB.prepare("SELECT id FROM users WHERE id=? AND role='SUPER_ADMIN' AND active=1").bind(cfg.QUESTION_AGENT_SERVICE_ACTOR_ID)):null;
 const verified=await one<{n:number}>(env.DB.prepare("SELECT count(*) n FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE o.active=1 AND cv.verified=1 AND o.grade_level IN (5,6,7,9,10,11) AND cv.academic_year=?").bind(year));
 const pending=await one<{n:number}>(env.DB.prepare("SELECT j.question_count n FROM question_generation_jobs j JOIN outcomes o ON o.id=j.outcome_id AND o.active=1 AND o.curriculum_version_id=j.curriculum_version_id AND o.grade_level=j.grade_level AND o.subject_id=j.subject_id AND o.title=j.outcome_title AND o.code IS j.outcome_code JOIN curriculum_versions cv ON cv.id=j.curriculum_version_id AND cv.verified=1 AND cv.academic_year=j.academic_year AND cv.grade_level=j.grade_level AND cv.program_version=j.program_version WHERE j.status='REQUESTED' AND j.attempt_count=0 AND j.academic_year=? AND j.grade_level IN (5,6,7,9,10,11) AND EXISTS(SELECT 1 FROM learning_nodes n WHERE n.id='ln_'||o.id AND n.active=1 AND n.node_type='OUTCOME' AND n.academic_year=j.academic_year AND n.grade_level=j.grade_level AND n.subject_id=j.subject_id) ORDER BY j.priority DESC,j.created_at,j.id LIMIT 1").bind(year));
 const quota=await one<{question_cap:number|null;reserved_count:number;budget_mode:string}>(env.DB.prepare("SELECT question_cap,reserved_count,budget_mode FROM question_agent_pilot_budget WHERE id='pilot_50'"));
 const report=evaluatePilotReadiness({aiBindingPresent:!!env.AI,generationEnabled:env.QUESTION_GENERATION_ENABLED==='true',pilotMode:cfg.QUESTION_AUTOMATED_PILOT_MODE==='true',dispatchPreview:cfg.QUESTION_AGENT_DISPATCH_PREVIEW==='true',executionEnabled:cfg.QUESTION_AGENT_EXECUTION_ENABLED==='true',serviceActorVerified:!!actor,verifiedOutcomeCount:Number(verified?.n||0),queuedQuestionCount:Number(pending?.n||0),reviewAvailable:cfg.QUESTION_PILOT_REVIEW_AVAILABLE==='true',reviewSlots:Number(cfg.QUESTION_PILOT_REVIEW_SLOTS??0),remainingBudget:effectivePilotBudget(quota,env.QUESTION_PILOT_BUDGET_REMAINING)});
 if(env.QUESTION_GENERATION_VERIFICATION_ENABLED!=='true'){report.reasons.push('GENERATION_VERIFICATION_UNAVAILABLE');report.ready=false;}
 return json({ok:true,academicYear:year||null,ready:report.ready,reasons:report.reasons,counts:{verifiedOutcomes:Number(verified?.n||0),largestRunnableBatch:Number(pending?.n||0),pilotRemaining:effectivePilotBudget(quota,env.QUESTION_PILOT_BUDGET_REMAINING)},manualPilot:{ready:!!env.AI&&env.QUESTION_GENERATION_ENABLED==='true'&&env.QUESTION_GENERATION_VERIFICATION_ENABLED==='true'&&Number(verified?.n||0)>0&&cfg.QUESTION_PILOT_REVIEW_AVAILABLE==='true'&&Number(cfg.QUESTION_PILOT_REVIEW_SLOTS||0)>0&&effectivePilotBudget(quota,env.QUESTION_PILOT_BUDGET_REMAINING)>0,mode:'SUPER_ADMIN_MANUAL',requestProfile:env.QUESTION_GENERATION_VERIFICATION_ENABLED==='true'?'VALIDATED_QUESTION_DRAFT_V7':'JSON_CHAT_NO_THINKING',generatorModel:env.QUESTION_GENERATION_MODEL??null,verifierModel:env.QUESTION_GENERATION_VERIFIER_MODEL??null,automaticSchedulingEnabled:cfg.QUESTION_AGENT_EXECUTION_ENABLED==='true',maxBatchQuestions:10},note:'Read-only readiness; AI connectivity not probed.'});
}

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

export default {async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{const url=new URL(request.url),p=url.pathname;if(p==='/api/question-bank-standard/team'||p.startsWith('/api/question-bank-standard/team/'))return handleQuestionTeam(request,env,await getAuthUser(env,request));if(p==='/api/question-bank-standard/media-jobs'||p.startsWith('/api/question-bank-standard/media-jobs/')){const renderer=/\/render\/(input|audio|output)$/.test(p);const user=renderer?null:await getAuthUser(env,request);return handleQuestionMediaJobs(request,env,user);}const verifyDraft=p.match(/^\/api\/question-bank-standard\/([^/]+)\/content\/verify$/);if(verifyDraft){const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');return verifyStoredQuestionDraft(request,env,user,verifyDraft[1]);}const intelligence=p.match(/^\/api\/question-bank-standard\/([^/]+)\/intelligence$/);if(intelligence&&request.method==='GET'){const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açın.');return questionCardIntelligence(env,user,intelligence[1]);}const contentEdit=p.match(/^\/api\/question-bank-standard\/([^/]+)\/content$/);if(contentEdit){const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');return handleQuestionContentEdit(request,env,user,contentEdit[1]);}if(p==='/api/question-bank-standard/coverage'||p.startsWith('/api/question-bank-standard/generation-jobs')){const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');if(p==='/api/question-bank-standard/coverage'&&request.method==='GET')return getQuestionPoolCoverage(request,env,user);const repair=p.match(/^\/api\/question-bank-standard\/generation-jobs\/([^/]+)\/repair$/);if(repair)return handleQuestionEditorialRepair(request,env,user,repair[1]);const run=p.match(/^\/api\/question-bank-standard\/generation-jobs\/([^/]+)\/run$/);if(run&&request.method==='POST')return runQuestionGenerationJob(request,env,user,run[1]);const response=await handleQuestionGenerationJobs(request,env,user);if(response)return response;return fail(404,'NOT_FOUND','İşlem bulunamadı.');}if(p==='/api/question-bank-standard/agent-pilot/readiness'&&request.method==='GET'){const user=await getAuthUser(env,request);const access=pilotReadinessAccess(user?.role??null);if(access===401)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');if(access===403)return fail(403,'SUPER_ADMIN_ONLY','Yalnız Süper Admin.');return pilotReadiness(env);}if(p==='/api/question-bank-standard/stats'&&request.method==='GET'){const user=await getAuthUser(env,request);if(!user)return fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');if(!['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role))return fail(403,'FORBIDDEN','Yetkisiz erişim.');return stats(env)}const review=p.match(/^\/api\/(?:question-bank-standard|platform\/questions)\/([^/]+)\/review$/);if(review&&request.method==='PATCH')return reviewQuestion(request,env,review[1]);const patch=p.match(/^\/api\/question-bank-standard\/([^/]+)$/);if(patch&&request.method==='PATCH')return patchQuestion(request,env,patch[1]);return app.fetch(request,env,ctx);},async scheduled(event:ScheduledController,env:Env,ctx:ExecutionContext){
  ctx.waitUntil(prepareAutonomousQuestionVideo(env).then(result=>{console.log('question-agent-media',JSON.stringify(result));}));
  // Read-only scheduling preview. No provider requests, job claims or database writes.
  const cfg=env as Env & {QUESTION_AGENT_DISPATCH_PREVIEW?:string;QUESTION_PILOT_BUDGET_REMAINING?:string;QUESTION_PILOT_REVIEW_SLOTS?:string};
  if(cfg.QUESTION_AGENT_DISPATCH_PREVIEW==='true'){
    const reviewSlots=Number(cfg.QUESTION_PILOT_REVIEW_SLOTS??'0');
    ctx.waitUntil((async()=>{
      const targetYear=env.QUESTION_AUTOMATED_ACADEMIC_YEAR;
      const rows=await all<any>(env.DB.prepare(`SELECT j.id,j.grade_level gradeLevel,j.academic_year academicYear,
       j.question_count questionCount,j.status,j.attempt_count attemptCount,
       cv.verified curriculumVerified,o.active outcomeActive
       FROM question_generation_jobs j
       JOIN outcomes o ON o.id=j.outcome_id AND o.curriculum_version_id=j.curriculum_version_id
         AND o.grade_level=j.grade_level AND o.subject_id=j.subject_id
         AND o.title=j.outcome_title AND o.code IS j.outcome_code
       JOIN curriculum_versions cv ON cv.id=j.curriculum_version_id
         AND cv.academic_year=j.academic_year AND cv.grade_level=j.grade_level
         AND cv.program_version=j.program_version
       WHERE j.status='REQUESTED' AND j.academic_year=?
         AND EXISTS(SELECT 1 FROM learning_nodes n WHERE n.id='ln_'||o.id AND n.active=1
           AND n.node_type='OUTCOME' AND n.academic_year=j.academic_year
           AND n.grade_level=j.grade_level AND n.subject_id=j.subject_id)
       ORDER BY j.priority DESC,j.created_at,j.id LIMIT 20`).bind(targetYear??''));
      // Read from the same atomic reservation ledger used by dispatch.
      // Historic/manual generation jobs do not consume this pilot's quota.
      const quota=await one<{question_cap:number|null;reserved_count:number;budget_mode:string}>(env.DB.prepare(
       "SELECT question_cap,reserved_count,budget_mode FROM question_agent_pilot_budget WHERE id='pilot_50'"
      ));
      const remainingBudget=effectivePilotBudget(quota,cfg.QUESTION_PILOT_BUDGET_REMAINING);
      const plan=planQuestionPilotDispatch(rows.map(r=>({...r,gradeLevel:Number(r.gradeLevel),
       questionCount:Number(r.questionCount),attemptCount:Number(r.attemptCount),
       curriculumVerified:Number(r.curriculumVerified)===1,outcomeActive:Number(r.outcomeActive)===1})),
       {enabled:env.QUESTION_GENERATION_ENABLED==='true'&&!!env.AI,budget:remainingBudget,reviewSlots,maxJobs:5,maxQuestions:Math.min(50,remainingBudget)});
      console.log('question-agent-dispatch-preview',JSON.stringify({selected:plan.ids.length,questionCount:plan.questionCount,rejected:plan.rejected.length}));
      const actorId=(cfg as typeof cfg & {QUESTION_AGENT_SERVICE_ACTOR_ID?:string}).QUESTION_AGENT_SERVICE_ACTOR_ID;
      const actorRow=actorId?await one<{id:string;role:string;active:number}>(env.DB.prepare(
       "SELECT id,role,active FROM users WHERE id=? AND role='SUPER_ADMIN' AND active=1"
      ).bind(actorId)):null;
      const actor=validateScheduledActor(actorRow?{id:actorRow.id,role:actorRow.role,active:actorRow.active===1}:null,actorId);
      if(env.QUESTION_GENERATION_VERIFICATION_ENABLED!=='true'){console.log('question-agent-execution-blocked',JSON.stringify({reasons:['GENERATION_VERIFICATION_UNAVAILABLE']}));return;}
      const execution=canExecuteScheduledPilot({
       dispatchPreview:true,
       executionEnabled:(cfg as typeof cfg & {QUESTION_AGENT_EXECUTION_ENABLED?:string;QUESTION_AUTOMATED_PILOT_MODE?:string}).QUESTION_AGENT_EXECUTION_ENABLED==='true' && (cfg as typeof cfg & {QUESTION_AUTOMATED_PILOT_MODE?:string}).QUESTION_AUTOMATED_PILOT_MODE==='true',
       generationEnabled:env.QUESTION_GENERATION_ENABLED==='true',
       providerAvailable:!!env.AI,
       verifiedServiceActor:actor.ok, // verified directly from D1; no user object is forged
       reviewCapacity:reviewSlots,budget:remainingBudget
      });
      if(!execution.allowed){
       console.log('question-agent-execution-blocked',JSON.stringify({reasons:execution.reasons}));
       return;
      }
      // D1-bound active SUPER_ADMIN, explicitly configured for this internal
      // scheduled task; this is not an HTTP session or a public API credential.
      if(!actorRow||!actor.ok)return;
      const academicYear=(env as Env & {QUESTION_AUTOMATED_ACADEMIC_YEAR?:string}).QUESTION_AUTOMATED_ACADEMIC_YEAR;
      if(!autonomousYear(academicYear)){console.log('question-agent-execution-blocked',JSON.stringify({reasons:['AUTOMATED_ACADEMIC_YEAR_REQUIRED']}));return;}
      const replenishment=await replenishAutonomousQueue(env,{id:actorRow.id,role:'SUPER_ADMIN',institution_id:null,student_id:null,display_name:'Scheduled Question Agent',email:null,username:null},academicYear);
      console.log('question-agent-queue',JSON.stringify(replenishment));
      // One job per cron tick until there is an atomic cross-job budget ledger.
      const jobId=plan.ids.find(id=>rows.find(r=>r.id===id)?.academicYear===academicYear);if(!jobId)return;
      const queuedReview=await one<{n:number}>(env.DB.prepare("SELECT count(*) n FROM question_bank WHERE owner_type='PLATFORM' AND origin_kind IN ('AI','AI_GENERATED','AI_DRAFT','NIBIRU','NIBIRU_AI') AND review_status='REVIEW'"));
      if(Number(queuedReview?.n??0)+Number(rows.find(r=>r.id===jobId)?.questionCount??0)>reviewSlots){console.log('question-agent-execution-blocked',JSON.stringify({reasons:['REVIEW_QUEUE_FULL']}));return;}
      // The job runner requires a separate review-capacity flag. Keep scheduler
      // planning and execution aligned, never dispatch when reviewers are unavailable.
      if(!canDispatchToReviewQueue({reviewAvailable:(cfg as typeof cfg & {QUESTION_PILOT_REVIEW_AVAILABLE?:string}).QUESTION_PILOT_REVIEW_AVAILABLE==='true',reviewSlots,questionCount:Number(rows.find(r=>r.id===jobId)?.questionCount??0)})){
       console.log('question-agent-execution-blocked',JSON.stringify({reasons:['REVIEW_QUEUE_NOT_AVAILABLE']}));return;
      }
      // A database trigger atomically reserves capacity across concurrent cron
      // invocations. Never call the model if the reservation is rejected.
      try {
       const reservation=await env.DB.prepare(`INSERT OR IGNORE INTO question_agent_pilot_reservations(job_id,question_count)
        SELECT id,question_count FROM question_generation_jobs
        WHERE id=? AND status='REQUESTED' AND attempt_count=0 AND question_count BETWEEN 1 AND 10
        AND question_count+(SELECT count(*) FROM question_bank WHERE owner_type='PLATFORM' AND origin_kind IN ('AI','AI_GENERATED','AI_DRAFT','NIBIRU','NIBIRU_AI') AND review_status='REVIEW')
        +COALESCE((SELECT sum(r.question_count) FROM question_agent_pilot_reservations r JOIN question_generation_jobs j ON j.id=r.job_id WHERE j.status IN ('REQUESTED','RUNNING')),0)<=?`).bind(jobId,reviewSlots).run();
       if(Number(reservation.meta?.changes||0)!==1){
        console.log('question-agent-reservation-skipped',JSON.stringify({jobId}));return;
       }
      } catch {
       console.log('question-agent-reservation-denied',JSON.stringify({jobId}));return;
      }
      const result=await runQuestionGenerationJob(new Request('https://internal.invalid/scheduled-question-generation',{method:'POST'}),
       env,{id:actorRow.id,role:'SUPER_ADMIN',institution_id:null,student_id:null,
       display_name:'Scheduled Question Agent',email:null,username:null},jobId);
      console.log('question-agent-execution-result',JSON.stringify({status:result.status,jobId}));

    })());
  }
  if('scheduled' in app&&typeof app.scheduled==='function')return app.scheduled(event,env,ctx);
}} satisfies ExportedHandler<Env>;
