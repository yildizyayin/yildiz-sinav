import {expect,it,vi} from 'vitest';
import {mechanicalDraftIssues,parseVerification,readAiJson,verifyQuestionDrafts,DEFAULT_QUESTION_VERIFIER_MODEL,outcomeDraftIssues,nearRepeatedStem,officialPilotGuidance} from '../worker/lib/question-generation-validation';
const q=(correctAnswer='C',solutionText='5 × 12 = 60. 60 × 7 = 420. Doğru cevap A: 420 kg.')=>({stemText:'Ağaçlardan kaç kilogram ürün alınır?',options:['420 kg','600 kg','840 kg','4200 kg'].map((text,i)=>({label:String.fromCharCode(65+i),text})),correctAnswer,solutionText,difficultyLevel:3});
it('blocks the actual pilot key mismatch and incorrect arithmetic',()=>{
 expect(mechanicalDraftIssues(q())).toContain('ANSWER_VALUE_MISMATCH');
 expect(mechanicalDraftIssues(q('A'))).toEqual([]);
 expect(mechanicalDraftIssues(q('A','543.210 + 12.560 = 557.770'))).toContain('INVALID_ARITHMETIC');
});
it('rejects numerically equivalent choices despite different formatting',()=>{
 const draft=q('A');draft.options[0].text='456.789';draft.options[1].text='456789';
 expect(mechanicalDraftIssues(draft)).toContain('EQUIVALENT_NUMERIC_OPTIONS');
});
it('requires one independent verdict for every draft and fails malformed verdicts closed',()=>{
 expect(parseVerification({response:{reviews:[{index:0,valid:true,issues:[]}]}},1)).not.toBeNull();
 for(const reviews of [[],[{index:1,valid:true,issues:[]}],[{index:0,valid:true,issues:['Wrong answer']}],[{index:0,valid:true,issues:[]},{index:0,valid:true,issues:[]}]])expect(parseVerification({response:{reviews}},1)).toBeNull();
 expect(readAiJson({response:'x'.repeat(65537)})).toBeNull();
});
it('mechanical failure consumes no verification request; independent rejection remains blocked',async()=>{
 const run=vi.fn(async()=>({response:JSON.stringify({reviews:[{index:0,valid:false,issues:['Outcome mismatch']}]})}));
 const env={AI:{run}} as any;
 expect((await verifyQuestionDrafts(env,{},[q()])).ok).toBe(false);expect(run).not.toHaveBeenCalled();
 const result=await verifyQuestionDrafts(env,{},[q('A')]);expect(result.ok).toBe(false);expect(result.unavailable).toBe(false);
 expect(run).toHaveBeenCalledWith(DEFAULT_QUESTION_VERIFIER_MODEL,expect.objectContaining({max_tokens:1500,stream:false}));
});
it('unavailable verification and same-model configuration cannot pass',async()=>{
 const run=vi.fn(async()=>{throw Error('Unavailable');});
 expect((await verifyQuestionDrafts({AI:{run}} as any,{},[q('A')])).unavailable).toBe(true);
 run.mockClear();expect((await verifyQuestionDrafts({AI:{run},QUESTION_GENERATION_MODEL:DEFAULT_QUESTION_VERIFIER_MODEL} as any,{},[q('A')])).ok).toBe(false);expect(run).not.toHaveBeenCalled();
});

it('blocks the real mixed-language and six-digit-only reading failures',()=>{
 const context={gradeLevel:5,outcomeCode:'MAT.5.1.1',outcomeTitle:'Altı basamaklı sayıları okuma ve yazmayı çok basamaklı sayılara genelleyebilme'};
 const draft=q('A');draft.stemText='743.219 sayısının okunuşu hangisidir?';draft.options[0].text='Yedi yüz forty üç bin iki yüz on dokuz';
 expect(outcomeDraftIssues(draft,context)).toEqual(expect.arrayContaining(['NON_TURKISH_NUMBER_WORD','READING_OUTCOME_DIGIT_SCOPE']));
 draft.stemText='3.000.085 sayısının okunuşu hangisidir?';draft.options[0].text='Üç milyon seksen beş';
 expect(outcomeDraftIssues(draft,context)).toEqual([]);
 expect(officialPilotGuidance(context)).toContain('7 to 12');
});
it('applies official grade-five operand bounds without blocking a valid division',()=>{
 const context={gradeLevel:5,outcomeCode:'MAT.5.1.2'};
 expect(outcomeDraftIssues(q('A','15.000 / 5 = 3.000'),context)).toContain('ARITHMETIC_OUTCOME_DIGIT_SCOPE');
 expect(outcomeDraftIssues(q('A','240 / 40 = 6'),context)).toEqual([]);
});
it('detects paraphrased arithmetic tasks despite a swapped option order',()=>{
 expect(nearRepeatedStem('Bir okulda 5. sınıf öğrencileri için 240 adet kitap dağıtılacaktır. Sınıfı 40 öğrenci olan bu okulda, her öğrenciye kaç kitap dağıtılacaktır?','Bir okulda 5. sınıf öğrencileri için 240 adet kitap dağıtılacaktır. Sınıfı 40 öğrenci olan bu okulda, her öğrenciye kaç kitap düşer?')).toBe(true);
 expect(nearRepeatedStem('Kampanyada toplanan kitaplar kutulara yerleştirildiğinde kalan kitap sayısını bulunuz.','Bir takvimde belirli tarihler arasında geçen gün sayısını hesaplayınız.')).toBe(false);
});
