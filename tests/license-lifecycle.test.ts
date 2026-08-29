import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';

const service=readFileSync(new URL('../worker/lib/license.ts',import.meta.url),'utf8');
const entry=readFileSync(new URL('../worker/nibiru-license-entry.ts',import.meta.url),'utf8');
const boundary=readFileSync(new URL('../src/components/LicenseBoundary.tsx',import.meta.url),'utf8');
const admin=readFileSync(new URL('../src/pages/Licenses.tsx',import.meta.url),'utf8');

describe('institution license lifecycle',()=>{
 it('extends annual licenses from the current future expiry and reactivates expired licenses',()=>{
  expect(service).toContain("row.plan_code !== 'ANNUAL'");
  expect(service).toContain('currentExpiry.getTime() > now.getTime() ? currentExpiry : now');
  expect(service).toContain("action:'ANNUAL_RENEWED'");
  expect(entry).toContain("'/api/admin/licenses/renew'");
  expect(admin).toContain('1 Yıl Uzat');
 });

 it('does not reactivate an already expired period without renewal',()=>{
  expect(service).toContain("throw new Error('LICENSE_RENEWAL_REQUIRED')");
 });

 it('locks operational modules while leaving security and Nibiru license support available',()=>{
  expect(boundary).toContain("['/profile','/nibiru'].includes(location.pathname)");
  expect(boundary).toContain('Yıllık Lisans Talebini Onayla');
  expect(boundary).toContain('Güvenlik ve Oturumlar');
 });
});