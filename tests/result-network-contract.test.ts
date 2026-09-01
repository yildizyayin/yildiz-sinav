import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';
import { CAPACITY_PROFILES,buildCapacityChunks } from '../worker/lib/operations-completion';

const source=readFileSync(new URL('../worker/result-network-entry.ts',import.meta.url),'utf8');
const migration=readFileSync(new URL('../migrations/0033_results_network_targets_attendance.sql',import.meta.url),'utf8');
const portalMigration=readFileSync(new URL('../migrations/0034_result_portal_brand_settings.sql',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');

describe('ANUNEX result network contract',()=>{
 it('never uses a raw TCKN as the result access decision',()=>{
  expect(source).toContain("hmac(env,`TCKN|");
  expect(source).toContain('secondFactorRequired:true');
  expect(source).toContain('verifyPassword(code');
  expect(migration).not.toContain('tckn TEXT');
  expect(migration).toContain('tckn_lookup_token TEXT');
 });
 it('routes sonuc.anunex.com to the public result portal',()=>{
  expect(app).toContain("hostname==='sonuc.anunex.com'");
  expect(app).toContain('<ResultPortal/>');
 });
 it('retains exam definitions while purging result identities and participants',()=>{
  expect(source).toContain("status='PURGED'");
  expect(source).toContain('examDefinitionRetained:true');
  expect(migration).toContain("catalogue_retention TEXT NOT NULL DEFAULT 'PERMANENT'");
 });
 it('lets only Super Admin manage portal conversion copy while brand marks stay locked in code',()=>{
  expect(portalMigration).toContain('CREATE TABLE IF NOT EXISTS result_portal_settings');
  expect(source).toContain("p==='/api/admin/result-network/portal-settings'");
  expect(source).toContain('requireSuper(request,env)');
  expect(source).toContain('RESULT_PORTAL_BRAND_UPDATED');
 });
});

describe('agreed capacity profiles',()=>{
 it('models both 2/45 and 15000/1000000 on the same queue chunk contract',()=>{
  expect(CAPACITY_PROFILES.SMALL).toEqual({institutions:2,students:45,chunkSize:100});
  expect(CAPACITY_PROFILES.NATIONAL).toEqual({institutions:15000,students:1000000,chunkSize:1000});
  expect(buildCapacityChunks('national',1000000,1000)).toHaveLength(1000);
 });
});
