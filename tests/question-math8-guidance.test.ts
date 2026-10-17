import {expect,it} from 'vitest';
import spec from '../data/question-math8-target-2028.json';
import {officialPilotGuidance} from '../worker/lib/question-generation-validation';
it('binds current grade-eight guidance to exact official code and title',()=>{
 for(const o of spec.outcomes){const c={gradeLevel:8,outcomeCode:o.code,outcomeTitle:o.title};expect(officialPilotGuidance(c)).toContain(spec.sourceUrl);expect(officialPilotGuidance({...c,outcomeTitle:'invented'})).toBeNull();}
 const guide=(i:number)=>officialPilotGuidance({gradeLevel:8,outcomeCode:spec.outcomes[i].code,outcomeTitle:spec.outcomes[i].title});
 expect(guide(0)).toContain('do not introduce scientific notation');expect(guide(1)).toContain('Do not introduce transforming a radical');expect(guide(2)).toContain('finite calculator display');expect(guide(3)).toContain('infinity is not an included real endpoint');
});
