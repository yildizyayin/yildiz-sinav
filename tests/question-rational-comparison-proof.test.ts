import {expect,it,vi} from 'vitest';
import spec from '../data/question-pilot-math7-curriculum.json';
import {rationalComparisonEvidence} from '../worker/lib/question-rational-comparison-proof';
import {independentlySolve} from '../worker/lib/question-blind-solve';
import {verifyQuestionDrafts} from '../worker/lib/question-generation-validation';
import {editorialQuestion,editorialScores} from './fixtures/editorial-question';
const context={gradeLevel:7,outcomeCode:'MAT.7.1.3',outcomeTitle:spec.outcomes[2].title,taskFocus:'GENERIC'};
function question(a=-1,b=2,c=-1,d=3){
 const left=a*d,right=c*b,rel=left<right?'<':left>right?'>':'=',wrong=rel==='<'?'>':'<';
 const claim=(l:number,r:number,s:string)=>`A ve B için çapraz çarpımlar sırasıyla ${l} ve ${r} olduğundan A ${s} B.`;
 return {stemText:`A = ${a}/${b} ve B = ${c}/${d} olarak verilmiştir. Çapraz çarpımlar A için birinci pay ile ikinci payda, B için ikinci pay ile birinci payda çarpılarak bulunur. Hangi karşılaştırma gerekçesiyle birlikte doğrudur?`,options:[{label:'A',text:claim(left+1,right,rel)},{label:'B',text:claim(left,right,wrong)},{label:'C',text:claim(left,right,rel)},{label:'D',text:claim(left,right+1,wrong)}]};
}
it('checks products and signed order against a common-denominator oracle',()=>{
 for(let a=-12;a<=12;a++)for(let c=-12;c<=12;c++){
  const p=rationalComparisonEvidence(question(a,2,c,3),context)!;
  expect(p.answer).toBe('C');expect(p.optionChecks.map(o=>o.correct)).toEqual([false,false,true,false]);
  expect(p.witness.relation).toBe(3*a<2*c?'<':3*a>2*c?'>':'=');
 }
});
it('supports equal values, zero and bounded large cross products',()=>{
 for(const input of [[0,2,0,3],[-2,4,-1,2],[999998,999999,999999,999998],[-999999,999998,999998,999999]])expect(rationalComparisonEvidence(question(...input as [number,number,number,number]),context)?.answer).toBe('C');
});
it('rejects a true conclusion with a false calculation',()=>{
 const q=question();q.options[2].text=q.options[0].text;expect(rationalComparisonEvidence(q,context)?.answer).toBe('NONE');
});
it('reports ambiguous choices rather than trusting a key',()=>{
 const q=question();q.options[0].text=q.options[2].text;expect(rationalComparisonEvidence(q,context)?.answer).toBe('MULTIPLE');
 for(const k of ['correctAnswer','solutionText','editorial'])Object.defineProperty(q,k,{get:()=>{throw Error('Private field');}});expect(rationalComparisonEvidence(q,context)?.answer).toBe('MULTIPLE');
});
it('does not guess unsupported grammar, denominators, labels or outcome bindings',()=>{
 const q=question();for(const stemText of [question(1,0).stemText,question(1,-2).stemText,question(1000000).stemText,q.stemText+' Ek koşul.'])expect(rationalComparisonEvidence({...q,stemText},context)).toBeNull();
 expect(rationalComparisonEvidence({...q,options:q.options.map(o=>({...o,label:'A'}))},context)).toBeNull();
 expect(rationalComparisonEvidence({...q,options:q.options.map(o=>({...o,text:o.text+' Başka iddia.'}))},context)).toBeNull();
 for(const patch of [{gradeLevel:8},{outcomeCode:'MAT.7.1.4'},{outcomeTitle:'invented'},{taskFocus:'OTHER'}])expect(rationalComparisonEvidence(q,{...context,...patch})).toBeNull();
});
it('compares the key afterwards and never calls AI for proof or unsupported grammar',async()=>{
 const run=vi.fn(),q:any={...question(),correctAnswer:'C',solutionText:'not evidence',editorial:{visual:{kind:'NONE'}}};
 expect(await independentlySolve({AI:{run}} as any,q,'model',context)).toMatchObject({ok:true,method:'DETERMINISTIC_RATIONAL_COMPARISON'});
 expect(await independentlySolve({AI:{run}} as any,{...q,correctAnswer:'A'},'model',context)).toMatchObject({ok:false,issues:['BLIND_ANSWER_DISAGREEMENT']});
 expect(await independentlySolve({AI:{run}} as any,{...q,stemText:'Other'},'model',context)).toMatchObject({ok:false,issues:['BLIND_PROOF_SCOPE_UNSUPPORTED']});expect(run).not.toHaveBeenCalled();
});
it('retains independent editorial rejection after mathematical success',async()=>{
 const q:any={...editorialQuestion(),...question(),correctAnswer:'C',solutionText:'Paydalar pozitiftir. Birinci çapraz çarpım -3, ikinci çapraz çarpım -2 olur; -3 < -2 olduğu için A < B.'};
 q.editorial.visual={kind:'NONE',title:'',unit:'',columns:[],rows:[],categories:[],values:[],readingPurpose:''};q.editorial.distractors=q.editorial.distractors.map((d:any,i:number)=>({...d,label:['A','B','D'][i]}));
 const run=vi.fn(async()=>({response:JSON.stringify({reviews:[{index:0,valid:false,issues:['DISTRACTOR_QUALITY_INSUFFICIENT'],editorial:editorialScores}]})}));
 const r=await verifyQuestionDrafts({AI:{run},QUESTION_BLIND_SOLVE_ENABLED:'true',QUESTION_GENERATION_VERIFIER_MODEL:'reviewer'} as any,{...context,qualityProfile:'EDITORIAL_V1',presentation:'TEXT',producerModel:'writer'},[q]);
 expect(r.ok).toBe(false);expect(r.blindSolves[0]).toMatchObject({ok:true,method:'DETERMINISTIC_RATIONAL_COMPARISON'});expect(run).toHaveBeenCalledTimes(1);
});
