import {describe,it,expect} from 'vitest';
import {selectAnnualCurricula,overlappingAnnualOutcomes} from '../worker/lib/annual-curriculum-selection';
const v=(id:string,extra={})=>({id,academic_year:'2027-2028',grade_level:9,program_code:'SCHOOL',verified:1,...extra});
describe('annual plan curriculum selection',()=>{
 it('does not choose the last imported branch',()=>expect(selectAnnualCurricula([v('math'),v('physics')],'2027-2028',9)).toEqual({ok:false,reason:'CURRICULUM_SELECTION_REQUIRED'}));
 it('accepts an explicit complete source set deterministically',()=>expect(selectAnnualCurricula([v('math'),v('physics')],'2027-2028',9,['physics','math'])).toEqual({ok:true,ids:['math','physics']}));
 it('rejects foreign years, grades, exam programs and unverified sources',()=>{
  for(const extra of [{academic_year:'2026-2027'},{grade_level:10},{program_code:'AYT'},{verified:0}])expect(selectAnnualCurricula([v('x',extra)],'2027-2028',9,['x']).ok).toBe(false);
 });
 it('rejects empty, duplicate and nonexistent explicit selections',()=>{for(const ids of [[],['x','x'],['missing'],[4]])expect(selectAnnualCurricula([v('x')],'2027-2028',9,ids).ok).toBe(false)});
 it('retains compatibility when exactly one source is eligible',()=>expect(selectAnnualCurricula([v('x')],'2027-2028',9)).toEqual({ok:true,ids:['x']}));
 it('rejects overlapping program versions but keeps theme-scoped literature',()=>{
  const a={subject_id:'edb',unit:'Tema 1',code:'TDE1.1'};
  expect(overlappingAnnualOutcomes([a,{...a}])).toBe(true);
  expect(overlappingAnnualOutcomes([a,{...a,unit:'Tema 2'}])).toBe(false);
  expect(overlappingAnnualOutcomes([a,{...a,subject_id:'other'}])).toBe(false);
 });
});
