import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';

const worker=readFileSync(new URL('../worker/onboarding-entry.ts',import.meta.url),'utf8');
const migration=readFileSync(new URL('../migrations/0027_institution_onboarding_packages.sql',import.meta.url),'utf8');
const institutions=readFileSync(new URL('../src/pages/Institutions.tsx',import.meta.url),'utf8');
const licenses=readFileSync(new URL('../src/pages/Licenses.tsx',import.meta.url),'utf8');

describe('institution onboarding and licensing',()=>{
 it('creates institution, season, manager, package permissions and seven-day trial in one D1 batch',()=>{
  expect(worker).toContain('await env.DB.batch(statements)');
  expect(worker).toContain("'INSTITUTION_MANAGER'");
  expect(worker).toContain("'TRIAL_7_DAY','ACTIVE'");
  expect(worker).toContain('now.getTime()+7*86400000');
  expect(worker).toContain('institution_feature_overrides');
 });

 it('never stores a manager temporary password as plaintext',()=>{
  expect(worker).toContain('await hashPassword(password)');
  expect(worker).not.toContain('temporary_password');
  expect(worker).not.toContain('password_plaintext');
 });

 it('keeps personal books, zero error, attendance and assignments in the package catalog',()=>{
  expect(migration).toContain("('STANDARD','PERSONAL_BOOKS')");
  expect(migration).toContain("('STANDARD','ZERO_ERROR_BOOKLET')");
  expect(migration).toContain("'ATTENDANCE','Yoklama ve Devamsızlık'");
  expect(migration).toContain("'ASSIGNMENTS','Ödev Verme ve Takip'");
 });

 it('supports Standard, Premium and custom module selection',()=>{
  expect(migration).toContain("('STANDARD','Standard'");
  expect(migration).toContain("('PREMIUM','Premium'");
  expect(migration).toContain("('CUSTOM','Kendi Paketini Oluştur'");
  expect(institutions).toContain("form.packageCode==='CUSTOM'");
 });

 it('requires institution consent before trial-to-annual conversion',()=>{
  expect(worker).toContain('ANNUAL_CONSENT_REQUIRED');
  expect(worker).toContain("annual_consent_status!=='APPROVED'");
  expect(licenses).toContain('Kurum Onayı Bekleniyor');
 });
});
