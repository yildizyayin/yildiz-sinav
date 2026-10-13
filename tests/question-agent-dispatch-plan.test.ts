import {describe,it,expect} from 'vitest';
import {pilotBatchLimit,canExecuteScheduledPilot,validateScheduledActor,canDispatchToReviewQueue,evaluatePilotReadiness,pilotReadinessAccess} from '../worker/lib/question-agent-dispatch-plan';
describe('agent pilot batch constraints',()=>{
 it('caps each job at ten',()=>expect(pilotBatchLimit(50,50,50)).toBe(10));
 it('honors remaining budget and review slots',()=>expect(pilotBatchLimit(10,8,3)).toBe(3));
 it('refuses invalid or exhausted capacity',()=>{expect(pilotBatchLimit(10,0,5)).toBe(0);expect(pilotBatchLimit(NaN,5,5)).toBe(0);});
});

import {planQuestionPilotDispatch} from '../worker/lib/question-agent-dispatch-plan';
const candidate=(id:string)=>({id,gradeLevel:5,academicYear:'2026-2027',curriculumVerified:true,outcomeActive:true,questionCount:10,status:'REQUESTED',attemptCount:0});
describe('pilot multi-job dispatch',()=>{
 it('selects at most five 10-question jobs',()=>{
  const plan=planQuestionPilotDispatch(Array.from({length:6},(_,i)=>candidate('job'+i)),{enabled:true,budget:60,reviewSlots:60,maxJobs:6,maxQuestions:60});
  expect(plan.ids).toHaveLength(5);expect(plan.questionCount).toBe(50);
 });
 it('blocks disallowed grades and missing review capacity',()=>{
  const plan=planQuestionPilotDispatch([{...candidate('bad'),gradeLevel:8},candidate('ok')],{enabled:true,budget:20,reviewSlots:10,maxJobs:5,maxQuestions:50});
  expect(plan.ids).toEqual(['ok']);
 });
 it('does not select jobs while disabled',()=>{
  expect(planQuestionPilotDispatch([candidate('x')],{enabled:false,budget:10,reviewSlots:10,maxJobs:1,maxQuestions:10}).ids).toEqual([]);
 });
});

describe('scheduled agent execution rollout',()=>{
 const ready={dispatchPreview:true,executionEnabled:true,generationEnabled:true,providerAvailable:true,verifiedServiceActor:true,reviewCapacity:10,budget:10};
 it('refuses execution with no authenticated scheduler actor',()=>expect(canExecuteScheduledPilot({...ready,verifiedServiceActor:false}).reasons).toContain('SERVICE_ACTOR_NOT_VERIFIED'));
 it('requires an independent execution opt-in',()=>expect(canExecuteScheduledPilot({...ready,executionEnabled:false}).allowed).toBe(false));
 it('blocks empty reviewer capacity or budget',()=>{
  expect(canExecuteScheduledPilot({...ready,reviewCapacity:0}).allowed).toBe(false);
  expect(canExecuteScheduledPilot({...ready,budget:0}).allowed).toBe(false);
 });
 it('allows all safeguards present',()=>expect(canExecuteScheduledPilot(ready).allowed).toBe(true));
});

describe('scheduled actor binding',()=>{
 it('rejects absent actor or service configuration',()=>expect(validateScheduledActor(null,undefined).ok).toBe(false));
 it('rejects inactive or non-admin actors',()=>{
  expect(validateScheduledActor({id:'x',role:'TEACHER',active:true},'x').ok).toBe(false);
  expect(validateScheduledActor({id:'x',role:'SUPER_ADMIN',active:false},'x').ok).toBe(false);
 });
 it('requires exact provisioned actor ID',()=>{
  expect(validateScheduledActor({id:'x',role:'SUPER_ADMIN',active:true},'y').ok).toBe(false);
  expect(validateScheduledActor({id:'x',role:'SUPER_ADMIN',active:true},'x').ok).toBe(true);
 });
});

describe('full batch review capacity',()=>{
 it('rejects capacity short of the selected batch',()=>expect(canDispatchToReviewQueue({reviewAvailable:true,reviewSlots:5,questionCount:10})).toBe(false));
 it('blocks a disabled queue',()=>expect(canDispatchToReviewQueue({reviewAvailable:false,reviewSlots:10,questionCount:10})).toBe(false));
 it('accepts a ready queue with enough slots',()=>expect(canDispatchToReviewQueue({reviewAvailable:true,reviewSlots:10,questionCount:10})).toBe(true));
});

describe('initial question-agent pilot readiness',()=>{
 const ready={aiBindingPresent:true,generationEnabled:true,pilotMode:true,dispatchPreview:true,executionEnabled:true,serviceActorVerified:true,verifiedOutcomeCount:5,queuedQuestionCount:10,reviewAvailable:true,reviewSlots:10,remainingBudget:50};
 it('passes only complete preparation',()=>expect(evaluatePilotReadiness(ready).ready).toBe(true));
 it('blocks absent verified outcomes',()=>expect(evaluatePilotReadiness({...ready,verifiedOutcomeCount:0}).reasons).toContain('VERIFIED_OUTCOMES_MISSING'));
 it('blocks absent provider binding and review capacity',()=>{
  const result=evaluatePilotReadiness({...ready,aiBindingPresent:false,reviewSlots:5});
  expect(result.reasons).toContain('AI_BINDING_MISSING');
  expect(result.reasons).toContain('REVIEW_CAPACITY_REQUIRED');
 });
 it('rejects pilot with disabled flags',()=>expect(evaluatePilotReadiness({...ready,executionEnabled:false}).ready).toBe(false));
});

describe('Süper Admin pilot readiness authorization',()=>{
 it('rejects anonymous requests',()=>expect(pilotReadinessAccess(null)).toBe(401));
 it('rejects institution and teacher roles',()=>{
  expect(pilotReadinessAccess('INSTITUTION_MANAGER')).toBe(403);
  expect(pilotReadinessAccess('TEACHER')).toBe(403);
 });
 it('allows only super admin',()=>expect(pilotReadinessAccess('SUPER_ADMIN')).toBe(200));
});

describe('ten-question pilot readiness minimum',()=>{
 const ready={aiBindingPresent:true,generationEnabled:true,pilotMode:true,dispatchPreview:true,executionEnabled:true,serviceActorVerified:true,verifiedOutcomeCount:1,queuedQuestionCount:10,reviewAvailable:true,reviewSlots:10,remainingBudget:10};
 it('rejects fewer than ten queued questions',()=>expect(evaluatePilotReadiness({...ready,queuedQuestionCount:9}).reasons).toContain('TEN_QUESTION_PILOT_NOT_QUEUED'));
 it('rejects fewer than ten reviewer slots',()=>expect(evaluatePilotReadiness({...ready,reviewSlots:9}).reasons).toContain('REVIEW_CAPACITY_REQUIRED'));
 it('rejects less than ten remaining budget',()=>expect(evaluatePilotReadiness({...ready,remainingBudget:9}).reasons).toContain('BUDGET_EXHAUSTED'));
 it('passes complete ten-question readiness',()=>expect(evaluatePilotReadiness(ready).ready).toBe(true));
});
