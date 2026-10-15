import {expect,it,vi} from 'vitest';
import {deterministicReadingEvidence,independentlySolve} from '../worker/lib/question-blind-solve';
import {qualityValidationCases} from '../worker/lib/question-quality-validation';
it('proves the actual number-reading source without a model or access to the answer key',async()=>{
 const c=qualityValidationCases()[4],run=vi.fn();
 const publicInput={stemText:c.question.stemText,options:c.question.options};
 expect(deterministicReadingEvidence(publicInput,c.context)).toMatchObject({target:2000300407,answer:'B'});
 const good=await independentlySolve({AI:{run}} as any,c.question,'verifier',c.context);
 expect(good).toMatchObject({ok:true,model:null,method:'DETERMINISTIC_TURKISH_CARDINAL',keyHidden:true,solutionHidden:true});
 const wrong=await independentlySolve({AI:{run}} as any,{...c.question,correctAnswer:'A'},'verifier',c.context);
 expect(wrong.issues).toContain('BLIND_ANSWER_DISAGREEMENT');expect(run).not.toHaveBeenCalled();
});
it('does not assume the same task for changed instructions, other outcomes or malformed numbers',()=>{
 const c=qualityValidationCases()[4],q=c.question;
 expect(deterministicReadingEvidence({...q,stemText:q.stemText.replace('sayıyı,','sayının bir fazlasını,')},c.context)).toBeNull();
 expect(deterministicReadingEvidence(q,{...c.context,outcomeCode:'MAT.5.1.2'})).toBeNull();
 expect(deterministicReadingEvidence({...q,options:q.options.map(o=>({...o,text:'2.00.300.407'}))},c.context)).toBeNull();
});
