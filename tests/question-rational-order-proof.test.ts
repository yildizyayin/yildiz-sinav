import {expect,it,vi} from 'vitest';
import spec from '../data/question-pilot-math7-curriculum.json';
import {rationalOrderEvidence} from '../worker/lib/question-rational-order-proof';
import {independentlySolve} from '../worker/lib/question-blind-solve';
import {verifyQuestionDrafts} from '../worker/lib/question-generation-validation';
import {editorialQuestion,editorialScores} from './fixtures/editorial-question';
const context={gradeLevel:7,outcomeCode:'MAT.7.1.3',outcomeTitle:spec.outcomes[2].title,taskFocus:'GENERIC'};
it('agrees with common-denominator order across signed pairs',()=>{
 for(let a=-8;a<=8;a++)for(let b=-8;b<=8;b++){
  const values=[3*a,2*b,1];if(new Set(values).size!==3)continue;
  const t=[`${a}/2`,`${b}/3`,'1/6'];const sorted=[0,1,2].sort((i,j)=>values[i]-values[j]);
  const q=question(t);q.options[0].text=sorted.map(i=>t[i]).join(' < ');
  const p=rationalOrderEvidence(q,context)!;expect(p.optionChecks[0].correct).toBe(true);
  for(const check of p.optionChecks){const ordered=q.options.find(o=>o.label===check.label)!.text.split(' < ').map(s=>values[t.indexOf(s)]);expect(check.correct).toBe(ordered[0]<ordered[1]&&ordered[1]<ordered[2]);}
 }
});
function question(tokens=['-1/2','2/3','-3/4']){return {stemText:`Verilen rasyonel sayılar: ${tokens.join(', ')}. Bu sayıların küçükten büyüğe doğru sıralaması hangisidir?`,options:[[0,1,2],[2,0,1],[1,0,2],[0,2,1]].map((p,i)=>({label:'ABCD'[i],text:p.map(j=>tokens[j]).join(' < ')}))};}
it('orders negative, zero, improper and close fractions without rounding',()=>{
 for(const t of [['-1/2','2/3','-3/4'],['0/7','5/2','-1/9'],['999998/999999','999999/999998','999997/999999']]){
  expect(rationalOrderEvidence(question(t),context)?.answer).toBe('B');
 }
});
it('checks all permutations against independently known negative-number order',()=>{
 const q=question(['-2/3','-1/3','-5/6']);
 q.options=[{label:'A',text:'-2/3 < -1/3 < -5/6'},{label:'B',text:'-1/3 < -5/6 < -2/3'},{label:'C',text:'-5/6 < -2/3 < -1/3'},{label:'D',text:'-5/6 < -1/3 < -2/3'}];
 expect(rationalOrderEvidence(q,context)?.answer).toBe('C');
});
it('fails closed on zero denominators, equivalent values, changed source sets and extra prose',()=>{
 for(const t of [['1/0','1/2','3/4'],['1/2','2/4','3/4'],['1/-2','2/3','3/4']])expect(rationalOrderEvidence(question(t),context)).toBeNull();
 const q=question();expect(rationalOrderEvidence({...q,stemText:q.stemText+' Ek koşul.'},context)).toBeNull();q.options[0].text='-1/2 < 2/3 < -4/5';expect(rationalOrderEvidence(q,context)).toBeNull();
 expect(rationalOrderEvidence(question(),{...context,outcomeTitle:'wrong'})).toBeNull();
});
it('reports multiple and no correct choices',()=>{
 const q=question();q.options[0].text=q.options[1].text;expect(rationalOrderEvidence(q,context)?.answer).toBe('MULTIPLE');
 q.options[0].text=q.options[2].text;q.options[1].text=q.options[2].text;expect(rationalOrderEvidence(q,context)?.answer).toBe('NONE');
});
it('never reads a private key or solution to construct proof',()=>{
 const q=question();for(const k of ['correctAnswer','solutionText'])Object.defineProperty(q,k,{get:()=>{throw Error('private access');}});expect(rationalOrderEvidence(q,context)?.answer).toBe('B');
});
it('dispatches a bounded proof but retains the unsupported-scope gate for other questions',async()=>{
 const run=vi.fn(),env:any={AI:{run}},q:any={...question(),correctAnswer:'B',solutionText:'not evidence',editorial:{visual:{kind:'NONE'}}};
 expect(await independentlySolve(env,q,'model',context)).toMatchObject({ok:true,method:'DETERMINISTIC_RATIONAL_ORDER'});
 expect(await independentlySolve(env,{...q,correctAnswer:'A'},'model',context)).toMatchObject({ok:false,issues:['BLIND_ANSWER_DISAGREEMENT']});
 expect(await independentlySolve(env,{...q,stemText:'Başka soru'},'model',context)).toMatchObject({ok:false,issues:['BLIND_PROOF_SCOPE_UNSUPPORTED']});expect(run).not.toHaveBeenCalled();
});
it('does not bypass the final independent editorial review',async()=>{
 const q:any={...editorialQuestion(),...question(),correctAnswer:'B',solutionText:'Negatif sayılar pozitif sayıdan küçüktür. Negatif kesirler karşılaştırıldığında -3/4 < -1/2 < 2/3 bulunur.'};
 q.editorial.visual={kind:'NONE',title:'',unit:'',columns:[],rows:[],categories:[],values:[],readingPurpose:''};q.editorial.distractors=q.editorial.distractors.map((d:any,i:number)=>({...d,label:['A','C','D'][i]}));
 const run=vi.fn(async()=>({response:JSON.stringify({reviews:[{index:0,valid:false,issues:['DISTRACTOR_QUALITY_INSUFFICIENT'],editorial:editorialScores}]})}));
 const r=await verifyQuestionDrafts({AI:{run},QUESTION_BLIND_SOLVE_ENABLED:'true',QUESTION_GENERATION_VERIFIER_MODEL:'reviewer'} as any,{...context,qualityProfile:'EDITORIAL_V1',presentation:'TEXT',producerModel:'writer'},[q]);
 expect(r.ok).toBe(false);expect(r.blindSolves[0]).toMatchObject({ok:true,method:'DETERMINISTIC_RATIONAL_ORDER'});expect(run).toHaveBeenCalledTimes(1);
});
