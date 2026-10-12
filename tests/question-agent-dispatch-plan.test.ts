import {describe,it,expect} from 'vitest';
import {pilotBatchLimit} from '../worker/lib/question-agent-dispatch-plan';
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
