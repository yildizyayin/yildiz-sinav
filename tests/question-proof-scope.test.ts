import {describe,it,expect,vi} from 'vitest';
import {unsupportedPilotProofScope} from '../worker/lib/question-proof-scope';
import {independentlySolve} from '../worker/lib/question-blind-solve';
describe('unqualified imported mathematical scopes',()=>{
 it.each([7,8,9,10,11,12])('does not infer or approve grade %s with a generic arithmetic solver',async grade=>{
  const run=vi.fn();
  const result=await independentlySolve({AI:{run}} as any,{stemText:'1 + 1 kaçtır?',options:[{label:'A',text:'2'}],correctAnswer:'A',solutionText:'2',difficultyLevel:1},'model',{gradeLevel:grade,outcomeCode:`MAT.${grade}.1.1`});
  expect(result.ok).toBe(false);expect(result.issues).toEqual(['BLIND_PROOF_SCOPE_UNSUPPORTED']);expect(run).not.toHaveBeenCalled();
 });
 it('does not classify another subject, a conflicting grade or existing bounded scopes as this restriction',()=>{
  for(const c of [{gradeLevel:5,outcomeCode:'MAT.5.1.1'},{gradeLevel:6,outcomeCode:'MAT.6.1.1'},{gradeLevel:7,outcomeCode:'FEN.7.1.1'},{gradeLevel:7,outcomeCode:'MAT.9.1.1'},undefined])expect(unsupportedPilotProofScope(c)).toBe(false);
 });
});
