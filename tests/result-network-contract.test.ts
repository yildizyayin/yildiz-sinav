import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';
import { CAPACITY_PROFILES,buildCapacityChunks } from '../worker/lib/operations-completion';

const source=readFileSync(new URL('../worker/result-network-entry.ts',import.meta.url),'utf8');
const migration=readFileSync(new URL('../migrations/0033_results_network_targets_attendance.sql',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const portal=readFileSync(new URL('../src/pages/ResultPortal.tsx',import.meta.url),'utf8');

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
  expect(source).toContain("p==='/api/admin/result-network/portal-settings'");
  expect(source).toContain('requireSuper(request,env)');
  expect(source).toContain("env.FILES.put('settings/result-portal.json'");
 });
 it('resolves institution and approved dealer access after authentication',()=>{
  expect(source).toContain("p==='/api/admin/result-network/access-profile'");
  expect(source).toContain("dealer?.status==='APPROVED'");
  expect(source).toContain("canManageInstitution:user.role==='SUPER_ADMIN'||activeInstitutionManager");
  expect(portal).toContain("api<any>('/api/admin/result-network/access-profile')");
  expect(portal).toContain('<ResultNetworkAdmin/>');
 });
 it('keeps result institution and dealer lifecycle controls scoped and auditable',()=>{
  expect(source).toContain("activeInstitutionManager=user.role==='INSTITUTION_MANAGER'&&institution?.lifecycle_status==='ACTIVE'");
  expect(source).toContain("scope_type='DISTRICT' AND city=? AND district=?");
  expect(source).toContain("'RESULT_DEALER_STATUS_CHANGED'");
  expect(source).toContain("'RESULT_DEALER_SCOPE_REVOKED'");
  expect(source).toContain("UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id IN (SELECT id FROM users WHERE institution_id=?)");
  expect(source).toContain("'INSTITUTION_ALREADY_EXISTS'");
 });
 it('refreshes single-use Turnstile tokens after a failed result lookup or operator login',()=>{
  expect(portal).toContain('const refreshTurnstile=()=>');
  expect(portal).toContain('key={turnstileCycle}');
  expect(portal).toContain('disabled={busy||!institution||!token}');
 });
});

describe('agreed capacity profiles',()=>{
 it('models both 2/45 and 15000/1000000 on the same queue chunk contract',()=>{
  expect(CAPACITY_PROFILES.SMALL).toEqual({institutions:2,students:45,chunkSize:100});
  expect(CAPACITY_PROFILES.NATIONAL).toEqual({institutions:15000,students:1000000,chunkSize:1000});
  expect(buildCapacityChunks('national',1000000,1000)).toHaveLength(1000);
 });
});
