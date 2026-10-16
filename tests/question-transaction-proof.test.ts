import {expect,it,vi} from 'vitest';
import {transactionBalanceEvidence} from '../worker/lib/question-transaction-proof';
import {independentlySolve} from '../worker/lib/question-blind-solve';
const context={gradeLevel:5,outcomeCode:'MAT.5.1.2',taskFocus:'NAT_INVERSE_STEPS'};
function question(a=275,b=148,end=632){const x=end+a-b,first=end+a,wrong=end+b-a,other=end-b;return {stemText:`Bir depoda başlangıçta kaç kitap olduğu soruluyor. İlk olarak ${a} kitap satıldı, ardından ${b} kitap alındı. Bu iki işlemden sonra depoda ${end} kitap kaldı.\nBaşlangıç miktarı için iki yöntem öneriliyor:\nI. yöntem: ${end} + ${a} = ${first}; ${first} - ${b} = ${x}.\nII. yöntem: ${end} + ${b} - ${a} = ${wrong}.\nHangi açıklama bu işlemleri doğru geri alarak başlangıç miktarını bulur?`,options:[{label:'A',text:`I. yöntemin yalnız ilk hesabı yeterlidir; başlangıç miktarı ${first} olur.`},{label:'B',text:`II. yöntem iki işlemi de doğru geri alır; başlangıç miktarı ${wrong} olur.`},{label:'C',text:`I. yöntem iki işlemi de doğru geri alır; başlangıç miktarı ${x} olur.`},{label:'D',text:`Yalnız ${b} çıkarmak yeterlidir; başlangıç miktarı ${other} olur.`}]};}
it('uses only public data and computes reverse-chronological balance before judging the proposals',()=>{
 const q=question();Object.defineProperty(q,'correctAnswer',{get:()=>{throw Error('Key read');}});Object.defineProperty(q,'solutionText',{get:()=>{throw Error('Solution read');}});
 const p=transactionBalanceEvidence(q,context)!;expect(p.answer).toBe('C');expect(p.calculations.slice(0,2)).toEqual([{left:632,op:'SUB',right:148,result:484},{left:484,op:'ADD',right:275,result:759}]);expect(p.optionChecks.map(o=>o.correct)).toEqual([false,false,true,false]);
});
it('handles unseen balances and label permutations, without a fixed answer letter or original numbers',()=>{
 for(let i=1;i<=20;i++){const q=question(100+i*7,20+i,500+i*11),expected=BigInt(500+i*11)+BigInt(100+i*7)-BigInt(20+i);q.options=[q.options[2],q.options[0],q.options[3],q.options[1]].map((o,j)=>({...o,label:String.fromCharCode(65+j)}));const p=transactionBalanceEvidence(q,context)!;expect(p.answer).toBe('A');expect(p.calculations[1].result).toBe(Number(expected));}
});
it('does not mistake commuting addition/subtraction for an invalid method',()=>{
 const q=question();q.stemText=q.stemText.replace('632 + 275 = 907; 907 - 148 = 759','632 - 148 = 484; 484 + 275 = 759');q.options[0].text='I. yöntemin yalnız ilk hesabı yeterlidir; başlangıç miktarı 484 olur.';expect(transactionBalanceEvidence(q,context)?.answer).toBe('C');
});
it('finds no or multiple true statements rather than trusting a supplied intended key',()=>{
 const none=question();none.options[2].text=none.options[2].text.replace('759','758');expect(transactionBalanceEvidence(none,context)?.answer).toBe('NONE');
 const multiple=question();multiple.options[0].text=multiple.options[2].text;expect(transactionBalanceEvidence(multiple,context)?.answer).toBe('MULTIPLE');
});
it('refuses extra facts, unsupported language or scope instead of silently ignoring them',()=>{
 const q=question();expect(transactionBalanceEvidence({...q,stemText:q.stemText+' Ayrıca 10 kitap kayboldu.'},context)).toBeNull();expect(transactionBalanceEvidence({...q,stemText:q.stemText.replace('satıldı','bağışlandı')},context)).toBeNull();expect(transactionBalanceEvidence(q,{...context,gradeLevel:6})).toBeNull();expect(transactionBalanceEvidence(question(100000),context)).toBeNull();
});
it('does not accept an arithmetically false proposed result',()=>{
 const q=question();q.stemText=q.stemText.replace('907 - 148 = 759','907 - 148 = 758');expect(transactionBalanceEvidence(q,context)?.answer).toBe('NONE');
});
it('makes no provider call for a recognized proof, compares the hidden key afterwards, and stays opt-in',async()=>{
 const provider=vi.fn(async()=>{throw Error('No provider needed');}),q={...question(),correctAnswer:'C',solutionText:'not read',difficultyLevel:3,editorial:{visual:{kind:'NONE'}}} as any,env:any={AI:{run:provider},QUESTION_TRANSACTION_PROOF_ENABLED:'true'};
 expect(await independentlySolve(env,q,'model',context)).toMatchObject({ok:true,method:'DETERMINISTIC_TRANSACTION_BALANCE',model:null,keyHidden:true,solutionHidden:true});expect(provider).not.toHaveBeenCalled();
 expect(await independentlySolve(env,{...q,correctAnswer:'A'},'model',context)).toMatchObject({ok:false,issues:['BLIND_ANSWER_DISAGREEMENT']});expect(provider).not.toHaveBeenCalled();
 await independentlySolve({...env,QUESTION_TRANSACTION_PROOF_ENABLED:undefined},q,'model',context);expect(provider).toHaveBeenCalledTimes(1);
});
it.each([['alındı','alındı',1115,'-',40,1075,'-',75,1150],['satıldı','satıldı',885,'+',40,925,'+',75,920],['alındı','satıldı',1035,'+',40,1075,'-',75,1070]] as const)('solves both transaction directions from a fixed independently known initial balance: %s/%s',(v1,v2,end,op1,n1,mid,op2,n2,wrong)=>{
 const q=question(75,40,end);q.stemText=q.stemText.replace('75 kitap satıldı',`75 kitap ${v1}`).replace('40 kitap alındı',`40 kitap ${v2}`).replace(/I\. yöntem: [^\n]+/u,`I. yöntem: ${end} ${op1} ${n1} = ${mid}; ${mid} ${op2} ${n2} = 1000.`).replace(/II\. yöntem: [^\n]+/u,`II. yöntem: ${end} + 75 - 40 = ${wrong}.`);
 q.options[0].text=`I. yöntemin yalnız ilk hesabı yeterlidir; başlangıç miktarı ${mid} olur.`;q.options[1].text=`II. yöntem iki işlemi de doğru geri alır; başlangıç miktarı ${wrong} olur.`;q.options[2].text='I. yöntem iki işlemi de doğru geri alır; başlangıç miktarı 1000 olur.';
 const p=transactionBalanceEvidence(q,context)!;expect(p.answer).toBe('C');expect(p.calculations[1].result).toBe(1000);
});
