import {describe,it,expect} from 'vitest';
import {recommendedOptionCount,validateAnswerForOptions} from '../worker/lib/question-option-policy';
describe('option policy recommendations',()=>{
 it('uses three options for early primary grades',()=>expect([1,2,3].map(g=>recommendedOptionCount(g))).toEqual([3,3,3]));
 it('uses four for middle grades and five for upper grades',()=>expect([4,5,6,7,8,9,10,11,12].map(g=>recommendedOptionCount(g))).toEqual([4,4,4,4,4,5,5,5,5]));
 it('prioritizes standardized exam types',()=>{expect(recommendedOptionCount(8,'TYT')).toBe(5);expect(recommendedOptionCount(12,'LGS')).toBe(4)});
 it('validates correct letter against choice count',()=>{
  expect(validateAnswerForOptions(3,'C')).toBe(true);expect(validateAnswerForOptions(3,'D')).toBe(false);
  expect(validateAnswerForOptions(4,'E')).toBe(false);expect(validateAnswerForOptions(5,'E')).toBe(true);
 });
});
