import {expect,it} from 'vitest';
import spec from '../data/question-math12-target-2028.json';
import {officialPilotGuidance} from '../worker/lib/question-generation-validation';
it('binds the current mathematics program and keeps finite sums and discrete domains explicit',()=>{
 const guide=(i:number)=>officialPilotGuidance({gradeLevel:12,outcomeCode:spec.outcomes[i].code,outcomeTitle:spec.outcomes[i].title});
 expect(guide(0)).toContain('Handle geometric ratio 1 separately');expect(guide(0)).toContain('finite sums by infinite-series');expect(guide(1)).toContain('indices are positive integers');expect(guide(1)).toContain('discrete sequence domain');
 for(const o of spec.outcomes){const c={gradeLevel:12,outcomeCode:o.code,outcomeTitle:o.title};expect(officialPilotGuidance(c)).toContain(spec.sourceUrl);expect(officialPilotGuidance({...c,outcomeTitle:'invented'})).toBeNull();expect(officialPilotGuidance({...c,outcomeCode:o.code.replace('MAT.','MAT.T.')})).toBeNull();}
});
