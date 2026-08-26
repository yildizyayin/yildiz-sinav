import { describe,expect,it } from 'vitest';
import { routeNibiruSpecialist } from '../worker/lib/nibiru-specialists';

describe('Nibiru specialist orchestration',()=>{
 it('routes student study plans to Education Coach',()=>{
  const r=routeNibiruSpecialist({role:'STUDENT'},'Bugün ne çalışayım, kaç soru çözeyim?');
  expect(r.specialist).toBe('EDUCATION_COACH');
 });
 it('routes student targets to Guidance AI',()=>{
  const r=routeNibiruSpecialist({role:'STUDENT'},'YKS hedefimde tıp için kaç net daha lazım?');
  expect(r.specialist).toBe('GUIDANCE_COUNSELOR');
 });
 it('routes subject questions to Subject Teacher AI',()=>{
  const r=routeNibiruSpecialist({role:'STUDENT'},'Bu matematik sorusunu neden yanlış yaptım?');
  expect(r.specialist).toBe('SUBJECT_TEACHER');
  expect(r.subjectHint).toBe('Matematik');
 });
 it('keeps branch teachers in their subject specialist',()=>{
  const r=routeNibiruSpecialist({role:'TEACHER'},'7/A hangi kazanımda zorlanıyor?');
  expect(r.specialist).toBe('SUBJECT_TEACHER');
 });
 it('routes guidance teachers to whole-student guidance',()=>{
  const r=routeNibiruSpecialist({role:'GUIDANCE_TEACHER'},'7/A sınıfının genel gelişimi nasıl?');
  expect(r.specialist).toBe('GUIDANCE_COUNSELOR');
 });
 it('routes parents and managers to role-safe specialists',()=>{
  expect(routeNibiruSpecialist({role:'PARENT'},'Çocuğum nasıl?').specialist).toBe('PARENT_GUIDE');
  expect(routeNibiruSpecialist({role:'INSTITUTION_MANAGER'},'Kurumum bugün nasıl?').specialist).toBe('INSTITUTION_INSIGHT');
 });
});
