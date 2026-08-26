import { describe,expect,it } from 'vitest';
import { guidanceRouteFromHistory,istanbulDateKey,metricLabelForExam,positiveGapTotal } from '../worker/lib/target-analysis-v2';

describe('target analysis v2',()=>{
 it('keeps LGS subject labels unprefixed',()=>{
  expect(metricLabelForExam('LGS','Matematik','LGS_SCHOOL')).toBe('Matematik');
 });
 it('separates TYT and AYT metrics for YÖK Atlas comparison',()=>{
  expect(metricLabelForExam('TYT','Matematik','YKS_PROGRAM')).toBe('TYT Matematik');
  expect(metricLabelForExam('AYT','Matematik','YKS_PROGRAM')).toBe('AYT Matematik');
  expect(metricLabelForExam('TYT','Matematik','YKS_PROGRAM')).not.toBe(metricLabelForExam('AYT','Matematik','YKS_PROGRAM'));
 });
 it('sums only positive target net gaps',()=>{
  expect(positiveGapTotal([{gap:3.5},{gap:-2},{gap:1.25}])).toBe(4.75);
 });
 it('marks the route as closing when historical gap shrinks materially',()=>{
  expect(guidanceRouteFromHistory(6,8,true)).toEqual({status:'CLOSING_GAP',gapChange:2});
  expect(guidanceRouteFromHistory(9,8,true)).toEqual({status:'WIDENING',gapChange:-1});
  expect(guidanceRouteFromHistory(8.3,8,true)).toEqual({status:'STABLE',gapChange:-0.3});
 });
 it('never invents a target route without an official net profile',()=>{
  expect(guidanceRouteFromHistory(0,8,false)).toEqual({status:'OFFICIAL_PROFILE_REQUIRED',gapChange:null});
 });
 it('uses Istanbul calendar day for snapshot identity',()=>{
  expect(istanbulDateKey(new Date('2026-08-25T21:30:00Z'))).toBe('20260826');
 });
});
