import {expect,it} from 'vitest';
import spec from '../data/question-math12-target-2028.json';
import {checkMath12Target2028,math12Csv} from '../scripts/math12-target-2028-source.mjs';
import {parseCurriculumCsv} from '../worker/lib/curriculum-import';
const limits=['Nicelikler Ve Değişimler (1)','sonlu toplamlarına','cebirsel olarak ispat','tanım kümesi pozitif tam sayılar'];
const html=spec.outcomes.map(o=>`<p>${o.code}. ${o.title}</p>`).join('')+limits.join(' ');
it('verifies only the two current first-theme pairs and creates grade-twelve rows',()=>{
 expect(checkMath12Target2028(spec,html)).toMatchObject({matchedCodes:['MAT.12.1.1','MAT.12.1.2'],targetAcademicYear:'2027-2028',completeGrade:false,productionQualified:false,annualPlanVerified:false,exam2028ScopeVerified:false});
 const csv=parseCurriculumCsv(math12Csv(spec),'SCHOOL',12);expect(csv.errors).toEqual([]);expect(csv.rows).toHaveLength(2);expect(csv.rows.every(r=>r.gradeLevel===12)).toBe(true);
});
it('rejects another year, grade, source, reordered or basic-math codes',()=>{
 for(const patch of [{academicYear:'2026-2027'},{gradeLevel:11},{sourceUrl:'https://tymm.meb.gov.tr/temel-matematik-dersi/unite/1667'},{outcomes:spec.outcomes.slice(1)},{outcomes:[...spec.outcomes].reverse()},{outcomes:spec.outcomes.map(o=>({...o,code:o.code.replace('MAT.','MAT.T.')}))}])expect(()=>checkMath12Target2028({...spec,...patch},html)).toThrow();
});
it('requires exact titles, visible source content and finite-sum/domain scope',()=>{
 expect(()=>checkMath12Target2028(spec,html.replace(spec.outcomes[0].title,'invented title'))).toThrow();
 expect(()=>checkMath12Target2028(spec,'<script>'+html+'</script>')).toThrow();
 for(const phrase of limits)expect(()=>checkMath12Target2028(spec,html.replace(phrase,''))).toThrow();
});
