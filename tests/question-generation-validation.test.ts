import {expect,it,vi} from 'vitest';
import {mechanicalDraftIssues,parseVerification,readAiJson,verifyQuestionDrafts,DEFAULT_QUESTION_VERIFIER_MODEL} from '../worker/lib/question-generation-validation';
const q=(correctAnswer='C',solutionText='5 × 12 = 60. 60 × 7 = 420. Doğru cevap A: 420 kg.')=>({stemText:'Ağaçlardan kaç kilogram ürün alınır?',options:['420 kg','600 kg','840 kg','4200 kg'].map((text,i)=>({label:String.fromCharCode(65+i),text})),correctAnswer,solutionText,difficultyLevel:3});
it('blocks the actual pilot key mismatch and incorrect arithmetic',()=>{
 expect(mechanicalDraftIssues(q())).toContain('ANSWER_VALUE_MISMATCH');
 expect(mechanicalDraftIssues(q('A'))).toEqual([]);
 expect(mechanicalDraftIssues(q('A','543.210 + 12.560 = 557.770'))).toContain('INVALID_ARITHMETIC');
});
it('rejects numerically equivalent choices despite different formatting',()=>{
 const draft=q('A');draft.options[0].text='456.789';draft.options[1].text='456789';
 expect(mechanicalDraftIssues(draft)).toContain('EQUIVALENT_NUMERIC_OPTIONS');
});
it('requires one independent verdict for every draft and fails malformed verdicts closed',()=>{
 expect(parseVerification({response:{reviews:[{index:0,valid:true,issues:[]}]}},1)).not.toBeNull();
 for(const reviews of [[],[{index:1,valid:true,issues:[]}],[{index:0,valid:true,issues:['Wrong answer']}],[{index:0,valid:true,issues:[]},{index:0,valid:true,issues:[]}]])expect(parseVerification({response:{reviews}},1)).toBeNull();
 expect(readAiJson({response:'x'.repeat(65537)})).toBeNull();
});
it('mechanical failure consumes no verification request; independent rejection remains blocked',async()=>{
 const run=vi.fn(async()=>({response:JSON.stringify({reviews:[{index:0,valid:false,issues:['Outcome mismatch']}]})}));
 const env={AI:{run}} as any;
 expect((await verifyQuestionDrafts(env,{},[q()])).ok).toBe(false);expect(run).not.toHaveBeenCalled();
 const result=await verifyQuestionDrafts(env,{},[q('A')]);expect(result.ok).toBe(false);expect(result.unavailable).toBe(false);
 expect(run).toHaveBeenCalledWith(DEFAULT_QUESTION_VERIFIER_MODEL,expect.objectContaining({max_tokens:1500,stream:false}));
});
it('unavailable verification and same-model configuration cannot pass',async()=>{
 const run=vi.fn(async()=>{throw Error('Unavailable');});
 expect((await verifyQuestionDrafts({AI:{run}} as any,{},[q('A')])).unavailable).toBe(true);
 run.mockClear();expect((await verifyQuestionDrafts({AI:{run},QUESTION_GENERATION_MODEL:DEFAULT_QUESTION_VERIFIER_MODEL} as any,{},[q('A')])).ok).toBe(false);expect(run).not.toHaveBeenCalled();
});
