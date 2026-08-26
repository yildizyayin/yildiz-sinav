import { describe,expect,it } from 'vitest';
import { guidanceBand,guidanceInstrumentForMessage,scoreGuidanceResponses } from '../worker/lib/guidance-assessments';
import { routeNibiruSpecialist } from '../worker/lib/nibiru-specialists';

describe('counselor-governed guidance assessments',()=>{
 it('scores educational dimensions on a normalized 0-100 scale',()=>{
  const result=scoreGuidanceResponses({scale:{min:1,max:5},items:[
   {id:'a',dimension:'planning',text:'A'},
   {id:'b',dimension:'planning',text:'B'},
   {id:'c',dimension:'persistence',text:'C'},
  ]},{a:5,b:3,c:1});
  expect(result.dimensions.planning).toBe(75);
  expect(result.dimensions.persistence).toBe(0);
  expect(result.confidence.planning).toBe(1);
  expect(result.confidence.persistence).toBe(.5);
 });
 it('rejects missing or out-of-range answers',()=>{
  expect(()=>scoreGuidanceResponses({scale:{min:1,max:5},items:[{id:'a',dimension:'x',text:'A'}]},{a:6})).toThrow('RESPONSE_REQUIRED:a');
  expect(()=>scoreGuidanceResponses({scale:{min:1,max:5},items:[{id:'a',dimension:'x',text:'A'}]},{})).toThrow('RESPONSE_REQUIRED:a');
 });
 it('maps explicit student test requests to approved instrument codes',()=>{
  expect(guidanceInstrumentForMessage('RBA testi yapmak istiyorum')).toBe('RBA_EDU_V1');
  expect(guidanceInstrumentForMessage('çalışma alışkanlık testi yapalım')).toBe('STUDY_HABITS_V1');
  expect(guidanceInstrumentForMessage('motivasyon değerlendirmesi istiyorum')).toBe('GOAL_MOTIVATION_V1');
  expect(guidanceInstrumentForMessage('sınav hazırlık testi')).toBe('EXAM_READINESS_V1');
  expect(guidanceInstrumentForMessage('bugün ne çalışayım')).toBeNull();
 });
 it('routes RBA to Guidance Counselor AI',()=>{
  const route=routeNibiruSpecialist({role:'STUDENT'},'RBA testi yapmak istiyorum');
  expect(route.specialist).toBe('GUIDANCE_COUNSELOR');
  expect(route.reason).toContain('rehber öğretmen onayı');
 });
 it('uses non-diagnostic educational bands',()=>{
  expect(guidanceBand(80)).toBe('STRONG');
  expect(guidanceBand(55)).toBe('BALANCED');
  expect(guidanceBand(35)).toBe('DEVELOPING');
  expect(guidanceBand(10)).toBe('NEEDS_SUPPORT');
 });
});
