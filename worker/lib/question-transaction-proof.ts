type PublicQuestion={stemText:string;options:{label:string;text:string}[]};
type Calculation={left:number;op:'ADD'|'SUB';right:number;result:number};
/** Narrow public-language recognizer, then exact balance equations. No answer
 * key, worked solution, author metadata or editor plan is accepted as input. */
export function transactionBalanceEvidence(q:PublicQuestion,context:any){
 if(context?.gradeLevel!==5||context.outcomeCode!=='MAT.5.1.2'||context.taskFocus!=='NAT_INVERSE_STEPS')return null;
 const story=q.stemText.match(/^Bir ([\p{L}]+) başlangıçta kaç ([\p{L}]+) olduğu soruluyor\. İlk olarak (\d+) \2 (satıldı|alındı), ardından (\d+) \2 (satıldı|alındı)\. Bu iki işlemden sonra \1 (\d+) \2 kaldı\.\nBaşlangıç miktarı için iki yöntem öneriliyor:\nI\. yöntem: ([^\n]+)\nII\. yöntem: ([^\n]+)\nHangi açıklama bu işlemleri doğru geri alarak başlangıç miktarını bulur\?$/u);
 if(!story||q.options.length!==4||new Set(q.options.map(o=>o.label)).size!==4)return null;
 const amounts=[Number(story[3]),Number(story[5])],verbs=[story[4],story[6]],final=Number(story[7]);
 if([...amounts,final].some(n=>!Number.isSafeInteger(n)||n<0||n>99999))return null;
 const calculations:Calculation[]=[];
 const run=(left:number,op:'ADD'|'SUB',right:number)=>{const result=op==='ADD'?left+right:left-right;calculations.push({left,op,right,result});return result;};
 // Reverse the chronological transactions, independently of either proposal.
 let initial=final;for(let i=1;i>=0;i--)initial=run(initial,verbs[i]==='alındı'?'SUB':'ADD',amounts[i]);
 if(initial<0||initial>99999)return null;
 let forward=initial;for(let i=0;i<2;i++){forward=run(forward,verbs[i]==='alındı'?'ADD':'SUB',amounts[i]);if(forward<0)return null;}if(forward!==final)return null;
 const methods=new Map<string,{result:number;partial:number;valid:boolean}>();
 for(const [i,text] of [story[8],story[9]].entries()){
  const clauses=text.replace(/\.$/u,'').split(/;\s*/u);let current=final,partial:number|undefined,operands:number[]=[],valid=true;
  for(const clause of clauses){const m=clause.match(/^(\d+)((?:\s*[+−–-]\s*\d+){1,2})\s*=\s*(\d+)$/u);if(!m||Number(m[1])!==current)return null;
   for(const op of m[2].matchAll(/([+−–-])\s*(\d+)/gu)){const amount=Number(op[2]);operands.push(amount);current=run(current,op[1]==='+'?'ADD':'SUB',amount);partial??=current;}
   if(current!==Number(m[3]))valid=false;
  }
  if(operands.length!==2||operands.slice().sort((a,b)=>a-b).join(',')!==amounts.slice().sort((a,b)=>a-b).join(','))return null;
  methods.set(i===0?'I':'II',{result:current,partial:partial!,valid:valid&&current===initial});
 }
 const optionChecks:{label:string;correct:boolean;reason:string}[]=[];
 for(const o of q.options){let correct=false,recognized=false;
  const full=o.text.match(/^(I|II)\. yöntem iki işlemi de doğru geri alır; başlangıç miktarı (\d+) olur\.$/u);
  const partial=o.text.match(/^(I|II)\. yöntemin yalnız ilk hesabı yeterlidir; başlangıç miktarı (\d+) olur\.$/u);
  const single=o.text.match(/^Yalnız (\d+) (çıkarmak|eklemek) yeterlidir; başlangıç miktarı (\d+) olur\.$/u);
  if(full){recognized=true;const m=methods.get(full[1])!;correct=m.valid&&Number(full[2])===initial;}
  else if(partial){recognized=true;correct=methods.get(partial[1])!.partial===initial&&Number(partial[2])===initial;}
  else if(single){recognized=true;const amount=Number(single[1]);if(!amounts.includes(amount))return null;const result=run(final,single[2]==='çıkarmak'?'SUB':'ADD',amount);correct=result===initial&&Number(single[3])===result;}
  if(!recognized)return null;
  optionChecks.push({label:o.label,correct,reason:`Verilen hareketlerin bağımsız denge hesabında başlangıç ${initial}, ileri kontrolün sonu ${forward}; seçenek bu dengeyi ${correct?'sağlıyor':'sağlamıyor'}.`});
 }
 if(calculations.length>24)return null;
 const matches=optionChecks.filter(o=>o.correct);
 return {answer:matches.length===1?matches[0].label:matches.length?'MULTIPLE':'NONE',optionChecks,calculations};
}
