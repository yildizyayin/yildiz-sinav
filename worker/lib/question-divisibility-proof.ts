import spec from '../../data/question-pilot-math6-curriculum.json';
type PublicQuestion={stemText:string;options:{label:string;text:string}[]};
/** Bounded application grammar, not a restriction asserted by the MEB. Claims
 * are checked against public digits and exact integer remainders, never a key. */
export function divisibilityEvidence(q:PublicQuestion,context:any){
 if(context?.gradeLevel!==6||context.outcomeCode!=='MAT.6.1.2'||context.outcomeTitle!==spec.outcomes[1].title||context.taskFocus!=='GENERIC')return null;
 const match=q.stemText.match(/^([1-9]\d{1,5}) sayısının 2, 3, 4, 5, 6, 9 ve 10 ile bölünebilmesi hakkında aşağıdaki gerekçeli açıklamalardan hangisi doğrudur\?$/u);
 if(!match||q.options.length!==4||q.options.map(o=>o.label).sort().join('')!=='ABCD')return null;
 const n=Number(match[1]),sum=[...match[1]].reduce((a,d)=>a+Number(d),0),unit=n%10,lastTwo=n%100,divisors=new Set<number>();
 const optionChecks=[];
 for(const o of q.options){let d:number,facts:boolean;
  const digitSum=o.text.match(/^Rakamları toplamı (\d{1,2}) olduğundan (3|9) ile tam (bölünür|bölünmez)\.$/u);
  const finalPair=o.text.match(/^Son iki basamağının oluşturduğu sayı (\d{1,2}) olduğundan (4) ile tam (bölünür|bölünmez)\.$/u);
  const lastDigit=o.text.match(/^Birler basamağı (\d) olduğundan (2|5|10) ile tam (bölünür|bölünmez)\.$/u);
  const six=o.text.match(/^Birler basamağı (\d) ve rakamları toplamı (\d{1,2}) olduğundan (6) ile tam (bölünür|bölünmez)\.$/u);
  let conclusion:string;
  if(digitSum){d=Number(digitSum[2]);facts=Number(digitSum[1])===sum;conclusion=digitSum[3];}
  else if(finalPair){d=4;facts=Number(finalPair[1])===lastTwo;conclusion=finalPair[3];}
  else if(lastDigit){d=Number(lastDigit[2]);facts=Number(lastDigit[1])===unit;conclusion=lastDigit[3];}
  else if(six){d=6;facts=Number(six[1])===unit&&Number(six[2])===sum;conclusion=six[4];}
  else return null;
  divisors.add(d);const divisible=n%d===0,correct=facts&&(conclusion==='bölünür')===divisible;
  optionChecks.push({label:o.label,correct,reason:`Sayı ${n}; rakamları toplamı ${sum}, birler basamağı ${unit}, son iki basamak ${lastTwo}. ${d} ile bölümden kalan ${n%d}; gerekçenin verileri ${facts?'doğru':'yanlış'}, gerekçeli açıklama ${correct?'geçerli':'geçersiz'}.`});
 }
 const matches=optionChecks.filter(o=>o.correct);
 // DIV supports noninteger quotients in the existing scientific evidence
 // contract; exact divisibility itself was computed by integer remainder above.
 return {answer:matches.length===1?matches[0].label:matches.length?'MULTIPLE':'NONE',optionChecks,calculations:[...divisors].map(d=>({left:n,op:'DIV' as const,right:d,result:n/d}))};
}
