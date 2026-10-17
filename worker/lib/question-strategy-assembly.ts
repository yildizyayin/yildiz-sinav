import type {CheckedDraft} from './question-generation-validation';
type Step={left:number;op:string;right:number;result:number};
const nat=(s:string)=>Number(s.replace(/[. \u00a0\u202f]/g,''));
const operation=(a:number,op:string,b:number)=>op==='+'?a+b:a-b;
const fmt=(s:Step)=>`${s.left} ${s.op} ${s.right} = ${s.result}`;
const symbol=(s:string)=>['−','–','-'].includes(s)?'-':'+';
/** Narrow semantic editor: derive two proposals from already-generated exact
 * arithmetic. Never invent givens, options or a new answer to force acceptance. */
export function assembleInverseStrategies(source:CheckedDraft){
 if(!source.editorial||source.editorial.visual.kind!=='NONE'||source.options.length!==4||source.options.some(o=>!/^\d+$/.test(o.text)))return null;
 const prefix=source.solutionText.split(/Kontrol\s*:/iu)[0];
 const steps:Step[]=[...prefix.matchAll(/(\d+)\s*([+−–-])\s*(\d+)\s*=\s*(\d+)/g)].map(m=>({left:nat(m[1]),op:symbol(m[2]),right:nat(m[3]),result:nat(m[4])}));
 if(steps.length!==2||steps.some(s=>operation(s.left,s.op,s.right)!==s.result||Math.min(s.left,s.right,s.result)<0||Math.max(s.left,s.right,s.result)>99999)||steps[0].result!==steps[1].left)return null;
 const answer=Number(source.options.find(o=>o.label===source.correctAnswer)?.text);
 if(steps[1].result!==answer)return null;
 let wrong:{label:string;expression:string;result:number}|null=null;
 for(const d of source.editorial.distractors){const m=d.whyIncorrect.match(/^Yanılgı hesabı:\s*(\d+)\s*([+−–-])\s*(\d+)\s*([+−–-])\s*(\d+)\s*=\s*(\d+)\./u);if(!m)continue;
  const [start,a,b,value]=[nat(m[1]),nat(m[3]),nat(m[5]),nat(m[6])],ops=[symbol(m[2]),symbol(m[4])];
  if(start!==steps[0].left||[a,b].sort((a,b)=>a-b).join(',')!==steps.map(s=>s.right).sort((a,b)=>a-b).join(',')||operation(operation(start,ops[0],a),ops[1],b)!==value||value===answer||Number(source.options.find(o=>o.label===d.label)?.text)!==value)continue;
  wrong={label:d.label,expression:`${start} ${ops[0]} ${a} ${ops[1]} ${b}`,result:value};
 }
 if(!wrong)return null;
 const firstPartial=source.options.find(o=>o.label!==source.correctAnswer&&o.label!==wrong!.label&&Number(o.text)===steps[0].result);
 const otherValue=operation(steps[0].left,steps[1].op,steps[1].right),other=source.options.find(o=>o.label!==source.correctAnswer&&o.label!==wrong!.label&&o.label!==firstPartial?.label&&Number(o.text)===otherValue);
 if(!firstPartial||!other)return null;
 const story=source.stemText.replace(/\s*Başlangıçta[^?]*\?\s*$/u,'');if(story===source.stemText)return null;
 const q=structuredClone(source),plan={steps,wrong,firstPartial:firstPartial.label,otherPartial:other.label,answer,originalOptionValues:source.options};
 q.stemText=story+`\nBaşlangıç miktarı için iki yöntem öneriliyor:\nI. yöntem: ${steps.map(fmt).join('; ')}.\nII. yöntem: ${wrong.expression} = ${wrong.result}.\nHangi açıklama bu işlemleri doğru geri alarak başlangıç miktarını bulur?`;
 q.options=q.options.map(o=>({label:o.label,text:o.label===q.correctAnswer?`I. yöntem iki işlemi de doğru geri alır; başlangıç miktarı ${answer} olur.`:o.label===wrong!.label?`II. yöntem iki işlemi de doğru geri alır; başlangıç miktarı ${wrong!.result} olur.`:o.label===firstPartial.label?`I. yöntemin yalnız ilk hesabı yeterlidir; başlangıç miktarı ${o.text} olur.`:`Yalnız ${steps[1].right} ${steps[1].op==='-'?'çıkarmak':'eklemek'} yeterlidir; başlangıç miktarı ${o.text} olur.`}));
 q.solutionText=source.solutionText+` I. yöntem ${answer} sonucunu verir. II. yöntemde ${wrong.expression} = ${wrong.result} hesaplanır; verilen işlemler doğru geri alınmadığından başlangıç miktarı bulunamaz. Doğru seçenek ${q.correctAnswer}.`;
 q.editorial!.cognitiveDemand='EVALUATE';q.editorial!.skillTarget=`Son miktar ${steps[0].left} ve işlem miktarları ${steps[0].right}, ${steps[1].right} kullanılarak iki geri kurma yöntemini karşılaştırma; ara sonucu başlangıçtan ayırma.`;
 q.editorial!.reasoningSteps=[`Verilen işlemleri geri alan I. yöntemin ${steps.map(fmt).join('; ')} hesabını kontrol eder.`,`II. yöntemin ${wrong.expression} = ${wrong.result} hesabını verilen işlemlerle karşılaştırır; eksik tek-adım önerilerini eler.`];
 q.editorial!.originalityDesign=`Aynı verilenlerle I: ${steps.map(fmt).join('; ')} ve II: ${wrong.expression} = ${wrong.result} karşılaştırılır. Ara sonuç ${steps[0].result} ile yalnız diğer işlemin geri alındığı ${otherValue} ayrı yanılgıları temsil eder.`;
 q.editorial!.distractors=q.editorial!.distractors.map(d=>d.label===wrong!.label?{label:d.label,misconception:'Verilen miktarlarla ters işlemleri yanlış eşleştiren II. yöntemi geçerli sayma.',whyIncorrect:`Yanılgı hesabı: ${wrong!.expression} = ${wrong!.result}. I. yöntemdeki ${steps.map(fmt).join('; ')} gerekli geri almayı yapar; II. yöntemde miktarlar ters işlemlerle yanlış eşleştirilmiştir.`}:d.label===firstPartial.label?{label:d.label,misconception:'I. yöntemin ara sonucunu başlangıç miktarı sanıp kalan ters işlemi yapmama.',whyIncorrect:`Yanılgı hesabı: ${fmt(steps[0])}. ${steps[1].right} ile yapılacak ikinci ters işlem henüz uygulanmamıştır; başlangıç ${answer} olmalıdır.`}:{label:d.label,misconception:'Yalnız diğer işlemi geri alıp gerekli ters işlemlerden birini atlama.',whyIncorrect:`Yanılgı hesabı: ${steps[0].left} ${steps[1].op} ${steps[1].right} = ${otherValue}. ${steps[0].right} ile yapılacak ters işlem atlandığı için bu değer başlangıç miktarı değildir.`});
 return {question:q,plan,construction:'AI_SOURCE_WITH_DETERMINISTIC_STRATEGY_EDITOR',pureLlmEditorial:false};
}
