import {describe,it,expect} from 'vitest';
import {pilotBatchLimit} from '../worker/lib/question-agent-dispatch-plan';
describe('agent pilot batch constraints',()=>{
 it('caps each job at ten',()=>expect(pilotBatchLimit(50,50,50)).toBe(10));
 it('honors remaining budget and review slots',()=>expect(pilotBatchLimit(10,8,3)).toBe(3));
 it('refuses invalid or exhausted capacity',()=>{expect(pilotBatchLimit(10,0,5)).toBe(0);expect(pilotBatchLimit(NaN,5,5)).toBe(0);});
});
