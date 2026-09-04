import { describe,expect,it } from 'vitest';
import { readFileSync } from 'node:fs';

const read=(path:string)=>readFileSync(path,'utf8');

describe('sonuc.anunex.com geographic operator boundary',()=>{
 it('keeps result operators outside licensed platform user roles',()=>{
  const schema=read('migrations/0035_result_operator_geo_scope.sql');
  const core=read('migrations/0001_schema.sql');
  expect(schema).toContain('CREATE TABLE IF NOT EXISTS result_operators');
  expect(schema).toContain('CREATE TABLE IF NOT EXISTS result_operator_scopes');
  expect(core).toContain("role TEXT NOT NULL CHECK(role IN ('SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER','STUDENT','PARENT'))");
  expect(core).not.toContain("'DEALER'");
 });

 it('enforces city and optional district at the server query',()=>{
  const worker=read('worker/result-operator-entry.ts');
  expect(worker).toContain('UPPER(s.city)=UPPER(n.city)');
  expect(worker).toContain("s.district IS NULL OR s.district='' OR UPPER(s.district)=UPPER(n.district)");
  expect(worker).toContain('RESULT_OPERATOR_GEO_SCOPE_DENIED');
  expect(worker).toContain('operatorCanAccessInstitution');
 });

 it('auto-registers every new central exam in the Result Network',()=>{
  const schema=read('migrations/0035_result_operator_geo_scope.sql');
  expect(schema).toContain('trg_central_exam_result_network_auto');
  expect(schema).toContain("NEW.owner_type='CENTRAL'");
  expect(schema).toContain("'RESULT_NETWORK','DRAFT'");
 });

 it('routes the same protected operator API in staging and production',()=>{
  for(const path of ['worker/sekonic-staging-entry.ts','worker/sekonic-production-entry.ts']){
   const entry=read(path);
   expect(entry).toContain("import { handleResultOperatorRequest } from './result-operator-entry'");
   expect(entry).toContain('handleResultOperatorRequest(request,env)');
  }
 });
});
