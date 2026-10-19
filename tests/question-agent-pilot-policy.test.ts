import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {checkQuestionAgentPilot,PILOT_GRADES_SQL} from '../worker/lib/question-agent-pilot-policy';
const valid={gradeLevel:5,academicYear:'2026-2027',curriculumVerified:true,outcomeActive:true,questionCount:5,generationEnabled:true,budgetRemaining:1,reviewQueueAvailable:true};
describe('question agent controlled pilot guard',()=>{
 it('allows verified approved grade context',()=>expect(checkQuestionAgentPilot(valid).ok).toBe(true));
 it('accepts every 2027–2028 Maarif middle and high school grade, including LGS 8 and YKS 12',()=>{for(const gradeLevel of [5,6,7,8,9,10,11,12])expect(checkQuestionAgentPilot({...valid,academicYear:'2027-2028',gradeLevel}).ok).toBe(true)});
 it('still excludes grades outside the imported 5–12 scope',()=>{for(const gradeLevel of [1,4,13])expect(checkQuestionAgentPilot({...valid,gradeLevel}).reasons).toContain('GRADE_OUTSIDE_APPROVED_SCOPE')});
 it('keeps SQL filters on the same grade list as the guard',()=>{
  expect(PILOT_GRADES_SQL).toBe('5,6,7,8,9,10,11,12');
  const queue=readFileSync(new URL('../worker/lib/question-autonomous-queue.ts',import.meta.url),'utf8');
  const entry=readFileSync(new URL('../worker/question-bank-standard-entry.ts',import.meta.url),'utf8');
  expect(queue).toContain('o.grade_level IN (${PILOT_GRADES_SQL})');
  expect(entry.match(/grade_level IN \(([0-9,]+)\)/g)).toEqual(['grade_level IN (5,6,7,8,9,10,11,12)','grade_level IN (5,6,7,8,9,10,11,12)']);
 });
 it('production opens a real, bounded human review queue',()=>{
  const config=readFileSync(new URL('../wrangler.production.jsonc',import.meta.url),'utf8');
  expect(config).toMatch(/"QUESTION_PILOT_REVIEW_AVAILABLE":\s*"true"/);
  expect(config).toMatch(/"QUESTION_PILOT_REVIEW_SLOTS":\s*"10000"/);
 });
 it('fails closed if production not enabled',()=>expect(checkQuestionAgentPilot({...valid,generationEnabled:false}).ok).toBe(false));
 it('requires real curriculum verification',()=>expect(checkQuestionAgentPilot({...valid,curriculumVerified:false}).ok).toBe(false));
 it('requires budget and review queue',()=>expect(checkQuestionAgentPilot({...valid,budgetRemaining:0,reviewQueueAvailable:false}).reasons).toEqual(['BUDGET_EXHAUSTED','REVIEW_CAPACITY_REQUIRED']));
});
