import {expect,it} from 'vitest';
import spec from '../data/question-pilot-math11-curriculum.json';
import {checkMath11Source,math11Csv} from '../scripts/math11-curriculum-source.mjs';
import {parseCurriculumCsv} from '../worker/lib/curriculum-import';
import {officialPilotGuidance} from '../worker/lib/question-generation-validation';
const html=()=>spec.outcomes.map(o=>`<b>${o.code}.</b>&nbsp; ${o.title}`).join('<br>')+'<p>İstatistiksel Araştırma Süreci; korelasyon katsayısı; neden-sonuç ilişkisi olduğu anlamına gelmez.</p>';
it('pins both exact current titles and association/causation teaching scope',()=>{
 expect(checkMath11Source(spec,html())).toMatchObject({completeGrade:false,productionQualified:false,matchedCodes:spec.outcomes.map(o=>o.code)});
 expect(()=>checkMath11Source(spec,html().replace(spec.outcomes[0].title,'Trigonometrik fonksiyonlar'))).toThrow('MATH11_OFFICIAL_TEXT_MISMATCH');
 expect(()=>checkMath11Source(spec,html().replace('neden-sonuç ilişkisi olduğu anlamına gelmez','nedensellik kanıtıdır'))).toThrow('MATH11_SCOPE_GUIDANCE_MISSING');
 expect(()=>checkMath11Source(spec,'<script>'+html()+'</script>')).toThrow('MATH11_OFFICIAL_TEXT_MISMATCH');
});
it('rejects wrong source/grade, missing outcomes and reordered manifests',()=>{
 for(const patch of [{gradeLevel:10},{sourceUrl:'https://tymm.meb.gov.tr/matematik-dersi/unite/281'},{outcomes:spec.outcomes.slice(0,1)},{outcomes:[...spec.outcomes].reverse()}])expect(()=>checkMath11Source({...spec,...patch},html())).toThrow('MATH11_MANIFEST_SCOPE_MISMATCH');
});
it('imports exactly two grade-eleven outputs in the statistics unit',()=>{
 const p=parseCurriculumCsv(math11Csv(spec),'SCHOOL',11);expect(p.errors).toEqual([]);expect(p.rows).toHaveLength(2);expect(p.rows.every(r=>r.issues.length===0&&r.gradeLevel===11&&r.subjectCode==='MAT'&&r.unit==='İstatistiksel Araştırma Süreci')).toBe(true);expect(p.rows.map(r=>r.title)).toEqual(spec.outcomes.map(o=>o.title));
});
it('binds guidance to exact title/grade and does not turn correlation into causation',()=>{
 for(const o of spec.outcomes)expect(officialPilotGuidance({gradeLevel:11,outcomeCode:o.code,outcomeTitle:o.title})).toContain(spec.sourceUrl);
 expect(officialPilotGuidance({gradeLevel:11,outcomeCode:spec.outcomes[0].code,outcomeTitle:spec.outcomes[0].title})).toContain('Correlation is not a causal proof');
 expect(officialPilotGuidance({gradeLevel:11,outcomeCode:spec.outcomes[0].code,outcomeTitle:'invented'})).toBeNull();expect(officialPilotGuidance({gradeLevel:10,outcomeCode:spec.outcomes[0].code,outcomeTitle:spec.outcomes[0].title})).toBeNull();
});
