import {expect,it} from 'vitest';
import spec from '../data/question-pilot-math9-curriculum.json';
import {checkMath9Source,math9Csv} from '../scripts/math9-curriculum-source.mjs';
import {parseCurriculumCsv} from '../worker/lib/curriculum-import';
import {officialPilotGuidance} from '../worker/lib/question-generation-validation';
const html=()=>spec.outcomes.map(o=>`<b>${o.code}.</b>&nbsp; ${o.title}`).join('<br>')+'<p>evrensel kümenin gerçek sayılar kümesi olduğu; denklem ve eşitsizlik çözümlerine değinilmeksizin incelenir.</p>';
it('requires all exact official code/title pairs and the interval teaching restriction',()=>{
 expect(checkMath9Source(spec,html())).toMatchObject({completeGrade:false,productionQualified:false,matchedCodes:spec.outcomes.map(o=>o.code)});
 expect(()=>checkMath9Source(spec,html().replace(spec.outcomes[0].title,'Başka başlık'))).toThrow('MATH9_OFFICIAL_TEXT_MISMATCH');
 expect(()=>checkMath9Source(spec,html().replace('denklem ve eşitsizlik çözümlerine değinilmeksizin','denklem çözümü'))).toThrow('MATH9_SCOPE_GUIDANCE_MISSING');
 expect(()=>checkMath9Source(spec,'<script>'+html()+'</script>')).toThrow('MATH9_OFFICIAL_TEXT_MISMATCH');
});
it('rejects wrong official source/grade and incomplete or reordered manifest scopes',()=>{
 for(const patch of [{gradeLevel:8},{sourceUrl:'https://example.com'},{outcomes:spec.outcomes.slice(0,3)},{outcomes:[...spec.outcomes].reverse()}])expect(()=>checkMath9Source({...spec,...patch},html())).toThrow('MATH9_MANIFEST_SCOPE_MISMATCH');
});
it('preserves the four exact grade-nine outcome titles and their first-theme unit through CSV import',()=>{
 const parsed=parseCurriculumCsv(math9Csv(spec),'SCHOOL',9);expect(parsed.errors).toEqual([]);expect(parsed.rows).toHaveLength(4);expect(parsed.rows.every(r=>r.issues.length===0&&r.gradeLevel===9&&r.subjectCode==='MAT'&&r.unit==='Sayılar')).toBe(true);expect(parsed.rows.map(r=>r.title)).toEqual(spec.outcomes.map(o=>o.title));
});
it('gives only exact code/title-bound official guidance and preserves domain/interval restrictions',()=>{
 for(const o of spec.outcomes)expect(officialPilotGuidance({gradeLevel:9,outcomeCode:o.code,outcomeTitle:o.title})).toContain(spec.sourceUrl);
 expect(officialPilotGuidance({gradeLevel:9,outcomeCode:spec.outcomes[0].code,outcomeTitle:spec.outcomes[0].title})).toContain('real-domain/sign conditions');
 expect(officialPilotGuidance({gradeLevel:9,outcomeCode:spec.outcomes[1].code,outcomeTitle:spec.outcomes[1].title})).toContain('without introducing equation/inequality solving outside that context');
 expect(officialPilotGuidance({gradeLevel:9,outcomeCode:spec.outcomes[0].code,outcomeTitle:'invented'})).toBeNull();expect(officialPilotGuidance({gradeLevel:7,outcomeCode:spec.outcomes[0].code,outcomeTitle:spec.outcomes[0].title})).toBeNull();
});
