import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {parseCurriculumCsv} from '../worker/lib/curriculum-import';
// @ts-expect-error Node Actions import planner.
import {buildBranchImportPlan,branchImportCsv} from '../scripts/branch-import-plan.mjs';
const catalog=JSON.parse(readFileSync(new URL('../data/question-branch-catalog-2028.json',import.meta.url),'utf8'));
describe('theme-scoped official import planning',()=>{
 it('all prepared imports pass the actual CSV importer without relaxing uniqueness',()=>{
  const plan=buildBranchImportPlan(catalog);expect(plan.imports).toHaveLength(69);
  for(const item of plan.imports){const result=parseCurriculumCsv(branchImportCsv(item),'SCHOOL',item.grade);
   expect(result.errors,item.programVersion).toEqual([]);expect(result.rows).toHaveLength(item.outcomeCount);
   expect(result.rows.flatMap(r=>r.issues),item.programVersion).toEqual([]);
   expect(result.rows.every(r=>r.subjectCode===item.subjectCode)).toBe(true);
  }
 });
 it('keeps literature theme-specific text under its unchanged official code',()=>{
  const plan=buildBranchImportPlan(catalog);const literary=plan.imports.filter((i:any)=>i.subjectCode==='EDB'&&i.grade===9);
  expect(literary).toHaveLength(4);expect(new Set(literary.map((i:any)=>i.programVersion)).size).toBe(4);
  const occurrences=literary.flatMap((i:any)=>i.outcomes.filter((o:any)=>o.code==='TDE1.1'));
  expect(occurrences.length).toBeGreaterThan(1);expect(new Set(occurrences.map((o:any)=>o.title)).size).toBeGreaterThan(1);
 });
 it('retains unresolved source problems and does not declare automatic activation safe',()=>{
  const plan=buildBranchImportPlan(catalog);expect(plan.blocked).toHaveLength(2);
  expect(plan.automaticAnnualPlanSelectionSafe).toBe(false);expect(plan.officialCodesRewritten).toBe(false);
  expect(plan.imports.some((i:any)=>i.subjectCode==='TUR'&&i.grade===5)).toBe(false);
 });
 it('is deterministic and isolates school curricula from exam specifications',()=>{
  const a=buildBranchImportPlan(catalog),b=buildBranchImportPlan(catalog);expect(a).toEqual(b);
  expect(a.imports.every((i:any)=>i.programCode==='SCHOOL'&&i.examSpecification===false)).toBe(true);
  expect(()=>buildBranchImportPlan({...catalog,academicYear:'2026-2027'})).toThrow('CATALOG_YEAR_MISMATCH');
 });
});
