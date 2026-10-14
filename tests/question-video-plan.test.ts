import {it,expect} from 'vitest';
import {buildQuestionVideoPlan} from '../worker/lib/question-video-plan';
it('uses the frozen source verbatim and produces bounded Turkish scenes without inventing an answer',()=>{
 const q={id:'q',review_revision:3,stem_text:'Bir kutuda 2 kalem, diğerinde 3 kalem var. Toplam kaç kalem?',solution_text:'2 + 3 = 5. Toplam5 kalem vardır.',correct_answer:'B',options_json:JSON.stringify(['4','5','6','7'])};
 const p=buildQuestionVideoPlan(q);expect(p.scenes[0].text).toContain(q.stem_text);expect(p.scenes[1].text).toBe(q.solution_text);expect(p.scenes.at(-1)?.text).toBe('B seçeneği: 5');expect(p.narrationText).toContain('eşittir');expect(p.synthetic).toBe(false);
 expect(()=>buildQuestionVideoPlan({...q,solution_text:'çok uzun '.repeat(1000)})).toThrow(/TOO_LONG/);
 expect(()=>buildQuestionVideoPlan({...q,options_json:'[]'})).toThrow(/INVALID/);
});
