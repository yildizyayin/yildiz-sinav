import {describe,it,expect} from 'vitest';
import {checkQuestionAgentPilot} from '../worker/lib/question-agent-pilot-policy';
const valid={gradeLevel:5,academicYear:'2026-2027',curriculumVerified:true,outcomeActive:true,questionCount:5,generationEnabled:true,budgetRemaining:1,reviewQueueAvailable:true};
describe('question agent controlled pilot guard',()=>{
 it('allows verified approved grade context',()=>expect(checkQuestionAgentPilot(valid).ok).toBe(true));
 it('excludes grades 4 8 and 12',()=>{for(const gradeLevel of [4,8,12])expect(checkQuestionAgentPilot({...valid,gradeLevel}).reasons).toContain('GRADE_OUTSIDE_APPROVED_SCOPE')});
 it('fails closed if production not enabled',()=>expect(checkQuestionAgentPilot({...valid,generationEnabled:false}).ok).toBe(false));
 it('requires real curriculum verification',()=>expect(checkQuestionAgentPilot({...valid,curriculumVerified:false}).ok).toBe(false));
 it('requires budget and review queue',()=>expect(checkQuestionAgentPilot({...valid,budgetRemaining:0,reviewQueueAvailable:false}).reasons).toEqual(['BUDGET_EXHAUSTED','REVIEW_CAPACITY_REQUIRED']));
});
