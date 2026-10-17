import {expect,it} from 'vitest';
import {batchTargets,checkBatchTarget,batchTargetCsv,assertTargetRows} from '../scripts/math-target-2028-batch.mjs';
import {parseCurriculumCsv} from '../worker/lib/curriculum-import';
import {targetReadiness} from '../scripts/question-target-2028-readiness.mjs';
const scope='en fazla on iki basamaklı en fazla beş basamak en fazla üç basamaklı EBOB EKOK kavramlarına değinilmez evrensel kümenin gerçek sayılar kümesi denklem ve eşitsizlik çözümlerine değinilmeksizin Geometrik Şekiller birim çember Pisagor teoremi İstatistiksel Araştırma Süreci korelasyon katsayısı neden-sonuç ilişkisi olduğu anlamına gelmez';
it('prepares only the five remaining first themes without changing reference years',()=>{
 expect(batchTargets.map(s=>s.gradeLevel)).toEqual([5,6,9,10,11]);
 expect(batchTargets.reduce((n,s)=>n+s.outcomes.length,0)).toBe(16);
 for(const s of batchTargets){
  const html=s.outcomes.map(o=>`<p>${o.code}. ${o.title}</p>`).join('')+scope;
  expect(checkBatchTarget(s,html)).toMatchObject({targetAcademicYear:'2027-2028',productionQualified:false,annualPlanVerified:false,exam2028ScopeVerified:false});
  const parsed=parseCurriculumCsv(batchTargetCsv(s),'SCHOOL',s.gradeLevel);expect(parsed.errors).toEqual([]);expect(parsed.rows).toHaveLength(s.outcomes.length);
  expect(()=>checkBatchTarget({...s,academicYear:'2026-2027'},html)).toThrow();expect(()=>checkBatchTarget({...s,outcomes:s.outcomes.slice(1)},html)).toThrow();
  expect(()=>checkBatchTarget(s,html.replace(s.outcomes[0].title,'wrong'))).toThrow();expect(()=>checkBatchTarget(s,'<script>'+html+'</script>')).toThrow();
 }
});
function rows(s:any){return s.outcomes.map((o:any)=>({...o,grade_level:s.gradeLevel,official:1,active:1,subject_code:'MAT',node_id:'ln_'+o.code,node_active:1,node_grade:s.gradeLevel,node_year:s.academicYear,version_id:'v'}));}
it('requires exact active outcomes and target-year learning nodes',()=>{
 const s=batchTargets[0],r=rows(s);expect(()=>assertTargetRows(s,r)).not.toThrow();
 for(const patch of [{title:'wrong'},{grade_level:6},{official:0},{active:0},{node_active:0},{node_year:'2026-2027'},{subject_code:'TUR'},{node_id:null}])expect(()=>assertTargetRows(s,[{...r[0],...patch},...r.slice(1)])).toThrow();
 expect(()=>assertTargetRows(s,[...r,...r])).toThrow();
});
it('does not call imported first themes or existing approved questions full production readiness',()=>{
 const s=batchTargets[0],versions=[{id:'v',academic_year:s.academicYear,grade_level:s.gradeLevel,program_code:s.programCode,program_version:s.programVersion,verified:1,authority:'MEB',source_url:s.sourceUrl}];
 expect(targetReadiness(s,versions,rows(s),500)).toMatchObject({firstThemeImported:true,approvedLinkedQuestions:500,fullCurriculumVerified:false,massProductionReady:false,exam2028ScopeVerified:false});
 expect(targetReadiness(s,[],rows(s),0).firstThemeImported).toBe(false);
 expect(targetReadiness(s,versions,[...rows(s),rows(s)[0]],0).firstThemeImported).toBe(false);
 expect(targetReadiness(s,[{...versions[0],academic_year:'2026-2027'}],rows(s),0).firstThemeImported).toBe(false);
 expect(targetReadiness(s,versions,[{...rows(s)[0],node_year:'2026-2027'},rows(s)[1]],0).firstThemeImported).toBe(false);
});
