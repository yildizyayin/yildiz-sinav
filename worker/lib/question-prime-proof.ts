import spec from '../../data/question-pilot-math6-curriculum.json';
type Certificate={number:number;factors:{prime:number;exponent:number}[]};
const prime=(n:number)=>{if(!Number.isSafeInteger(n)||n<2)return false;for(let d=2;d*d<=n;d++)if(n%d===0)return false;return true;};
/** Independently check a complete prime-power factorization, including n=1.
 * Input bound is an application cost limit, not an official curriculum claim. */
export function validPrimeCertificate(c:Certificate){
 if(!c||Object.keys(c).sort().join(',')!=='factors,number'||!Number.isSafeInteger(c.number)||c.number<1||c.number>999999||!Array.isArray(c.factors)||c.factors.length>7)return false;
 let product=1,previous=1;
 for(const f of c.factors){if(!f||Object.keys(f).sort().join(',')!=='exponent,prime'||f.prime>c.number||!prime(f.prime)||f.prime<=previous||!Number.isSafeInteger(f.exponent)||f.exponent<1||f.exponent>19)return false;
  for(let i=0;i<f.exponent;i++){product*=f.prime;if(product>c.number)return false;}previous=f.prime;
 }
 return product===c.number;
}
/** Public statement semantics + exact integer factorization; no hidden key. */
export function primeFactorEvidence(q:{stemText:string;options:{label:string;text:string}[]},context:any){
 if(context?.gradeLevel!==6||context.outcomeCode!=='MAT.6.1.3'||context.outcomeTitle!==spec.outcomes[2].title||context.taskFocus!=='GENERIC')return null;
 const m=q.stemText.match(/^([1-9]\d{0,5}) sayısının asal olma durumu ve asal çarpanları hakkında aşağıdaki açıklamalardan hangisi doğrudur\?$/u);
 if(!m||q.options.length!==4||q.options.map(o=>o.label).sort().join(',')!=='A,B,C,D')return null;
 const n=Number(m[1]),factors:Certificate['factors']=[];let remaining=n;
 for(let d=2;d*d<=remaining;d++){let exponent=0;while(remaining%d===0){remaining/=d;exponent++;}if(exponent)factors.push({prime:d,exponent});}
 if(remaining>1)factors.push({prime:remaining,exponent:1});
 const certificate={number:n,factors};if(!validPrimeCertificate(certificate))return null;
 const actual=factors.map(f=>f.prime),isPrime=actual.length===1&&actual[0]===n,optionChecks=[];
 for(const o of q.options){let correct:boolean;
  const single=o.text.match(/^(Asaldır|Asal değildir); tek asal çarpanı ([1-9]\d{0,5}) sayısıdır\.$/u);
  const many=o.text.match(/^Asal değildir; farklı asal çarpanları yalnızca ([1-9]\d{0,5}(?:, [1-9]\d{0,5})* ve [1-9]\d{0,5}) sayılarıdır\.$/u);
  if(single)correct=(single[1]==='Asaldır')===isPrime&&actual.length===1&&Number(single[2])===actual[0];
  else if(many){const claimed=many[1].split(/, | ve /u).map(Number).sort((a,b)=>a-b);correct=!isPrime&&claimed.length===actual.length&&claimed.every((v,i)=>v===actual[i]);}
  else if(o.text==='Asal değildir; asal çarpanı yoktur.')correct=n===1;
  else return null;
  optionChecks.push({label:o.label,correct,reason:`${n} ${isPrime?'asaldır':'asal değildir'}; eksiksiz asal çarpan ayrışımı ${factors.length?factors.map(f=>`${f.prime} üzeri ${f.exponent}`).join(' × '):'boş çarpım = 1'}. Seçeneğin asal olma ve çarpan listesi birlikte ${correct?'doğrudur':'yanlıştır'}.`});
 }
 const matches=optionChecks.filter(o=>o.correct);
 // This is a checked prime-power certificate, not a linear arithmetic proof.
 // Do not seed the generic solver's source operands with claimed option values.
 return {proof:{answer:matches.length===1?matches[0].label:matches.length?'MULTIPLE':'NONE',optionChecks,calculations:[]},derivation:{kind:'EXACT_PRIME_POWER_CERTIFICATE',certificate,verified:true}};
}
