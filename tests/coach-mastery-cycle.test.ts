import { describe,expect,it } from 'vitest';
import { evaluateMiniTest,miniTestQuestionCount } from '../worker/lib/coach-mastery-cycle';

describe('Nibiru coach mastery cycle',()=>{
 it('requires at least five verified questions',()=>{
  expect(miniTestQuestionCount(4,1)).toBe(0);
  expect(miniTestQuestionCount(5,1)).toBe(5);
 });

 it('grows retry tests but never exceeds ten questions',()=>{
  expect(miniTestQuestionCount(20,2)).toBe(6);
  expect(miniTestQuestionCount(20,12)).toBe(10);
 });

 it('masters an outcome only at eighty percent or above',()=>{
  expect(evaluateMiniTest(4,5)).toMatchObject({passed:true,scorePercent:80});
  expect(evaluateMiniTest(3,5)).toMatchObject({passed:false,scorePercent:60});
 });

 it('does not accept undersized evidence as mastery',()=>{
  expect(evaluateMiniTest(4,4)).toMatchObject({passed:false,scorePercent:100});
 });
});
