import {expect,it,vi} from 'vitest';
import spec from '../data/question-pilot-math6-curriculum.json';
import {factorRelationEvidence,validDivisionRelation} from '../worker/lib/question-factor-relation-proof';
import {independentlySolve} from '../worker/lib/question-blind-solve';
import {verifyQuestionDrafts} from '../worker/lib/question-generation-validation';
import {editorialQuestion,editorialScores} from './fixtures/editorial-question';
const context=(common=false)=>({gradeLevel:6,outcomeCode:common?'MAT.6.1.4':'MAT.6.1.1',outcomeTitle:spec.outcomes[common?3:0].title,taskFocus:'GENERIC'});
const singleStem=(n:number)=>`${n} sayısının çarpanları ve pozitif katları hakkında aşağıdaki gerekçeli açıklamalardan hangisi doğrudur?`;
const commonStem=(a:number,b:number)=>`${a} ve ${b} sayılarının ortak bölenleri ve pozitif ortak katları hakkında aşağıdaki gerekçeli açıklamalardan hangisi doğrudur?`;
function packet(stemText:string,claim:(offset:number)=>string){return {stemText,options:[{label:'A',text:claim(1)},{label:'B',text:claim(2)},{label:'C',text:claim(0)},{label:'D',text:claim(3)}]};}
function single(n:number,x:number,multiple=false){const dividend=BigInt(multiple?x:n),divisor=BigInt(multiple?n:x),q=Number(dividend/divisor),r=Number(dividend%divisor);return packet(singleStem(n),offset=>multiple?r?`${x} sayısı, ${n} sayısının pozitif bir katı değildir; ${x} sayısının ${n} ile bölümünden kalan ${r+offset} olur.`:`${x} sayısı, ${n} sayısının pozitif bir katıdır; ${x} = ${n} × ${q+offset}.`:r?`${x} sayısı, ${n} sayısının bir çarpanı değildir; ${n} sayısının ${x} ile bölümünden kalan ${r+offset} olur.`:`${x} sayısı, ${n} sayısının bir çarpanıdır; ${n} = ${x} × ${q+offset}.`);}
function common(a:number,b:number,x:number,multiple=false){
 const da=BigInt(multiple?x:a),db=BigInt(multiple?x:b),va=BigInt(multiple?a:x),vb=BigInt(multiple?b:x),qa=Number(da/va),qb=Number(db/vb),ra=Number(da%va),rb=Number(db%vb);
 return packet(commonStem(a,b),offset=>multiple?(ra||rb)?`${x} sayısı ortak kat değildir; ${x} sayısının ${ra?a:b} ile bölümünden kalan ${(ra||rb)+offset} olur.`:`${x} sayısı her ikisinin de pozitif katıdır; ${x} = ${a} × ${qa+offset} ve ${x} = ${b} × ${qb}.`:(ra||rb)?`${x} sayısı ortak bölen değildir; ${ra?a:b} sayısının ${x} ile bölümünden kalan ${(ra||rb)+offset} olur.`:`${x} sayısı her ikisinin de bölenidir; ${a} = ${x} × ${qa+offset} ve ${b} = ${x} × ${qb}.`);
}
it('checks factor and positive-multiple claims against independent BigInt division across 2400 cases',()=>{
 for(let n=1;n<=30;n++)for(let x=1;x<=40;x++)for(const mode of [false,true]){const q=single(n,x,mode);q.options=q.options.map((o,i)=>({...o,label:String.fromCharCode(65+(i+n)%4)}));const p=factorRelationEvidence(q,context())!;expect(p.proof.answer).toBe(q.options[2].label);expect(p.derivation.relations.every(validDivisionRelation)).toBe(true);}
});
it('checks both numbers of common-factor/multiple claims across 1944 BigInt cases',()=>{
 for(let a=1;a<=9;a++)for(let b=1;b<=9;b++)for(let x=1;x<=12;x++)for(const mode of [false,true]){const p=factorRelationEvidence(common(a,b,x,mode),context(true))!;expect(p.proof.answer).toBe('C');expect(p.derivation.relations.every(validDivisionRelation)).toBe(true);}
});
it('accepts reversed public equation order but rejects a true claim about an unrelated number',()=>{
 const q=common(12,18,6);q.options[2].text='6 sayısı her ikisinin de bölenidir; 18 = 6 × 3 ve 12 = 6 × 2.';expect(factorRelationEvidence(q,context(true))?.proof.answer).toBe('C');
 const m=common(12,18,36,true);m.options[2].text='36 sayısı her ikisinin de pozitif katıdır; 36 = 18 × 2 ve 36 = 12 × 3.';expect(factorRelationEvidence(m,context(true))?.proof.answer).toBe('C');
 q.options[2].text='6 sayısı her ikisinin de bölenidir; 12 = 6 × 2 ve 24 = 6 × 4.';expect(factorRelationEvidence(q,context(true))?.proof.answer).toBe('NONE');
});
it('requires both common relations and the actual remainder, not just the claimed conclusion',()=>{
 const q=common(12,18,4);q.options[2].text='4 sayısı her ikisinin de bölenidir; 12 = 4 × 3 ve 18 = 4 × 4.';expect(factorRelationEvidence(q,context(true))?.proof.answer).toBe('NONE');
 q.options[2].text='4 sayısı ortak bölen değildir; 18 sayısının 4 ile bölümünden kalan 1 olur.';expect(factorRelationEvidence(q,context(true))?.proof.answer).toBe('NONE');
 const m=common(12,18,24,true);m.options[2].text='24 sayısı her ikisinin de pozitif katıdır; 24 = 12 × 2 ve 24 = 18 × 2.';expect(factorRelationEvidence(m,context(true))?.proof.answer).toBe('NONE');
});
it('checks exact integer identities and rejects invalid certificates',()=>{
 expect(validDivisionRelation({dividend:18,divisor:4,quotient:4,remainder:2})).toBe(true);
 for(const r of [{dividend:18,divisor:4,quotient:4,remainder:1},{dividend:18,divisor:0,quotient:4,remainder:2},{dividend:18,divisor:4,quotient:3,remainder:6},{dividend:18,divisor:4,quotient:4.5,remainder:0},{dividend:1000000,divisor:1,quotient:1000000,remainder:0}])expect(validDivisionRelation(r)).toBe(false);
});
it('detects multiple true explanations and never reads a private key or solution',()=>{
 const q=single(12,4);for(const key of ['correctAnswer','solutionText','editorial'])Object.defineProperty(q,key,{get:()=>{throw Error('Private field read');}});expect(factorRelationEvidence(q,context())?.proof.answer).toBe('C');q.options[0].text=q.options[2].text;expect(factorRelationEvidence(q,context())?.proof.answer).toBe('MULTIPLE');
});
it('refuses unsupported language, zero, extra facts, scope mismatches and label collisions',()=>{
 expect(factorRelationEvidence(single(999999,999999),context())?.proof.answer).toBe('C');
 expect(factorRelationEvidence(common(999999,999999,999999),context(true))?.proof.answer).toBe('C');
 const q=single(12,4);for(const text of [q.stemText+' Ayrıca sayı 2 artırılmıştır.',singleStem(0),singleStem(1000000)])expect(factorRelationEvidence({...q,stemText:text},context())).toBeNull();
 for(const patch of [{gradeLevel:5},{outcomeCode:'MAT.6.1.3'},{outcomeTitle:'invented'},{taskFocus:'NAT_INVERSE_STEPS'}])expect(factorRelationEvidence(q,{...context(),...patch})).toBeNull();
 q.options[0].text='EBOB 6 olur.';expect(factorRelationEvidence(q,context())).toBeNull();
 expect(factorRelationEvidence({...single(12,4),options:single(12,4).options.map((o,i)=>({...o,label:['','AB','C','D'][i]}))},context())).toBeNull();
});
it.each([false,true])('normal dispatcher keeps witnesses, wrong-key protection and disabled routing: common=%s',async isCommon=>{
 const run=vi.fn(async()=>({response:'{}'})),env:any={AI:{run},QUESTION_MATH6_PROOF_ENABLED:'true'},q:any={...(isCommon?common(12,18,6):single(12,4)),correctAnswer:'C',solutionText:'not evidence',editorial:{visual:{kind:'NONE'}}};
 expect(await independentlySolve(env,q,'reviewer',context(isCommon))).toMatchObject({ok:true,method:'DETERMINISTIC_FACTOR_RELATIONS',model:null,keyHidden:true,solutionHidden:true,derivation:{kind:'EXACT_DIVISION_RELATIONS',verified:true}});expect(run).not.toHaveBeenCalled();
 expect(await independentlySolve(env,{...q,correctAnswer:'A'},'reviewer',context(isCommon))).toMatchObject({ok:false,issues:['BLIND_ANSWER_DISAGREEMENT']});expect(run).not.toHaveBeenCalled();
 await independentlySolve({...env,QUESTION_MATH6_PROOF_ENABLED:'false'},q,'reviewer',context(isCommon));expect(run).toHaveBeenCalledTimes(1);
});
it('keeps final independent editorial rejection after valid common-factor evidence',async()=>{
 const base=editorialQuestion(),q:any={...base,...common(12,18,6),correctAnswer:'C',solutionText:'6 sayısı hem 12 hem 18 sayısının bölenidir. Doğru seçenek C.'};q.editorial.visual={kind:'NONE',title:'',unit:'',columns:[],rows:[],categories:[],values:[],readingPurpose:''};q.editorial.distractors=q.editorial.distractors.map((d:any,i:number)=>({...d,label:['A','B','D'][i]}));
 const run=vi.fn(async()=>({response:JSON.stringify({reviews:[{index:0,valid:false,issues:['DISTRACTOR_QUALITY_INSUFFICIENT'],editorial:editorialScores}]})}));const r=await verifyQuestionDrafts({AI:{run},QUESTION_MATH6_PROOF_ENABLED:'true',QUESTION_BLIND_SOLVE_ENABLED:'true',QUESTION_GENERATION_VERIFIER_MODEL:'reviewer'} as any,{...context(true),qualityProfile:'EDITORIAL_V1',presentation:'TEXT',producerModel:'writer'},[q]);expect(r.ok).toBe(false);expect(r.blindSolves[0]).toMatchObject({ok:true,method:'DETERMINISTIC_FACTOR_RELATIONS'});expect(run).toHaveBeenCalledTimes(1);
});
