import {expect,it,vi} from 'vitest';
import spec from '../data/question-pilot-math6-curriculum.json';
import {divisibilityEvidence} from '../worker/lib/question-divisibility-proof';
import {independentlySolve} from '../worker/lib/question-blind-solve';
import {verifyQuestionDrafts} from '../worker/lib/question-generation-validation';
import {editorialQuestion,editorialScores} from './fixtures/editorial-question';
const context={gradeLevel:6,outcomeCode:'MAT.6.1.2',outcomeTitle:spec.outcomes[1].title,taskFocus:'GENERIC'};
const stem=(n:number)=>`${n} sayısının 2, 3, 4, 5, 6, 9 ve 10 ile bölünebilmesi hakkında aşağıdaki gerekçeli açıklamalardan hangisi doğrudur?`;
function claim(n:number,d:number,divisible:boolean,facts=true){
 const word=divisible?'bölünür':'bölünmez',sum=[...String(n)].reduce((s,d)=>s+Number(d),0);
 if(d===3||d===9)return `Rakamları toplamı ${sum+(facts?0:1)} olduğundan ${d} ile tam ${word}.`;
 if(d===4)return `Son iki basamağının oluşturduğu sayı ${(n%100+(facts?0:1))%100} olduğundan 4 ile tam ${word}.`;
 if(d===6)return `Birler basamağı ${n%10} ve rakamları toplamı ${sum+(facts?0:1)} olduğundan 6 ile tam ${word}.`;
 return `Birler basamağı ${(n%10+(facts?0:1))%10} olduğundan ${d} ile tam ${word}.`;
}
function question(n=742,d=3){const divides=BigInt(n)%BigInt(d)===0n;return {stemText:stem(n),options:[{label:'A',text:claim(n,d,divides,false)},{label:'B',text:claim(n,d,!divides)},{label:'C',text:claim(n,d,divides)},{label:'D',text:claim(n,d,!divides,false)}]};}
it('checks every official divisor against an independent BigInt oracle and rotated labels',()=>{
 for(const n of [10,11,12,20,24,25,30,36,40,45,50,60,72,90,99,100,101,108,120,144,180,225,360,742,999,1000,1001,999999])for(const d of [2,3,4,5,6,9,10]){
  const q=question(n,d);q.options=q.options.map((o,i)=>({...o,label:String.fromCharCode(65+(i+n)%4)}));const p=divisibilityEvidence(q,context)!;
  expect(p.answer).toBe(q.options[2].label);expect(p.optionChecks.map(o=>o.correct)).toEqual([false,false,true,false]);expect(p.calculations).toEqual([{left:n,op:'DIV',right:d,result:n/d}]);
 }
});
it('rejects an incorrect reason even when its divisibility conclusion is true',()=>{
 const q=question(120,3);q.options[2].text='Rakamları toplamı 6 olduğundan 3 ile tam bölünür.';expect(divisibilityEvidence(q,context)?.answer).toBe('NONE');
 const six=question(12,6);six.options[2].text='Birler basamağı 2 ve rakamları toplamı 6 olduğundan 6 ile tam bölünür.';expect(divisibilityEvidence(six,context)?.answer).toBe('NONE');
});
it('checks several different criteria inside one actual question',()=>{
 const q={stemText:stem(742),options:[{label:'A',text:claim(742,2,false)},{label:'B',text:claim(742,4,true)},{label:'C',text:claim(742,3,false)},{label:'D',text:claim(742,10,true)}]};
 const p=divisibilityEvidence(q,context)!;expect(p.answer).toBe('C');expect(p.calculations.map(s=>s.right)).toEqual([2,4,3,10]);
});
it('does not read private key, solution or editorial metadata',()=>{
 const q=question();for(const key of ['correctAnswer','solutionText','editorial'])Object.defineProperty(q,key,{get:()=>{throw Error('Private field accessed');}});
 expect(divisibilityEvidence(q,context)?.answer).toBe('C');
});
it('detects multiple correct explanations instead of selecting the stored key',()=>{
 const q=question();q.options[0].text=q.options[2].text;expect(divisibilityEvidence(q,context)?.answer).toBe('MULTIPLE');
});
it('does not guess unsupported facts, grammar, number bounds or curriculum context',()=>{
 const q=question();for(const text of [q.stemText+' Ayrıca sayı 100 artırılmıştır.',stem(1000000),stem(0),stem(9)])expect(divisibilityEvidence({...q,stemText:text},context)).toBeNull();
 expect(divisibilityEvidence({...q,options:q.options.map(o=>({...o,text:o.text.replace('3 ile','7 ile')}))},context)).toBeNull();
 expect(divisibilityEvidence({...q,options:q.options.map(o=>({...o,label:'A'}))},context)).toBeNull();
 for(const patch of [{gradeLevel:5},{outcomeCode:'MAT.6.1.3'},{outcomeTitle:'invented'},{taskFocus:'NAT_INVERSE_STEPS'}])expect(divisibilityEvidence(q,{...context,...patch})).toBeNull();
});
it('uses the normal blind-solve dispatcher without a numeric model call and compares the key afterwards',async()=>{
 const run=vi.fn(async()=>({response:'{}'})),env:any={AI:{run},QUESTION_MATH6_PROOF_ENABLED:'true'},q:any={...question(),correctAnswer:'C',solutionText:'not evidence',editorial:{visual:{kind:'NONE'}}};
 expect(await independentlySolve(env,q,'reviewer',context)).toMatchObject({ok:true,method:'DETERMINISTIC_DIVISIBILITY_REASONING',keyHidden:true,solutionHidden:true,model:null});expect(run).not.toHaveBeenCalled();
 expect(await independentlySolve(env,{...q,correctAnswer:'A'},'reviewer',context)).toMatchObject({ok:false,issues:['BLIND_ANSWER_DISAGREEMENT']});expect(run).not.toHaveBeenCalled();
 await independentlySolve({...env,QUESTION_MATH6_PROOF_ENABLED:'false'},q,'reviewer',context);expect(run).toHaveBeenCalledTimes(1);
});
it('keeps final independent editorial rejection after a correct mathematical proof',async()=>{
 const base=editorialQuestion(),q:any={...base,...question(),correctAnswer:'C',solutionText:'742 sayısının rakamları toplamı 13 olur. 742 sayısı 3 ile tam bölünmez. Doğru seçenek C.'};
 q.editorial.visual={kind:'NONE',title:'',unit:'',columns:[],rows:[],categories:[],values:[],readingPurpose:''};q.editorial.distractors=q.editorial.distractors.map((d:any,i:number)=>({...d,label:['A','B','D'][i]}));
 const run=vi.fn(async()=>({response:JSON.stringify({reviews:[{index:0,valid:false,issues:['DISTRACTOR_QUALITY_INSUFFICIENT'],editorial:editorialScores}]})}));
 const r=await verifyQuestionDrafts({AI:{run},QUESTION_MATH6_PROOF_ENABLED:'true',QUESTION_BLIND_SOLVE_ENABLED:'true',QUESTION_GENERATION_VERIFIER_MODEL:'reviewer'} as any,{...context,qualityProfile:'EDITORIAL_V1',presentation:'TEXT',producerModel:'writer'},[q]);
 expect(r.ok).toBe(false);expect(r.blindSolves[0]).toMatchObject({ok:true,method:'DETERMINISTIC_DIVISIBILITY_REASONING'});expect(run).toHaveBeenCalledTimes(1);
});
