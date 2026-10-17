import {it,expect} from 'vitest';
import {EDITORIAL_INSTRUCTION} from '../worker/lib/question-editorial';
import {buildQuestionVideoPlan} from '../worker/lib/question-video-plan';
it('passes source/model distinction and media rules into the actual shared editorial instruction',()=>{
 expect(EDITORIAL_INSTRUCTION).toContain('Never invent a named athlete');expect(EDITORIAL_INSTRUCTION).toContain('student-visible stem');expect(EDITORIAL_INSTRUCTION).toContain('do not assume news photos');
});
it('preserves a clearly labelled model, its units and frozen solution in video without claiming animated footage',()=>{
 const q={id:'model',review_revision:4,stem_text:'Eğitim amaçlı modellenmiştir; gerçek sporcu ölçümü değildir. Bir ok 70 m yolu 0,7 s içinde alıyor. Ortalama sürati kaç m/s olur?',solution_text:'Ortalama sürat, mesafenin süreye bölünmesiyle 100 m/s bulunur.',correct_answer:'B',options_json:JSON.stringify(['70 m/s','100 m/s','49 m/s','10 m/s'])};const p=buildQuestionVideoPlan(q);
 expect(p.scenes.map(s=>s.text).join('\n')).toContain(q.stem_text);expect(p.scenes.map(s=>s.text)).toContain(q.solution_text);expect(p.sourceRevision).toBe(4);expect(p.productionPolicy).toMatchObject({source:'FROZEN_APPROVED_QUESTION',sourceVerificationRequired:true,reconstructionDisclosureRequired:true,richAnimationQualified:false});
 p.productionPolicy.richAnimationQualified=false;expect(buildQuestionVideoPlan(q).productionPolicy.richAnimationQualified).toBe(false);
});
