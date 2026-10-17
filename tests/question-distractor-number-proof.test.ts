import {expect,it,vi} from 'vitest';
import {readingDistractorIssues,verifyQuestionDrafts} from '../worker/lib/question-generation-validation';
import {qualityValidationCases} from '../worker/lib/question-quality-validation';
it('blocks actual contradictory partial-group claims before any AI score can accept them',async()=>{
 const c=qualityValidationCases()[4],run=vi.fn();
 expect(readingDistractorIssues(c.question)).toEqual(['DISTRACTOR_GROUP_VALUE_CONTRADICTION']);
 const r=await verifyQuestionDrafts({AI:{run}} as any,c.context,[c.question]);
 expect(r).toMatchObject({ok:false,unavailable:false,model:null});expect(r.reviews[0].issues).toContain('DISTRACTOR_GROUP_VALUE_CONTRADICTION');expect(run).not.toHaveBeenCalled();
});
it('accepts consistent group arithmetic and does not invent unstated transformations',()=>{
 const c=qualityValidationCases()[4],q=structuredClone(c.question);
 for(const d of q.editorial!.distractors)d.whyIncorrect='Üç yüz bin 300.000 eder; bu sayı bin grubunda 000.300.000 şeklinde yazılır. Bu durumda sayı 2.000.300.407 olur.';
 expect(readingDistractorIssues(q)).toEqual([]);
 q.editorial!.distractors[0].whyIncorrect='Bir ara adım 000.300.000 olabilir; başka bir işlem sonucunda sayı değişir.';
 expect(readingDistractorIssues(q)).toEqual([]);
 q.stemText='Verilen tablodaki teklifleri karşılaştırınız.';expect(readingDistractorIssues(q)).toEqual([]);
});
