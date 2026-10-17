import spec from '../../data/question-pilot-math6-curriculum.json';
type Relation={dividend:number;divisor:number;quotient:number;remainder:number};
/** Checked integer identity; no Euclidean algorithm or extremum concept. */
export function validDivisionRelation(r:Relation){
 return !!r&&Object.keys(r).sort().join(',')==='dividend,divisor,quotient,remainder'&&Object.values(r).every(n=>Number.isSafeInteger(n)&&n>=0&&n<=999999)&&r.dividend>0&&r.divisor>0&&r.remainder<r.divisor&&r.dividend===r.divisor*r.quotient+r.remainder;
}
const N='([1-9]\\d{0,5})',R='(0|[1-9]\\d{0,5})';
const patterns={
 factor:new RegExp(`^${N} sayısı, ${N} sayısının bir çarpanıdır; ${N} = ${N} × ${N}\\.$`,'u'),
 notFactor:new RegExp(`^${N} sayısı, ${N} sayısının bir çarpanı değildir; ${N} sayısının ${N} ile bölümünden kalan ${R} olur\\.$`,'u'),
 multiple:new RegExp(`^${N} sayısı, ${N} sayısının pozitif bir katıdır; ${N} = ${N} × ${N}\\.$`,'u'),
 notMultiple:new RegExp(`^${N} sayısı, ${N} sayısının pozitif bir katı değildir; ${N} sayısının ${N} ile bölümünden kalan ${R} olur\\.$`,'u'),
 commonFactor:new RegExp(`^${N} sayısı her ikisinin de bölenidir; ${N} = ${N} × ${N} ve ${N} = ${N} × ${N}\\.$`,'u'),
 commonMultiple:new RegExp(`^${N} sayısı her ikisinin de pozitif katıdır; ${N} = ${N} × ${N} ve ${N} = ${N} × ${N}\\.$`,'u'),
 notCommonFactor:new RegExp(`^${N} sayısı ortak bölen değildir; ${N} sayısının ${N} ile bölümünden kalan ${R} olur\\.$`,'u'),
 notCommonMultiple:new RegExp(`^${N} sayısı ortak kat değildir; ${N} sayısının ${N} ile bölümünden kalan ${R} olur\\.$`,'u'),
};
export function factorRelationEvidence(q:{stemText:string;options:{label:string;text:string}[]},context:any){
 if(context?.gradeLevel!==6||context.taskFocus!=='GENERIC'||!['MAT.6.1.1','MAT.6.1.4'].includes(context.outcomeCode)||!spec.outcomes.some(o=>o.code===context.outcomeCode&&o.title===context.outcomeTitle))return null;
 if(q.options.length!==4||q.options.map(o=>o.label).sort().join(',')!=='A,B,C,D')return null;
 const common=context.outcomeCode==='MAT.6.1.4';
 const stem=q.stemText.match(common?new RegExp(`^${N} ve ${N} sayılarının ortak bölenleri ve pozitif ortak katları hakkında aşağıdaki gerekçeli açıklamalardan hangisi doğrudur\\?$`,'u'):new RegExp(`^${N} sayısının çarpanları ve pozitif katları hakkında aşağıdaki gerekçeli açıklamalardan hangisi doğrudur\\?$`,'u'));
 if(!stem)return null;
 const a=Number(stem[1]),b=common?Number(stem[2]):a,relations:Relation[]=[],checks=[];
 const divide=(dividend:number,divisor:number)=>{const r={dividend,divisor,quotient:Math.floor(dividend/divisor),remainder:dividend%divisor};relations.push(r);return r;};
 const pair=(x:number,y:number)=>x===a&&y===b||x===b&&y===a;
 for(const o of q.options){let correct:boolean,found=false;const from=relations.length;
  for(const [kind,re] of Object.entries(patterns)){
   if(common!==['commonFactor','commonMultiple','notCommonFactor','notCommonMultiple'].includes(kind))continue;
   const match=o.text.match(re);if(!match)continue;found=true;const v=match.slice(1).map(Number),[x,y,z,t,u,w,k]=v;
   if(kind==='factor'||kind==='notFactor'){
    const r=divide(a,x);correct=y===a&&z===a&&t===x&&(kind==='factor'?r.remainder===0&&u===r.quotient:r.remainder!==0&&u===r.remainder);
   }else if(kind==='multiple'||kind==='notMultiple'){
    const r=divide(x,a);correct=y===a&&z===x&&t===a&&(kind==='multiple'?r.remainder===0&&u===r.quotient:r.remainder!==0&&u===r.remainder);
   }else if(kind==='commonFactor'){
    const ra=divide(a,x),rb=divide(b,x),first=y===a?ra:rb,second=u===b?rb:ra;
    correct=pair(y,u)&&z===x&&w===x&&first.remainder===0&&second.remainder===0&&t===first.quotient&&k===second.quotient;
   }else if(kind==='commonMultiple'){
    const ra=divide(x,a),rb=divide(x,b),first=z===a?ra:rb,second=w===b?rb:ra;
    correct=y===x&&u===x&&pair(z,w)&&first.remainder===0&&second.remainder===0&&t===first.quotient&&k===second.quotient;
   }else if(kind==='notCommonFactor'){
    const ra=divide(a,x),rb=divide(b,x),r=y===a?ra:rb;correct=(y===a||y===b)&&z===x&&r.remainder!==0&&t===r.remainder;
   }else{
    const ra=divide(x,a),rb=divide(x,b),r=z===a?ra:rb;correct=y===x&&(z===a||z===b)&&r.remainder!==0&&t===r.remainder;
   }
   break;
  }
  if(!found)return null;
  checks.push({label:o.label,correct:correct!,reason:relations.slice(from).map(r=>`${r.dividend} = ${r.divisor} × ${r.quotient} + ${r.remainder}`).join('; ')+`. Sayı ilişkisi ve verilen gerekçe birlikte ${correct!?'doğrudur':'yanlıştır'}.`});
 }
 if(!relations.every(validDivisionRelation))return null;
 const matches=checks.filter(o=>o.correct);
 return {proof:{answer:matches.length===1?matches[0].label:matches.length?'MULTIPLE':'NONE',optionChecks:checks,calculations:[]},derivation:{kind:'EXACT_DIVISION_RELATIONS',numbers:common?[a,b]:[a],relations,verified:true}};
}
