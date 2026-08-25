import { describe,expect,it } from 'vitest';
import { evaluateProviderActivation,evaluateStandardReadiness,STANDARD_MODULES } from '../worker/lib/standard-readiness';

describe('Standard package readiness',()=>{
 it('marks core ready when every required table exists',()=>{
  const tables=STANDARD_MODULES.flatMap(m=>[...m.tables]);
  const r=evaluateStandardReadiness(tables,{files:true,ai:true,youtube:true,whatsapp:true});
  expect(r.summary.missing).toBe(0);
  expect(r.summary.coreReady).toBe(true);
  expect(r.checks.every(x=>x.state==='READY')).toBe(true);
 });
 it('separates missing core from external configuration',()=>{
  const tables=STANDARD_MODULES.flatMap(m=>[...m.tables]).filter(t=>t!=='scan_batches');
  const r=evaluateStandardReadiness(tables,{files:true,ai:true,youtube:false,whatsapp:false});
  expect(r.summary.missing).toBe(1);
  expect(r.summary.configRequired).toBe(2);
  expect(r.summary.coreReady).toBe(false);
  expect(r.checks.find(x=>x.key==='OPTICAL_CENTER')?.state).toBe('MISSING');
 });
 it('requires all four WhatsApp secrets and the YouTube key for provider activation',()=>{
  const partial=evaluateProviderActivation({youtubeApiKey:'key',whatsappAccessToken:'token',whatsappPhoneNumberId:'phone'});
  expect(partial.youtube.ready).toBe(true);
  expect(partial.whatsapp.ready).toBe(false);
  expect(partial.whatsapp.verifyToken).toBe(false);
  expect(partial.whatsapp.appSecret).toBe(false);
  const complete=evaluateProviderActivation({youtubeApiKey:'key',whatsappVerifyToken:'verify',whatsappAppSecret:'secret',whatsappAccessToken:'token',whatsappPhoneNumberId:'phone'});
  expect(complete.whatsapp.ready).toBe(true);
 });
});
