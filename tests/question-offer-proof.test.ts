import {expect,it,vi} from 'vitest';
import {offerComparisonEvidence} from '../worker/lib/question-offer-proof';
import {verifyQuestionDrafts} from '../worker/lib/question-generation-validation';
import {editorialQuestion,editorialScores} from './fixtures/editorial-question';
import {independentlySolve} from '../worker/lib/question-blind-solve';
const context={gradeLevel:5,outcomeCode:'MAT.5.1.2',taskFocus:'NAT_COMPARE_OFFERS'};
function question(quantity=12,priceA=18,feeA=35,priceB=20,feeB=5,budget?:number){
 const a=quantity*priceA+feeA,b=quantity*priceB+feeB,target=budget===undefined?Math.abs(a-b):budget-Math.min(a,b);
 return {stemText:`Bir okul ${quantity} adet kalem almak istiyor. A satıcısında bir kalem ${priceA} TL, teslimat ücreti ${feeA} TL'dir. B satıcısında bir kalem ${priceB} TL, teslimat ücreti ${feeB} TL'dir. Teslimat ücreti her sipariş için yalnız bir kez alınır. ${budget===undefined?'Aynı miktar için daha ucuz teklif seçilirse kaç TL tasarruf edilir?':`Okulun bütçesi ${budget} TL'dir. Aynı miktar için daha ucuz teklif seçilirse bütçeden kaç TL kalır?`}`,options:[{label:'A',text:String(target+1)},{label:'B',text:String(target+2)},{label:'C',text:String(target)},{label:'D',text:String(target+3)}]};
}
it('compares full delivered totals, rather than the cheaper unit price',()=>{
 const q=question(),proof=offerComparisonEvidence(q,context)!;
 expect(proof.answer).toBe('C');expect(proof.calculations).toEqual([{left:12,op:'MUL',right:18,result:216},{left:12,op:'MUL',right:20,result:240},{left:216,op:'ADD',right:35,result:251},{left:240,op:'ADD',right:5,result:245},{left:251,op:'SUB',right:245,result:6}]);
});
it('computes remaining budget and allows an exact zero balance',()=>{
 for(const budget of [245,300]){const p=offerComparisonEvidence(question(12,18,35,20,5,budget),context)!;expect(p.answer).toBe('C');expect(p.calculations.at(-1)?.result).toBe(budget-245);}
});
it('uses an independent integer oracle across unseen inputs and rotated labels',()=>{
 for(let i=1;i<=60;i++){
  const quantity=i+1,a=i%9+3,b=i%7+11,fa=i*3,fb=i;
  const totalA=BigInt(quantity)*BigInt(a)+BigInt(fa),totalB=BigInt(quantity)*BigInt(b)+BigInt(fb);if(totalA===totalB)continue;
  const q=question(quantity,a,fa,b,fb);q.options=q.options.map((o,j)=>({...o,label:String.fromCharCode(65+(j+i)%4)}));
  const proof=offerComparisonEvidence(q,context)!;expect(proof.answer).toBe(q.options[2].label);expect(BigInt(proof.calculations.at(-1)!.result)).toBe(totalA>totalB?totalA-totalB:totalB-totalA);
 }
});
it('cannot read the answer key or worked solution as proof input',()=>{
 const q=question();for(const key of ['correctAnswer','solutionText','editorial'])Object.defineProperty(q,key,{get:()=>{throw Error('Private field read');}});
 expect(offerComparisonEvidence(q,context)?.answer).toBe('C');
});
it('returns NONE and MULTIPLE for invalid answer sets',()=>{
 const q=question();q.options[2].text='999';expect(offerComparisonEvidence(q,context)?.answer).toBe('NONE');
 q.options[2].text='6';q.options[0].text='6';expect(offerComparisonEvidence(q,context)?.answer).toBe('MULTIPLE');
});
it('refuses equal offers, insufficient funds and source-specific operand boundaries',()=>{
 expect(offerComparisonEvidence(question(12,18,0,18,0),context)).toBeNull();
 expect(offerComparisonEvidence(question(12,18,35,20,5,244),context)).toBeNull();
 for(const q of [question(0),question(1000),question(12,1000),question(12,18,100000),question(999,999),question(12,18,35,20,5,100000)])expect(offerComparisonEvidence(q,context)).toBeNull();
 expect(offerComparisonEvidence(question(999,1,0,2,0),context)?.answer).toBe('C');
});
it('rejects unrecognized facts, discounts, malformed options, visuals and unverified scope',()=>{
 const q=question();expect(offerComparisonEvidence({...q,stemText:q.stemText+' Ancak yüzde 10 indirim vardır.'},context)).toBeNull();
 expect(offerComparisonEvidence({...q,stemText:q.stemText.replace('yalnız bir kez','her kalem için')},context)).toBeNull();
 expect(offerComparisonEvidence({...q,options:q.options.map(o=>({...o,text:o.text+' TL'}))},context)).toBeNull();
 expect(offerComparisonEvidence({...q,options:q.options.map(o=>({...o,label:'A'}))},context)).toBeNull();
 for(const changed of [{gradeLevel:6},{outcomeCode:'MAT.5.1.1'},{taskFocus:'GENERIC'}])expect(offerComparisonEvidence(q,{...context,...changed})).toBeNull();
});
it('normal solver uses the enabled proof, compares the hidden key afterwards and otherwise retains AI routing',async()=>{
 const run=vi.fn(async()=>({response:'{}'})),env:any={AI:{run},QUESTION_OFFER_PROOF_ENABLED:'true'},q:any={...question(),correctAnswer:'C',solutionText:'not a proof',editorial:{visual:{kind:'NONE'}}};
 expect(await independentlySolve(env,q,'reviewer',context)).toMatchObject({ok:true,method:'DETERMINISTIC_OFFER_COMPARISON',model:null,keyHidden:true,solutionHidden:true});expect(run).not.toHaveBeenCalled();
 expect(await independentlySolve(env,{...q,correctAnswer:'A'},'reviewer',context)).toMatchObject({ok:false,issues:['BLIND_ANSWER_DISAGREEMENT']});expect(run).not.toHaveBeenCalled();
 await independentlySolve({...env,QUESTION_OFFER_PROOF_ENABLED:'false'},q,'reviewer',context);expect(run).toHaveBeenCalledTimes(1);
 await independentlySolve(env,{...q,editorial:{visual:{kind:'TABLE',rows:[]}}},'reviewer',context);expect(run).toHaveBeenCalledTimes(2);
});

it('formal offer arithmetic does not bypass the final editorial reviewer',async()=>{
 const base=editorialQuestion(),q:any={...base,...question(),correctAnswer:'C',solutionText:'12 × 18 = 216; 216 + 35 = 251. 12 × 20 = 240; 240 + 5 = 245. 251 − 245 = 6. Doğru seçenek C) 6.'};
 q.editorial.visual={kind:'NONE',title:'',unit:'',columns:[],rows:[],categories:[],values:[],readingPurpose:''};
 q.editorial.distractors=q.editorial.distractors.map((d:any,i:number)=>({...d,label:['A','B','D'][i]}));
 const run=vi.fn(async()=>({response:JSON.stringify({reviews:[{index:0,valid:false,issues:['DISTRACTOR_QUALITY_INSUFFICIENT'],editorial:editorialScores}]})}));
 const result=await verifyQuestionDrafts({AI:{run},QUESTION_OFFER_PROOF_ENABLED:'true',QUESTION_BLIND_SOLVE_ENABLED:'true',QUESTION_GENERATION_VERIFIER_MODEL:'reviewer'} as any,{...context,qualityProfile:'EDITORIAL_V1',presentation:'TEXT',producerModel:'writer'},[q]);
 expect(result.ok).toBe(false);expect(result.blindSolves[0]).toMatchObject({ok:true,method:'DETERMINISTIC_OFFER_COMPARISON'});expect(run).toHaveBeenCalledTimes(1);
});
