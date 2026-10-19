import {expect,it} from 'vitest';
import reference from '../data/question-pilot-math7-curriculum.json';
import target from '../data/question-math7-target-2028.json';
import {checkMath7Target2028,math7Csv} from '../scripts/math7-target-2028-source.mjs';
import {parseCurriculumCsv,validateCurriculumImportMetadata} from '../worker/lib/curriculum-import';
const html=reference.outcomes.map(o=>`<p>${o.code}. ${o.title}</p>`).join('')+' devirli mutlak değer sayı doğrusu';
it('keeps the old year and outcomes while verifying current program for a separate target year',()=>{
 const before=JSON.stringify(reference),r=checkMath7Target2028(target,html);
 expect(r).toMatchObject({targetAcademicYear:'2027-2028',annualPlanVerified:false,exam2028ScopeVerified:false,productionQualified:false,matchedCodes:reference.outcomes.map(o=>o.code)});
 expect(JSON.stringify(reference)).toBe(before);expect(reference.academicYear).toBe('2026-2027');
 expect(validateCurriculumImportMetadata(target).valid).toBe(true);
 const csv=parseCurriculumCsv(math7Csv(target),'SCHOOL',7);expect(csv.errors).toEqual([]);expect(csv.rows).toHaveLength(4);
});
it('rejects year, grade, source, title and outcome drift instead of relabelling it',()=>{
 for(const patch of [{academicYear:'2026-2027'},{programVersion:reference.programVersion},{gradeLevel:8},{sourceUrl:'https://example.com'},{outcomes:target.outcomes.slice(1)},{outcomes:target.outcomes.map((o,i)=>i?o:{...o,title:'invented'})}])expect(()=>checkMath7Target2028({...target,...patch},html)).toThrow();
 expect(()=>checkMath7Target2028(target,html.replace(target.outcomes[2].title,'changed'))).toThrow();
 expect(()=>checkMath7Target2028(target,'<script>'+html+'</script>')).toThrow();
});
