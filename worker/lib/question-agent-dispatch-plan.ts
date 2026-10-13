export function pilotBatchLimit(requested: number, budget: number, reviewSlots: number): number {
  if (![requested,budget,reviewSlots].every(Number.isSafeInteger)) return 0;
  return Math.max(0, Math.min(requested, budget, reviewSlots, 10));
}

import {checkQuestionAgentPilot} from './question-agent-pilot-policy';

export type DispatchCandidate={id:string;gradeLevel:number;academicYear:string;curriculumVerified:boolean;outcomeActive:boolean;questionCount:number;status:string;attemptCount:number};
export function planQuestionPilotDispatch(jobs:readonly DispatchCandidate[], capacity:{enabled:boolean;budget:number;reviewSlots:number;maxJobs:number;maxQuestions:number}){
 const ids:string[]=[];const rejected:{id:string;reasons:string[]}[]=[];
 if(![capacity.budget,capacity.reviewSlots,capacity.maxJobs,capacity.maxQuestions].every(v=>Number.isSafeInteger(v)&&v>=0))return {ids,rejected:jobs.map(j=>({id:j.id,reasons:['INVALID_CAPACITY']})),questionCount:0};
 let remainingBudget=capacity.budget,remainingReview=capacity.reviewSlots,total=0;
 for(const j of jobs){
  const reasons=checkQuestionAgentPilot({gradeLevel:j.gradeLevel,academicYear:j.academicYear,curriculumVerified:j.curriculumVerified,outcomeActive:j.outcomeActive,questionCount:j.questionCount,generationEnabled:capacity.enabled,budgetRemaining:remainingBudget,reviewQueueAvailable:remainingReview>0}).reasons;
  if(j.status!=='REQUESTED'||j.attemptCount!==0)reasons.push('JOB_STATE_INVALID');
  if(ids.length>=Math.min(capacity.maxJobs,5)||total+j.questionCount>Math.min(capacity.maxQuestions,50))reasons.push('PILOT_LIMIT');
  if(j.questionCount>remainingBudget||j.questionCount>remainingReview)reasons.push('CAPACITY_EXCEEDED');
  if(reasons.length){rejected.push({id:j.id,reasons});continue;}
  ids.push(j.id);total+=j.questionCount;remainingBudget-=j.questionCount;remainingReview-=j.questionCount;
 }
 return {ids,rejected,questionCount:total};
}

/** Execution eligibility is separate from the read-only scheduling preview.
 * No job is run unless all independent rollout gates are explicitly enabled.
 */
export function canExecuteScheduledPilot(flags:{
 dispatchPreview:boolean;executionEnabled:boolean;generationEnabled:boolean;
 providerAvailable:boolean;verifiedServiceActor:boolean;reviewCapacity:number;budget:number
}):{allowed:boolean;reasons:string[]}{
 const reasons:string[]=[];
 if(!flags.dispatchPreview)reasons.push('PREVIEW_NOT_ENABLED');
 if(!flags.executionEnabled)reasons.push('EXECUTION_NOT_ENABLED');
 if(!flags.generationEnabled||!flags.providerAvailable)reasons.push('AI_NOT_READY');
 if(!flags.verifiedServiceActor)reasons.push('SERVICE_ACTOR_NOT_VERIFIED');
 if(!Number.isSafeInteger(flags.reviewCapacity)||flags.reviewCapacity<=0)reasons.push('REVIEW_CAPACITY_REQUIRED');
 if(!Number.isSafeInteger(flags.budget)||flags.budget<=0)reasons.push('BUDGET_REQUIRED');
 return {allowed:reasons.length===0,reasons};
}

/** Service execution identity must come from a separately provisioned database actor,
 * never from a fabricated SUPER_ADMIN object in a cron invocation.
 */
export function validateScheduledActor(actor:{id:string;role:string;active:boolean}|null,expectedId:string|undefined){
 const reasons:string[]=[];
 if(!expectedId||!expectedId.trim())reasons.push('SERVICE_ACTOR_NOT_CONFIGURED');
 if(!actor||!actor.active)reasons.push('SERVICE_ACTOR_NOT_ACTIVE');
 if(actor?.role!=='SUPER_ADMIN')reasons.push('SERVICE_ACTOR_ROLE_INVALID');
 if(actor&&expectedId&&actor.id!==expectedId)reasons.push('SERVICE_ACTOR_MISMATCH');
 return {ok:reasons.length===0,reasons};
}

/** The scheduler and generator must agree on human-review availability. */
export function canDispatchToReviewQueue(input:{reviewAvailable:boolean;reviewSlots:number;questionCount:number}):boolean{
 return input.reviewAvailable && Number.isSafeInteger(input.reviewSlots)
  && Number.isSafeInteger(input.questionCount) && input.questionCount>0
  && input.questionCount<=10 && input.reviewSlots>=input.questionCount;
}

/** External provider connectivity needs a real smoke run; this is a no-write config gate. */
export function evaluatePilotReadiness(input:{
 aiBindingPresent:boolean;generationEnabled:boolean;pilotMode:boolean;dispatchPreview:boolean;
 executionEnabled:boolean;serviceActorVerified:boolean;verifiedOutcomeCount:number;
 queuedQuestionCount:number;reviewAvailable:boolean;reviewSlots:number;remainingBudget:number
}):{ready:boolean;reasons:string[]}{
 const reasons:string[]=[];
 if(!input.aiBindingPresent)reasons.push('AI_BINDING_MISSING');
 if(!input.generationEnabled)reasons.push('GENERATION_DISABLED');
 if(!input.pilotMode||!input.dispatchPreview||!input.executionEnabled)reasons.push('PILOT_GATES_DISABLED');
 if(!input.serviceActorVerified)reasons.push('SERVICE_ACTOR_NOT_VERIFIED');
 if(!Number.isSafeInteger(input.verifiedOutcomeCount)||input.verifiedOutcomeCount<1)reasons.push('VERIFIED_OUTCOMES_MISSING');
 if(!Number.isSafeInteger(input.queuedQuestionCount)||input.queuedQuestionCount<1)reasons.push('NO_QUEUED_QUESTIONS');
 if(!canDispatchToReviewQueue({reviewAvailable:input.reviewAvailable,reviewSlots:input.reviewSlots,questionCount:Math.min(10,input.queuedQuestionCount)}))reasons.push('REVIEW_CAPACITY_REQUIRED');
 if(!Number.isSafeInteger(input.remainingBudget)||input.remainingBudget<Math.min(10,input.queuedQuestionCount))reasons.push('BUDGET_EXHAUSTED');
 return {ready:reasons.length===0,reasons};
}
