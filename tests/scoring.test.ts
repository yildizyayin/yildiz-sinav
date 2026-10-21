import { describe, expect, it } from 'vitest';
import { assertScoringRuleVerified, calculateOverall, calculateSubjectScore } from '../worker/lib/scoring';

describe('scoring',()=>{
 it('calculates configurable wrong divisor',()=>{const r=calculateSubjectScore({correct:15,wrong:4,blank:1,wrongDivisor:4,questionCount:20});expect(r.net).toBe(14);expect(r.successPercent).toBe(70)});
 it('aggregates subject results',()=>{const a=calculateSubjectScore({correct:8,wrong:4,blank:0,wrongDivisor:4,questionCount:12});const b=calculateSubjectScore({correct:10,wrong:0,blank:2,wrongDivisor:4,questionCount:12});expect(calculateOverall([a,b]).net).toBe(17)});
 it('refuses unverified official/configured rule',()=>expect(()=>assertScoringRuleVerified({verified:0,authority:'ÖSYM'})).toThrow('OFFICIAL_SCORING_RULE_REQUIRED'));
});

import {readdirSync,readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {calculateExamScore,effectiveWrongDivisor,scoreMethodFor} from '../worker/lib/scoring';
describe('A024 exam score',()=>{
 it('"yanlış götürmez" (0) no longer becomes 4 wrongs = 1 correct',()=>{
  expect(calculateSubjectScore({correct:15,wrong:4,blank:1,wrongDivisor:0,questionCount:20}).net).toBe(15);
  expect(calculateSubjectScore({correct:15,wrong:3,blank:2,wrongDivisor:3,questionCount:20}).net).toBe(14);
 });
 it('LGS estimate with MEB weights 4/4/4/1/1/1 on the 100–500 scale',()=>{
  const sub=(code:string,net:number,q:number)=>({code,net,questionCount:q});
  const full=[sub('TUR',20,20),sub('MAT',20,20),sub('FEN',20,20),sub('INK',10,10),sub('DIN',10,10),sub('YAB',10,10)];
  expect(calculateExamScore('LGS_ESTIMATE',full)).toBe(500);
  expect(calculateExamScore('LGS_ESTIMATE',full.map(s=>({...s,net:-2})))).toBe(100);
  // 4·(15+10+12) + 8 + 9 + 7 = 172 of 270 → 100 + 400·172/270 = 354.81
  expect(calculateExamScore('LGS_ESTIMATE',[sub('TUR',15,20),sub('MAT',10,20),sub('FEN',12,20),sub('INK',8,10),sub('DIN',9,10),sub('YAB',7,10)])).toBe(354.81);
  // A Türkçe net is worth four times an İnkılap net
  const a=calculateExamScore('LGS_ESTIMATE',[sub('TUR',11,20),sub('INK',5,10)])!,b=calculateExamScore('LGS_ESTIMATE',[sub('TUR',10,20),sub('INK',9,10)])!;expect(a).toBe(b);
 });
 it('school percent and custom scale; ÖSYM profiles give no score until coefficients are approved',()=>{
  expect(calculateExamScore('PERCENT',[{net:15,questionCount:20},{net:5,questionCount:20}])).toBe(50);
  expect(calculateExamScore('CUSTOM',[{subjectId:'a',net:10,questionCount:20},{subjectId:'b',net:20,questionCount:20}],{scoreScale:500,weights:{a:3}})).toBe(312.5);
  expect(calculateExamScore('NONE',[{net:10,questionCount:20}])).toBeNull();
  expect(effectiveWrongDivisor(4,'CUSTOM',{wrongDivisor:0})).toBe(0);expect(effectiveWrongDivisor(3,'LGS_ESTIMATE',{wrongDivisor:0})).toBe(3);expect(effectiveWrongDivisor(undefined,'NONE',null)).toBe(4);
 });
 it('seeded profiles say what the score is; no profile claims an official standard score',()=>{
  const db=new DatabaseSync(':memory:');for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(`migrations/${f}`,'utf8'));
  const rows=db.prepare(`SELECT v.id,v.config_json c FROM scoring_rule_versions v JOIN scoring_rules r ON r.id=v.rule_id WHERE r.official=1 OR r.code IN ('SCHOOL_100','CUSTOM_EXAM')`).all() as any[];
  for(const r of rows){const c=JSON.parse(r.c);expect(c.scoreLabel,r.id).toBeTruthy();expect(c.standardization?.enabled===true,r.id).toBe(false);}
  expect(scoreMethodFor(JSON.parse((rows.find(r=>r.id==='srv_meb_lgs_2627') as any).c))).toBe('LGS_ESTIMATE');
  expect(scoreMethodFor(JSON.parse((rows.find(r=>r.id==='srv_osym_tyt_2627') as any).c))).toBe('NONE');
  db.close();
 });
});
