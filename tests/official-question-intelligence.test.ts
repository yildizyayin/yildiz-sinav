import { describe,expect,it } from 'vitest';
import { questionDifficulty } from '../worker/lib/official-question-intelligence';

describe('official question intelligence',()=>{
 it('uses blue for easy questions',()=>{
  expect(questionDifficulty(1)).toEqual({band:'EASY',color:'BLUE',label:'Kolay'});
  expect(questionDifficulty(2).color).toBe('BLUE');
 });
 it('uses green for medium questions',()=>{
  expect(questionDifficulty(3)).toEqual({band:'MEDIUM',color:'GREEN',label:'Orta'});
 });
 it('uses red for hard questions',()=>{
  expect(questionDifficulty(4).color).toBe('RED');
  expect(questionDifficulty(5)).toEqual({band:'HARD',color:'RED',label:'Zor'});
 });
});
