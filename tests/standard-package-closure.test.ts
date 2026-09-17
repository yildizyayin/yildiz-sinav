import {describe,expect,it} from 'vitest';
import {evaluateStandardPackageClosure} from '../worker/lib/standard-package-closure';

describe('Standard package final closure',()=>{
 it('does not let optional YouTube and WhatsApp block the Standard package',()=>{
  const checks=[
   {key:'OPTICAL_CENTER',state:'READY' as const},
   {key:'NIBIRU_BASIC',state:'READY' as const},
   {key:'YOUTUBE_MICRO',state:'CONFIG_REQUIRED' as const},
   {key:'WHATSAPP',state:'CONFIG_REQUIRED' as const},
  ];
  const operational=[{state:'READY' as const,blocking:true},{state:'SETUP_REQUIRED' as const,blocking:false}];
  const r=evaluateStandardPackageClosure(checks,operational,{youtube:{ready:false},whatsapp:{ready:false}},null);
  expect(r.standardPackageReady).toBe(true);
  expect(r.saleReady).toBe(true);
  expect(r.optionalChannelSetup).toBe(2);
  expect(r.fullChannelReady).toBe(false);
 });
 it('blocks the package on a required config, core table or blocking operational gap',()=>{
  const providers={youtube:{ready:true},whatsapp:{ready:true}};
  expect(evaluateStandardPackageClosure([{key:'NIBIRU_BASIC',state:'CONFIG_REQUIRED'}],[],providers,null).standardPackageReady).toBe(false);
  expect(evaluateStandardPackageClosure([{key:'OPTICAL_CENTER',state:'MISSING'}],[],providers,null).standardPackageReady).toBe(false);
  expect(evaluateStandardPackageClosure([{key:'OPTICAL_CENTER',state:'READY'}],[{state:'SETUP_REQUIRED',blocking:true}],providers,null).standardPackageReady).toBe(false);
 });
 it('requires a clean operational probe',()=>{
  const r=evaluateStandardPackageClosure([{key:'OPTICAL_CENTER',state:'READY'}],[{state:'READY',blocking:true}],{youtube:{ready:true},whatsapp:{ready:true}},'D1 probe failed');
  expect(r.standardPackageReady).toBe(false);
 });
});
