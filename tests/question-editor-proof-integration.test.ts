import {readFileSync} from 'node:fs';
import {expect,it,vi} from 'vitest';
import {editQuestionPacket} from '../worker/lib/question-ai-editor';
import {verifyQuestionDrafts} from '../worker/lib/question-generation-validation';
import {editorialScores} from './fixtures/editorial-question';
import {independentlySolve} from '../worker/lib/question-blind-solve';
const context={qualityProfile:'EDITORIAL_V1',gradeLevel:5,outcomeCode:'MAT.5.1.2',taskFocus:'NAT_INVERSE_STEPS',presentation:'TEXT',sourceModel:'writer'};
const source=()=>JSON.parse(readFileSync(new URL('./fixtures/pipeline-reasoned-math-candidate.json',import.meta.url),'utf8'));
it('normal editor output reaches public-data proof without a second numeric model call',async()=>{
 const q=source(),before=JSON.stringify(q),run=vi.fn(async()=>({response:JSON.stringify({questions:[q]}),usage:{neurons:1}}));
 const env:any={AI:{run},QUESTION_TRANSACTION_PROOF_ENABLED:'true'};
 const edited=await editQuestionPacket(env,[q],context);
 expect(edited).toMatchObject({construction:'AI_SOURCE_WITH_DETERMINISTIC_STRATEGY_EDITOR',humanApproved:false});
 expect(JSON.stringify(q)).toBe(before);
 const proof=await independentlySolve(env,edited.questions[0],'reviewer',context);
 expect(proof).toMatchObject({ok:true,method:'DETERMINISTIC_TRANSACTION_BALANCE',keyHidden:true,solutionHidden:true});
 expect(run).toHaveBeenCalledTimes(1);
 expect(await independentlySolve(env,{...edited.questions[0],correctAnswer:'A'},'reviewer',context)).toMatchObject({ok:false,issues:['BLIND_ANSWER_DISAGREEMENT']});
});
it('does not repair unsupported scope, extra defects or a disabled feature',async()=>{
 for(const mode of ['disabled','grade','arithmetic']){
  const q=source();if(mode==='arithmetic')q.solutionText=q.solutionText.replace('759','758');
  const env:any={AI:{run:vi.fn(async()=>({response:JSON.stringify({questions:[q]})}))},QUESTION_TRANSACTION_PROOF_ENABLED:mode==='disabled'?'false':'true'};
  await expect(editQuestionPacket(env,[q],{...context,gradeLevel:mode==='grade'?6:5})).rejects.toThrow('EDITOR_OUTPUT_INVALID');
 }
});

it('keeps the independent final reviewer after formal arithmetic and respects its rejection',async()=>{
 const q=source(),run=vi.fn(async()=>({response:JSON.stringify({questions:[q]})}));
 const env:any={AI:{run},QUESTION_TRANSACTION_PROOF_ENABLED:'true',QUESTION_BLIND_SOLVE_ENABLED:'true',QUESTION_GENERATION_VERIFIER_MODEL:'reviewer'};
 const edited=await editQuestionPacket(env,[q],context);
 run.mockImplementation(async()=>({response:JSON.stringify({reviews:[{index:0,valid:true,issues:[],editorial:editorialScores}]})}));
 const result=await verifyQuestionDrafts(env,{...context,authorModels:['writer',edited.model],producerModel:edited.model,previousQuestions:[],previousDrafts:[],originalityCandidates:[]},edited.questions);
 expect(result.ok).toBe(true);expect(run).toHaveBeenCalledTimes(2);expect(run.mock.calls[1][0]).toBe('reviewer');
 run.mockImplementation(async()=>({response:JSON.stringify({reviews:[{index:0,valid:false,issues:['REASONING_WEAK'],editorial:editorialScores}]})}));
 expect((await verifyQuestionDrafts(env,{...context,producerModel:edited.model},edited.questions)).ok).toBe(false);
});
