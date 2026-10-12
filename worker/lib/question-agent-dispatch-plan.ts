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
