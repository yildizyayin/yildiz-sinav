import {describe,expect,it} from 'vitest';
import {verifyFreeWorkersSubscriptions} from '../scripts/nibiru-free-subscription-policy.mjs';
describe('Workers Free acceptance preflight',()=>{
 it('permits implicit Workers Free without subscriptions',()=>expect(verifyFreeWorkersSubscriptions([]).ok).toBe(true));
 it('does not confuse an existing R2 Paid subscription with Workers Paid',()=>{
  expect(verifyFreeWorkersSubscriptions([{rate_plan:{id:'free',public_name:'Cloudflare Free Plan'},state:'Paid'},{rate_plan:{id:'r2_paid',public_name:'R2 Paid'},state:'Paid'}]).ok).toBe(true);
 });
 it('keeps Workers Paid blocked before any inference',()=>expect(verifyFreeWorkersSubscriptions([{rate_plan:{id:'workers_paid',public_name:'Workers Paid'}}]).code).toBe('WORKERS_PLAN_REQUIRES_QUOTA_AUDIT'));
 it('keeps unrecognized Workers plans blocked',()=>expect(verifyFreeWorkersSubscriptions([{rate_plan:{id:'workers_custom',public_name:'Workers custom'}}]).ok).toBe(false));
 it('does not ignore paid prices under otherwise unknown product names',()=>expect(verifyFreeWorkersSubscriptions([{price:5,rate_plan:{id:'unknown',public_name:'Other service'}}]).ok).toBe(false));
 it('rejects malformed evidence',()=>expect(verifyFreeWorkersSubscriptions(null).ok).toBe(false));
});
