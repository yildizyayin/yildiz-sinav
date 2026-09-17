import { describe, expect, it } from 'vitest';
import { assertScoringRuleVerified, calculateOverall, calculateSubjectScore } from '../worker/lib/scoring';

describe('scoring',()=>{
 it('calculates configurable wrong divisor',()=>{const r=calculateSubjectScore({correct:15,wrong:4,blank:1,wrongDivisor:4,questionCount:20});expect(r.net).toBe(14);expect(r.successPercent).toBe(70)});
 it('aggregates subject results',()=>{const a=calculateSubjectScore({correct:8,wrong:4,blank:0,wrongDivisor:4,questionCount:12});const b=calculateSubjectScore({correct:10,wrong:0,blank:2,wrongDivisor:4,questionCount:12});expect(calculateOverall([a,b]).net).toBe(17)});
 it('refuses unverified official/configured rule',()=>expect(()=>assertScoringRuleVerified({verified:0,authority:'ÖSYM'})).toThrow('OFFICIAL_SCORING_RULE_REQUIRED'));
});
