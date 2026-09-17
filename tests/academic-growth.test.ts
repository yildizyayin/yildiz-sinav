import { describe,expect,it } from 'vitest';
import { compareTargetProfile,normalizeMetricKey,targetEligibility,targetNibiruAnswer } from '../worker/lib/academic-growth';

describe('academic target engine',()=>{
 it('restricts target types by grade',()=>{
  expect(targetEligibility(8,'LGS_SCHOOL')).toBe(true);
  expect(targetEligibility(8,'YKS_PROGRAM')).toBe(false);
  expect(targetEligibility(12,'YKS_PROGRAM')).toBe(true);
  expect(targetEligibility(11,'YKS_PROGRAM')).toBe(false);
 });
 it('normalizes Turkish metric labels safely',()=>{
  expect(normalizeMetricKey('TYT Matematik')).toBe('TYTMATEMATIK');
  expect(normalizeMetricKey('Fen Bilimleri')).toBe('FENBILIMLERI');
 });
 it('compares official target nets without inventing missing metrics',()=>{
  const gaps=compareTargetProfile({Matematik:14.5,Türkçe:17},{MATEMATIK:17.25,TURKCE:18.5});
  expect(gaps.find(x=>x.metric==='MATEMATIK')?.gap).toBe(2.75);
  expect(gaps.find(x=>x.metric==='TURKCE')?.gap).toBe(1.5);
  expect(gaps).toHaveLength(2);
 });
 it('Nibiru discloses source and no placement guarantee',()=>{
  const answer=targetNibiruAnswer({target:{target_type:'LGS_SCHOOL',school_name:'Örnek Lise'},analysis:{examCount:5,trend:'RISING',gaps:[{metric:'MATEMATIK',gap:2.5}],weakOutcomes:[],source:{kind:'MEB_ROTA_MAARIF',year:2026}}});
  expect(answer.startsWith('🤖 Nibiru:')).toBe(true);
  expect(answer).toContain('MEB_ROTA_MAARIF');
  expect(answer).toContain('yerleştirme garantisi vermez');
 });
});
