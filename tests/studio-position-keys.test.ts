import {describe,it,expect} from 'vitest';
import {buildPositionAnswerKeys} from '../worker/lib/studio-position-keys';
const base=[{bookletCode:'A',questionId:'q1',position:1,subjectId:'math',correctAnswer:'A'},{bookletCode:'A',questionId:'q2',position:2,subjectId:'math',correctAnswer:'C'}];
describe('booklet position answer keys',()=>{
 it('uses the answer of the question at the same B position',()=>{
  const r=buildPositionAnswerKeys([...base,{...base[1],bookletCode:'B',position:1},{...base[0],bookletCode:'B',position:2}]);
  expect(r.ok).toBe(true);if(r.ok)expect(r.keys.map(k=>k.answers.B)).toEqual(['C','A']);
 });
 it('rejects a missing B question',()=>expect(buildPositionAnswerKeys([...base,{...base[0],bookletCode:'B'}]).ok).toBe(false));
 it('rejects cross-subject position swapping until scoring mapping is supported',()=>{
  const q=[base[0],{...base[1],subjectId:'science'},{...base[1],subjectId:'science',bookletCode:'B',position:1},{...base[0],bookletCode:'B',position:2}];
  expect(buildPositionAnswerKeys(q)).toMatchObject({ok:false,error:'BOOKLET_SUBJECT_POSITION_MISMATCH'});
 });
 it('rejects swapped positions with different 4/5-option format',()=>{
  const q=[{...base[0],optionCount:4},{...base[1],optionCount:5},
   {...base[1],bookletCode:'B',position:1,optionCount:5},
   {...base[0],bookletCode:'B',position:2,optionCount:4}];
  expect(buildPositionAnswerKeys(q)).toMatchObject({ok:false,error:'BOOKLET_OPTION_COUNT_MISMATCH'});
 });

});
