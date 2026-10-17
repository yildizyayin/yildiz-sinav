import spec from '../../data/question-pilot-math7-curriculum.json';
type Question={stemText:string;options:{label:string;text:string}[]};
/** Bounded public grammar; BigInt cross products avoid floating-point ordering. */
export function rationalOrderEvidence(q:Question,context:any){
 if(context?.gradeLevel!==7||context.outcomeCode!=='MAT.7.1.3'||context.outcomeTitle!==spec.outcomes[2].title||context.taskFocus!=='GENERIC')return null;
 const m=q.stemText.match(/^Verilen rasyonel sayılar: (.+)\. Bu sayıların küçükten büyüğe doğru sıralaması hangisidir\?$/u);
 if(!m||q.options.length!==4||q.options.map(o=>o.label).sort().join('')!=='ABCD')return null;
 const tokens=m[1].split(', ');
 const parse=(s:string)=>{const f=s.match(/^(-?(?:0|[1-9]\d{0,5}))\/(0|[1-9]\d{0,5})$/u);return f&&BigInt(f[2])>0n?{n:BigInt(f[1]),d:BigInt(f[2])}:null;};
 if(tokens.length!==3||new Set(tokens).size!==3)return null;
 const fractions=tokens.map(parse);if(fractions.some(f=>!f))return null;
 const compare=(a:NonNullable<ReturnType<typeof parse>>,b:NonNullable<ReturnType<typeof parse>>)=>a.n*b.d-b.n*a.d;
 // Equal rational values cannot have a strict ordering, even with different spellings.
 for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)if(compare(fractions[i]!,fractions[j]!)===0n)return null;
 const checks=[];const witnesses=[];
 for(const o of q.options){
  const ordered=o.text.split(' < ');if(ordered.length!==3||[...ordered].sort().join('|')!==[...tokens].sort().join('|'))return null;
  const f=ordered.map(s=>parse(s)!);const pairs=[0,1].map(i=>({left:(f[i].n*f[i+1].d).toString(),right:(f[i+1].n*f[i].d).toString()}));
  const correct=pairs.every(p=>BigInt(p.left)<BigInt(p.right));
  checks.push({label:o.label,correct,reason:'Pozitif paydalarda çapraz çarpımlar: '+pairs.map(p=>p.left+' < '+p.right+' '+(BigInt(p.left)<BigInt(p.right)?'doğru':'yanlış')).join('; ')});
  witnesses.push({label:o.label,pairs});
 }
 const matches=checks.filter(c=>c.correct);
 return {answer:matches.length===1?matches[0].label:matches.length?'MULTIPLE':'NONE',optionChecks:checks,witnesses};
}
