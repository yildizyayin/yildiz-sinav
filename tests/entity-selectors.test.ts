import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';

const selectors=readFileSync(new URL('../src/components/EntitySelectors.tsx',import.meta.url),'utf8');
const students=readFileSync(new URL('../src/pages/Students.tsx',import.meta.url),'utf8');
const exams=readFileSync(new URL('../src/pages/Exams.tsx',import.meta.url),'utf8');
const transfers=readFileSync(new URL('../src/pages/Transfers.tsx',import.meta.url),'utf8');
const board=readFileSync(new URL('../src/pages/BoardCenter.tsx',import.meta.url),'utf8');

describe('safe entity selectors',()=>{
 it('loads institution and class options from authorized catalogs',()=>{
  expect(selectors).toContain("api<any>('/api/institutions')");
  expect(selectors).toContain('/api/classes');
  expect(selectors).toContain('Kurum bulunamadı');
  expect(selectors).toContain('Sınıf seçmeden devam et');
 });

 it('replaces free-text institution identifiers in operational pages',()=>{
  for(const page of [students,exams,transfers])expect(page).toContain('<InstitutionSelect');
  for(const page of [students,exams,transfers])expect(page).not.toContain("useState('inst_demo')");
 });

 it('replaces the board class identifier input with a class selector',()=>{
  expect(board).toContain('<ClassSelect');
  expect(board).not.toContain('Sınıf ID (opsiyonel)');
 });
});
