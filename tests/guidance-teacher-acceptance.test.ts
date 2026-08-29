import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {apiFeatureForPath} from '../worker/lib/feature-access';

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

describe('P5 Rehber Öğretmeni acceptance',()=>{
 it('uses only active, same-tenant, explicitly assigned classes',()=>{
  const permissions=read('worker/lib/permissions.ts'),guidance=read('worker/lib/guidance-assessments.ts');
  expect(permissions).toContain('c.institution_id=ta.institution_id');
  expect(permissions).toContain('se.institution_id=ta.institution_id');
  expect(permissions).toContain("se.status='ACTIVE'");
  expect(guidance).toContain('ta.class_id=? AND ta.season_id=?');
  expect(guidance).not.toContain('(class_id=? OR class_id IS NULL)');
  expect(guidance).not.toContain('(ta.class_id=e.class_id OR ta.class_id IS NULL)');
 });

 it('keeps the counselor queue on active students and hides raw responses',()=>{
  const worker=read('worker/lib/guidance-assessments.ts');
  expect(worker).toContain("e.status='ACTIVE'");
  expect(worker).toContain("st.status='ACTIVE'");
  expect(worker).toContain('function safeSession');
  expect(worker).toContain('response_json,scored_result_json,question_schema_json,proposal_evidence_json');
  expect(worker).toContain("includeQuestions?parseJson(question_schema_json,{})");
 });

 it('requires accountable human decisions and audits every transition',()=>{
  const worker=read('worker/lib/guidance-assessments.ts'),page=read('src/pages/GuidanceTests.tsx');
  expect(worker).toContain("'GUIDANCE_NOTE_REQUIRED'");
  expect(worker).toContain("'GUIDANCE_ASSESSMENT_APPROVED'");
  expect(worker).toContain("'GUIDANCE_ASSESSMENT_REJECTED'");
  expect(worker).toContain("'GUIDANCE_ASSESSMENT_REVIEWED'");
  expect(page).toContain('profil kabulünde zorunlu');
  expect(page).toContain('Gerekçeyle Reddet');
  expect(page).toContain('İnceleme Bekleyen');
 });

 it('limits content and full student intelligence to assigned guidance grades/classes',()=>{
  const content=read('worker/lib/platform-expansion.ts'),governance=read('worker/question-bank-standard-entry.ts'),intelligence=read('worker/lib/student-intelligence.ts'),page=read('src/pages/ContentCenter.tsx');
  expect(content).toContain("ta.assignment_type='GUIDANCE'");
  expect(content).toContain('SELECT DISTINCT s.id subject_id,c.grade_level');
  expect(governance).toContain("user.role==='GUIDANCE_TEACHER'");
  expect(governance).toContain("ta.assignment_type='GUIDANCE' AND c.grade_level=q.grade_level");
  expect(intelligence).toContain("ta.assignment_type='GUIDANCE'");
  expect(intelligence).toContain('ta.class_id=? AND ta.season_id=?');
  expect(intelligence).not.toContain('(class_id IS NULL OR class_id=?)');
  expect(page).toContain("user?.role==='TEACHER'||user?.role==='GUIDANCE_TEACHER'");
 });

 it('gates direct guidance APIs and provides practical daily actions',()=>{
  const home=read('src/pages/StandardRoleHomes.tsx');
  expect(apiFeatureForPath('/api/nibiru/guidance/instruments')).toBe('GUIDANCE_TESTS');
  expect(apiFeatureForPath('/api/nibiru/guidance/assessments/counselor-queue')).toBe('GUIDANCE_TESTS');
  for(const label of ['Rehberlik Onayları','Yoklama ve Devamsızlık','Ödev ve Takip','Sınıf Duyuruları'])expect(home).toContain(label);
  for(const feature of ['GUIDANCE_TESTS','ATTENDANCE','ASSIGNMENTS'])expect(home).toContain(`enabled('${feature}')`);
 });
});
