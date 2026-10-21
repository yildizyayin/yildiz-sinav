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
  expect(scoreMethodFor(JSON.parse((rows.find(r=>r.id==='srv_osym_tyt_2627') as any).c))).toBe('WEIGHTED_ESTIMATE');
  expect(scoreMethodFor(JSON.parse((rows.find(r=>r.id==='srv_osym_ayt_2627') as any).c))).toBe('NONE');
  db.close();
 });
});

import {calculateWeightedEstimate} from '../worker/lib/scoring';
describe('A024 ÖSYM weighted estimate (approved 21 Oct)',()=>{
 const tyt={TYT_TUR:33,TYT_SOS:17,TYT_MAT:33,TYT_FEN:17};
 const s=(code:string,net:number,q:number)=>({code,net,questionCount:q});
 it('TYT: 100 + 400 × weighted net share; perfect 500, nothing 100, a worked example',()=>{
  expect(calculateWeightedEstimate(tyt,[s('TYT_TUR',40,40),s('TYT_SOS',20,20),s('TYT_MAT',40,40),s('TYT_FEN',20,20)])).toBe(500);
  expect(calculateWeightedEstimate(tyt,[s('TYT_TUR',-1,40),s('TYT_SOS',0,20),s('TYT_MAT',0,40),s('TYT_FEN',0,20)])).toBe(100);
  // .33·30/40 + .17·10/20 + .33·20/40 + .17·10/20 = .5825 → 333
  expect(calculateWeightedEstimate(tyt,[s('TYT_TUR',30,40),s('TYT_SOS',10,20),s('TYT_MAT',20,40),s('TYT_FEN',10,20)])).toBe(333);
  // one Türkçe net ≈ 3.3 points, one Sosyal net ≈ 3.4 points
  const base=[s('TYT_TUR',20,40),s('TYT_SOS',10,20),s('TYT_MAT',20,40),s('TYT_FEN',10,20)];
  expect(calculateWeightedEstimate(tyt,[s('TYT_TUR',21,40),...base.slice(1)])!-calculateWeightedEstimate(tyt,base)!).toBeCloseTo(3.3,2);
  expect(calculateWeightedEstimate(tyt,[base[0],s('TYT_SOS',11,20),...base.slice(2)])!-calculateWeightedEstimate(tyt,base)!).toBeCloseTo(3.4,2);
 });
 it('a score type needing tests that were not taken gives no score (AYT-only cannot make SAY)',()=>{
  const say={TYT_TUR:13,TYT_SOS:7,TYT_MAT:13,TYT_FEN:7,AYT_MAT:30,AYT_FIZ:10,AYT_KIM:10,AYT_BIY:10};
  expect(calculateWeightedEstimate(say,[s('AYT_MAT',30,40),s('AYT_FIZ',7,14),s('AYT_KIM',6,13),s('AYT_BIY',6,13)])).toBeNull();
  expect(calculateWeightedEstimate(say,[s('TYT_TUR',40,40),s('TYT_SOS',20,20),s('TYT_MAT',40,40),s('TYT_FEN',20,20),s('AYT_MAT',40,40),s('AYT_FIZ',14,14),s('AYT_KIM',13,13),s('AYT_BIY',13,13)])).toBe(500);
 });
 it('migrated profiles: TYT and YKS types carry weights summing to 100; AYT/YDT alone explain why there is no score',()=>{
  const db=new DatabaseSync(':memory:');for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(`migrations/${f}`,'utf8'));
  const cfg=(id:string)=>JSON.parse((db.prepare('SELECT config_json c FROM scoring_rule_versions WHERE id=?').get(id) as any).c);
  for(const id of ['srv_osym_tyt_2627','srv_osym_yks_say_2627','srv_osym_yks_ea_2627','srv_osym_yks_soz_2627','srv_osym_yks_dil_2627']){const c=cfg(id);expect(c.scoreModel,id).toBe('WEIGHTED_ESTIMATE');expect(Object.values(c.estimateWeights).reduce((a:any,b:any)=>a+b,0),id).toBe(100);expect(c.scoreLabel).toContain('Tahmini');}
  expect(cfg('srv_osym_ayt_2627').scoreModel).toBe('NONE');expect(cfg('srv_osym_ayt_2627').scoreLabel).toContain('TYT gerekir');
  db.close();
 });
});
