import { describe,expect,it } from 'vitest';
import { buildCoachDraft,coachQuestionTarget,istanbulDateKey } from '../worker/lib/education-coach';

const weak=(id:string,rate:number,subject='Matematik')=>({outcome_id:id,title:`Kazanım ${id}`,topic:'Problemler',subtopic:null,subject_id:`s_${subject}`,subject_name:subject,evidence_count:6,correct_count:Math.round(rate*6),success_rate:rate});

describe('Education Coach daily plan',()=>{
 it('scales practice size to verified success rate',()=>{
  expect(coachQuestionTarget(.30)).toBe(12);
  expect(coachQuestionTarget(.45)).toBe(10);
  expect(coachQuestionTarget(.60)).toBe(8);
 });
 it('builds at most three short tasks and prioritizes weak outcome first',()=>{
  const draft=buildCoachDraft([weak('o1',.33),weak('o2',.58,'Türkçe')],{id:'w1',title:'Haftalık Föy',track:'NUMERIC',planned_date:'2026-08-26',outcome_id:'o1'});
  expect(draft).toHaveLength(3);
  expect(draft[0].itemType).toBe('TASK');
  expect(draft[0].referenceId).toBe('o1');
  expect(draft[1].itemType).toBe('WORKSHEET');
  expect(draft[2].referenceId).toBe('o2');
 });
 it('does not invent a task when there is no verified evidence or worksheet',()=>{
  expect(buildCoachDraft([],null)).toEqual([]);
 });
 it('uses Istanbul calendar day for deterministic daily plan keys',()=>{
  expect(istanbulDateKey(new Date('2026-08-25T22:30:00Z'))).toBe('2026-08-26');
 });
});
