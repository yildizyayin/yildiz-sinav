import {expect,it} from 'vitest';
import spec from '../data/question-pilot-math10-curriculum.json';
import {checkMath10Source,math10Csv} from '../scripts/math10-curriculum-source.mjs';
import {parseCurriculumCsv} from '../worker/lib/curriculum-import';
import {officialPilotGuidance} from '../worker/lib/question-generation-validation';
const html=()=>spec.outcomes.map(o=>`<b>${o.code}.</b>&nbsp; ${o.title}`).join('<br>')+'<p>Geometrik Şekiller; birim çember; Pisagor teoremi</p>';
it('requires all exact current official code/title pairs and supporting geometry scope',()=>{
 expect(checkMath10Source(spec,html())).toMatchObject({completeGrade:false,productionQualified:false,matchedCodes:spec.outcomes.map(o=>o.code)});
 expect(()=>checkMath10Source(spec,html().replace(spec.outcomes[0].title,'Başka başlık'))).toThrow('MATH10_OFFICIAL_TEXT_MISMATCH');
 expect(()=>checkMath10Source(spec,html().replace('birim çember',''))).toThrow('MATH10_SCOPE_GUIDANCE_MISSING');
 expect(()=>checkMath10Source(spec,'<script>'+html()+'</script>')).toThrow('MATH10_OFFICIAL_TEXT_MISMATCH');
});
it('rejects wrong source/grade and legacy-code or incomplete manifest mixing',()=>{
 for(const patch of [{gradeLevel:9},{sourceUrl:'https://tymm.meb.gov.tr/matematik-dersi/unite/244'},{outcomes:spec.outcomes.slice(0,3)},{outcomes:spec.outcomes.map(o=>({...o,code:o.code.replace('.1.','.4.')}))}])expect(()=>checkMath10Source({...spec,...patch},html())).toThrow('MATH10_MANIFEST_SCOPE_MISMATCH');
});
it('preserves comma-containing titles as single UTF-8 cells with the geometry unit',()=>{
 const parsed=parseCurriculumCsv(math10Csv(spec),'SCHOOL',10);expect(parsed.errors).toEqual([]);expect(parsed.rows).toHaveLength(4);expect(parsed.rows.every(r=>r.issues.length===0&&r.gradeLevel===10&&r.subjectCode==='MAT'&&r.unit==='Geometrik Şekiller')).toBe(true);expect(parsed.rows.map(r=>r.title)).toEqual(spec.outcomes.map(o=>o.title));
});
it('binds geometry guidance to exact current codes/titles without cross-grade or legacy reuse',()=>{
 for(const o of spec.outcomes)expect(officialPilotGuidance({gradeLevel:10,outcomeCode:o.code,outcomeTitle:o.title})).toContain(spec.sourceUrl);
 expect(officialPilotGuidance({gradeLevel:10,outcomeCode:spec.outcomes[1].code,outcomeTitle:spec.outcomes[1].title})).toContain('Never infer a right angle');
 expect(officialPilotGuidance({gradeLevel:10,outcomeCode:'MAT.10.4.1',outcomeTitle:spec.outcomes[0].title})).toBeNull();
 expect(officialPilotGuidance({gradeLevel:10,outcomeCode:spec.outcomes[0].code,outcomeTitle:'invented'})).toBeNull();expect(officialPilotGuidance({gradeLevel:9,outcomeCode:spec.outcomes[0].code,outcomeTitle:spec.outcomes[0].title})).toBeNull();
});
