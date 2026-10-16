import {expect,it,vi} from 'vitest';
import {tableOfferComparisonEvidence} from '../worker/lib/question-offer-proof';
import {independentlySolve} from '../worker/lib/question-blind-solve';
import {verifyQuestionDrafts} from '../worker/lib/question-generation-validation';
import {editorialQuestion,editorialScores} from './fixtures/editorial-question';
const context={gradeLevel:5,outcomeCode:'MAT.5.1.2',taskFocus:'NAT_COMPARE_OFFERS'};
function question(budget?:number){
 return {stemText:`Bir okul 12 adet kalem almak istiyor. Satıcıların birim fiyatları ve teslimat ücretleri tabloda verilmiştir. Teslimat ücreti her sipariş için yalnız bir kez alınır. ${budget===undefined?'Aynı miktar için daha ucuz teklif seçilirse kaç TL tasarruf edilir?':`Okulun bütçesi ${budget} TL'dir. Aynı miktar için daha ucuz teklif seçilirse bütçeden kaç TL kalır?`}`,options:[{label:'A',text:'16'},{label:'B',text:'36'},{label:'C',text:budget===undefined?'6':String(budget-245)},{label:'D',text:'216'}],visual:{kind:'TABLE',title:'Satıcı teklifleri',unit:'TL',columns:['Satıcı','Birim fiyat','Teslimat ücreti'],rows:[['A','18','35'],['B','20','5']],categories:[] as string[],values:[] as number[]}};
}
it('computes both delivered offers from public table cells only',()=>{
 const q=question();for(const key of ['correctAnswer','solutionText','editorial'])Object.defineProperty(q,key,{get:()=>{throw Error('Hidden source read');}});
 const p=tableOfferComparisonEvidence(q,context)!;expect(p.answer).toBe('C');expect(p.calculations.map(s=>s.result)).toEqual([216,240,251,245,6]);
});
it('tracks column names and seller identifiers rather than row/column position',()=>{
 const q=question();q.visual.rows=q.visual.rows.reverse().map(r=>[r[2],r[0],r[1]]);q.visual.columns=['Teslimat ücreti','Satıcı','Birim fiyat'];q.options.reverse();
 expect(tableOfferComparisonEvidence(q,context)?.answer).toBe('C');
});
it('supports remaining budget and an exact zero remainder',()=>{
 for(const budget of [245,300])expect(tableOfferComparisonEvidence(question(budget),context)?.calculations.at(-1)?.result).toBe(budget-245);
 expect(tableOfferComparisonEvidence(question(244),context)).toBeNull();
});
it('responds to changed visible cells instead of retaining the intended answer',()=>{
 const q=question();q.visual.rows[1][1]='30';const p=tableOfferComparisonEvidence(q,context)!;expect(p.calculations.at(-1)?.result).toBe(114);expect(p.answer).toBe('NONE');
 q.options[0].text='114';expect(tableOfferComparisonEvidence(q,context)?.answer).toBe('A');q.options[1].text='114';expect(tableOfferComparisonEvidence(q,context)?.answer).toBe('MULTIPLE');
});
it('refuses extra facts, ignored cells, ambiguous units and unsupported visual semantics',()=>{
 const changes:Array<(q:ReturnType<typeof question>)=>unknown>=[(q:ReturnType<typeof question>)=>q.stemText+=' Ayrıca 10 TL indirim vardır.',q=>q.visual.rows.push(['C','1','0']),q=>q.visual.columns[0]='Kurum',q=>q.visual.columns[2]='Birim fiyat',q=>q.visual.unit='kuruş',q=>q.visual.title='Fiyatlar öğrenci başınadır',q=>q.visual.rows[1][0]='A',q=>q.visual.rows[0][1]='18,5',q=>q.visual.rows[0].push('9'),q=>q.visual.values.push(10),q=>q.visual.categories.push('Ek indirim'),q=>q.visual.rows[0][1]='1000'];
 for(const mutate of changes){const q=question();mutate(q);expect(tableOfferComparisonEvidence(q,context)).toBeNull();}
 for(const patch of [{gradeLevel:6},{outcomeCode:'MAT.5.1.1'},{taskFocus:'GENERIC'}])expect(tableOfferComparisonEvidence(question(),{...context,...patch})).toBeNull();
});
it('uses every numeric table cell in normal proof and retains wrong-key protection',async()=>{
 const q=question(),run=vi.fn(async()=>({response:'{}'})),env:any={AI:{run},QUESTION_OFFER_PROOF_ENABLED:'true'},draft:any={...q,correctAnswer:'C',solutionText:'not consulted',editorial:{visual:{...q.visual,readingPurpose:'Tekliflerin teslimat dâhil toplam maliyetlerini karşılaştırma.'}}};
 expect(await independentlySolve(env,draft,'reviewer',context)).toMatchObject({ok:true,method:'DETERMINISTIC_OFFER_COMPARISON',keyHidden:true,solutionHidden:true});expect(run).not.toHaveBeenCalled();
 expect(await independentlySolve(env,{...draft,correctAnswer:'A'},'reviewer',context)).toMatchObject({ok:false,issues:['BLIND_ANSWER_DISAGREEMENT']});expect(run).not.toHaveBeenCalled();
 await independentlySolve({...env,QUESTION_OFFER_PROOF_ENABLED:'false'},draft,'reviewer',context);expect(run).toHaveBeenCalledTimes(1);
});
it('does not substitute arithmetic correctness for final independent editorial acceptance',async()=>{
 const q=question(),base=editorialQuestion(),draft:any={...base,stemText:q.stemText,options:q.options,correctAnswer:'C',solutionText:'12 × 18 = 216; 216 + 35 = 251. 12 × 20 = 240; 240 + 5 = 245. 251 − 245 = 6. Doğru seçenek C) 6.'};
 draft.editorial.visual={...q.visual,readingPurpose:'İki satıcının birim fiyatları ve teslimat ücretleri birlikte değerlendirilir.'};draft.editorial.distractors=draft.editorial.distractors.map((d:any,i:number)=>({...d,label:['A','B','D'][i]}));
 const run=vi.fn(async()=>({response:JSON.stringify({reviews:[{index:0,valid:false,issues:['DISTRACTOR_QUALITY_INSUFFICIENT'],editorial:editorialScores}]})}));
 const r=await verifyQuestionDrafts({AI:{run},QUESTION_OFFER_PROOF_ENABLED:'true',QUESTION_BLIND_SOLVE_ENABLED:'true',QUESTION_GENERATION_VERIFIER_MODEL:'reviewer'} as any,{...context,qualityProfile:'EDITORIAL_V1',presentation:'TABLE',producerModel:'writer'},[draft]);
 expect(r.ok).toBe(false);expect(r.blindSolves[0]).toMatchObject({ok:true,method:'DETERMINISTIC_OFFER_COMPARISON'});expect(run).toHaveBeenCalledTimes(1);
});
