type PublicQuestion={stemText:string;options:{label:string;text:string}[]};
type Calculation={left:number;op:'ADD'|'SUB'|'MUL';right:number;result:number};
/** Exact public-data proof for two unit-price + delivery offers, under the
 * verified MAT.5.1.2 scope. No key, solution, editorial plan or free-form parsing.
 * This proves arithmetic only; independent editorial/originality review remains. */
export function offerComparisonEvidence(q:PublicQuestion,context:any){
 if(context?.gradeLevel!==5||context.outcomeCode!=='MAT.5.1.2'||context.taskFocus!=='NAT_COMPARE_OFFERS')return null;
 const m=q.stemText.match(/^Bir okul (\d+) adet ([\p{L}]+) almak istiyor\. A satıcısında bir \2 (\d+) TL, teslimat ücreti (\d+) TL'dir\. B satıcısında bir \2 (\d+) TL, teslimat ücreti (\d+) TL'dir\. Teslimat ücreti her sipariş için yalnız bir kez alınır\. (?:Aynı miktar için daha ucuz teklif seçilirse kaç TL tasarruf edilir\?|Okulun bütçesi (\d+) TL'dir\. Aynı miktar için daha ucuz teklif seçilirse bütçeden kaç TL kalır\?)$/u);
 if(!m||q.options.length!==4||q.options.map(o=>o.label).sort().join('')!=='ABCD'||q.options.some(o=>!/^(?:0|[1-9]\d{0,4})$/.test(o.text)))return null;
 const [quantity,priceA,deliveryA,priceB,deliveryB]=[m[1],m[3],m[4],m[5],m[6]].map(Number),budget=m[7]===undefined?null:Number(m[7]);
 // MEB source: multiplication operands <=3 digits, addition/subtraction <=5.
 if(quantity<1||quantity>999||[priceA,priceB].some(n=>n<1||n>999)||[deliveryA,deliveryB,...(budget===null?[]:[budget])].some(n=>n<0||n>99999))return null;
 const calculations:Calculation[]=[];
 const run=(left:number,op:Calculation['op'],right:number)=>{const result=op==='ADD'?left+right:op==='SUB'?left-right:left*right;calculations.push({left,op,right,result});return result;};
 const subtotalA=run(quantity,'MUL',priceA),subtotalB=run(quantity,'MUL',priceB);
 if(subtotalA>99999||subtotalB>99999)return null;
 const totalA=run(subtotalA,'ADD',deliveryA),totalB=run(subtotalB,'ADD',deliveryB);
 if(totalA>99999||totalB>99999||totalA===totalB)return null;
 const cheaper=Math.min(totalA,totalB);
 if(budget!==null&&budget<cheaper)return null;
 const target=budget===null?run(Math.max(totalA,totalB),'SUB',cheaper):run(budget,'SUB',cheaper);
 const optionChecks=q.options.map(o=>({label:o.label,correct:Number(o.text)===target,reason:`A teklifinin toplamı ${totalA} TL, B teklifinin toplamı ${totalB} TL; ${budget===null?'tasarruf':'kalan bütçe'} ${target} TL. Seçenek ${Number(o.text)===target?'bu değere eşittir':'bu değerden farklıdır'}.`}));
 const matches=optionChecks.filter(o=>o.correct);
 return {answer:matches.length===1?matches[0].label:matches.length?'MULTIPLE':'NONE',optionChecks,calculations};
}

type PublicOfferVisual={kind:string;title:string;unit:string;columns:string[];rows:string[][];categories:string[];values:number[]};
/** Strict table-to-public-statement adapter. Every numeric cell is a price or
 * once-per-order delivery fee. Column/row order has no semantic significance.
 * No hidden editorial metadata or answer key is accepted by this function. */
export function tableOfferComparisonEvidence(q:PublicQuestion&{visual:PublicOfferVisual},context:any){
 if(context?.gradeLevel!==5||context.outcomeCode!=='MAT.5.1.2'||context.taskFocus!=='NAT_COMPARE_OFFERS')return null;
 const v=q.visual,headers=['Satıcı','Birim fiyat','Teslimat ücreti'];
 if(v.kind!=='TABLE'||v.title!=='Satıcı teklifleri'||v.unit!=='TL'||v.categories.length||v.values.length||v.columns.length!==3||new Set(v.columns).size!==3||v.columns.some(c=>!headers.includes(c))||v.rows.length!==2||v.rows.some(r=>r.length!==3))return null;
 const seller=v.columns.indexOf('Satıcı'),price=v.columns.indexOf('Birim fiyat'),delivery=v.columns.indexOf('Teslimat ücreti');
 if(v.rows.map(r=>r[seller]).sort().join(',')!=='A,B'||v.rows.some(r=>![r[price],r[delivery]].every(n=>/^(?:0|[1-9]\d{0,4})$/.test(n))))return null;
 const m=q.stemText.match(/^Bir okul (\d+) adet ([\p{L}]+) almak istiyor\. Satıcıların birim fiyatları ve teslimat ücretleri tabloda verilmiştir\. Teslimat ücreti her sipariş için yalnız bir kez alınır\. (Aynı miktar için daha ucuz teklif seçilirse kaç TL tasarruf edilir\?|Okulun bütçesi \d+ TL'dir\. Aynı miktar için daha ucuz teklif seçilirse bütçeden kaç TL kalır\?)$/u);
 if(!m)return null;
 const a=v.rows.find(r=>r[seller]==='A')!,b=v.rows.find(r=>r[seller]==='B')!;
 return offerComparisonEvidence({stemText:`Bir okul ${m[1]} adet ${m[2]} almak istiyor. A satıcısında bir ${m[2]} ${a[price]} TL, teslimat ücreti ${a[delivery]} TL'dir. B satıcısında bir ${m[2]} ${b[price]} TL, teslimat ücreti ${b[delivery]} TL'dir. Teslimat ücreti her sipariş için yalnız bir kez alınır. ${m[3]}`,options:q.options},context);
}
