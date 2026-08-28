import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';

const page=readFileSync(new URL('../src/pages/Institutions.tsx',import.meta.url),'utf8');
const worker=readFileSync(new URL('../worker/onboarding-entry.ts',import.meta.url),'utf8');

describe('institution detail management',()=>{
 it('exposes a super-admin-only institution detail read and update endpoint',()=>{
  expect(worker).toContain("/^\\/api\\/admin\\/institutions\\/([^/]+)\\/detail$/");
  expect(worker).toContain("user.role!=='SUPER_ADMIN'");
  expect(worker).toContain("request.method==='GET'||request.method==='PUT'");
 });

 it('updates the package feature overrides and active network membership together',()=>{
  expect(worker).toContain("if(!selected.includes('EXAM_CENTER'))");
  expect(worker).toContain('institution_feature_overrides');
  expect(worker).toContain('UPDATE institution_network_members SET active=0');
  expect(worker).toContain('INSTITUTION_PROFILE_UPDATED');
 });

 it('lets the operator edit contact, package, module and branch data from one panel',()=>{
  for(const text of ['Kurum Ayrıntısı','Zincir / grup','Şube / bölge etiketi','Kurum Ayrıntısını Kaydet'])expect(page).toContain(text);
  expect(page).toContain('/api/admin/institutions/${row.id}/detail');
  expect(page).toContain("packageCode==='CUSTOM'");
 });
});
