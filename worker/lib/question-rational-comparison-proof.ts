import spec from '../../data/question-pilot-math7-curriculum.json';
type PublicQuestion={stemText:string;options:{label:string;text:string}[]};
/** Application-owned grammar: validate both the public calculation and conclusion. */
export function rationalComparisonEvidence(q:PublicQuestion,context:any){
 if(context?.gradeLevel!==7||context.outcomeCode!=='MAT.7.1.3'||context.outcomeTitle!==spec.outcomes[2].title||context.taskFocus!=='GENERIC')return null;
 const fraction='(-?(?:0|[1-9]\\d{0,5}))\\/([1-9]\\d{0,5})';
 const match=q.stemText.match(new RegExp('^A = '+fraction+' ve B = '+fraction+' olarak verilmiştir\\. Çapraz çarpımlar A için birinci pay ile ikinci payda, B için ikinci pay ile birinci payda çarpılarak bulunur\\. Hangi karşılaştırma gerekçesiyle birlikte doğrudur\\?$','u'));
 if(!match||q.options.length!==4||q.options.map(o=>o.label).sort().join('')!=='ABCD')return null;
 const [a,b,c,d]=match.slice(1).map(BigInt),left=a*d,right=c*b;
 const relation=left<right?'<':left>right?'>':'=';
 const checks=[];
 for(const o of q.options){
  const claim=o.text.match(/^A ve B için çapraz çarpımlar sırasıyla (-?(?:0|[1-9]\d{0,11})) ve (-?(?:0|[1-9]\d{0,11})) olduğundan A (<|>|=) B\.$/u);
  if(!claim)return null;
  const facts=BigInt(claim[1])===left&&BigInt(claim[2])===right,conclusion=claim[3]===relation;
  checks.push({label:o.label,correct:facts&&conclusion,reason:`Pozitif paydalarda A için çapraz çarpım ${left}, B için ${right}; A ${relation} B. Seçeneğin işlemleri ${facts?'doğru':'yanlış'}, sonucu ${conclusion?'doğru':'yanlış'}.`});
 }
 const matches=checks.filter(c=>c.correct);
 return {answer:matches.length===1?matches[0].label:matches.length?'MULTIPLE':'NONE',optionChecks:checks,witness:{numerators:[a.toString(),c.toString()],denominators:[b.toString(),d.toString()],crossProducts:[left.toString(),right.toString()],relation}};
}
