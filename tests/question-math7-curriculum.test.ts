import {expect,it} from 'vitest';
import spec from '../data/question-pilot-math7-curriculum.json';
import {checkMath7Source,math7Csv} from '../scripts/math7-curriculum-source.mjs';
import {parseCurriculumCsv} from '../worker/lib/curriculum-import';
import {officialPilotGuidance} from '../worker/lib/question-generation-validation';
const html=()=>spec.outcomes.map(o=>`<b>${o.code}.</b>&nbsp; ${o.title}`).join('<br>')+'<p>devirli ondalık, mutlak değer ve sayı doğrusu</p>';
it('pins exact official code/title pairs and requires the represented scope',()=>{
 expect(checkMath7Source(spec,html())).toMatchObject({completeGrade:false,productionQualified:false,matchedCodes:spec.outcomes.map(o=>o.code)});
 expect(()=>checkMath7Source(spec,html().replace(spec.outcomes[1].title,'Başka başlık'))).toThrow('MATH7_OFFICIAL_TEXT_MISMATCH');
 expect(()=>checkMath7Source(spec,html().replace('devirli',''))).toThrow('MATH7_SCOPE_GUIDANCE_MISSING');
 expect(()=>checkMath7Source(spec,'<script>'+html()+'</script>')).toThrow('MATH7_OFFICIAL_TEXT_MISMATCH');
});
it('rejects wrong source/grade and missing or reordered outcome manifests',()=>{
 for(const patch of [{gradeLevel:6},{sourceUrl:'https://example.com'},{outcomes:spec.outcomes.slice(0,3)},{outcomes:[...spec.outcomes].reverse()}])expect(()=>checkMath7Source({...spec,...patch},html())).toThrow('MATH7_MANIFEST_SCOPE_MISMATCH');
});
it('preserves all four exact grade-seven titles in quoted UTF-8 CSV cells',()=>{
 const parsed=parseCurriculumCsv(math7Csv(spec),'SCHOOL',7);expect(parsed.errors).toEqual([]);expect(parsed.rows).toHaveLength(4);expect(parsed.rows.every(r=>r.issues.length===0&&r.gradeLevel===7&&r.subjectCode==='MAT')).toBe(true);expect(parsed.rows.map(r=>r.title)).toEqual(spec.outcomes.map(o=>o.title));
});
it('binds author/editor/reviewer guidance to the exact official code/title, without cross-grade reuse',()=>{
 for(const o of spec.outcomes)expect(officialPilotGuidance({gradeLevel:7,outcomeCode:o.code,outcomeTitle:o.title})).toContain(spec.sourceUrl);
 expect(officialPilotGuidance({gradeLevel:7,outcomeCode:'MAT.7.1.2',outcomeTitle:spec.outcomes[1].title})).toContain('Do not treat a finite truncation as exact equality');
 expect(officialPilotGuidance({gradeLevel:7,outcomeCode:spec.outcomes[0].code,outcomeTitle:'invented'})).toBeNull();expect(officialPilotGuidance({gradeLevel:6,outcomeCode:spec.outcomes[0].code,outcomeTitle:spec.outcomes[0].title})).toBeNull();
});
