import {expect,it} from 'vitest';
import spec from '../data/question-pilot-math6-curriculum.json';
import {checkMath6Source,math6Csv} from '../scripts/math6-curriculum-source.mjs';
import {parseCurriculumCsv} from '../worker/lib/curriculum-import';
import {officialPilotGuidance} from '../worker/lib/question-generation-validation';
const html=()=>spec.outcomes.map(o=>`<b>${o.code}.</b>&nbsp; ${o.title}`).join('<br>')+'<p>EBOB ve EKOK kavramlarına değinilmez.</p>';
it('requires all exact code/title pairs from the pinned official source',()=>{
 expect(checkMath6Source(spec,html())).toMatchObject({completeGrade:false,productionQualified:false,matchedCodes:spec.outcomes.map(o=>o.code)});
 expect(()=>checkMath6Source(spec,html().replace(spec.outcomes[2].title,'Başka başlık'))).toThrow('MATH6_OFFICIAL_TEXT_MISMATCH');
 expect(()=>checkMath6Source(spec,html().replace('kavramlarına değinilmez','öğretilir'))).toThrow('MATH6_SCOPE_RESTRICTION_MISSING');
 expect(()=>checkMath6Source(spec,'<script>'+html()+'</script>')).toThrow('MATH6_OFFICIAL_TEXT_MISMATCH');
});
it('rejects wrong grade/source/missing or reordered outcome manifests',()=>{
 for(const patch of [{gradeLevel:7},{sourceUrl:'https://example.com'},{outcomes:spec.outcomes.slice(0,3)},{outcomes:[...spec.outcomes].reverse()}])expect(()=>checkMath6Source({...spec,...patch},html())).toThrow('MATH6_MANIFEST_SCOPE_MISMATCH');
});
it('imports the title containing commas as a single UTF-8 CSV cell and preserves the four exact outcomes',()=>{
 const parsed=parseCurriculumCsv(math6Csv(spec),'SCHOOL',6);expect(parsed.errors).toEqual([]);expect(parsed.rows).toHaveLength(4);expect(parsed.rows.every(r=>r.issues.length===0&&r.gradeLevel===6&&r.subjectCode==='MAT')).toBe(true);expect(parsed.rows.map(r=>r.title)).toEqual(spec.outcomes.map(o=>o.title));
});
it('passes grade-specific official scope guidance only for the exact matching code and title',()=>{
 for(const o of spec.outcomes)expect(officialPilotGuidance({gradeLevel:6,outcomeCode:o.code,outcomeTitle:o.title})).toContain(spec.sourceUrl);
 expect(officialPilotGuidance({gradeLevel:6,outcomeCode:'MAT.6.1.4',outcomeTitle:spec.outcomes[3].title})).toContain('Do not introduce EBOB/EKOK');
 expect(officialPilotGuidance({gradeLevel:6,outcomeCode:spec.outcomes[0].code,outcomeTitle:'invented'})).toBeNull();expect(officialPilotGuidance({gradeLevel:7,outcomeCode:spec.outcomes[0].code,outcomeTitle:spec.outcomes[0].title})).toBeNull();
});
