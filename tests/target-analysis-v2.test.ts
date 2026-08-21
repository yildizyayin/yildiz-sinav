import { describe,expect,it } from 'vitest';
import { metricLabelForExam } from '../worker/lib/target-analysis-v2';

describe('target analysis v2',()=>{
 it('keeps LGS subject labels unprefixed',()=>{
  expect(metricLabelForExam('LGS','Matematik','LGS_SCHOOL')).toBe('Matematik');
 });
 it('separates TYT and AYT metrics for YÖK Atlas comparison',()=>{
  expect(metricLabelForExam('TYT','Matematik','YKS_PROGRAM')).toBe('TYT Matematik');
  expect(metricLabelForExam('AYT','Matematik','YKS_PROGRAM')).toBe('AYT Matematik');
  expect(metricLabelForExam('TYT','Matematik','YKS_PROGRAM')).not.toBe(metricLabelForExam('AYT','Matematik','YKS_PROGRAM'));
 });
});
