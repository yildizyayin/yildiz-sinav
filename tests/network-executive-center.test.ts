import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {networkPercent} from '../worker/lib/platform-expansion';

const migration=readFileSync(new URL('../migrations/0034_network_executive_center.sql',import.meta.url),'utf8');
const worker=readFileSync(new URL('../worker/lib/platform-expansion.ts',import.meta.url),'utf8');
const page=readFileSync(new URL('../src/pages/EnterpriseCenter.tsx',import.meta.url),'utf8');
const layout=readFileSync(new URL('../src/components/Layout.tsx',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');

describe('network executive center',()=>{
 it('models headquarters to campus hierarchy and scoped network roles',()=>{
  for(const text of ['network_units','HEADQUARTERS','REGION','PROVINCE','DISTRICT','CAMPUS','scope_unit_id','unit_id'])expect(migration).toContain(text);
  expect(worker).toContain('WITH RECURSIVE permitted');expect(worker).toContain('WITH RECURSIVE visible');
 });

 it('does not grant full network visibility from ordinary institution membership',()=>{
  const list=worker.slice(worker.indexOf('async function listNetworks'),worker.indexOf('async function createNetwork'));
  expect(list).toContain('network_user_roles');expect(list).not.toContain('UNION SELECT network_id FROM institution_network_members');
  const dashboard=worker.slice(worker.indexOf('async function networkDashboard'),worker.indexOf('async function networkExport'));
  expect(dashboard).toContain('networkAccess');expect(dashboard).not.toContain("user.role==='INSTITUTION_MANAGER'");
 });

 it('calculates tenant-scoped branch KPIs safely',()=>{
  for(const text of ['m.network_id=?','se.institution_id=i.id','ep.institution_id=i.id','ats.institution_id=i.id','a.institution_id=i.id','rp.institution_id=i.id'])expect(worker).toContain(text);
  expect(networkPercent(7,8)).toBe(87.5);expect(networkPercent(1,0)).toBe(0);
 });

 it('provides executive comparison, filters, CSV and audited writes',()=>{
  for(const text of ['Şubeler arası karşılaştırma','Hiyerarşi kapsamı','Aktif Sıfır Hata','CSV İndir','Zincir rolü'])expect(page).toContain(text);
  expect(worker).toContain('NETWORK_REPORT_EXPORTED');expect(worker).toContain("text/csv; charset=utf-8");expect(worker).toContain('NETWORK_ROLE_GRANTED');
 });

 it('keeps the removed smart-board module out of navigation and routes',()=>{
  expect(layout).not.toContain("label: 'Akıllı Tahta'");expect(layout).not.toContain("'/board'");expect(app).not.toContain('BoardCenter');expect(app).not.toContain('path="board"');
 });
});
