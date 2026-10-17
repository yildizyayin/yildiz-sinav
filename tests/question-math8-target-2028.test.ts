import {expect,it} from 'vitest';
import spec from '../data/question-math8-target-2028.json';
import {checkMath8Target2028,math8Csv} from '../scripts/math8-target-2028-source.mjs';
import {parseCurriculumCsv} from '../worker/lib/curriculum-import';
const limits=['Sayılar Ve Nicelikler','bilimsel gösterime girilmez','binde birler basamağına kadar','katsayıyı kök içine almaya yönelik çalışmalara değinilmeden','açık ve yarı açık'];
const html=spec.outcomes.map(o=>`<p>${o.code}. ${o.title}</p>`).join('')+limits.join(' ');
it('verifies the four official pairs without claiming full grade or exam qualification',()=>{
 expect(checkMath8Target2028(spec,html)).toMatchObject({matchedCodes:spec.outcomes.map(o=>o.code),targetAcademicYear:'2027-2028',completeGrade:false,productionQualified:false,annualPlanVerified:false,exam2028ScopeVerified:false});
 const csv=parseCurriculumCsv(math8Csv(spec),'SCHOOL',8);expect(csv.errors).toEqual([]);expect(csv.rows).toHaveLength(4);expect(csv.rows.every(r=>r.gradeLevel===8)).toBe(true);
});
it('rejects a different year, grade, source, missing or reordered outcome',()=>{
 for(const patch of [{academicYear:'2026-2027'},{gradeLevel:7},{sourceUrl:'https://example.com'},{outcomes:spec.outcomes.slice(1)},{outcomes:[...spec.outcomes].reverse()}])expect(()=>checkMath8Target2028({...spec,...patch},html)).toThrow();
});
it('requires exact titles, real visible source text and all source scope limits',()=>{
 expect(()=>checkMath8Target2028(spec,html.replace(spec.outcomes[0].title,'old factors and multiples'))).toThrow();
 expect(()=>checkMath8Target2028(spec,'<script>'+html+'</script>')).toThrow();
 for(const phrase of limits)expect(()=>checkMath8Target2028(spec,html.replace(phrase,''))).toThrow();
});
