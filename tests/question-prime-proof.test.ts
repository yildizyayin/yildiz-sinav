import {expect,it,vi} from 'vitest';
import spec from '../data/question-pilot-math6-curriculum.json';
import {primeFactorEvidence,validPrimeCertificate} from '../worker/lib/question-prime-proof';
import {independentlySolve} from '../worker/lib/question-blind-solve';
import {verifyQuestionDrafts} from '../worker/lib/question-generation-validation';
import {editorialQuestion,editorialScores} from './fixtures/editorial-question';
const context={gradeLevel:6,outcomeCode:'MAT.6.1.3',outcomeTitle:spec.outcomes[2].title,taskFocus:'GENERIC'};
const sieve=new Uint8Array(1000000);sieve.fill(1,2);for(let p=2;p*p<sieve.length;p++)if(sieve[p])for(let k=p*p;k<sieve.length;k+=p)sieve[k]=0;
const oracle=(n:number)=>Array.from({length:n+1},(_,i)=>i).filter(p=>sieve[p]&&n%p===0);
const statement=(n:number,factors:number[])=>n===1?'Asal değildir; asal çarpanı yoktur.':factors.length===1?`${sieve[n]?'Asaldır':'Asal değildir'}; tek asal çarpanı ${factors[0]} sayısıdır.`:`Asal değildir; farklı asal çarpanları yalnızca ${factors.slice(0,-1).join(', ')} ve ${factors.at(-1)} sayılarıdır.`;
function question(n=60){return {stemText:`${n} sayısının asal olma durumu ve asal çarpanları hakkında aşağıdaki açıklamalardan hangisi doğrudur?`,options:[{label:'A',text:'Asaldır; tek asal çarpanı 1 sayısıdır.'},{label:'B',text:'Asal değildir; tek asal çarpanı 1 sayısıdır.'},{label:'C',text:statement(n,oracle(n))},{label:'D',text:'Asal değildir; farklı asal çarpanları yalnızca 2 ve 2 sayılarıdır.'}]};}
it('matches an independent sieve for 1–1000, with label permutations',()=>{
 for(let n=1;n<=1000;n++){const q=question(n);q.options=q.options.map((o,i)=>({...o,label:String.fromCharCode(65+(i+n)%4)}));const p=primeFactorEvidence(q,context)!;expect(p.proof.answer).toBe(q.options[2].label);expect(p.derivation.certificate.factors.map(f=>f.prime)).toEqual(oracle(n));expect(validPrimeCertificate(p.derivation.certificate)).toBe(true);}
});
it('handles prime squares, prime powers, upper-range primes, composites and seven distinct prime factors',()=>{
 for(const n of [49,121,169,524288,510510,999983,999999]){const p=primeFactorEvidence(question(n),context)!;expect(p.proof.answer).toBe('C');expect(p.derivation.certificate.factors.map(f=>f.prime)).toEqual(oracle(n));}
});
it('validates complete exact prime-power certificates and refuses forged or oversized witnesses',()=>{
 expect(validPrimeCertificate({number:60,factors:[{prime:2,exponent:2},{prime:3,exponent:1},{prime:5,exponent:1}]})).toBe(true);
 expect(validPrimeCertificate({number:1,factors:[]})).toBe(true);
 for(const c of [{number:0,factors:[]},{number:60,factors:[{prime:2,exponent:2},{prime:3,exponent:1}]},{number:36,factors:[{prime:6,exponent:2}]},{number:4,factors:[{prime:2,exponent:1},{prime:2,exponent:1}]},{number:2,factors:[{prime:9007199254740881,exponent:1}]},{number:2,factors:[{prime:2,exponent:1000000}]},{number:6,factors:[{prime:3,exponent:1},{prime:2,exponent:1}]}])expect(validPrimeCertificate(c)).toBe(false);
});
it('rejects incomplete, duplicate and nonprime lists even with a correct composite conclusion',()=>{
 for(const text of ['Asal değildir; farklı asal çarpanları yalnızca 2 ve 3 sayılarıdır.','Asal değildir; farklı asal çarpanları yalnızca 2, 3, 5 ve 6 sayılarıdır.','Asaldır; tek asal çarpanı 60 sayısıdır.']){const q=question(60);q.options[2].text=text;expect(primeFactorEvidence(q,context)?.proof.answer).toBe('NONE');}
 const q=question(60);q.options[0].text=q.options[2].text;expect(primeFactorEvidence(q,context)?.proof.answer).toBe('MULTIPLE');
});
it('can reorder a complete distinct factor list without changing its mathematical meaning',()=>{
 const q=question(60);q.options[2].text='Asal değildir; farklı asal çarpanları yalnızca 5, 2 ve 3 sayılarıdır.';expect(primeFactorEvidence(q,context)?.proof.answer).toBe('C');
});
it('reads only public fields and refuses unsupported context, extra facts and application bounds',()=>{
 const q=question(60);for(const key of ['correctAnswer','solutionText','editorial'])Object.defineProperty(q,key,{get:()=>{throw Error('Private field read');}});expect(primeFactorEvidence(q,context)?.proof.answer).toBe('C');
 expect(primeFactorEvidence({...q,stemText:q.stemText+' Ayrıca sayıya 1 eklenmiştir.'},context)).toBeNull();
 for(const n of [0,1000000])expect(primeFactorEvidence({...q,stemText:q.stemText.replace('60',String(n))},context)).toBeNull();
 for(const patch of [{gradeLevel:5},{outcomeTitle:'invented'},{outcomeCode:'MAT.6.1.4'},{taskFocus:'NAT_INVERSE_STEPS'}])expect(primeFactorEvidence(q,{...context,...patch})).toBeNull();
 expect(primeFactorEvidence({...q,options:q.options.map((o,i)=>({...o,label:['','AB','C','D'][i]}))},context)).toBeNull();
});
it('normal dispatcher preserves the certificate, makes no numeric model call and still checks the hidden key',async()=>{
 const run=vi.fn(async()=>({response:'{}'})),env:any={AI:{run},QUESTION_MATH6_PROOF_ENABLED:'true'},q:any={...question(),correctAnswer:'C',solutionText:'not evidence',editorial:{visual:{kind:'NONE'}}};
 expect(await independentlySolve(env,q,'reviewer',context)).toMatchObject({ok:true,method:'DETERMINISTIC_PRIME_FACTOR_REASONING',model:null,keyHidden:true,solutionHidden:true,derivation:{kind:'EXACT_PRIME_POWER_CERTIFICATE',verified:true,certificate:{number:60}}});expect(run).not.toHaveBeenCalled();
 expect(await independentlySolve(env,{...q,correctAnswer:'A'},'reviewer',context)).toMatchObject({ok:false,issues:['BLIND_ANSWER_DISAGREEMENT']});expect(run).not.toHaveBeenCalled();
 await independentlySolve({...env,QUESTION_MATH6_PROOF_ENABLED:'false'},q,'reviewer',context);expect(run).toHaveBeenCalledTimes(1);
});
it('keeps final independent editorial rejection after a valid prime factor proof',async()=>{
 const base=editorialQuestion(),q:any={...base,...question(),correctAnswer:'C',solutionText:'60 sayısı asal değildir. Farklı asal çarpanları 2, 3 ve 5 sayılarıdır. Doğru seçenek C.'};q.editorial.visual={kind:'NONE',title:'',unit:'',columns:[],rows:[],categories:[],values:[],readingPurpose:''};q.editorial.distractors=q.editorial.distractors.map((d:any,i:number)=>({...d,label:['A','B','D'][i]}));
 const run=vi.fn(async()=>({response:JSON.stringify({reviews:[{index:0,valid:false,issues:['DISTRACTOR_QUALITY_INSUFFICIENT'],editorial:editorialScores}]})}));const r=await verifyQuestionDrafts({AI:{run},QUESTION_MATH6_PROOF_ENABLED:'true',QUESTION_BLIND_SOLVE_ENABLED:'true',QUESTION_GENERATION_VERIFIER_MODEL:'reviewer'} as any,{...context,qualityProfile:'EDITORIAL_V1',presentation:'TEXT',producerModel:'writer'},[q]);
 expect(r.ok).toBe(false);expect(r.blindSolves[0]).toMatchObject({ok:true,method:'DETERMINISTIC_PRIME_FACTOR_REASONING'});expect(run).toHaveBeenCalledTimes(1);
});
