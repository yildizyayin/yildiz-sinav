import type {AuthUser,Env} from '../types';
import {one,all,json,uuid} from './db';
import {productionQualityGate,productionWorkerCapacity,PRODUCTION_CAMPAIGN} from './question-production-policy';
import {handleQuestionGenerationJobs} from './question-generation-jobs';
import {runQuestionGenerationJob} from './question-generation-runner';
import {withQuestionAiBudget} from './question-ai-budget';
import {questionTeamPaused} from './question-team-policy';

export async function productionSnapshot(env:Env){
 const [campaign,quality,day,slots,scope]=await Promise.all([
  one<any>(env.DB.prepare('SELECT * FROM question_production_campaigns WHERE id=?').bind(PRODUCTION_CAMPAIGN)),
  productionQualityGate(env),
  one<any>(env.DB.prepare('SELECT * FROM question_ai_budget_days WHERE day=?').bind(new Date().toISOString().slice(0,10))),
  all<any>(env.DB.prepare('SELECT id,sequence,outcome_id,question_count,job_id,status,error_code,created_at,completed_at FROM question_production_slots WHERE campaign_id=? ORDER BY sequence DESC LIMIT 20').bind(PRODUCTION_CAMPAIGN)),
  one<any>(env.DB.prepare("SELECT count(*) n FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE cv.verified=1 AND o.active=1 AND o.grade_level=cv.grade_level AND cv.academic_year='2026-2027' AND o.grade_level IN (5,6,7,9,10,11)")),
 ]);
 return {campaign,quality,day,slots,verifiedOutcomes:Number(scope?.n??0),automaticEnabled:campaign?.status==='ACTIVE'&&(env as any).QUESTION_PRODUCTION_CAMPAIGNS_ENABLED==='true',billingVerified:false,sharedFreeAllocationGuaranteed:false,paidBudgetApproved:(env as any).QUESTION_AI_PAID_BUDGET_APPROVED==='true',massProductionThroughputVerified:false,limits:{questionsPerJob:3,maxWorkers:4,cronMinutes:1,dailyAiNeuronLimit:Number((env as any).QUESTION_AI_DAILY_NEURON_LIMIT??0)},note:'Kabul hedefi insan onaylı sorudur. Taslak limiti ve otomatik puan bunu sağlamaz. Küçük pilot kapsamı, sağlayıcı kotası ve insan inceleme kuyruğu üretimi sınırlar.'};
}
export async function handleProductionCampaign(request:Request,env:Env,user:AuthUser|null){
 if(!user)return json({ok:false,error:{code:'UNAUTHENTICATED'}},401);
 if(user.role!=='SUPER_ADMIN')return json({ok:false,error:{code:'SUPER_ADMIN_ONLY'}},403);
 if(request.method==='GET')return json({ok:true,...await productionSnapshot(env)});
 if(request.method!=='PATCH')return json({ok:false,error:{code:'METHOD_NOT_ALLOWED'}},405);
 if(request.headers.get('Origin')!==new URL(request.url).origin)return json({ok:false,error:{code:'INVALID_ORIGIN'}},403);
 const body:any=await request.json().catch(()=>null);
 if(!body||!['ACTIVE','PAUSED'].includes(body.status)||!Number.isSafeInteger(body.expectedRevision))return json({ok:false,error:{code:'INVALID_CAMPAIGN_CONTROL'}},400);
 if(body.status==='ACTIVE'){
  if((env as any).QUESTION_PRODUCTION_CAMPAIGNS_ENABLED!=='true'||(env as any).QUESTION_BLIND_SOLVE_ENABLED!=='true'||env.QUESTION_GENERATION_ENABLED!=='true'||env.QUESTION_GENERATION_VERIFICATION_ENABLED!=='true'||!env.AI||!Number.isSafeInteger(Number((env as any).QUESTION_AI_DAILY_NEURON_LIMIT))||Number((env as any).QUESTION_AI_DAILY_NEURON_LIMIT)<=0)return json({ok:false,error:{code:'BOUNDED_PRODUCTION_NOT_CONFIGURED'}},409);
  const actor=await one<any>(env.DB.prepare("SELECT id FROM users WHERE id=? AND active=1 AND role='SUPER_ADMIN'").bind(user.id));
  const quality=await productionQualityGate(env);
  if(!actor||!quality.allowed)return json({ok:false,error:{code:'AUTONOMOUS_QUALITY_REQUIRED'},quality},409);
 }
 const r=await env.DB.prepare('UPDATE question_production_campaigns SET status=?,actor_id=?,revision=revision+1 WHERE id=? AND revision=?').bind(body.status,user.id,PRODUCTION_CAMPAIGN,body.expectedRevision).run();
 if(Number(r.meta?.changes)!==1)return json({ok:false,error:{code:'CAMPAIGN_REVISION_CHANGED'}},409);
 await env.DB.prepare("INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,NULL,'QUESTION_PRODUCTION_CONTROL','question_production_campaign',?,?)").bind(uuid('aud'),user.id,PRODUCTION_CAMPAIGN,JSON.stringify({status:body.status,humanQuestionApproval:false,paidBudgetApproval:false})).run();
 return json({ok:true,...await productionSnapshot(env)});
}
export async function tickQuestionProduction(env:Env){
 const cfg=env as any,now=new Date().toISOString(),day=now.slice(0,10);
 if(cfg.QUESTION_PRODUCTION_CAMPAIGNS_ENABLED!=='true')return {code:'DISABLED'};
 const campaign=await one<any>(env.DB.prepare('SELECT * FROM question_production_campaigns WHERE id=?').bind(PRODUCTION_CAMPAIGN));
 const finish=async(result:any)=>{await env.DB.prepare('UPDATE question_production_campaigns SET last_tick_at=?,last_result_json=? WHERE id=?').bind(now,JSON.stringify(result),PRODUCTION_CAMPAIGN).run();return result;};
 if(!campaign||campaign.status!=='ACTIVE')return finish({code:'PAUSED'});
 if(await questionTeamPaused(env,['GENERATOR','VERIFIER','ORIGINALITY','MEDIA']))return finish({code:'TEAM_PAUSED'});
 if(!(await productionQualityGate(env)).allowed)return finish({code:'QUALITY_REQUIRED'});
 const actor=await one<AuthUser>(env.DB.prepare("SELECT * FROM users WHERE id=? AND active=1 AND role='SUPER_ADMIN'").bind(campaign.actor_id));
 if(!actor)return finish({code:'DELEGATED_ACTOR_INACTIVE'});
 await env.DB.prepare("UPDATE question_production_slots SET status='FAILED',error_code='LEASE_EXPIRED',completed_at=CURRENT_TIMESTAMP WHERE campaign_id=? AND status='RUNNING' AND lease_until<=?").bind(PRODUCTION_CAMPAIGN,now).run();
 await env.DB.prepare("UPDATE question_generation_jobs SET status='FAILED',error_code='GENERATION_TIMEOUT',lease_token=NULL,lease_until=NULL WHERE status IN ('REQUESTED','RUNNING') AND (lease_until IS NULL OR lease_until<=?) AND (id IN (SELECT job_id FROM question_production_slots WHERE error_code='LEASE_EXPIRED') OR request_key IN (SELECT id FROM question_production_slots WHERE error_code='LEASE_EXPIRED'))").bind(now).run();
 const recent=await all<any>(env.DB.prepare('SELECT status FROM question_production_slots WHERE campaign_id=? ORDER BY sequence DESC LIMIT 3').bind(PRODUCTION_CAMPAIGN));
 if(recent.length===3&&recent.every(s=>s.status==='FAILED')){await env.DB.prepare("UPDATE question_production_campaigns SET status='PAUSED',revision=revision+1 WHERE id=? AND status='ACTIVE'").bind(PRODUCTION_CAMPAIGN).run();return finish({code:'THREE_FAILURE_CIRCUIT_BREAKER'});}
 const usage=await one<any>(env.DB.prepare('SELECT limit_neurons,held_neurons,charged_neurons FROM question_ai_budget_days WHERE day=?').bind(day));
 const remaining=usage?Math.max(0,Math.min(Number(cfg.QUESTION_AI_DAILY_NEURON_LIMIT??0),usage.limit_neurons)-usage.held_neurons-usage.charged_neurons):Number(cfg.QUESTION_AI_DAILY_NEURON_LIMIT??0);
 const active=await one<any>(env.DB.prepare("SELECT count(*) n FROM question_production_slots WHERE campaign_id=? AND status='RUNNING' AND lease_until>?").bind(PRODUCTION_CAMPAIGN,now));
 const workers=productionWorkerCapacity(remaining,Number(active?.n??0),campaign.max_workers);
 if(!workers)return finish({code:'WAIT_DAILY_AI_BUDGET_OR_WORKER',remainingNeurons:remaining});
 await env.DB.prepare('INSERT OR IGNORE INTO question_production_days(campaign_id,day,question_cap) VALUES(?,?,?)').bind(PRODUCTION_CAMPAIGN,day,campaign.daily_question_cap).run();
 const outcomes=await all<any>(env.DB.prepare(`SELECT o.id,o.code,o.subject_id,o.grade_level,cv.id curriculum_version_id,cv.program_version,cv.academic_year FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE cv.verified=1 AND o.active=1 AND o.grade_level=cv.grade_level AND cv.academic_year=? AND o.grade_level IN (5,6,7,9,10,11) AND EXISTS(SELECT 1 FROM learning_nodes n WHERE n.id='ln_'||o.id AND n.active=1 AND n.node_type='OUTCOME' AND n.academic_year=cv.academic_year AND n.grade_level=o.grade_level AND n.subject_id=o.subject_id) AND NOT EXISTS(SELECT 1 FROM question_generation_jobs j WHERE j.outcome_id=o.id AND j.status IN ('REQUESTED','RUNNING')) ORDER BY (SELECT count(*) FROM question_production_slots s WHERE s.outcome_id=o.id),o.id LIMIT ?`).bind(campaign.academic_year,workers));
 const tasks=outcomes.map(async(o)=>{
  const id=crypto.randomUUID();let jobId:string|undefined;
  try{
   const r=await env.DB.prepare("INSERT INTO question_production_slots(id,campaign_id,sequence,day,outcome_id,question_count,lease_until) SELECT ?,id,next_slot+1,?,?,min(3,draft_cap-reserved_questions),? FROM question_production_campaigns WHERE id=? AND status='ACTIVE' AND reserved_questions<draft_cap").bind(id,day,o.id,new Date(Date.now()+900000).toISOString(),PRODUCTION_CAMPAIGN).run();
   if(Number(r.meta?.changes)!==1)return {code:'DRAFT_CAP_REACHED'};
   const slot=await one<any>(env.DB.prepare('SELECT question_count FROM question_production_slots WHERE id=?').bind(id));
   const response=await handleQuestionGenerationJobs(new Request('https://internal.invalid/api/question-bank-standard/generation-jobs',{method:'POST',body:JSON.stringify({requestKey:id,outcomeId:o.id,questionCount:slot.question_count,qualityProfile:'EDITORIAL_V1',presentation:'AUTO',taskFocus:'GENERIC',priority:1,instructionNote:'Sürekli editoryal üretim; kayıtlı kampanya ve maliyet sınırı; insan onayı ayrıca gerekir.',expectedContext:{curriculumVersionId:o.curriculum_version_id,academicYear:o.academic_year,gradeLevel:o.grade_level,subjectId:o.subject_id,programVersion:o.program_version}})}),env,actor);
   const body:any=await response?.json();jobId=body?.job?.id;
   if(!response?.ok||!jobId)throw Error(body?.error?.code??'JOB_CREATE_FAILED');
   await env.DB.prepare('UPDATE question_production_slots SET job_id=? WHERE id=? AND job_id IS NULL').bind(jobId,id).run();
   const result=await runQuestionGenerationJob(new Request('https://internal.invalid/scheduled-question-production',{method:'POST'}),withQuestionAiBudget(env),actor,jobId);
   const payload:any=await result.json();const code=payload?.error?.code??null;
   await env.DB.prepare('UPDATE question_production_slots SET status=?,error_code=?,completed_at=CURRENT_TIMESTAMP WHERE id=? AND status=\'RUNNING\'').bind(result.ok&&payload.job?.status==='REVIEW_READY'?'REVIEW_READY':'FAILED',code,id).run();
   return {id,jobId,status:result.status,code};
  }catch(e){const code=e instanceof Error?e.message.slice(0,160):'PRODUCTION_FAILED';await env.DB.prepare("UPDATE question_production_slots SET status='FAILED',error_code=?,completed_at=CURRENT_TIMESTAMP WHERE id=? AND status='RUNNING'").bind(code,id).run();return {id,jobId,code};}
 });
 return finish({code:tasks.length?'DISPATCHED':'NO_AVAILABLE_VERIFIED_OUTCOMES',results:await Promise.all(tasks)});
}
