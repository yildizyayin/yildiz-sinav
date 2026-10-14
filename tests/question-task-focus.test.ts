import {it,expect} from 'vitest';
import {reasoningFamily,taskFocusIssues,verifyQuestionDrafts} from '../worker/lib/question-generation-validation';
import {validTaskFocus} from '../worker/lib/question-task-focus';
it('recognizes the real box-packing numerical reskin despite reordered solution steps',async()=>{
 const first={stemText:'Bir okul 3.560 kalem aldı. İlk ay 1.245, ikinci ay 678 kullanıldı. Kalanlar24 kalemlik kutulara konulacak. Kaç tam kutu hazırlanabilir?',solutionText:'3.560 − 1.245 = 2.315. 2.315 − 678 = 1.637. 1.637 ÷ 24 = 68 tam kutu, kalan5.'};
 const second={stemText:'Bir okul 12.750 kitap aldı. İlk ay 4.235, ikinci ay 1.890 dağıtıldı. Kalanlar30 kitaplık kutulara konulacak. Kaç tam kutu hazırlanabilir?',solutionText:'4.235 + 1.890 = 6.125. 12.750 − 6.125 = 6.625. 6.625 ÷ 30 = 220 tam kutu, kalan25.'};
 expect(reasoningFamily(first)).toBe(reasoningFamily(second));
 const result=await verifyQuestionDrafts({} as any,{previousDrafts:[first]},[{...second,options:['220','221','215','225'].map((text,i)=>({label:String.fromCharCode(65+i),text})),correctAnswer:'A',difficultyLevel:3}]);
 expect(result.reviews[0].issues).toContain('REPEATED_REASONING_FAMILY');
 expect(reasoningFamily({stemText:'İki mağazanın tekliflerini karşılaştırınız.',solutionText:'24 × 12 = 288.'})).toBeNull();
});
it('requires an actually omitted millions group in the focused reading task',()=>{
 const q={stemText:'“sekiz milyar on bin altı” hangi sayıdır?',solutionText:'Milyonlar bölüğü000 olur.',options:['8000010006','8001010006','8010010006','8000010060'].map((text,i)=>({label:String.fromCharCode(65+i),text})),correctAnswer:'A',difficultyLevel:3};
 expect(taskFocusIssues(q,{taskFocus:'READ_ZERO_PERIODS'})).toEqual([]);
 expect(taskFocusIssues({...q,stemText:'“sekiz milyar iki milyon on bin altı” hangi sayıdır?'},{taskFocus:'READ_ZERO_PERIODS'})).toContain('TASK_FOCUS_MISMATCH');
 expect(validTaskFocus('NAT_COMPARE_OFFERS',5,'MAT.5.1.1')).toBe(false);
 expect(validTaskFocus('READ_ZERO_PERIODS',5,'MAT.5.1.1')).toBe(true);
 expect(validTaskFocus('READ_ZERO_PERIODS',7,'MAT.5.1.1')).toBe(false);
});
